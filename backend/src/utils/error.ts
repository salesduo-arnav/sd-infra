import { Response } from 'express';

export const handleError = (res: Response, error: unknown, message: string = 'Internal server error') => {
    console.error(message, error);
    
    if (res.headersSent) return;

    const err = error as Error;
    
    if (err.message === 'NOT_FOUND' || err.message.includes('not found')) {
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
