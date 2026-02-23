import morgan, { StreamOptions } from "morgan";
import { Request, Response } from "express";
import Logger from "../utils/logger";

const stream: StreamOptions = {
    write: (message) => Logger.http(message),
};

const skip = (req: Request, res: Response) => {
    if (req.originalUrl === '/health' || req.originalUrl === '/api/health') {
        return true;
    }
    return false;
};

const morganMiddleware = morgan(
    ":method :url :status :res[content-length] - :response-time ms",
    { stream, skip }
);

export default morganMiddleware;
