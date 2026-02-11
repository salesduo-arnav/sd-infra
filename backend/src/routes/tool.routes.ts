
import { Router } from 'express';
import { trackToolUsage, getTools } from '../controllers/tool.controller';
import { authenticate } from '../middlewares/auth.middleware';

const router = Router();

router.get('/', authenticate, getTools);
router.post('/:id/track', authenticate, trackToolUsage);

export default router;
