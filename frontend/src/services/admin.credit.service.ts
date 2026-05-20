import api from '../lib/api';

export type CreditResetInterval = 'monthly' | 'yearly' | 'never';
export type CreditOnCancel = 'forfeit_immediate' | 'keep_till_period_end' | 'keep_forever';
export type CreditBucket = 'plan' | 'purchased' | 'trial';

export interface FeatureCost {
  id: string;
  tool_id: string;
  slug: string;
  name: string;
  credit_cost: number;
  requires_subscription: boolean;
  use_credit_system: boolean;
  tool?: { id: string; name: string; slug: string };
}

export interface ToolCreditConfig {
  tool_id: string;
  alacarte_enabled: boolean;
  price_per_credit: number | null;
  currency: string;
  min_credits: number;
  max_credits: number | null;
  alacarte_stripe_product_id: string | null;
  alacarte_stripe_price_id: string | null;
}

export interface CreditPack {
  id: string;
  tool_id: string;
  name: string;
  credits: number;
  price: number;
  currency: string;
  stripe_product_id: string | null;
  stripe_price_id: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
  tool?: { id: string; name: string; slug: string };
}

export interface PlanCreditGrant {
  id: string;
  plan_id: string;
  tool_id: string;
  credits_per_cycle: number;
  trial_credits: number;
  reset_interval: CreditResetInterval;
  carry_over: boolean;
  on_cancel: CreditOnCancel;
  tool?: { id: string; name: string; slug: string };
  plan?: { id: string; name: string; tier: string };
}

export interface OrgWalletSummary {
  id: string;
  name: string;
  slug: string;
  total_credits: number;
  plan_total: number;
  purchased_total: number;
  wallet_count: number;
}

export interface OrgWallet {
  wallet_id: string;
  tool_id: string;
  tool_slug?: string;
  tool_name?: string;
  plan_balance: number;
  purchased_balance: number;
  reserved_amount: number;
  total_available: number;
  plan_period_end?: string | null;
}

export interface LedgerEntry {
  id: string;
  entry_type: string;
  bucket: CreditBucket;
  amount: number;
  balance_after_plan: number;
  balance_after_purchased: number;
  source: string;
  operation_slug: string | null;
  reason: string | null;
  admin_user_id: string | null;
  reservation_id: string | null;
  created_at: string;
}

export interface UsageSummary {
  days: number;
  since: string;
  operations: { operation_slug: string; spent: number; runs: number }[];
}

// Feature cost
export const updateFeatureCreditCost = async (
  id: string,
  patch: { credit_cost?: number; requires_subscription?: boolean; use_credit_system?: boolean },
) => {
  const res = await api.put(`/admin/features/${id}/credit-cost`, patch);
  return res.data;
};
export const listFeatureCreditCosts = async (toolId?: string): Promise<FeatureCost[]> => {
  const res = await api.get('/admin/feature-credit-costs', { params: toolId ? { tool_id: toolId } : {} });
  return res.data;
};

// Tool credit config
export const getToolCreditConfig = async (toolId: string): Promise<ToolCreditConfig> => {
  const res = await api.get(`/admin/tools/${toolId}/credit-config`);
  return res.data;
};
export const upsertToolCreditConfig = async (
  toolId: string,
  data: Partial<ToolCreditConfig>,
): Promise<ToolCreditConfig> => {
  const res = await api.put(`/admin/tools/${toolId}/credit-config`, data);
  return res.data;
};

// Credit packs
export const listCreditPacks = async (toolId?: string): Promise<CreditPack[]> => {
  const res = await api.get('/admin/credit-packs', { params: toolId ? { tool_id: toolId } : {} });
  return res.data;
};
export const createCreditPack = async (data: Partial<CreditPack>): Promise<CreditPack> => {
  const res = await api.post('/admin/credit-packs', data);
  return res.data;
};
export const updateCreditPack = async (id: string, data: Partial<CreditPack>): Promise<CreditPack> => {
  const res = await api.put(`/admin/credit-packs/${id}`, data);
  return res.data;
};
export const deleteCreditPack = async (id: string) => {
  const res = await api.delete(`/admin/credit-packs/${id}`);
  return res.data;
};

// Plan credit grants
export const listAllPlanCreditGrants = async (): Promise<PlanCreditGrant[]> => {
  const res = await api.get('/admin/plan-credit-grants');
  return res.data;
};
export const listPlanCreditGrants = async (planId: string): Promise<PlanCreditGrant[]> => {
  const res = await api.get(`/admin/plans/${planId}/credit-grants`);
  return res.data;
};
export const upsertPlanCreditGrant = async (
  planId: string,
  toolId: string,
  data: Partial<PlanCreditGrant>,
): Promise<PlanCreditGrant> => {
  const res = await api.put(`/admin/plans/${planId}/credit-grants/${toolId}`, data);
  return res.data;
};
export const deletePlanCreditGrant = async (planId: string, toolId: string) => {
  const res = await api.delete(`/admin/plans/${planId}/credit-grants/${toolId}`);
  return res.data;
};

// Org wallets
export const listOrgsWithWallets = async (search?: string): Promise<OrgWalletSummary[]> => {
  const res = await api.get('/admin/credit-orgs', { params: search ? { search } : {} });
  return res.data;
};
export const getOrgCreditWallets = async (orgId: string): Promise<OrgWallet[]> => {
  const res = await api.get(`/admin/organizations/${orgId}/credit-wallets`);
  return res.data;
};
export const getOrgWalletLedger = async (
  orgId: string,
  toolId: string,
  params?: { cursor?: string; limit?: number },
): Promise<{ entries: LedgerEntry[]; next_cursor: string | null }> => {
  const res = await api.get(`/admin/organizations/${orgId}/credit-wallets/${toolId}/ledger`, { params });
  return res.data;
};
export const getOrgWalletUsage = async (orgId: string, toolId: string, days = 30): Promise<UsageSummary> => {
  const res = await api.get(`/admin/organizations/${orgId}/credit-wallets/${toolId}/usage`, {
    params: { days },
  });
  return res.data;
};
export const adjustOrgWallet = async (
  orgId: string,
  toolId: string,
  data: { bucket: CreditBucket; delta: number; reason: string },
) => {
  const res = await api.post(`/admin/organizations/${orgId}/credit-wallets/${toolId}/adjust`, data);
  return res.data;
};
