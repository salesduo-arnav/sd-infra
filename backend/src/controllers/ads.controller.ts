import { Request, Response } from 'express';
import { URLSearchParams } from 'url';
import crypto from 'crypto';
import { IntegrationAccount, IntegrationStatus } from '../models/integration_account';
import { encrypt, decrypt } from '../utils/encryption';
import { AuditService } from '../services/audit.service';
import { handleError } from '../utils/error';
import Logger from '../utils/logger';
import { configService } from '../services/config.service';
import { STATE_PAYLOAD_DELIMITER } from '../constants/app.constants';

interface AdsCredentials {
    encrypted: string;
}

interface AmazonProfile {
    profileId: string | number;
    countryCode?: string;
    accountInfo?: {
        name?: string;
        type?: string;
        id?: string;
    };
}

interface AmazonAdsAccount {
    adsAccountId: string;
    countryCodes?: string[];
    alternateIds?: {
        profileId?: string | number;
        entityId?: string;
        countryCode?: string;
    }[];
    entityId?: string;
}

interface AmazonAdsAccountListResponse {
    adsAccounts?: AmazonAdsAccount[];
    nextToken?: string;
}

// --- ENV ---
const CLIENT_ID = process.env.AMAZON_ADS_CLIENT_ID!;
const CLIENT_SECRET = process.env.AMAZON_ADS_CLIENT_SECRET!;
const REDIRECT_URI = process.env.AMAZON_ADS_REDIRECT_URI!;

// ========================================
// Metadata Helpers
// ========================================

const ADS_REGIONS: Record<string, string> = {
    NA: 'https://advertising-api.amazon.com',
    EU: 'https://advertising-api-eu.amazon.com',
    FE: 'https://advertising-api-fe.amazon.com',
};

const COUNTRY_TO_REGION: Record<string, string> = {
    US: 'NA', CA: 'NA', MX: 'NA', BR: 'NA',
    UK: 'EU', GB: 'EU', DE: 'EU', FR: 'EU', ES: 'EU', IT: 'EU', NL: 'EU', SE: 'EU', PL: 'EU', TR: 'EU', IN: 'EU',
    JP: 'FE', AU: 'FE', SG: 'FE',
};

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

        const statePayload = `${accountId}${STATE_PAYLOAD_DELIMITER}${state}`;

        const authUrl = configService.get('amazon_ads_auth_url', 'https://www.amazon.com/ap/oa')!;
        const adsScope = configService.get('amazon_ads_scope', 'advertising::campaign_management')!;

        const params = new URLSearchParams({
            client_id: CLIENT_ID,
            scope: adsScope,
            response_type: 'code',
            redirect_uri: REDIRECT_URI,
            state: statePayload,
        });

        const url = `${authUrl}?${params.toString()}`;
        return res.json({ url });

    } catch (error) {
        handleError(res, error, 'Get Ads Auth URL Error');
    }
};

