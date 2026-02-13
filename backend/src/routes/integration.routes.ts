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

export default router;
