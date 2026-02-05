import { Router } from 'express';
import {
    createOrganization,
    getMyOrganization,
    updateOrganization,
    getOrganizationMembers,
    removeMember,
    updateMemberRole,
    transferOwnership,
    deleteOrganization
} from '../controllers/organization.controller';
import { authenticate } from '../middlewares/auth.middleware';

const router = Router();

router.post('/', authenticate, createOrganization);
router.get('/me', authenticate, getMyOrganization);
router.get('/members', authenticate, getOrganizationMembers);
router.put('/', authenticate, updateOrganization);
router.delete('/', authenticate, deleteOrganization);
router.delete('/members/:memberId', authenticate, removeMember);
router.patch('/members/:memberId', authenticate, updateMemberRole);
router.post('/transfer-ownership', authenticate, transferOwnership);

export default router;
