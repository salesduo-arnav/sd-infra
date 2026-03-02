import { Response } from 'express';
import Logger from '../utils/logger';

export class AppError extends Error {
    constructor(public statusCode: number, message: string) {
        super(message);
        this.name = this.constructor.name;
        Error.captureStackTrace(this, this.constructor);
    }
}

export const handleError = (res: Response, error: unknown, message: string = 'Internal server error') => {
    Logger.error(message, { error });

    if (res.headersSent) return;

    if (error instanceof AppError) {
        return res.status(error.statusCode).json({ message: error.message });
    }

    const err = error as Error & { statusCode?: number };

    if (err.statusCode) {
        return res.status(err.statusCode).json({ message: err.message || message });
    }

    if (err.message === 'NOT_FOUND') {
        return res.status(404).json({ message: 'Resource not found' });
    }

    if (err.message === 'ALREADY_EXISTS' || err.name === 'SequelizeUniqueConstraintError') {
        return res.status(400).json({ message: 'Resource already exists' });
    }

    if (err.message === 'FORBIDDEN') {
        return res.status(403).json({ message: 'Insufficient permissions' });
    }

    if (err.message === 'UNAUTHORIZED') {
        return res.status(401).json({ message: 'Unauthorized' });
    }

    // Default 500
    res.status(500).json({ message });
};
