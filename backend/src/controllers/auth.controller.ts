import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import User from '../models/user';
import redisClient from '../config/redis';
import { isSuperuserEmail } from '../config/superuser';


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
        const { email, password, full_name } = req.body;

        const existingUser = await User.findOne({ where: { email } });
        if (existingUser) {
            return res.status(400).json({ message: 'User already exists' });
        }

        const salt = await bcrypt.genSalt(10);
        const password_hash = await bcrypt.hash(password, salt);

        const user = await User.create({
            email,
            password_hash,
            full_name,
            is_superuser: isSuperuserEmail(email)
        });


        await createSession(res, user);

        res.status(201).json({
            message: 'Registered successfully',
            user: user
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
    res.json(req.user);
};