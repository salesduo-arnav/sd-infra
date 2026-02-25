import { Request, Response, NextFunction } from 'express';
import Logger from '../utils/logger';

// Extend Request to include service identity
declare module 'express-serve-static-core' {
    interface Request {
        serviceName?: string;
    }
}

/**
 * Middleware to authenticate internal service-to-service requests.
 * Validates the X-Service-Key header against INTERNAL_API_KEY env var.
 * Attaches the caller's service name from X-Service-Name header.
 */
export const requireServiceAuth = (req: Request, res: Response, next: NextFunction) => {
    const serviceKey = req.headers['x-service-key'] as string;
    const serviceName = req.headers['x-service-name'] as string;

    if (!serviceKey) {
        return res.status(401).json({ message: 'Service authentication required' });
    }

    if (serviceKey !== process.env.INTERNAL_API_KEY) {
        Logger.warn('Invalid service key attempt', { serviceName, ip: req.ip });
        return res.status(403).json({ message: 'Invalid service key' });
    }

    req.serviceName = serviceName || 'unknown-service';
    next();
};
