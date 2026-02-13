
import { Router } from 'express';
import { trackToolUsage, getTools, getToolBySlug } from '../controllers/tool.controller';
import { authenticate } from '../middlewares/auth.middleware';

const router = Router();

router.get('/', authenticate, getTools);
router.get('/by-slug/:slug', authenticate, getToolBySlug);
router.post('/:id/track', authenticate, trackToolUsage);

export default router;
