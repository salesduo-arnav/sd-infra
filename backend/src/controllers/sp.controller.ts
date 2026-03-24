import { Request, Response } from 'express';
import { URLSearchParams } from 'url';
import crypto from 'crypto';
import { IntegrationAccount, IntegrationStatus } from '../models/integration_account';
import { encrypt } from '../utils/encryption';
import { AuditService } from '../services/audit.service';
import { handleError } from '../utils/error';
import Logger from '../utils/logger';

// --- ENV ---
const APP_ID = process.env.AMZN_SP_APP_ID!;
const CLIENT_ID = process.env.AMZN_SP_CLIENT_ID!;
const CLIENT_SECRET = process.env.AMZN_SP_CLIENT_SECRET!;
const REDIRECT_URI = process.env.AMZN_SP_REDIRECT_URI!;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

// Map region → Amazon Seller Central Base URL
const SC_REGION_URLS: Record<string, string> = {
    NA: "https://sellercentral.amazon.com",
    EU: "https://sellercentral.amazon.co.uk",
    FE: "https://sellercentral.amazon.co.jp"
};

const VC_REGION_URLS: Record<string, string> = {
    NA: "https://vendorcentral.amazon.com",
    EU: "https://vendorcentral.amazon.co.uk",
    FE: "https://vendorcentral.amazon.co.jp"
};

// Map marketplace ID to region code (simple mapping for now, can be expanded)
const MARKETPLACE_REGION_MAP: Record<string, string> = {
    'us': 'NA', 'ca': 'NA', 'mx': 'NA', 'br': 'NA',
    'uk': 'EU', 'de': 'EU', 'fr': 'EU', 'it': 'EU', 'es': 'EU', 'nl': 'EU', 'se': 'EU', 'tr': 'EU', 'pl': 'EU', 'be': 'EU',
    'jp': 'FE', 'au': 'FE', 'sg': 'FE'
};

const TOKEN_URL = 'https://api.amazon.com/auth/o2/token';

// ========================================
// Generate Auth URL
// ========================================
export const getSpAuthUrl = async (req: Request, res: Response) => {
    try {
        const { accountId } = req.query;

        if (!accountId) {
            return res.status(400).json({ message: 'accountId is required' });
        }

        const account = await IntegrationAccount.findByPk(accountId as string);
        if (!account) {
            return res.status(404).json({ message: 'Integration account not found' });
        }

        const state = crypto.randomBytes(16).toString('hex');

        await account.update({
            oauth_state: state
        });

        const statePayload = `${accountId}##${state}`; // accountId##state

        // Determine Base URL based on region
        const regionCode = MARKETPLACE_REGION_MAP[account.region];
        if (!regionCode) {
            return res.status(400).json({ message: `Unsupported or unknown region: ${account.region}` });
        }

        let authUrl: string;

        if (account.integration_type === 'sp_api_vc') {
            const baseUrl = VC_REGION_URLS[regionCode];
            authUrl = `${baseUrl}/apps/authorize/consent?application_id=${APP_ID}&state=${statePayload}&redirect_uri=${REDIRECT_URI}`;
        } else {
            // Seller Central
            const baseUrl = SC_REGION_URLS[regionCode];
            authUrl = `${baseUrl}/selling-partner-appstore/dp/${APP_ID}?state=${statePayload}&redirect_uri=${REDIRECT_URI}`;
        }



        return res.json({ url: authUrl });

    } catch (error) {
        handleError(res, error, 'Get SP Auth URL Error');
    }
};

// ========================================
// Handle OAuth Callback
// ========================================
export const handleSpCallback = async (req: Request, res: Response) => {
    Logger.info('Amazon SP Callback', { query: req.query });

    const { spapi_oauth_code, state, selling_partner_id, error, error_description } = req.query;
    const redirectBase = `${FRONTEND_URL}/integration-onboarding`;

    if (!state) {
        return res.redirect(`${redirectBase}?sp_auth=error&message=${encodeURIComponent('Missing state parameter')}`);
    }

    let accountId: string;
    let returnedState: string;

    try {
        const parsed = (state as string).split("##");
        if (parsed.length !== 2) throw new Error('Invalid format');
        accountId = parsed[0];
        returnedState = parsed[1];
    } catch {
        return res.redirect(`${redirectBase}?sp_auth=error&message=${encodeURIComponent('Invalid state format')}`);
    }

    const account = await IntegrationAccount.findByPk(accountId);
    if (!account) {
        return res.redirect(`${redirectBase}?sp_auth=error&message=${encodeURIComponent('Integration account not found')}`);
    }

    const storedStateBuffer = Buffer.from(account.oauth_state || '');
    const returnedStateBuffer = Buffer.from(returnedState || '');

    if (
        storedStateBuffer.length !== returnedStateBuffer.length ||
        !crypto.timingSafeEqual(storedStateBuffer, returnedStateBuffer)
    ) {
        return res.redirect(`${redirectBase}?sp_auth=error&message=${encodeURIComponent('Invalid OAuth state')}`);
    }

    if (error) {
        return res.redirect(`${redirectBase}?sp_auth=error&message=${encodeURIComponent(error_description as string || 'Authorization denied')}`);
    }

    if (!spapi_oauth_code) {
        return res.redirect(`${redirectBase}?sp_auth=error&message=${encodeURIComponent('Missing authorization code')}`);
    }

    try {
        const tokenParams = new URLSearchParams({
            grant_type: 'authorization_code',
            code: spapi_oauth_code as string,
            client_id: CLIENT_ID,
            client_secret: CLIENT_SECRET,
            redirect_uri: REDIRECT_URI,
        });

        const tokenResponse = await fetch(TOKEN_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
            },
            body: tokenParams,
        });

        if (!tokenResponse.ok) {
            const errorBody = await tokenResponse.text();
            throw new Error(errorBody);
        }

        const tokenData = await tokenResponse.json();
        const { access_token, refresh_token, expires_in } = tokenData;

        const secureCredentials = {
            encrypted: encrypt(JSON.stringify({
                access_token,
                refresh_token,
                expires_in,
                token_type: 'bearer',
                obtained_at: new Date().toISOString(),
                selling_partner_id
            }))
        };

        await account.update({
            status: IntegrationStatus.CONNECTED,
            credentials: secureCredentials,
            connected_at: new Date(),
            oauth_state: null
        });

        await AuditService.log({
            action: 'CONNECT_INTEGRATION_ACCOUNT_SP',
            entityType: 'IntegrationAccount',
            entityId: account.id,
            details: { type: account.integration_type },
            req
        });

        return res.redirect(`${redirectBase}?sp_auth=success&accountId=${accountId}`);

    } catch (err) {
        Logger.error('Amazon SP Token Exchange Failed', { error: err });

        await account.update({
            status: IntegrationStatus.ERROR
        });

        return res.redirect(`${redirectBase}?sp_auth=error&message=${encodeURIComponent('Token exchange failed')}`);
    }
};

