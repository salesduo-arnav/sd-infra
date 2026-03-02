import { Router } from 'express';
import { billingController } from '../controllers/billing.controller';
import { authenticate } from '../middlewares/auth.middleware'; 
import { resolveOrganization, requireOrganization, requirePermission } from '../middlewares/organization.middleware';

const router = Router();

// Groups below endpoints must be authenticated and have an organization context
router.use(authenticate);
router.use(resolveOrganization);
router.use(requireOrganization);

// Read endpoints — require billing.view
router.get('/config', requirePermission('billing.view'), billingController.getConfig.bind(billingController));
router.get('/', requirePermission('billing.view'), billingController.getSubscription);
router.get('/invoices', requirePermission('billing.view'), billingController.getInvoices.bind(billingController));
router.get('/payment-methods', requirePermission('billing.view'), billingController.getPaymentMethods.bind(billingController));
router.get('/trial/eligibility', requirePermission('billing.view'), billingController.checkTrialEligibility.bind(billingController));

// Mutation endpoints — require billing.manage
router.post('/checkout-session', requirePermission('billing.manage'), billingController.createCheckoutSession.bind(billingController));
router.post('/portal-session', requirePermission('billing.manage'), billingController.createPortalSession.bind(billingController));
router.post('/subscription/:id/cancel', requirePermission('billing.manage'), billingController.cancelSubscription.bind(billingController));
router.post('/subscription/:id/resume', requirePermission('billing.manage'), billingController.resumeSubscription.bind(billingController));
router.post('/subscription/:id/cancel-downgrade', requirePermission('billing.manage'), billingController.cancelDowngrade.bind(billingController));
router.put('/subscription/:id', requirePermission('billing.manage'), billingController.updateSubscription.bind(billingController));
router.post('/sync', requirePermission('billing.manage'), billingController.syncSubscription.bind(billingController));
router.post('/trial/start', requirePermission('billing.manage'), billingController.startTrial.bind(billingController));
router.post('/trial/:id/cancel', requirePermission('billing.manage'), billingController.cancelTrial.bind(billingController));

export default router;

