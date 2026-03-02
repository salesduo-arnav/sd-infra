import Logger from './logger';

export const getStartOfMonth = (date: Date = new Date()): Date => {
    return new Date(date.getFullYear(), date.getMonth(), 1);
};

export const getStartOfLastMonth = (date: Date = new Date()): Date => {
    return new Date(date.getFullYear(), date.getMonth() - 1, 1);
};

/**
 * Calculates percentage growth.
 * Note: Returns 100% when previous is 0 and current is positive.
 * This is an intentional choice to avoid mathematical infinity.
 */
export const calculateGrowth = (current: number, previous: number): number => {
    if (previous === 0) {
        return current > 0 ? 100 : 0;
    }
    return ((current - previous) / previous) * 100;
};

// Define a minimal interface for what we need to calculate MRR
// This allows testing without mocking the entire Sequelize model
export interface MRRSubscription {
    plan?: {
        price: number | string;
        interval: string;
    }
}

export const calculateMRR = (subscriptions: MRRSubscription[]): number => {
    return subscriptions.reduce((total, sub) => {
        if (!sub.plan) {
            Logger.debug('Subscription excluded from MRR calculation: No plan associated', { subscription: sub });
            return total;
        }

        const price = Number(sub.plan.price);
        if (isNaN(price)) return total;

        if (price < 0) {
            Logger.debug('Subscription excluded from MRR calculation: Negative price', { subscription: sub });
            return total;
        }

        if (sub.plan.interval === 'monthly') {
            return total + price;
        } else if (sub.plan.interval === 'yearly') {
            return total + (price / 12);
        }
        return total;
    }, 0);
};
