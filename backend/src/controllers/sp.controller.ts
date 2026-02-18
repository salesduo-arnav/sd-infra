import { Request, Response } from 'express';
import { URLSearchParams } from 'url';
import crypto from 'crypto';
import { IntegrationAccount, IntegrationStatus } from '../models/integration_account';
import { handleError } from '../utils/error';
import Logger from '../utils/logger';

// --- ENV ---
// Ensure these are set in your .env file
const APP_ID = process.env.AMZN_SP_APP_ID!;
const CLIENT_ID = process.env.AMZN_SP_CLIENT_ID!;
const CLIENT_SECRET = process.env.AMZN_SP_CLIENT_SECRET!;
const REDIRECT_URI = process.env.AMZN_SP_REDIRECT_URI!;

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
        // defaulting to NA if not found, or maybe throw error
        const regionCode = MARKETPLACE_REGION_MAP[account.region] || 'NA';

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

    if (!state) {
        return sendOAuthPopupResponse(res, 'error', 'Missing state parameter');
    }

    let accountId: string;
    let returnedState: string;

    try {
        const parsed = (state as string).split("##");
        if (parsed.length !== 2) throw new Error('Invalid format');
        accountId = parsed[0];
        returnedState = parsed[1];
    } catch {
        return sendOAuthPopupResponse(res, 'error', 'Invalid state format');
    }

    const account = await IntegrationAccount.findByPk(accountId);
    if (!account) {
        return sendOAuthPopupResponse(res, 'error', 'Integration account not found');
    }

    if (account.oauth_state !== returnedState) {
        return sendOAuthPopupResponse(res, 'error', 'Invalid OAuth state');
    }

    if (error) {
        return sendOAuthPopupResponse(res, 'error', error_description as string);
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

        await account.update({
            status: IntegrationStatus.CONNECTED,
            credentials: {
                access_token,
                refresh_token,
                expires_in,
                token_type: 'bearer',
                obtained_at: new Date().toISOString(),
                selling_partner_id // Store the seller/vendor ID
            },
            connected_at: new Date(),
            oauth_state: null
        });

        return sendOAuthPopupResponse(res, 'success');

    } catch (err) {
        Logger.error('Amazon SP Token Exchange Failed', { error: err });

        await account.update({
            status: IntegrationStatus.ERROR
        });

        return sendOAuthPopupResponse(res, 'error', 'Token exchange failed');
    }
};

// ========================================
// Popup HTML Response
// ========================================
const sendOAuthPopupResponse = (
    res: Response,
    status: 'success' | 'error',
    message?: string
) => {

    const payload = {
        type: status === 'success'
            ? 'SP_AUTH_SUCCESS'
            : 'SP_AUTH_ERROR',
        message: message || null
    };

    // FORCE lax CSP for this specific response to ensure the inline script runs.
    res.setHeader('Content-Security-Policy', "default-src 'self' 'unsafe-inline' 'unsafe-eval'; script-src 'self' 'unsafe-inline' 'unsafe-eval';");
    res.setHeader('Content-Type', 'text/html');

    return res.send(`
<!DOCTYPE html>
<html>
<head>
    <title>Amazon SP-API Authentication</title>
    <style>
        body {
            margin: 0;
            font-family: Arial, Helvetica, sans-serif;
            background-color: #ffffff;
            color: #111111;
            display: flex;
            align-items: center;
            justify-content: center;
            height: 100vh;
        }

        .container {
            width: 360px;
            padding: 24px;
            border: 1px solid #dddddd;
            border-radius: 6px;
            text-align: center;
        }

        .logo {
            font-size: 20px;
            font-weight: bold;
            margin-bottom: 20px;
        }

        .logo span {
            color: #FF9900;
        }

        h3 {
            margin: 0 0 12px 0;
            font-size: 18px;
            font-weight: 600;
            color: ${status === 'success' ? '#067D62' : '#B12704'};
        }

        p {
            font-size: 14px;
            color: #555555;
            margin-bottom: 16px;
        }

        .error {
            font-size: 13px;
            color: #B12704;
            margin-bottom: 16px;
        }

        .btn {
            width: 100%;
            padding: 10px;
            background-color: #FF9900;
            border: 1px solid #E47911;
            color: #111111;
            font-weight: 600;
            border-radius: 4px;
            cursor: pointer;
        }

        .btn:hover {
            background-color: #F08804;
        }

        .footer-note {
            font-size: 12px;
            color: #777777;
            margin-top: 16px;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="logo">
            amazon<span>seller central</span>
        </div>

        ${status === 'success'
            ? `<h3>Authentication Successful</h3>
               <p>Your Amazon account has been connected successfully.</p>
               <p>This window will close automatically.</p>`
            : `<h3>Authentication Failed</h3>
               <div class="error">${message || 'An unknown error occurred.'}</div>
               <p>Please close this window and try again.</p>`
        }
        
        <button class="btn" onclick="window.close()">Close Window</button>
    </div>

    <script>
        (function() {
            console.log("[Backend] OAuth Callback Script Started");
            const payload = ${JSON.stringify(payload)};
            console.log("[Backend] Payload:", payload);
            
            function closeWindow() {
                console.log("[Backend] Attempting to close window...");
                window.close();
                setTimeout(() => {
                    document.body.insertAdjacentHTML(
                        'beforeend',
                        '<p class="footer-note">(If the window does not close, please click the button above)</p>'
                    );
                }, 2000);
            }

            if (window.opener) {
                try {
                    console.log("[Backend] Sending message to opener...");
                    window.opener.postMessage(payload, "*");
                    console.log("[Backend] Message sent.");
                } catch (err) {
                    console.error("[Backend] Error sending message:", err);
                }
            } else {
                console.warn("[Backend] No window.opener found. Polling on frontend should handle state update.");
            }

            if ('${status}' === 'success') {
                setTimeout(closeWindow, 500);
            }
        })();
    </script>
</body>
</html>
    `);
};
