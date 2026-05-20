import api from '../lib/api';

export interface CreditWallet {
  wallet_id: string;
  tool_id: string;
  tool_slug?: string;
  tool_name?: string;
  plan_balance: number;
  purchased_balance: number;
  reserved_amount: number;
  plan_available: number;
  purchased_available: number;
  plan_held: number;
  purchased_held: number;
  total_available: number;
  plan_period_end?: string | null;
}

export interface CreditPackOption {
  id: string;
  name: string;
  credits: number;
  price: number;
  currency: string;
  unit_price: number;
}

export interface AlacarteConfig {
  enabled: boolean;
  price_per_credit?: number;
  currency?: string;
  min_credits?: number;
  max_credits?: number | null;
}

export const getCreditWallets = async (): Promise<CreditWallet[]> => {
  const res = await api.get('/billing/credits/wallets');
  return res.data;
};

export const getCreditWalletByTool = async (toolSlug: string): Promise<CreditWallet> => {
  const res = await api.get(`/billing/credits/wallets/${toolSlug}`);
  return res.data;
};

export const listCreditPacks = async (toolSlug: string): Promise<CreditPackOption[]> => {
  const res = await api.get(`/billing/credits/tools/${toolSlug}/packs`);
  return res.data;
};

export const getAlacarteConfig = async (toolSlug: string): Promise<AlacarteConfig> => {
  const res = await api.get(`/billing/credits/tools/${toolSlug}/alacarte`);
  return res.data;
};

export const checkoutCreditPack = async (
  packId: string,
  successUrl?: string,
  cancelUrl?: string,
): Promise<{ url: string; session_id: string }> => {
  const res = await api.post(`/billing/credits/credit-packs/${packId}/checkout`, {
    success_url: successUrl,
    cancel_url: cancelUrl,
  });
  return res.data;
};

export const checkoutAlacarte = async (
  toolSlug: string,
  credits: number,
  successUrl?: string,
  cancelUrl?: string,
): Promise<{ url: string; session_id: string }> => {
  const res = await api.post(`/billing/credits/tools/${toolSlug}/alacarte/checkout`, {
    credits,
    success_url: successUrl,
    cancel_url: cancelUrl,
  });
  return res.data;
};
