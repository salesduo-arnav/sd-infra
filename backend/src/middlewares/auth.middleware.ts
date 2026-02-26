import { Request, Response, NextFunction } from 'express';
import redisClient from '../config/redis';
import User from '../models/user';
import { handleError } from '../utils/error';
import Logger from '../utils/logger';

export const authenticate = async (req: Request, res: Response, next: NextFunction) => {
    try {
        // 1. Get session ID from cookie
        const sessionId = req.cookies.session_id;

        if (!sessionId) {
            return res.status(401).json({ message: 'Authentication required' });
        }

        // 2. Lookup session in Redis
        const sessionData = await redisClient.get(`session:${sessionId}`);

        if (!sessionData) {
            // Invalid or expired session
            res.clearCookie('session_id');
            return res.status(401).json({ message: 'Session expired' });
        }

        // 3. Parse session and verify user still exists in DB (DB is source of truth)
        const session = JSON.parse(sessionData);

        // Security check: Session binding to IP and User-Agent
        const isLocalhost = (ip: string) => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(ip);
        const reqIp = req.ip || '';
        const ipMatch = session.ip === reqIp || (isLocalhost(session.ip) && isLocalhost(reqIp));
        const uaMatch = session.userAgent === req.headers['user-agent'];

        if (session.ip && session.userAgent && (!ipMatch || !uaMatch)) {
            Logger.warn('Session binding failed', { sessionId, expectedIp: session.ip, actualIp: req.ip, expectedUa: session.userAgent, actualUa: req.headers['user-agent'] });
            await redisClient.del(`session:${sessionId}`);
            res.clearCookie('session_id');
            return res.status(401).json({ message: 'Session invalid' });
        }

        const userExists = await User.findByPk(session.id, { attributes: ['id'] });

        if (!userExists) {
            // User was deleted or DB was reset — clean up stale session
            await redisClient.del(`session:${sessionId}`);
            res.clearCookie('session_id');
            return res.status(401).json({ message: 'User no longer exists' });
        }

        // 4. Attach user to request
        req.user = session;

        next();
    } catch (error) {
        handleError(res, error, 'Auth Middleware Error');
    }
};

export const requireAdmin = (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || !req.user.is_superuser) {
        return res.status(403).json({ message: 'Access denied: Admins only' });
    }
    next();
};