import { Request, Response } from 'express';
import crypto from 'crypto';
import { GlobalIntegration, GlobalIntegrationStatus } from '../models/global_integration';
import { OrganizationMember } from '../models/organization';
import { encrypt } from '../utils/encryption';
import { AuditService } from '../services/audit.service';
import { handleError } from '../utils/error';
import Logger from '../utils/logger';
import redisClient from '../config/redis';
import { STATE_PAYLOAD_DELIMITER } from '../constants/app.constants';
import { WebClient } from '@slack/web-api';
import { slackService } from '../services/slack.service';
import { configService } from '../services/config.service';

// ENV
const CLIENT_ID = process.env.SLACK_CLIENT_ID!;
const CLIENT_SECRET = process.env.SLACK_CLIENT_SECRET!;

// Defaults (overridable via SystemConfig)
const DEFAULT_SLACK_SCOPES = 'chat:write,users:read,users:read.email,channels:read,groups:read,files:write,channels:manage,im:write,channels:join';
const DEFAULT_SLACK_REDIRECT_URI = process.env.SLACK_REDIRECT_URI || 'http://api.lvh.me/integrations/slack/callback';
const DEFAULT_SLACK_AUTHORIZE_URL = 'https://slack.com/oauth/v2/authorize';
const DEFAULT_SLACK_TOKEN_URL = 'https://slack.com/api/oauth.v2.access';
const DEFAULT_SLACK_CHANNEL_NAME = 'salesduo-notifications';

const SLACK_OAUTH_STATE_PREFIX = 'slack_oauth_state:';
const SLACK_OAUTH_STATE_TTL = 600; // 10 minutes

// ========================================
// Helpers
// ========================================

const getOrgId = async (req: Request, res: Response): Promise<string | null> => {
    const orgId = req.headers['x-organization-id'] as string;

    if (!orgId) {
        res.status(400).json({ message: 'x-organization-id header is required' });
        return null;
    }

    const membership = await OrganizationMember.findOne({
        where: { organization_id: orgId, user_id: req.user!.id },
    });

    if (!membership) {
        res.status(403).json({ message: 'You are not a member of this organization' });
        return null;
    }

    return orgId;
};

// ========================================
// Generate Auth URL
// ========================================

export const getSlackAuthUrl = async (req: Request, res: Response) => {
    try {
        const orgId = await getOrgId(req, res);
        if (!orgId) return;

        const state = crypto.randomBytes(16).toString('hex');

        // Store state in Redis with TTL for validation in callback
        const statePayload = `${orgId}${STATE_PAYLOAD_DELIMITER}${state}`;
        await redisClient.setEx(`${SLACK_OAUTH_STATE_PREFIX}${state}`, SLACK_OAUTH_STATE_TTL, orgId);

        const slackScopes = configService.get('slack_bot_scopes', DEFAULT_SLACK_SCOPES)!;
        const redirectUri = configService.get('slack_redirect_uri', DEFAULT_SLACK_REDIRECT_URI)!;
        const authorizeUrl = configService.get('slack_authorize_url', DEFAULT_SLACK_AUTHORIZE_URL)!;

        const params = new URLSearchParams({
            client_id: CLIENT_ID,
            scope: slackScopes,
            redirect_uri: redirectUri,
            state: statePayload,
        });

        const url = `${authorizeUrl}?${params.toString()}`;
        return res.json({ url });
    } catch (error) {
        handleError(res, error, 'Get Slack Auth URL Error');
    }
};

// ========================================
// Handle OAuth Callback
// ========================================

