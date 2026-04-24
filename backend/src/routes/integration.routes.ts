import { Router } from 'express';
import {
    getIntegrationAccountGroups,
    getIntegrationAccounts,
    createIntegrationAccount,
    deleteIntegrationAccount,
    connectIntegrationAccount,
    disconnectIntegrationAccount,
    getGlobalIntegrations,
    connectGlobalIntegration,
    disconnectGlobalIntegration,
} from '../controllers/integration.controller';
import { authenticate } from '../middlewares/auth.middleware';
import rateLimit from 'express-rate-limit';

const oauthRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    limit: 10, // limit each IP to 10 requests per windowMs
    message: 'Too many OAuth requests from this IP, please try again after 15 minutes',
    skip: () => process.env.NODE_ENV === 'test'
});

const router = Router();

// Account groups
router.get('/account-groups', authenticate, getIntegrationAccountGroups);

// Account-level integrations
router.get('/accounts', authenticate, getIntegrationAccounts);
router.post('/accounts', authenticate, createIntegrationAccount);
router.delete('/accounts/:id', authenticate, deleteIntegrationAccount);
router.post('/accounts/:id/connect', authenticate, connectIntegrationAccount);
router.post('/accounts/:id/disconnect', authenticate, disconnectIntegrationAccount);

// Global integrations
router.get('/global', authenticate, getGlobalIntegrations);
router.post('/global', authenticate, connectGlobalIntegration);
router.delete('/global/:id', authenticate, disconnectGlobalIntegration);

// Slack
import { getSlackAuthUrl, handleSlackCallback, getSlackChannels } from '../controllers/slack.controller';
router.get('/slack/auth-url', authenticate, oauthRateLimiter, getSlackAuthUrl);
router.get('/slack/callback', oauthRateLimiter, handleSlackCallback);
router.get('/slack/channels', authenticate, getSlackChannels);

// Amazon Ads
import { getAdsAuthUrl, handleAdsCallback, listAdsAccounts, updateAdsAccount } from '../controllers/ads.controller';
router.get('/amazon-ads/auth-url', authenticate, oauthRateLimiter, getAdsAuthUrl);
router.get('/amazon-ads/callback', oauthRateLimiter, handleAdsCallback);
router.get('/amazon-ads/accounts', authenticate, listAdsAccounts);
router.post('/amazon-ads/accounts', authenticate, updateAdsAccount);

// Amazon SP-API (SC & VC); Note - Handling the Callback in app.ts
import { getSpAuthUrl } from '../controllers/sp.controller';
router.get('/sp-api/auth-url', authenticate, oauthRateLimiter, getSpAuthUrl);

export default router;
