import { Request, Response } from 'express';
import { URLSearchParams } from 'url';
import crypto from 'crypto';
import { IntegrationAccount, IntegrationStatus } from '../models/integration_account';
import { encrypt } from '../utils/encryption';
import { AuditService } from '../services/audit.service';
import { handleError } from '../utils/error';
import Logger from '../utils/logger';
import { configService } from '../services/config.service';
import { STATE_PAYLOAD_DELIMITER } from '../constants/app.constants';

// --- ENV ---
const APP_ID = process.env.AMZN_SP_APP_ID!;
const CLIENT_ID = process.env.AMZN_SP_CLIENT_ID!;
const CLIENT_SECRET = process.env.AMZN_SP_CLIENT_SECRET!;
const REDIRECT_URI = process.env.AMZN_SP_REDIRECT_URI!;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

// Defaults used when DB config is not yet seeded
const DEFAULT_SC_REGION_URLS: Record<string, string> = {
    NA: "https://sellercentral.amazon.com",
    EU: "https://sellercentral.amazon.co.uk",
    FE: "https://sellercentral.amazon.co.jp"
};

const DEFAULT_VC_REGION_URLS: Record<string, string> = {
    NA: "https://vendorcentral.amazon.com",
    EU: "https://vendorcentral.amazon.co.uk",
    FE: "https://vendorcentral.amazon.co.jp"
};

const DEFAULT_MARKETPLACE_REGION_MAP: Record<string, string> = {
    'us': 'NA', 'ca': 'NA', 'mx': 'NA', 'br': 'NA',
    'uk': 'EU', 'de': 'EU', 'fr': 'EU', 'it': 'EU', 'es': 'EU', 'nl': 'EU', 'se': 'EU', 'tr': 'EU', 'pl': 'EU', 'be': 'EU',
    'jp': 'FE', 'au': 'FE', 'sg': 'FE'
};

const DEFAULT_TOKEN_URL = 'https://api.amazon.com/auth/o2/token';

const escapeHtml = (unsafe: string) =>
    unsafe
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');

