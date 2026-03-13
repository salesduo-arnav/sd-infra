import redisClient from '../config/redis';
import Logger from '../utils/logger';

export enum EventType {
    USER_DELETED = 'USER_DELETED',
    ORGANIZATION_DELETED = 'ORGANIZATION_DELETED'
}

export const publishEvent = async (streamName: string, eventType: EventType, payload: Record<string, unknown>) => {
    try {
        if (!redisClient.isOpen) {
            Logger.warn(`Cannot publish event to stream ${streamName}: Redis client is not open`);
            return;
        }

        const messageId = await redisClient.xAdd(
            streamName,
            '*',
            {
                type: eventType,
                payload: JSON.stringify(payload),
                timestamp: new Date().toISOString()
            },
            {
                TRIM: {
                    strategy: 'MAXLEN',
                    strategyModifier: '~',
                    threshold: 10000
                }
            }
        );

        Logger.info(`Published event ${eventType} to stream ${streamName} with message ID ${messageId}`);
        return messageId;
    } catch (error) {
        Logger.error(`Failed to publish event ${eventType} to stream ${streamName}`, error);
    }
};
