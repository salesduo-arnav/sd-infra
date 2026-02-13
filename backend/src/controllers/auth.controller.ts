import { mailService } from '../services/mail.service';
import { otpService } from '../services/otp.service';
import crypto from 'crypto';
import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { OAuth2Client } from 'google-auth-library';
import User from '../models/user';
import { Organization, OrganizationMember } from '../models/organization';
import { Role } from '../models/role';
import { Invitation, InvitationStatus } from '../models/invitation';
import redisClient from '../config/redis';
import { isSuperuserEmail } from '../config/superuser';
import dotenv from 'dotenv';
import path from 'path';
import { handleError } from '../utils/error';
import { AuditService } from '../services/audit.service';
import Logger from '../utils/logger';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const client = new OAuth2Client(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    'postmessage' // Special redirect URI for credentials.getToken() from flow: 'auth-code'
);

// Helper to create session
const createSession = async (res: Response, user: User) => {
    const sessionId = uuidv4();
    const sessionTTL = 86400; // 24 hours

    // Data we want to store in Redis (avoid sensitive data like password)
    const sessionData = {
        id: user.id,
        email: user.email,
        name: user.full_name,
        is_superuser: user.is_superuser
    };

    // Store in Redis
    await redisClient.set(
        `session:${sessionId}`,
        JSON.stringify(sessionData),
        { EX: sessionTTL }
    );

    // Set Cookie
    res.cookie('session_id', sessionId, {
        httpOnly: true, // Prevents XSS
        secure: process.env.NODE_ENV === 'production', // HTTPS only in prod
        sameSite: 'lax', // CSRF protection
        maxAge: sessionTTL * 1000, // Match Redis TTL
        domain: process.env.NODE_ENV === 'production' ? process.env.COOKIE_DOMAIN : undefined
    });
};

export const register = async (req: Request, res: Response) => {
    try {
        const { email, password, full_name, token } = req.body;

        const existingUser = await User.findOne({ where: { email } });
        if (existingUser) {
            return res.status(400).json({ message: 'User already exists' });
        }

        let invitation: Invitation | null = null;
        if (token) {
            invitation = await Invitation.findOne({
                where: {
                    token,
                    status: InvitationStatus.PENDING
                }
            });

            if (!invitation) {
                return res.status(400).json({ message: 'Invalid or expired invitation token' });
            }

            if (invitation.email !== email) {
                return res.status(400).json({ message: 'Email does not match invitation' });
            }

            if (new Date() > invitation.expires_at) {
                return res.status(400).json({ message: 'Invitation expired' });
            }
        }

        const salt = await bcrypt.genSalt(10);
        const password_hash = await bcrypt.hash(password, salt);

        const user = await User.create({
            email,
            password_hash,
            full_name,
            is_superuser: isSuperuserEmail(email)
        });

        if (invitation) {
            // Add user to organization
            await OrganizationMember.create({
                organization_id: invitation.organization_id,
                user_id: user.id,
                role_id: invitation.role_id
            });

            // Mark invitation as accepted
            invitation.status = InvitationStatus.ACCEPTED;
            await invitation.save();

            // Audit log for invitation acceptance
            await AuditService.log({
                actorId: user.id,
                action: 'ACCEPT_INVITATION',
                entityType: 'Invitation',
                entityId: invitation.id,
                details: { organization_id: invitation.organization_id, method: 'registration' },
                req
            });
        }

        // Refetch user with membership to ensure frontend gets correct state
        const userWithOrg = await User.findByPk(user.id, {
            include: [{
                model: OrganizationMember,
                as: 'memberships',
                include: [{
                    model: Organization,
                    as: 'organization'
                }, {
                    model: Role,
                    as: 'role'
                }]
            }]
        });

        await createSession(res, user);

        // Audit log
        await AuditService.log({
            actorId: user.id,
            action: 'USER_REGISTER',
            entityType: 'User',
            entityId: user.id,
            details: { email: user.email, had_invitation: !!invitation },
            req
        });

        res.status(201).json({
            message: 'Registered successfully',
            user: userWithOrg
        });
    } catch (error) {
        handleError(res, error, 'Registration Error');
    }
};

