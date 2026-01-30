import { Router } from 'express';
import { createOrganization, getMyOrganization, updateOrganization, getOrganizationMembers } from '../controllers/organization.controller';
import { authenticate } from '../middlewares/auth.middleware';

const router = Router();

router.post('/', authenticate, createOrganization);
router.get('/me', authenticate, getMyOrganization);
router.get('/members', authenticate, getOrganizationMembers);
router.put('/', authenticate, updateOrganization);

export default router;
