import { mailService } from '../services/mail.service';
import crypto from 'crypto';
import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import User from '../models/user';
import { Organization, OrganizationMember } from '../models/organization';
import { Role } from '../models/role';
import { Invitation, InvitationStatus } from '../models/invitation';
import redisClient from '../config/redis';
import { isSuperuserEmail } from '../config/superuser';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });




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
        secure: process.env.NODE_ENV === 'production' ? true : false, // HTTPS only in prod
        sameSite: 'lax', // CSRF protection
        maxAge: sessionTTL * 1000 // Match Redis TTL
    });
};

export const register = async (req: Request, res: Response) => {
    try {
        const { email, password, full_name, token } = req.body;

        const existingUser = await User.findOne({ where: { email } });
        if (existingUser) {
            return res.status(400).json({ message: 'User already exists' });
        }

        let invitation: any = null;
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
        }

        // Refetch user with membership to ensure frontend gets correct state
        const userWithOrg = await User.findByPk(user.id, {
            include: [{
                model: OrganizationMember,
                as: 'membership',
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

        res.status(201).json({
            message: 'Registered successfully',
            user: userWithOrg
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error during registration' });
    }
};

export const login = async (req: Request, res: Response) => {
    try {
        const { email, password } = req.body;

        const user = await User.findOne({ where: { email } });
        if (!user) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        const isMatch = await bcrypt.compare(password, user.password_hash);
        if (!isMatch) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        // Sync superuser status if it changed in config
        const shouldBeSuperuser = isSuperuserEmail(email);
        if (user.is_superuser !== shouldBeSuperuser) {
            user.is_superuser = shouldBeSuperuser;
            await user.save();
        }

        await createSession(res, user);

        res.json({
            message: 'Logged in successfully',
            user: user
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error during login' });
    }
};

export const logout = async (req: Request, res: Response) => {
    const sessionId = req.cookies.session_id;

    if (sessionId) {
        await redisClient.del(`session:${sessionId}`);
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
                as: 'membership',
                include: [{
                    model: Organization,
                    as: 'organization'
                }, {
                    model: Role,
                    as: 'role'
                }]
            }]
        });

        res.json(userWithOrg);
    } catch (error) {
        console.error('GetMe Error:', error);
        res.status(500).json({ message: 'Server error' });
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
            subject: 'Password Reset Request',
            html: `
                <p>You requested a password reset.</p>
                <p>Click this link to reset your password:</p>
                <a href="${resetLink}">${resetLink}</a>
                <p>This link expires in 1 hour.</p>
            `,
        });

        res.json({ message: 'If an account exists, a reset link has been sent.' });
    } catch (error) {
        console.error('Forgot Password Error:', error);
        res.status(500).json({ message: 'Error sending email' });
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

        res.json({ message: 'Password has been reset successfully. You can now login.' });
    } catch (error) {
        console.error('Reset Password Error:', error);
        res.status(500).json({ message: 'Server error resetting password' });
    }
};