export const login = async (req: Request, res: Response) => {
    try {
        const { email, password, token } = req.body;

        const user = await User.findOne({ where: { email } });
        if (!user) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        const isMatch = user.password_hash && await bcrypt.compare(password, user.password_hash);
        if (!isMatch) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        // Sync superuser status if it changed in config
        const shouldBeSuperuser = isSuperuserEmail(email);
        if (user.is_superuser !== shouldBeSuperuser) {
            user.is_superuser = shouldBeSuperuser;
            await user.save();
        }

        // Handle Invitation if token is provided
        if (token) {
            const invitation = await Invitation.findOne({
                where: {
                    token,
                    status: InvitationStatus.PENDING
                }
            });

            if (invitation) {
                // Validate invitation match
                if (invitation.email === email && new Date() <= invitation.expires_at) {

                    // Check if already a member (idempotency)
                    const existingMembership = await OrganizationMember.findOne({
                        where: {
                            organization_id: invitation.organization_id,
                            user_id: user.id
                        }
                    });

                    if (!existingMembership) {
                        // Add user to organization
                        await OrganizationMember.create({
                            organization_id: invitation.organization_id,
                            user_id: user.id,
                            role_id: invitation.role_id
                        });
                    }

                    // Mark invitation as accepted
                    invitation.status = InvitationStatus.ACCEPTED;
                    await invitation.save();
                }
            }
        }

        // Refetch user with membership to ensure frontend gets correct state
        const userWithOrg = await User.findByPk(user.id, {
            include: [{
                model: OrganizationMember,
                as: 'memberships',
                include: [{
                    model: Organization,
                    as: 'organization'
                }, {
                    model: Role,
                    as: 'role'
                }]
            }]
        });

        await createSession(res, user);

        // Audit log
        await AuditService.log({
            actorId: user.id,
            action: 'USER_LOGIN',
            entityType: 'User',
            entityId: user.id,
            details: { method: 'password' },
            req
        });

        res.json({
            message: 'Logged in successfully',
            user: userWithOrg
        });
    } catch (error) {
        handleError(res, error, 'Login Error');
    }
};

export const logout = async (req: Request, res: Response) => {
    const sessionId = req.cookies.session_id;
    const userId = req.user?.id;

    if (sessionId) {
        await redisClient.del(`session:${sessionId}`);
    }

    // Audit log
    if (userId) {
        await AuditService.log({
            actorId: userId,
            action: 'USER_LOGOUT',
            entityType: 'User',
            entityId: userId,
            details: {},
            req
        });
    }

    res.clearCookie('session_id');
    res.json({ message: 'Logged out successfully' });
};

export const getMe = async (req: Request, res: Response) => {
    // req.user is populated by the middleware
    if (!req.user) return res.status(401).json({ message: 'Not authenticated' });

    // Fetch fresh user data with organization info
    try {
        const userWithOrg = await User.findByPk(req.user.id, {
            include: [{
                model: OrganizationMember,
                as: 'memberships',
                include: [{
                    model: Organization,
                    as: 'organization'
                }, {
                    model: Role,
                    as: 'role'
                }]
            }]
        });

        if (!userWithOrg) {
            // User no longer exists in DB — clear stale session
            res.clearCookie('session_id');
            return res.status(401).json({ message: 'User not found' });
        }

        res.json(userWithOrg);
    } catch (error) {
        handleError(res, error, 'GetMe Error');
    }
};

