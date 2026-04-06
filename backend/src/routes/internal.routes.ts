import { Router } from 'express';
import { requireServiceAuth } from '../middlewares/service.middleware';
import {
    getOrganization,
    getOrganizationMembers,
    getSubscription,
    getSubscriptions,
    getEntitlements,
    consumeEntitlement,
    trackUsage,
    createAuditLog,
    sendEmail,
    sendSlackToChannel,
    sendSlackToUser,
    sendSlackFileToChannel,
    sendSlackFileToUser,
    listSlackChannels,
    lookupSlackUser,
    getIntegrationAccounts,
    getIntegrationCredentials,
} from '../controllers/internal.controller';

const router = Router();

// All internal routes require service API key auth
router.use(requireServiceAuth);

// Organization data
router.get('/organizations/:id', getOrganization);
router.get('/organizations/:id/members', getOrganizationMembers);
router.get('/organizations/:id/subscription', getSubscription);
router.get('/organizations/:id/subscriptions', getSubscriptions);
router.get('/organizations/:id/entitlements', getEntitlements);
router.post('/organizations/:id/entitlements/consume', consumeEntitlement);

// Integration credentials
router.get('/integrations/accounts', getIntegrationAccounts);
router.get('/integrations/accounts/:id/credentials', getIntegrationCredentials);

// Fire-and-forget operations
router.post('/usage/track', trackUsage);
router.post('/audit-logs', createAuditLog);

// Email
router.post('/email/send', sendEmail);

// Slack
router.post('/slack/send-to-channel', sendSlackToChannel);
router.post('/slack/send-to-user', sendSlackToUser);
router.post('/slack/send-file-to-channel', sendSlackFileToChannel);
router.post('/slack/send-file-to-user', sendSlackFileToUser);
router.get('/slack/channels/:organization_id', listSlackChannels);
router.get('/slack/lookup-user/:organization_id', lookupSlackUser);

export default router;
