import api from '../lib/api';

import { Subscription } from '../types/subscription';

export type { Subscription };

export const getSubscriptions = async () => {
    const response = await api.get('/billing');
    return response.data;
};

export const updateSubscription = async (subscriptionId: string, items: { id: string; type: 'plan' | 'bundle'; interval: 'monthly' | 'yearly' | 'one_time' }[]) => {
    const response = await api.put(`/billing/subscription/${subscriptionId}`, { items });
    return response.data;
};

export const cancelDowngrade = async (subscriptionId: string) => {
    const response = await api.post(`/billing/subscription/${subscriptionId}/cancel-downgrade`);
    return response.data;
};

// Trials
export const startTrial = async (toolId: string) => {
    const response = await api.post('/billing/trial/start', { tool_id: toolId });
    return response.data;
};

export const cancelTrial = async (subscriptionId: string) => {
    const response = await api.post(`/billing/trial/${subscriptionId}/cancel`);
    return response.data;
};

export const checkTrialEligibility = async (toolId: string) => {
    const response = await api.get(`/billing/trial/eligibility?tool_id=${toolId}`);
    return response.data as { eligible: boolean; reason?: string; trialDays: number };
};