export const forgotPassword = async (req: Request, res: Response) => {
    try {
        const { email } = req.body;
        const user = await User.findOne({ where: { email } });

        // Always return success even if user doesn't exist to prevent enumeration attacks
        if (!user) {
            return res.json({ message: 'If an account exists, a reset link has been sent.' });
        }

        // Generate a secure random token
        const resetToken = crypto.randomBytes(32).toString('hex');
        const tokenTTL = 3600; // 1 hour

        // Store token in Redis: reset_token:xyz -> user_id
        await redisClient.set(
            `reset_token:${resetToken}`,
            user.id,
            { EX: tokenTTL }
        );

        // Create the reset link (Adjust frontend URL as needed)
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
        const resetLink = `${frontendUrl}/reset-password?token=${resetToken}`;

        // Send Email using MailService
        await mailService.sendMail({
            to: user.email,
            subject: "Reset Your Password - SalesDuo",
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #ff9900;">Password Reset Request</h2>
                <p>You requested to reset your SalesDuo password.</p>

                <div style="background-color: #f5f5f5; padding: 20px; text-align: center; margin: 20px 0;">
                    <a 
                    href="${resetLink}"
                    style="display: inline-block; padding: 12px 24px; background-color: #ff9900; color: #fff; text-decoration: none; font-weight: bold; border-radius: 4px;"
                    >
                    Reset Password
                    </a>
                </div>

                <p>This link is valid for <strong>1 hour</strong>.</p>
                <p>If you didn't request this, you can safely ignore this email.</p>

                <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
                <p style="color: #666; font-size: 12px;">This is an automated message from SalesDuo.</p>
                </div>
            `,
        });

        res.json({ message: 'If an account exists, a reset link has been sent.' });
    } catch (error) {
        handleError(res, error, 'Forgot Password Error');
    }
};

export const resetPassword = async (req: Request, res: Response) => {
    try {
        const { token, newPassword } = req.body;

        // Verify token from Redis
        const userId = await redisClient.get(`reset_token:${token}`);

        if (!userId) {
            return res.status(400).json({ message: 'Invalid or expired token' });
        }

        // Find user
        const user = await User.findByPk(userId);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Hash new password
        const salt = await bcrypt.genSalt(10);
        user.password_hash = await bcrypt.hash(newPassword, salt);
        await user.save();

        // Delete token from Redis so it can't be reused
        await redisClient.del(`reset_token:${token}`);

        // Audit log
        await AuditService.log({
            actorId: user.id,
            action: 'USER_PASSWORD_RESET',
            entityType: 'User',
            entityId: user.id,
            details: {},
            req
        });

        res.json({ message: 'Password has been reset successfully. You can now login.' });
    } catch (error) {
        handleError(res, error, 'Reset Password Error');
    }
};

export const googleAuth = async (req: Request, res: Response) => {
    try {
        const { code, token } = req.body;

        if (!process.env.GOOGLE_CLIENT_SECRET) {
            Logger.error('Missing GOOGLE_CLIENT_SECRET');
            return res.status(500).json({ message: 'Server configuration error' });
        }

        // 1. Exchange code for tokens
        const { tokens } = await client.getToken(code);
        client.setCredentials(tokens);

        // 2. Verify Id Token and get payload
        const ticket = await client.verifyIdToken({
            idToken: tokens.id_token!,
            audience: process.env.GOOGLE_CLIENT_ID,
        });
        const payload = ticket.getPayload();

        if (!payload || !payload.email) {
            return res.status(400).json({ message: 'Invalid Google Token' });
        }

        const { email, name } = payload;

        // 3. Check for valid invitation if token is provided
        let invitation: Invitation | null = null;
        if (token) {
            invitation = await Invitation.findOne({
                where: {
                    token,
                    status: InvitationStatus.PENDING
                }
            });

            if (invitation) {
                // Validate invitation
                if (invitation.email !== email) {
                    return res.status(400).json({ message: 'Google email does not match invitation email' });
                }

                if (new Date() > invitation.expires_at) {
                    return res.status(400).json({ message: 'Invitation expired' });
                }
            } else {
                return res.status(400).json({ message: 'Invalid or expired invitation token' });
            }
        }

        // 4. Check if user exists
        let user = await User.findOne({ where: { email } });
        const isNewUser = !user;

        // 5. If not, create new user
        if (!user) {
            user = await User.create({
                email,
                full_name: name,
                password_hash: null, // No password for Google users
                is_superuser: isSuperuserEmail(email),
            });
        } else {
            // Sync superuser status if it changed in config
            const shouldBeSuperuser = isSuperuserEmail(email);
            if (user.is_superuser !== shouldBeSuperuser) {
                user.is_superuser = shouldBeSuperuser;
                await user.save();
            }
        }

        // 6. Process Invitation if exists
        if (invitation) {
            // Check if already a member (idempotency)
            const membership = await OrganizationMember.findOne({
                where: {
                    organization_id: invitation.organization_id,
                    user_id: user.id
                }
            });

            if (!membership) {
                // Add user to organization
                await OrganizationMember.create({
                    organization_id: invitation.organization_id,
                    user_id: user.id,
                    role_id: invitation.role_id
                });
            }

            // Mark invitation as accepted
            invitation.status = InvitationStatus.ACCEPTED;
            await invitation.save();

            // Audit log for invitation acceptance
            await AuditService.log({
                actorId: user.id,
                action: 'ACCEPT_INVITATION',
                entityType: 'Invitation',
                entityId: invitation.id,
                details: { organization_id: invitation.organization_id, method: 'google_auth' },
                req
            });
        }

        // 7. Refetch user with membership to ensure frontend gets correct state
        const userWithOrg = await User.findByPk(user.id, {
            include: [{
                model: OrganizationMember,
                as: 'memberships',
                include: [{
                    model: Organization,
                    as: 'organization'
                }, {
                    model: Role,
                    as: 'role'
                }]
            }]
        });

        // 8. Create Session
        await createSession(res, user);

        // Audit log
        await AuditService.log({
            actorId: user.id,
            action: 'USER_GOOGLE_AUTH',
            entityType: 'User',
            entityId: user.id,
            details: { is_new_user: isNewUser, had_invitation: !!invitation },
            req
        });

        res.json({
            message: 'Logged in with Google successfully',
            user: userWithOrg
        });

    } catch (error) {
        handleError(res, error, 'Google authentication failed');
    }
};

// ===== OTP AUTHENTICATION ENDPOINTS =====

/**
 * Send OTP for login
 * POST /auth/send-login-otp
 */
export const sendLoginOtp = async (req: Request, res: Response) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({ message: 'Email is required' });
        }

        // Check if user exists
        const user = await User.findOne({ where: { email } });
        if (!user) {
            // Return success anyway to prevent email enumeration
            return res.json({ message: 'If an account exists, an OTP has been sent.' });
        }

        // Generate and store OTP
        const otp = await otpService.createLoginOtp(email);

        // Send OTP via email
        await mailService.sendMail({
            to: email,
            subject: 'Your Login OTP',
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <h2 style="color: #ff9900;">Login Verification</h2>
                    <p>Your one-time password (OTP) for login is:</p>
                    <div style="background-color: #f5f5f5; padding: 20px; text-align: center; margin: 20px 0;">
                        <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #333;">${otp}</span>
                    </div>
                    <p>This OTP is valid for <strong>5 minutes</strong>.</p>
                    <p>If you didn't request this OTP, please ignore this email.</p>
                    <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
                    <p style="color: #666; font-size: 12px;">This is an automated message from SalesDuo.</p>
                </div>
            `,
        });

        res.json({ message: 'If an account exists, an OTP has been sent.' });
    } catch (error) {
        handleError(res, error, 'Send Login OTP Error');
    }
};

