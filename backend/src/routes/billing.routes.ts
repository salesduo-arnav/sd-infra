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

export default router;
