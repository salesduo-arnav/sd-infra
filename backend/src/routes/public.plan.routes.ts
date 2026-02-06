import express from 'express';
import { getPublicBundles, getPublicPlans } from '../controllers/public.plan.controller';

const router = express.Router();

// Public routes for plans page
router.get('/bundles', getPublicBundles);
router.get('/plans', getPublicPlans);

export default router;