/**
 * Verify OTP and login
 * POST /auth/verify-login-otp
 */
export const verifyLoginOtp = async (req: Request, res: Response) => {
    try {
        const { email, otp } = req.body;

        if (!email || !otp) {
            return res.status(400).json({ message: 'Email and OTP are required' });
        }

        // Verify OTP
        const result = await otpService.verifyLoginOtp(email, otp);
        if (!result.valid) {
            return res.status(400).json({ message: result.message });
        }

        // Find user
        const user = await User.findOne({ where: { email } });
        if (!user) {
            return res.status(401).json({ message: 'User not found' });
        }

        // Sync superuser status if it changed in config
        const shouldBeSuperuser = isSuperuserEmail(email);
        if (user.is_superuser !== shouldBeSuperuser) {
            user.is_superuser = shouldBeSuperuser;
            await user.save();
        }

        // Fetch user with organization
        const userWithOrg = await User.findByPk(user.id, {
            include: [{
                model: OrganizationMember,
                as: 'memberships',
                include: [{
                    model: Organization,
                    as: 'organization'
                }, {
                    model: Role,
                    as: 'role'
                }]
            }]
        });

        // Create session
        await createSession(res, user);

        // Audit log
        await AuditService.log({
            actorId: user.id,
            action: 'USER_LOGIN_OTP_VERIFIED',
            entityType: 'User',
            entityId: user.id,
            details: { method: 'otp' },
            req
        });

        res.json({
            message: 'Logged in successfully',
            user: userWithOrg
        });
    } catch (error) {
        handleError(res, error, 'Verify Login OTP Error');
    }
};

/**
 * Send OTP for signup verification
 * POST /auth/send-signup-otp
 */
