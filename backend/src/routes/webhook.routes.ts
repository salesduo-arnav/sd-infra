import express, { Router } from 'express';
import { webhookController } from '../controllers/webhook.controller';

const router = Router();

// Webhook endpoint
router.post('/stripe', express.raw({ type: 'application/json' }), webhookController.handleWebhook.bind(webhookController));

export default router;
