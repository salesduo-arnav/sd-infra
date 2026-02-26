import { Router } from 'express';
import { requireServiceAuth } from '../middlewares/service.middleware';
import {
    getOrganization,
    getSubscription,
    getEntitlements,
    consumeEntitlement,
    trackUsage,
    createAuditLog,
} from '../controllers/internal.controller';

const router = Router();

// All internal routes require service API key auth
router.use(requireServiceAuth);

// Organization data
router.get('/organizations/:id', getOrganization);
router.get('/organizations/:id/subscription', getSubscription);
router.get('/organizations/:id/entitlements', getEntitlements);
router.post('/organizations/:id/entitlements/consume', consumeEntitlement);

// Fire-and-forget operations
router.post('/usage/track', trackUsage);
router.post('/audit-logs', createAuditLog);

export default router;
