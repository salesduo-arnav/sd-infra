import { createClient } from 'redis';
import dotenv from 'dotenv';
import path from 'path';
import Logger from '../utils/logger';

dotenv.config({ path: path.join(__dirname, '../../.env') });

const isProduction = process.env.NODE_ENV === 'production';

if (isProduction && !process.env.REDIS_URL) {
    throw new Error('REDIS_URL must be set in production environment.');
}

const redisClient = createClient({
    url: process.env.REDIS_URL || 'redis://localhost:6379',
    password: process.env.REDIS_PASSWORD || undefined,
    socket: {
        reconnectStrategy: (retries) => Math.min(retries * 50, 2000),
        timeout: 10000
    }
});

redisClient.on('error', (err) => Logger.error('Redis Client Error', err));
redisClient.on('connect', () => Logger.info('Redis Client Connected'));

export const connectRedis = async () => {
    if (!redisClient.isOpen) {
        await redisClient.connect();
    }
};

export const closeRedis = async () => {
    if (redisClient.isOpen) {
        await redisClient.quit();
    }
};

export default redisClient;