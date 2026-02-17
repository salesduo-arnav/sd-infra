import { Router } from 'express';
import { updateProfile, changePassword, createPassword, deleteAccount } from '../controllers/user.controller';
import { authenticate } from '../middlewares/auth.middleware';

const router = Router();

router.put('/me', authenticate, updateProfile);
router.put('/me/password', authenticate, changePassword);
router.post('/me/password', authenticate, createPassword);
router.delete('/me', authenticate, deleteAccount);

export default router;
