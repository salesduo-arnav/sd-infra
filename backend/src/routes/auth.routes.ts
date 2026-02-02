import { Router } from 'express';
import {
    register,
    login,
    getMe,
    logout,
    forgotPassword,
    resetPassword,
    googleAuth,
    sendLoginOtp,
    verifyLoginOtp,
    sendSignupOtp,
    verifySignupOtp
} from '../controllers/auth.controller';
import { authenticate } from '../middlewares/auth.middleware';

const router = Router();

router.post('/register', register);
router.post('/login', login);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);
router.get('/me', authenticate, getMe);
router.post('/logout', authenticate, logout);
router.post('/google', googleAuth);

// OTP Authentication Routes
router.post('/send-login-otp', sendLoginOtp);
router.post('/verify-login-otp', verifyLoginOtp);
router.post('/send-signup-otp', sendSignupOtp);
router.post('/verify-signup-otp', verifySignupOtp);

export default router;