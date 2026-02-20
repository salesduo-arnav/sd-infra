import { Router } from 'express';
import { inviteMember, getPendingInvitations, revokeInvitation, validateInvitation, acceptInvitation, getMyPendingInvitations, declineInvitation } from '../controllers/invitation.controller';
import { authenticate } from '../middlewares/auth.middleware';
import { resolveOrganization, requireOrganization, requirePermission } from '../middlewares/organization.middleware';

const router = Router();

// Permission-gated invitation management
router.post('/', authenticate, resolveOrganization, requireOrganization, requirePermission('members.invite'), inviteMember);
router.delete('/:id', authenticate, resolveOrganization, requireOrganization, requirePermission('members.invite'), revokeInvitation);

// Read/validate routes (authenticated but not permission-gated)
router.get('/validate', validateInvitation);
router.get('/my-pending', authenticate, getMyPendingInvitations);
router.get('/', authenticate, getPendingInvitations);
router.post('/accept', authenticate, acceptInvitation);
router.post('/decline', authenticate, declineInvitation);

export default router;
