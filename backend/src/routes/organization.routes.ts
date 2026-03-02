import { Router } from 'express';
import {
    createOrganization,
    getMyOrganization,
    updateOrganization,
    getOrganizationMembers,
    removeMember,
    updateMemberRole,
    transferOwnership,
    deleteOrganization,
    getMyPermissions
} from '../controllers/organization.controller';
import { authenticate } from '../middlewares/auth.middleware';
import { resolveOrganization, requireOrganization, requirePermission } from '../middlewares/organization.middleware';

const router = Router();

// Public org routes (no permission gating)
router.post('/', authenticate, createOrganization);
router.get('/me', authenticate, getMyOrganization);
router.get('/members', authenticate, getOrganizationMembers);

// Returns the current user's permissions for their active organization
router.get('/my-permissions', authenticate, resolveOrganization, requireOrganization, getMyPermissions);

// Permission-gated routes
router.put('/', authenticate, resolveOrganization, requireOrganization, requirePermission('org.update'), updateOrganization);
router.delete('/', authenticate, resolveOrganization, requireOrganization, requirePermission('org.delete'), deleteOrganization);
router.delete('/members/:memberId', authenticate, resolveOrganization, requireOrganization, requirePermission('members.remove'), removeMember);
router.patch('/members/:memberId', authenticate, resolveOrganization, requireOrganization, requirePermission('members.update_role'), updateMemberRole);
router.post('/transfer-ownership', authenticate, resolveOrganization, requireOrganization, requirePermission('ownership.transfer'), transferOwnership);

export default router;