export const handleSlackCallback = async (req: Request, res: Response) => {
    Logger.info('Slack OAuth Callback', { query: req.query });

    const { code, state, error: oauthError } = req.query;

    if (!state) {
        return sendSlackOAuthPopupResponse(res, 'error', 'Missing state parameter');
    }

    // Parse state payload
    let organizationId: string;
    let returnedState: string;

    try {
        const parsed = (state as string).split(STATE_PAYLOAD_DELIMITER);
        if (parsed.length !== 2) throw new Error('Invalid format');
        organizationId = parsed[0];
        returnedState = parsed[1];
    } catch {
        return sendSlackOAuthPopupResponse(res, 'error', 'Invalid state format');
    }

    // Validate state against Redis
    const storedOrgId = await redisClient.get(`${SLACK_OAUTH_STATE_PREFIX}${returnedState}`);
    if (!storedOrgId) {
        return sendSlackOAuthPopupResponse(res, 'error', 'OAuth state expired or invalid');
    }

    // Timing-safe comparison
    const storedBuffer = Buffer.from(storedOrgId);
    const receivedBuffer = Buffer.from(organizationId);

    if (
        storedBuffer.length !== receivedBuffer.length ||
        !crypto.timingSafeEqual(storedBuffer, receivedBuffer)
    ) {
        return sendSlackOAuthPopupResponse(res, 'error', 'Invalid OAuth state');
    }

    // Consume the state (single-use)
    await redisClient.del(`${SLACK_OAUTH_STATE_PREFIX}${returnedState}`);

    if (oauthError) {
        return sendSlackOAuthPopupResponse(res, 'error', oauthError as string);
    }

    if (!code) {
        return sendSlackOAuthPopupResponse(res, 'error', 'Missing authorization code');
    }

    try {
        // Exchange code for token
        const redirectUri = configService.get('slack_redirect_uri', DEFAULT_SLACK_REDIRECT_URI)!;
        const tokenUrl = configService.get('slack_token_url', DEFAULT_SLACK_TOKEN_URL)!;

        const tokenParams = new URLSearchParams({
            client_id: CLIENT_ID,
            client_secret: CLIENT_SECRET,
            code: code as string,
            redirect_uri: redirectUri,
        });

        const tokenResponse = await fetch(tokenUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: tokenParams,
        });

        const tokenData = await tokenResponse.json();

        if (!tokenData.ok) {
            Logger.error('Slack token exchange failed', { error: tokenData.error });
            return sendSlackOAuthPopupResponse(res, 'error', `Slack error: ${tokenData.error}`);
        }

        const { access_token, bot_user_id, scope, app_id, team, authed_user } = tokenData;
        const authedUserId: string | undefined = authed_user?.id;

        // Create a default notification channel
        const client = new WebClient(access_token);
        let defaultChannelId: string | null = null;
        const defaultChannelName = configService.get('slack_default_channel_name', DEFAULT_SLACK_CHANNEL_NAME)!;

        try {
            const createResult = await client.conversations.create({
                name: defaultChannelName,
                is_private: false,
            });
            defaultChannelId = createResult.channel?.id ?? null;
            Logger.info('Created default Slack channel', { channel: defaultChannelName, id: defaultChannelId });
        } catch (createError: unknown) {
            const slackErr = createError as { data?: { error?: string } };
            if (slackErr?.data?.error === 'name_taken') {
                // Channel already exists -- find it and join
                try {
                    let cursor: string | undefined;
                    do {
                        const listResult = await client.conversations.list({
                            types: 'public_channel',
                            limit: 200,
                            cursor,
                        });
                        const found = listResult.channels?.find(ch => ch.name === defaultChannelName);
                        if (found) {
                            defaultChannelId = found.id ?? null;
                            // Ensure bot is a member
                            await client.conversations.join({ channel: defaultChannelId! });
                            break;
                        }
                        cursor = listResult.response_metadata?.next_cursor || undefined;
                    } while (cursor);
                } catch (joinError) {
                    Logger.warn('Could not join existing default channel', { error: joinError });
                }
            } else {
                Logger.warn('Could not create default Slack channel', { error: createError });
            }
        }

        // Invite the authorizing user to the default channel
        if (defaultChannelId && authedUserId) {
            try {
                await client.conversations.invite({
                    channel: defaultChannelId,
                    users: authedUserId,
                });
                Logger.info('Invited user to default Slack channel', { userId: authedUserId, channel: defaultChannelId });
            } catch (inviteError: unknown) {
                const slackErr = inviteError as { data?: { error?: string } };
                // already_in_channel is fine -- user was already there
                if (slackErr?.data?.error !== 'already_in_channel') {
                    Logger.warn('Could not invite user to default channel', { error: inviteError });
                }
            }
        }

        // Encrypt credentials
        const secureCredentials = {
            encrypted: encrypt(JSON.stringify({
                access_token,
                bot_user_id,
                scope,
                obtained_at: new Date().toISOString(),
            })),
        };

        // Non-sensitive config for display + default channel info
        const config: Record<string, unknown> = {
            team_id: team.id,
            team_name: team.name,
            bot_user_id,
            app_id,
            default_channel_id: defaultChannelId,
            default_channel_name: defaultChannelName,
        };

        // Upsert GlobalIntegration
        const [integration, created] = await GlobalIntegration.findOrCreate({
            where: { organization_id: organizationId, service_name: 'slack' },
            defaults: {
                organization_id: organizationId,
                service_name: 'slack',
                status: GlobalIntegrationStatus.CONNECTED,
                credentials: secureCredentials,
                config,
                connected_at: new Date(),
            },
        });

        if (!created) {
            await integration.update({
                status: GlobalIntegrationStatus.CONNECTED,
                credentials: secureCredentials,
                config,
                connected_at: new Date(),
            });
        }

        await AuditService.log({
            action: 'CONNECT_GLOBAL_INTEGRATION_OAUTH',
            entityType: 'GlobalIntegration',
            entityId: integration.id,
            details: { service_name: 'slack', team_name: team.name },
            req,
        });

        return sendSlackOAuthPopupResponse(res, 'success');
    } catch (err) {
        Logger.error('Slack OAuth Token Exchange Failed', { error: err });
        return sendSlackOAuthPopupResponse(res, 'error', 'Token exchange failed');
    }
};

