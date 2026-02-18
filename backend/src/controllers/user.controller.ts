import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import User from '../models/user';
import { handleError } from '../utils/error';
import Logger from '../utils/logger';
import { AuditService } from '../services/audit.service';

export const updateProfile = async (req: Request, res: Response) => {
    try {
        const userId = req.user?.id;
        const { full_name, email } = req.body;

        if (!userId) {
            return res.status(401).json({ message: 'Unauthorized' });
        }

        const user = await User.findByPk(userId);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // basic validation
        if (email && !/^\S+@\S+\.\S+$/.test(email)) {
            return res.status(400).json({ message: 'Invalid email format' });
        }

        // check if email is taken by another user
        if (email && email !== user.email) {
            const existing = await User.findOne({ where: { email } });
            if (existing) {
                return res.status(400).json({ message: 'Email already in use' });
            }
        }

        const oldDetails = { full_name: user.full_name, email: user.email };

        if (full_name) user.full_name = full_name;
        if (email) user.email = email;

        await user.save();

        Logger.info(`User updated profile: ${user.id}`);

        await AuditService.log({
            actorId: user.id,
            action: 'USER_UPDATE_PROFILE',
            entityType: 'User',
            entityId: user.id,
            details: { old: oldDetails, new: { full_name, email } },
            req
        });

        res.json({ message: 'Profile updated successfully', user });
    } catch (error) {
        handleError(res, error, 'Update Profile Error');
    }
};

export const changePassword = async (req: Request, res: Response) => {
    try {
        const userId = req.user?.id;
        const { currentPassword, newPassword } = req.body;

        if (!userId) {
            return res.status(401).json({ message: 'Unauthorized' });
        }

        if (!currentPassword || !newPassword) {
            return res.status(400).json({ message: 'Current and new password are required' });
        }

        const user = await User.findByPk(userId);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        if (!user.password_hash) {
            return res.status(400).json({ message: 'User has no password set (OAuth user)' });
        }

        const isMatch = await bcrypt.compare(currentPassword, user.password_hash);
        if (!isMatch) {
            return res.status(400).json({ message: 'Incorrect current password' });
        }

        const salt = await bcrypt.genSalt(10);
        user.password_hash = await bcrypt.hash(newPassword, salt);
        await user.save();

        Logger.info(`User changed password: ${user.id}`);

        await AuditService.log({
            actorId: user.id,
            action: 'USER_CHANGE_PASSWORD',
            entityType: 'User',
            entityId: user.id,
            details: {},
            req
        });

        res.json({ message: 'Password changed successfully' });
    } catch (error) {
        handleError(res, error, 'Change Password Error');
    }
};

export const createPassword = async (req: Request, res: Response) => {
    try {
        const userId = req.user?.id;
        const { password } = req.body;

        if (!userId) {
            return res.status(401).json({ message: 'Unauthorized' });
        }

        if (!password) {
            return res.status(400).json({ message: 'Password is required' });
        }

        const user = await User.findByPk(userId);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        if (user.password_hash) {
            return res.status(400).json({ message: 'User already has a password set' });
        }

        const salt = await bcrypt.genSalt(10);
        user.password_hash = await bcrypt.hash(password, salt);
        await user.save();

        Logger.info(`User created password: ${user.id}`);

        await AuditService.log({
            actorId: user.id,
            action: 'USER_CREATE_PASSWORD',
            entityType: 'User',
            entityId: user.id,
            details: {},
            req
        });

        res.json({ message: 'Password created successfully' });
    } catch (error) {
        handleError(res, error, 'Create Password Error');
    }
};

export const deleteAccount = async (req: Request, res: Response) => {
    try {
        const userId = req.user?.id;

        if (!userId) {
            return res.status(401).json({ message: 'Unauthorized' });
        }

        const user = await User.findByPk(userId);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        await user.destroy();

        Logger.info(`User deleted account: ${user.id}`);

        await AuditService.log({
            actorId: user.id,
            action: 'USER_DELETE_ACCOUNT',
            entityType: 'User',
            entityId: user.id,
            details: {},
            req
        });

        const sessionId = req.cookies.session_id;
        if (sessionId) {
            await import('../config/redis').then(r => r.default.del(`session:${sessionId}`));
        }
        res.clearCookie('session_id');

        res.json({ message: 'Account deleted successfully' });
    } catch (error) {
        handleError(res, error, 'Delete Account Error');
    }
};
