import { Router } from 'express';
import {
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

const router = Router();

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

// Amazon Ads
import { getAdsAuthUrl, handleAdsCallback } from '../controllers/ads.controller';
router.get('/amazon-ads/auth-url', authenticate, getAdsAuthUrl);
router.get('/amazon-ads/callback', handleAdsCallback); // Callback might not have auth header?

export default router;
