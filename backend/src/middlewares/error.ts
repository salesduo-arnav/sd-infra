import { Request, Response, NextFunction } from 'express';

import Logger from '../utils/logger';

interface AppError extends Error {
    statusCode?: number;
    status?: number;
}

export const errorHandler = (err: AppError, req: Request, res: Response, next: NextFunction) => {
    if (res.headersSent) {
        return next(err);
    }

    const statusCode = err.statusCode || err.status || 500;
    const isServerError = statusCode >= 500;

    // Only log the stack trace for server errors
    if (isServerError) {
        Logger.error(err.stack || err.message);
    } else {
        Logger.error(`[${statusCode}] ${err.message}`);
    }

    let message = err.message || 'Internal Server Error';
    // Do not leak internal error messages in production for 500s
    if (isServerError && process.env.NODE_ENV === 'production') {
        message = 'Internal Server Error';
    }

    res.status(statusCode).json({
        status: 'error',
        message: message,
    });
};