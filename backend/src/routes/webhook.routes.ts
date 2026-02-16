import express, { Router } from 'express';
import { billingController } from '../controllers/billing.controller';

const router = Router();

// Webhook endpoint
router.post('/stripe', express.raw({ type: 'application/json' }), billingController.handleWebhook.bind(billingController));

export default router;
