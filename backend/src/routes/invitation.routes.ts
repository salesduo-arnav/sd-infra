import { Router } from 'express';
import { inviteMember, getPendingInvitations, revokeInvitation, validateInvitation } from '../controllers/invitation.controller';
import { authenticate } from '../middlewares/auth.middleware';

const router = Router();

router.post('/', authenticate, inviteMember);
router.get('/validate', validateInvitation); // Public route to validate token
router.get('/', authenticate, getPendingInvitations);
router.delete('/:id', authenticate, revokeInvitation);

export default router;
