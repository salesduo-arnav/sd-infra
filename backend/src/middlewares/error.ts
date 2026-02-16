import { Request, Response, NextFunction } from 'express';

import Logger from '../utils/logger';

export const errorHandler = (err: Error, req: Request, res: Response, _next: NextFunction) => {
    Logger.error(err.stack || err.message);
    res.status(500).json({
        status: 'error',
        message: err.message || 'Internal Server Error',
    });
};