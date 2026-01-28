import { Request, Response, NextFunction } from 'express';
import redisClient from '../config/redis';

export const authenticate = async (req: Request, res: Response, next: NextFunction) => {
    try {
        // 1. Get session ID from cookie
        const sessionId = req.cookies.session_id;
        
        if (!sessionId) {
            console.log('[Auth Middleware] No session ID found');
            return res.status(401).json({ message: 'Authentication required' });
        }

        // 2. Lookup session in Redis
        const sessionData = await redisClient.get(`session:${sessionId}`);
        
        if (!sessionData) {
            // Invalid or expired session
            res.clearCookie('session_id');
            console.log('[Auth Middleware] Invalid or expired session');
            return res.status(401).json({ message: 'Session expired' });
        }

        // 3. Attach user to request
        req.user = JSON.parse(sessionData);

        next();
    } catch (error) {
        console.error('Auth Middleware Error:', error);
        return res.status(500).json({ message: 'Internal server error' });
    }
};