// ========================================
// Get Slack Channels (user-facing)
// ========================================

export const getSlackChannels = async (req: Request, res: Response) => {
    try {
        const orgId = await getOrgId(req, res);
        if (!orgId) return;

        const channels = await slackService.listChannels(orgId);
        return res.json({ channels });
    } catch (error) {
        handleError(res, error, 'Get Slack Channels Error');
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

const sendSlackOAuthPopupResponse = (
    res: Response,
    status: 'success' | 'error',
    message?: string
) => {
    const payload = {
        type: status === 'success'
            ? 'SLACK_AUTH_SUCCESS'
            : 'SLACK_AUTH_ERROR',
        message: message || null,
    };

    const nonce = crypto.randomBytes(16).toString('base64');

    res.setHeader('Content-Security-Policy', `default-src 'self'; script-src 'self' 'nonce-${nonce}';`);
    res.setHeader('Content-Type', 'text/html');

    return res.send(`
<!DOCTYPE html>
<html>
<head>
    <title>Slack Authentication</title>
    <style>
        body {
            margin: 0;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background-color: #ffffff;
            color: #1d1c1d;
            display: flex;
            align-items: center;
            justify-content: center;
            height: 100vh;
        }

        .container {
            width: 360px;
            padding: 24px;
            border: 1px solid #dddddd;
            border-radius: 8px;
            text-align: center;
        }

        .logo {
            font-size: 20px;
            font-weight: bold;
            margin-bottom: 20px;
            color: #4A154B;
        }

        h3 {
            margin: 0 0 12px 0;
            font-size: 18px;
            font-weight: 600;
            color: ${status === 'success' ? '#007a5a' : '#e01e5a'};
        }

        p {
            font-size: 14px;
            color: #616061;
            margin-bottom: 16px;
        }

        .error {
            font-size: 13px;
            color: #e01e5a;
            margin-bottom: 16px;
        }

        .btn {
            width: 100%;
            padding: 10px;
            background-color: #4A154B;
            border: none;
            color: #ffffff;
            font-weight: 600;
            border-radius: 4px;
            cursor: pointer;
        }

        .btn:hover {
            background-color: #611f69;
        }

        .footer-note {
            font-size: 12px;
            color: #999999;
            margin-top: 16px;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="logo">Slack</div>

        ${status === 'success'
            ? `<h3>Authentication Successful</h3>
               <p>Your Slack workspace has been connected successfully.</p>
               <p>This window will close automatically.</p>`
            : `<h3>Authentication Failed</h3>
               <div class="error">${escapeHtml(message || 'An unknown error occurred.')}</div>
               <p>Please close this window and try again.</p>`
        }

        <button class="btn" onclick="window.close()">Close Window</button>
    </div>

    <script nonce="${nonce}">
        (function() {
            const payload = ${JSON.stringify(payload).replace(/</g, '\\u003c')};

            if (window.opener) {
                try {
                    const targetOrigin = '${process.env.FRONTEND_URL || "http://localhost:5173"}';
                    window.opener.postMessage(payload, targetOrigin);
                } catch (err) {
                    console.error("[Slack OAuth] Error sending message:", err);
                }
            }

            if ('${status}' === 'success') {
                setTimeout(function() {
                    window.close();
                    setTimeout(function() {
                        document.body.insertAdjacentHTML(
                            'beforeend',
                            '<p class="footer-note">(If the window does not close, please click the button above)</p>'
                        );
                    }, 2000);
                }, 500);
            }
        })();
    </script>
</body>
</html>
    `);
};
