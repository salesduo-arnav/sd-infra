import { Router } from 'express';
import { billingController } from '../controllers/billing.controller';
import { authenticate } from '../middlewares/auth.middleware'; 
import { resolveOrganization, requireOrganization } from '../middlewares/organization.middleware';

const router = Router();

// Groups below endpoints must be authenticated and have an organization context
router.use(authenticate);
router.use(resolveOrganization);
router.use(requireOrganization);

// Get current subscription
router.get('/', billingController.getSubscription);

// Create Checkout Session
router.post('/checkout-session', billingController.createCheckoutSession.bind(billingController));

// Create Portal Session
router.post('/portal-session', billingController.createPortalSession.bind(billingController));

// Invoices and Payment Methods
router.get('/invoices', billingController.getInvoices.bind(billingController));
router.get('/payment-methods', billingController.getPaymentMethods.bind(billingController));

// Subscription Management
router.post('/subscription/:id/cancel', billingController.cancelSubscription.bind(billingController));
router.post('/subscription/:id/resume', billingController.resumeSubscription.bind(billingController));
router.put('/subscription/:id', billingController.updateSubscription.bind(billingController));
// Sync Subscription
router.post('/sync', billingController.syncSubscription.bind(billingController));


export default router;
