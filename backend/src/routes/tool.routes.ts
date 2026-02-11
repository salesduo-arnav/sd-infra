
import { Router } from 'express';
import { trackToolUsage } from '../controllers/tool.controller';
import { authenticate } from '../middlewares/auth.middleware';

const router = Router();

router.post('/:id/track', authenticate, trackToolUsage);

export default router;