// ========================================
// Handle OAuth Callback
// ========================================
export const handleAdsCallback = async (req: Request, res: Response) => {
    Logger.info('Amazon Ads Callback Received', { 
        state: req.query.state, 
        hasCode: !!req.query.code 
    });

    const { code, state, error, error_description } = req.query;

    if (!state) {
        return sendOAuthPopupResponse(res, 'error', 'Missing state parameter');
    }

    let accountId: string;
    let returnedState: string;

    try {
        const parsed = (state as string).split(STATE_PAYLOAD_DELIMITER);
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

    const storedStateBuffer = Buffer.from(account.oauth_state || '');
    const returnedStateBuffer = Buffer.from(returnedState || '');

    if (
        storedStateBuffer.length !== returnedStateBuffer.length ||
        !crypto.timingSafeEqual(storedStateBuffer, returnedStateBuffer)
    ) {
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

        const tokenUrl = configService.get('amazon_token_url', 'https://api.amazon.com/auth/o2/token')!;
        const tokenResponse = await fetch(tokenUrl, {
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

        // Fetch Ads Metadata (Profile, Account, Entity IDs)
        let adsMetadata = {};
        try {
            adsMetadata = await fetchAdsMetadata(access_token, account.region || 'NA');
        } catch (metaErr) {
            Logger.warn('Failed to fetch ads metadata during callback', { error: metaErr });
        }

        const secureCredentials = {
            encrypted: encrypt(JSON.stringify({
                access_token,
                refresh_token,
                expires_in,
                token_type: 'bearer',
                obtained_at: new Date().toISOString()
            })),
            ads_metadata: adsMetadata
        };

        await account.update({
            status: IntegrationStatus.DISCONNECTED, // Keep disconnected until account/profile selected
            credentials: secureCredentials,
            oauth_state: null
        });

        await AuditService.log({
            action: 'CONNECT_INTEGRATION_ACCOUNT_OAUTH',
            entityType: 'IntegrationAccount',
            entityId: account.id,
            details: { type: account.integration_type },
            req
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
// Ads Account Selection
// ========================================

/**
 * Lists Amazon Ads accounts (using v2/profiles)
 * Handles filtering by the integration's region and sorts by name.
 */
export const listAdsAccounts = async (req: Request, res: Response) => {
    const { accountId } = req.query;
    Logger.info('>>> listAdsAccounts CALLED <<<', { accountId });
    try {
        if (!accountId) {
            Logger.warn('listAdsAccounts: accountId is missing');
            return res.status(400).json({ message: 'accountId is required' });
        }

        const account = await IntegrationAccount.findByPk(accountId as string);
        if (!account || !account.credentials) {
            Logger.warn('listAdsAccounts: Account or credentials not found', { accountId });
            return res.status(404).json({ message: 'Account or credentials not found' });
        }

        const creds = account.credentials as unknown as AdsCredentials;
        if (!creds.encrypted) {
            Logger.warn('listAdsAccounts: Account not encrypted/authenticated', { accountId });
            return res.status(400).json({ message: 'Account not authenticated' });
        }

        const decrypted = decrypt(creds.encrypted);
        const { access_token } = JSON.parse(decrypted);
        const country = account.region?.toUpperCase() || 'US';
        const amsRegion = COUNTRY_TO_REGION[country] || 'NA';
        const baseUrl = ADS_REGIONS[amsRegion];

        Logger.info('listAdsAccounts: Fetching profiles from Amazon', { amsRegion, baseUrl, country });

        // 1. Fetch profiles
        const response = await fetch(`${baseUrl}/v2/profiles`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${access_token}`,
                'Amazon-Advertising-API-ClientId': CLIENT_ID,
                'Content-Type': 'application/json',
            }
        });

        if (!response.ok) {
            const errorText = await response.text();
            Logger.error('listAdsAccounts: Amazon profiles API error', { status: response.status, error: errorText });
            throw new Error(`Failed to fetch ads profiles: ${errorText}`);
        }

        const profiles = await response.json() as AmazonProfile[];
        Logger.info('listAdsAccounts: Profiles received from Amazon', { count: profiles.length });
        
        // 2. Filter by Country and format
        const targetCountry = country.toUpperCase();
        const filtered = profiles
            .filter(p => p.countryCode?.toUpperCase() === targetCountry)
            .map(p => ({
                profileId: String(p.profileId),
                name: `${p.accountInfo?.name || 'Unknown'} - (${p.accountInfo?.type || 'unknown'})`,
                entityId: p.accountInfo?.id
            }))
            .sort((a, b) => a.name.localeCompare(b.name));

        Logger.info('listAdsAccounts: Profiles filtered and formatted', { 
            targetCountry,
            filteredCount: filtered.length,
            totalCount: profiles.length
        });

        // If filtered is empty but we have profiles, return everything as fallback
        if (filtered.length === 0 && profiles.length > 0) {
            Logger.warn('listAdsAccounts: No profiles matched country filter, returning all profiles as fallback', {
                targetCountry,
                availableCountries: [...new Set(profiles.map(p => p.countryCode))]
            });
            const allProfiles = profiles.map(p => ({
                profileId: String(p.profileId),
                name: `${p.accountInfo?.name || 'Unknown'} - (${p.accountInfo?.type || 'unknown'})`,
                entityId: p.accountInfo?.id
            })).sort((a, b) => a.name.localeCompare(b.name));
            return res.json(allProfiles);
        }

        return res.json(filtered);

    } catch (error) {
        handleError(res, error, 'List Ads Profiles Error');
    }
};

/**
 * Updates the selected Ads Account for the integration.
 * Now takes profileId and maps all required IDs.
 */
export const updateAdsAccount = async (req: Request, res: Response) => {
  const { accountId, profileId: selectedProfileId } = req.body;
  Logger.info('>>> updateAdsAccount CALLED <<<', { accountId, selectedProfileId });
  
  try {
    if (!accountId || !selectedProfileId) {
      Logger.warn('updateAdsAccount: Missing accountId or profileId');
      return res.status(400).json({
        message: 'accountId and profileId are required',
      });
    }

    const profileIdStr = String(selectedProfileId);

    const account = await IntegrationAccount.findByPk(accountId);
    if (!account || !account.credentials) {
      Logger.warn('updateAdsAccount: Account or credentials not found', { accountId });
      return res.status(404).json({ message: 'Account or credentials not found' });
    }

    const creds = account.credentials as unknown as AdsCredentials;
    const decrypted = decrypt(creds.encrypted);
    const { access_token } = JSON.parse(decrypted);

    const country = account.region?.toUpperCase() || 'US';
    const amsRegion = COUNTRY_TO_REGION[country] || 'NA';
    const baseUrl = ADS_REGIONS[amsRegion];

    Logger.info('updateAdsAccount: Using credentials to fetch profile details', { amsRegion, country });

    const headers = {
      Authorization: `Bearer ${access_token}`,
      'Amazon-Advertising-API-ClientId': CLIENT_ID,
      'Content-Type': 'application/json',
    };

    // 1. Fetch the specific profile from v2/profiles to get profile-level entity ID
    const profilesRes = await fetch(`${baseUrl}/v2/profiles`, {
      method: 'GET',
      headers,
    });

    if (!profilesRes.ok) {
      const errText = await profilesRes.text();
      Logger.error('updateAdsAccount: Amazon profiles API error', { status: profilesRes.status, error: errText });
      throw new Error('Failed to fetch ads profiles list');
    }

    const profiles = (await profilesRes.json()) as AmazonProfile[];
    const selectedProfile = profiles.find((p: AmazonProfile) => String(p.profileId) === profileIdStr);

    if (!selectedProfile) {
      Logger.warn('updateAdsAccount: Profile ID not found in Amazon list', { profileIdStr, availableCount: profiles.length });
      return res.status(404).json({ message: 'Selected Ads Profile not found in Amazon' });
    }

    Logger.info('updateAdsAccount: Profile matched. Fetching adsAccounts/list to map IDs.', { 
        profileId: profileIdStr,
        profileEntityId: selectedProfile.accountInfo?.id
    });

    // 2. Fetch adsAccounts/list to get ad_account_id and ad_entity_id
    let adsAccountId: string | null = null;
    let adEntityId: string | null = null;
    let nextToken: string | undefined = undefined;
    let foundMatch = false;

    do {
      Logger.info('updateAdsAccount: Requesting adsAccounts/list page', { nextToken: !!nextToken });
      const adsAccRes = await fetch(`${baseUrl}/adsAccounts/list`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          maxResults: 100,
          nextToken: nextToken,
        }),
      });

      if (!adsAccRes.ok) {
        const errText = await adsAccRes.text();
        Logger.error('updateAdsAccount: Amazon adsAccounts API error', { status: adsAccRes.status, error: errText });
        throw new Error('Failed to fetch ads accounts list');
      }

      const adsAccData = (await adsAccRes.json()) as AmazonAdsAccountListResponse;
      const adsAccounts = adsAccData?.adsAccounts || [];

      // Find match for the profile ID
      const matchedAccount = adsAccounts.find((acc: AmazonAdsAccount) => {
        const alternateIds = acc.alternateIds || [];
        return alternateIds.some((alt) => String(alt.profileId) === profileIdStr);
      });

      if (matchedAccount) {
        Logger.info('updateAdsAccount: Found matching account in adsAccounts/list', { adsAccountId: matchedAccount.adsAccountId });
        adsAccountId = matchedAccount.adsAccountId;
        // Find the entityId for the specific profile/country match if possible, or take from matchedAccount
        const altMatch = (matchedAccount.alternateIds || []).find(
          (alt) => String(alt.profileId) === profileIdStr
        );
        adEntityId = altMatch?.entityId || matchedAccount.entityId || null;
        foundMatch = true;
        break;
      }

      nextToken = adsAccData.nextToken;
    } while (nextToken);

    if (!foundMatch) {
        Logger.warn('updateAdsAccount: Profile ID not found in adsAccounts/list after full scan', { profileIdStr });
    }

    const adsMetadata = {
      ad_profile_id: profileIdStr,
      ad_profile_entity_id: selectedProfile.accountInfo?.id || null,
      ad_account_id: adsAccountId,
      ad_entity_id: adEntityId,
    };

    Logger.info('updateAdsAccount: Final Metadata Mapping', adsMetadata);

    // 3. Update account
    const updatedCredentials = {
      ...creds,
      ads_metadata: adsMetadata,
    };

    await account.update({
      credentials: updatedCredentials,
      status: IntegrationStatus.CONNECTED,
    });

    Logger.info('updateAdsAccount: Account successfully marked as CONNECTED', { accountId });

    return res.json({ success: true, ads_metadata: adsMetadata });
  } catch (error) {
    handleError(res, error, 'Update Ads Account Error');
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

    const nonce = crypto.randomBytes(16).toString('base64');

    // Ensure secure CSP with nonce instead of unsafe-inline
    res.setHeader('Content-Security-Policy', `default-src 'self'; script-src 'self' 'nonce-${nonce}';`);
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

    <script nonce="${nonce}">
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
                    // Using '*' for targetOrigin to avoid mismatch issues in local docker/ngrok setups
                    window.opener.postMessage(payload, "*");
                    console.log("[Backend] Message sent with payload:", payload);
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

/**
 * Fetches required IDs from Amazon Ads API after successful OAuth.
 * Uses only the adsAccounts/list endpoint as it contains profile and entity IDs.
 */
async function fetchAdsMetadata(accessToken: string, targetCountry: string) {
    const country = targetCountry?.toUpperCase() || 'US';
    const amsRegion = COUNTRY_TO_REGION[country] || 'NA';
    const baseUrl = ADS_REGIONS[amsRegion];

    const headers = {
        'Authorization': `Bearer ${accessToken}`,
        'Amazon-Advertising-API-ClientId': CLIENT_ID,
        'Content-Type': 'application/json',
    };

    // 1. List Ads Accounts
    // This returns the adsAccountId and alternateIds (which contain profileId and entityId per country)
    const adsAccRes = await fetch(`${baseUrl}/adsAccounts/list`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ maxResults: 100 })
    });

    if (!adsAccRes.ok) {
        const errorText = await adsAccRes.text();
        throw new Error(`Failed to fetch ads accounts: ${errorText}`);
    }

    const data = await adsAccRes.json() as AmazonAdsAccountListResponse;
    const accounts = data?.adsAccounts || [];

    if (accounts.length === 0) {
        return {};
    }

    // 2. Find the account that matches our selected country
    for (const acc of accounts) {
        const countryCodes = acc.countryCodes || [];
        
        // If this account supports our country (or if we only have one account, use it as fallback)
        if (countryCodes.includes(country) || accounts.length === 1) {
            const target = countryCodes.includes(country) ? country : countryCodes[0];
            
            const adsAccountId = acc.adsAccountId;
            
            // Extract profileId and entityId from alternateIds for this specific country
            const alternateIds = acc.alternateIds || [];
            const profileMatch = alternateIds.find((id) => id.countryCode === target && id.profileId);
            const entityMatch = alternateIds.find((id) => id.countryCode === target && id.entityId);

            return {
                ad_profile_id: profileMatch ? String(profileMatch.profileId) : null,
                ad_account_id: adsAccountId,
                ad_entity_id: entityMatch ? entityMatch.entityId : null
            };
        }
    }

    return {};
}
