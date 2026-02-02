import { Router } from 'express';
import { inviteMember, getPendingInvitations, revokeInvitation, validateInvitation, acceptInvitation, getMyPendingInvitations, declineInvitation } from '../controllers/invitation.controller';
import { authenticate } from '../middlewares/auth.middleware';

const router = Router();

router.post('/', authenticate, inviteMember);
router.get('/validate', validateInvitation); // Public route to validate token
router.get('/my-pending', authenticate, getMyPendingInvitations);
router.get('/', authenticate, getPendingInvitations);
router.delete('/:id', authenticate, revokeInvitation);
router.post('/accept', authenticate, acceptInvitation);
router.post('/decline', authenticate, declineInvitation);

export default router;
