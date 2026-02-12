import api from '../lib/api';

export interface Subscription {
    id: string;
    status: string;
    current_period_end: string;
    cancel_at_period_end: boolean;
    plan?: {
        id: string;
        name: string;
        price: number;
        interval: string;
    };
    bundle?: {
        id: string;
        name: string;
        price: number;
        interval: string;
    };
    upcoming_plan?: {
        id: string;
        name: string;
    };
    upcoming_bundle?: {
        id: string;
        name: string;
    };
}

export const getSubscriptions = async () => {
    const response = await api.get('/billing');
    return response.data;
};

export const updateSubscription = async (subscriptionId: string, items: { id: string; type: 'plan' | 'bundle'; interval: 'monthly' | 'yearly' }[]) => {
    const response = await api.put(`/billing/subscription/${subscriptionId}`, { items });
    return response.data;
};

export const cancelDowngrade = async (subscriptionId: string) => {
    const response = await api.post(`/billing/subscription/${subscriptionId}/cancel-downgrade`);
    return response.data;
};
