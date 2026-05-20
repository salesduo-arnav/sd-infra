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

// ── Credits ─────────────────────────────────────────────────────────

export interface PublicCreditPack {
    id: string;
    tool_id: string;
    name: string;
    slug: string;
    credit_amount: number;
    price: number;
    currency: string;
    description?: string | null;
    tool?: { id: string; name: string; slug: string };
}

export interface CreditWalletSnapshot {
    wallet_id: string;
    organization_id: string;
    tool_id: string;
    tool_slug?: string;
    tool_name?: string;
    plan_balance: number;
    purchased_balance: number;
    plan_held: number;
    purchased_held: number;
    plan_available: number;
    purchased_available: number;
    total_available: number;
    plan_period_end?: string | null;
}

export const listCreditPacks = async (toolSlug?: string) => {
    const response = await api.get('/billing/credit-packs', {
        params: toolSlug ? { tool_slug: toolSlug } : undefined,
    });
    return response.data.creditPacks as PublicCreditPack[];
};

export const getMyCredits = async () => {
    const response = await api.get('/billing/credits');
    return response.data as {
        organization_id: string;
        wallets: CreditWalletSnapshot[];
        feature_access: Array<{
            tool_slug: string;
            tool_name?: string;
            has_tool_access: boolean;
            sub_features: Record<string, boolean>;
        }>;
    };
};

export interface PricePerCredit {
    tool_id: string;
    tool_slug: string;
    tool_name: string;
    price_per_credit_cents: number | null;
    min: number;
    max: number;
    currency: string;
}

export const getPricePerCredit = async (toolSlug: string) => {
    const response = await api.get('/billing/credits/price-per-credit', { params: { tool_slug: toolSlug } });
    return response.data as PricePerCredit;
};

export const buyCreditPack = async (packId: string) => {
    const response = await api.post('/billing/checkout-session', {
        items: [{ id: packId, type: 'credit_pack' }],
    });
    return response.data as { url: string; sessionId: string };
};

export const buyCustomCredits = async (toolId: string, creditAmount: number) => {
    const response = await api.post('/billing/checkout-session', {
        items: [{ type: 'custom_credits', tool_id: toolId, credit_amount: creditAmount }],
    });
    return response.data as { url: string; sessionId: string };
};