export const sendSignupOtp = async (req: Request, res: Response) => {
    try {
        const { email, password, full_name, token } = req.body;

        if (!email || !password || !full_name) {
            return res.status(400).json({ message: 'Email, password, and full name are required' });
        }

        // Check if user already exists
        const existingUser = await User.findOne({ where: { email } });
        if (existingUser) {
            return res.status(400).json({ message: 'An account with this email already exists' });
        }

        // Validate invitation if token provided
        if (token) {
            const invitation = await Invitation.findOne({
                where: {
                    token,
                    status: InvitationStatus.PENDING
                }
            });

            if (!invitation) {
                return res.status(400).json({ message: 'Invalid or expired invitation token' });
            }

            if (invitation.email !== email) {
                return res.status(400).json({ message: 'Email does not match invitation' });
            }


            if (new Date() > invitation.expires_at) {
                return res.status(400).json({ message: 'Invitation expired' });
            }
        }

        // Generate and store OTP with user data
        const otp = await otpService.createSignupOtp(email, password, full_name, token);

        // Send OTP via email
        await mailService.sendMail({
            to: email,
            subject: 'Verify Your Email - SalesDuo',
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <h2 style="color: #ff9900;">Welcome to SalesDuo!</h2>
                    <p>To complete your registration, please verify your email with this one-time password:</p>
                    <div style="background-color: #f5f5f5; padding: 20px; text-align: center; margin: 20px 0;">
                        <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #333;">${otp}</span>
                    </div>
                    <p>This OTP is valid for <strong>5 minutes</strong>.</p>
                    <p>If you didn't create an account, please ignore this email.</p>
                    <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
                    <p style="color: #666; font-size: 12px;">This is an automated message from SalesDuo.</p>
                </div>
            `,
        });

        res.json({ message: 'Verification OTP sent to your email' });
    } catch (error) {
        handleError(res, error, 'Send Signup OTP Error');
    }
};

/**
 * Verify OTP and complete registration
 * POST /auth/verify-signup-otp
 */
export const verifySignupOtp = async (req: Request, res: Response) => {
    try {
        const { email, otp } = req.body;

        if (!email || !otp) {
            return res.status(400).json({ message: 'Email and OTP are required' });
        }

        // Verify OTP and get stored user data
        const result = await otpService.verifySignupOtp(email, otp);
        if (!result.valid || !result.userData) {
            return res.status(400).json({ message: result.message });
        }

        const { password, full_name, token } = result.userData;

        // Double-check user doesn't exist (race condition protection)
        const existingUser = await User.findOne({ where: { email } });
        if (existingUser) {
            return res.status(400).json({ message: 'An account with this email already exists' });
        }

        // Check for invitation
        let invitation: Invitation | null = null;
        if (token) {
            invitation = await Invitation.findOne({
                where: {
                    token,
                    status: InvitationStatus.PENDING
                }
            });

            if (!invitation) {
                return res.status(400).json({ message: 'Invalid or expired invitation token' });
            }

            if (invitation.email !== email) {
                return res.status(400).json({ message: 'Email does not match invitation' });
            }

            if (new Date() > invitation.expires_at) {
                return res.status(400).json({ message: 'Invitation expired' });
            }
        }

        // Hash password and create user
        const salt = await bcrypt.genSalt(10);
        const password_hash = await bcrypt.hash(password, salt);

        const user = await User.create({
            email,
            password_hash,
            full_name,
            is_superuser: isSuperuserEmail(email)
        });

        // Process invitation if exists
        if (invitation) {
            await OrganizationMember.create({
                organization_id: invitation.organization_id,
                user_id: user.id,
                role_id: invitation.role_id
            });

            invitation.status = InvitationStatus.ACCEPTED;
            await invitation.save();

            // Audit log for invitation acceptance
            await AuditService.log({
                actorId: user.id,
                action: 'ACCEPT_INVITATION',
                entityType: 'Invitation',
                entityId: invitation.id,
                details: { organization_id: invitation.organization_id, method: 'signup_otp' },
                req
            });
        }

        // Fetch user with membership
        const userWithOrg = await User.findByPk(user.id, {
            include: [{
                model: OrganizationMember,
                as: 'memberships',
                include: [{
                    model: Organization,
                    as: 'organization'
                }, {
                    model: Role,
                    as: 'role'
                }]
            }]
        });

        // Create session
        await createSession(res, user);

        // Audit log
        await AuditService.log({
            actorId: user.id,
            action: 'USER_SIGNUP_OTP_VERIFIED',
            entityType: 'User',
            entityId: user.id,
            details: { email: user.email, had_invitation: !!invitation },
            req
        });

        res.status(201).json({
            message: 'Account created successfully',
            user: userWithOrg
        });
    } catch (error) {
        handleError(res, error, 'Verify Signup OTP Error');
    }
};