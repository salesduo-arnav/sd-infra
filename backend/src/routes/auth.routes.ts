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
import rateLimit from 'express-rate-limit';

const otpRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // Limit each IP to 5 requests per windowMs
    message: { message: 'Too many OTP requests from this IP, please try again after 15 minutes' },
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});

const router = Router();

router.post('/register', register);
router.post('/login', login);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);
router.get('/me', authenticate, getMe);
router.post('/logout', authenticate, logout);
router.post('/google', googleAuth);

// OTP Authentication Routes
router.post('/send-login-otp', otpRateLimiter, sendLoginOtp);
router.post('/verify-login-otp', otpRateLimiter, verifyLoginOtp);
router.post('/send-signup-otp', otpRateLimiter, sendSignupOtp);
router.post('/verify-signup-otp', otpRateLimiter, verifySignupOtp);

export default router;