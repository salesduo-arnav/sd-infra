import express from 'express';
import {
    getPublicBundles,
    getPublicPlans,
    getPublicPlanCreditGrants,
    getPublicBundleCreditGrants,
} from '../controllers/public.plan.controller';

const router = express.Router();

// Public routes for plans page
router.get('/bundles', getPublicBundles);
router.get('/plans', getPublicPlans);
router.get('/plan-credit-grants', getPublicPlanCreditGrants);
router.get('/bundles/:bundleId/credit-grants', getPublicBundleCreditGrants);

export default router;
