import { Request, Response } from 'express';
import { URLSearchParams } from 'url';
import crypto from 'crypto';
import { IntegrationAccount, IntegrationStatus } from '../models/integration_account';
import { handleError } from '../utils/error';
import Logger from '../utils/logger';

// --- ENV ---
const CLIENT_ID = process.env.AMAZON_ADS_CLIENT_ID!;
const CLIENT_SECRET = process.env.AMAZON_ADS_CLIENT_SECRET!;
const REDIRECT_URI = process.env.AMAZON_ADS_REDIRECT_URI!;

const AUTH_URL = 'https://www.amazon.com/ap/oa';
const TOKEN_URL = 'https://api.amazon.com/auth/o2/token';

// ========================================
// Generate Auth URL
// ========================================
export const getAdsAuthUrl = async (req: Request, res: Response) => {
    try {
        const { accountId } = req.query;

        if (!accountId) {
            return res.status(400).json({ message: 'accountId is required' });
        }

        const state = crypto.randomBytes(16).toString('hex');

        const account = await IntegrationAccount.findByPk(accountId as string);
        if (!account) {
            return res.status(404).json({ message: 'Integration account not found' });
        }

        await account.update({
            oauth_state: state
        });

        const statePayload = `${accountId}##${state}`; // accountId##state

        const params = new URLSearchParams({
            client_id: CLIENT_ID,
            scope: 'advertising::campaign_management',
            response_type: 'code',
            redirect_uri: REDIRECT_URI,
            state: statePayload,
        });

        const url = `${AUTH_URL}?${params.toString()}`;
        return res.json({ url });

    } catch (error) {
        handleError(res, error, 'Get Ads Auth URL Error');
    }
};

// ========================================
// Handle OAuth Callback
// ========================================
export const handleAdsCallback = async (req: Request, res: Response) => {
    Logger.info('Amazon Ads Callback', { query: req.query });

    const { code, state, error, error_description } = req.query;

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

    if (!code) {
        return sendOAuthPopupResponse(res, 'error', 'Missing authorization code');
    }

    try {
        const tokenParams = new URLSearchParams({
            grant_type: 'authorization_code',
            code: code as string,
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
                obtained_at: new Date().toISOString()
            },
            connected_at: new Date(),
            oauth_state: null
        });

        return sendOAuthPopupResponse(res, 'success');

    } catch (err) {
        Logger.error('Amazon Ads Token Exchange Failed', { error: err });

        await account.update({
            status: IntegrationStatus.ERROR
        });

        return sendOAuthPopupResponse(res, 'error', 'Token exchange failed');
    }
};

// ========================================
// Popup HTML Response
// ========================================

const escapeHtml = (unsafe: string) => {
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
};

const sendOAuthPopupResponse = (
    res: Response,
    status: 'success' | 'error',
    message?: string
) => {

    const payload = {
        type: status === 'success'
            ? 'ADS_AUTH_SUCCESS'
            : 'ADS_AUTH_ERROR',
        message: message || null
    };

    // FORCE lax CSP for this specific response to ensure the inline script runs.
    res.setHeader('Content-Security-Policy', "default-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline';");
    res.setHeader('Content-Type', 'text/html');

    return res.send(`
<!DOCTYPE html>
<html>
<head>
    <title>Amazon Ads Authentication</title>
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
            amazon<span>ads</span>
        </div>

        ${status === 'success'
            ? `<h3>Authentication Successful</h3>
               <p>Your Amazon Ads account has been connected successfully.</p>
               <p>This window will close automatically.</p>`
            : `<h3>Authentication Failed</h3>
               <div class="error">${escapeHtml(message || 'An unknown error occurred.')}</div>
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
                    const targetOrigin = '${process.env.FRONTEND_URL || "http://localhost:5173"}';
                    window.opener.postMessage(payload, targetOrigin);
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