const sendOAuthPopupResponse = (
    res: Response,
    status: 'success' | 'error',
    message?: string
) => {
    const payload = {
        type: status === 'success' ? 'SP_AUTH_SUCCESS' : 'SP_AUTH_ERROR',
        message: message || null,
    };

    const nonce = crypto.randomBytes(16).toString('base64');
    res.setHeader('Content-Security-Policy', `default-src 'self'; script-src 'self' 'nonce-${nonce}';`);
    res.setHeader('Content-Type', 'text/html');

    return res.send(`<!DOCTYPE html>
<html>
<head>
    <title>Seller Central Authentication</title>
    <style>
        body { margin: 0; font-family: Arial, Helvetica, sans-serif; background-color: #ffffff; color: #111111; display: flex; align-items: center; justify-content: center; height: 100vh; }
        .container { width: 360px; padding: 24px; border: 1px solid #dddddd; border-radius: 6px; text-align: center; }
        .logo { font-size: 20px; font-weight: bold; margin-bottom: 20px; }
        .logo span { color: #FF9900; }
        h3 { margin: 0 0 12px 0; font-size: 18px; font-weight: 600; color: ${status === 'success' ? '#067D62' : '#B12704'}; }
        p { font-size: 14px; color: #555555; margin-bottom: 16px; }
        .error { font-size: 13px; color: #B12704; margin-bottom: 16px; }
        .btn { width: 100%; padding: 10px; background-color: #FF9900; border: 1px solid #E47911; color: #111111; font-weight: 600; border-radius: 4px; cursor: pointer; }
        .btn:hover { background-color: #F08804; }
        .footer-note { font-size: 12px; color: #777777; margin-top: 16px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="logo">seller<span>central</span></div>
        ${status === 'success'
            ? `<h3>Authentication Successful</h3>
               <p>Your Seller Central account has been connected successfully.</p>
               <p>This window will close automatically.</p>`
            : `<h3>Authentication Failed</h3>
               <div class="error">${escapeHtml(message || 'An unknown error occurred.')}</div>
               <p>Please close this window and try again.</p>`
        }
        <button class="btn" onclick="window.close()">Close Window</button>
    </div>
    <script nonce="${nonce}">
        (function() {
            const payload = ${JSON.stringify(payload)};
            function closeWindow() {
                window.close();
                setTimeout(() => {
                    document.body.insertAdjacentHTML('beforeend', '<p class="footer-note">(If the window does not close, please click the button above)</p>');
                }, 2000);
            }
            if (window.opener) {
                try {
                    window.opener.postMessage(payload, '${FRONTEND_URL}');
                } catch (err) {
                    console.error('[SP OAuth] postMessage failed:', err);
                }
            }
            if ('${status}' === 'success') {
                setTimeout(closeWindow, 500);
            }
        })();
    </script>
</body>
</html>`);
};

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

        const statePayload = `${accountId}${STATE_PAYLOAD_DELIMITER}${state}`;

        // Determine Base URL based on region (admin-configurable)
        const marketplaceRegionMap = configService.getJson<Record<string, string>>('marketplace_region_map', DEFAULT_MARKETPLACE_REGION_MAP);
        const regionCode = marketplaceRegionMap[account.region];
        if (!regionCode) {
            return res.status(400).json({ message: `Unsupported or unknown region: ${account.region}` });
        }

        let baseUrl: string;
        if (account.integration_type === 'sp_api_vc') {
            const vcRegionUrls = configService.getJson<Record<string, string>>('vc_region_urls', DEFAULT_VC_REGION_URLS);
            baseUrl = vcRegionUrls[regionCode];
        } else {
            const scRegionUrls = configService.getJson<Record<string, string>>('sc_region_urls', DEFAULT_SC_REGION_URLS);
            baseUrl = scRegionUrls[regionCode];
        }

        const consentParams = new URLSearchParams({
            application_id: APP_ID,
            state: statePayload,
            redirect_uri: REDIRECT_URI,
        });

        if (process.env.AMZN_SP_APP_DRAFT === 'true') {
            consentParams.set('version', 'beta');
        }

        const authUrl = `${baseUrl}/apps/authorize/consent?${consentParams.toString()}`;

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

    if (!state) {
        return sendOAuthPopupResponse(res, 'error', 'Missing state parameter');
    }

    let accountId: string;
    let returnedState: string;

    try {
        const parsed = (state as string).split(STATE_PAYLOAD_DELIMITER);
        if (parsed.length < 2) throw new Error('Invalid format');
        accountId = parsed[0];
        returnedState = parsed[1];
    } catch {
        return sendOAuthPopupResponse(res, 'error', 'Invalid state format');
    }

    const account = await IntegrationAccount.findByPk(accountId);
    if (!account) {
        return sendOAuthPopupResponse(res, 'error', 'Integration account not found');
    }

    const storedStateBuffer = Buffer.from(account.oauth_state || '');
    const returnedStateBuffer = Buffer.from(returnedState || '');

    if (
        storedStateBuffer.length !== returnedStateBuffer.length ||
        !crypto.timingSafeEqual(storedStateBuffer, returnedStateBuffer)
    ) {
        return sendOAuthPopupResponse(res, 'error', 'Invalid OAuth state');
    }

    if (error) {
        return sendOAuthPopupResponse(res, 'error', (error_description as string) || 'Authorization denied');
    }

    if (!spapi_oauth_code) {
        return sendOAuthPopupResponse(res, 'error', 'Missing authorization code');
    }

    try {
        const tokenParams = new URLSearchParams({
            grant_type: 'authorization_code',
            code: spapi_oauth_code as string,
            client_id: CLIENT_ID,
            client_secret: CLIENT_SECRET,
            redirect_uri: REDIRECT_URI,
        });

        const tokenUrl = configService.get('amazon_token_url', DEFAULT_TOKEN_URL)!;
        const tokenResponse = await fetch(tokenUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
            },
            body: tokenParams,
        });

        if (!tokenResponse.ok) {
            const errorBody = await tokenResponse.text();
            throw new Error(`Amazon token endpoint returned ${tokenResponse.status}: ${errorBody}`);
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

        return sendOAuthPopupResponse(res, 'success');

    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        Logger.error('Amazon SP Token Exchange Failed', {
            message,
            stack: err instanceof Error ? err.stack : undefined,
        });

        await account.update({
            status: IntegrationStatus.ERROR
        });

        return sendOAuthPopupResponse(res, 'error', 'Token exchange failed');
    }
};

