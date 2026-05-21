import { ReactNode } from "react";

export interface FeatureItem {
  name: string;
  limit?: string;
  isEnabled: boolean;
  toolName?: string;
  resetPeriod?: string;
  /** Credits consumed per unit when this feature is credit-metered. */
  creditCost?: number;
  /** When true, this feature is metered by credits rather than a hard limit. */
  useCreditSystem?: boolean;
}

export interface BundleTier {
  id: string;
  name: string;
  price: number;
  period: string;
  limits: string;
  features?: FeatureItem[];
  currency?: string;
  /** Per-tool credit grants this bundle tier confers each period. */
  creditGrants?: Array<{
    tool_id: string;
    tool_slug?: string;
    tool_name?: string;
    credits_per_period: number;
    period_unit: 'monthly' | 'yearly';
  }>;
}

export interface Bundle {
  id: string;
  name: string;
  description: string;
  apps: { name: string; description?: string; features: string[] }[];
  tiers: BundleTier[];
  popular?: boolean;
  icon: ReactNode;
}

export interface AppTier {
  id: string;
  name: string;
  price: number;
  period: string;
  limits: string;
  features?: FeatureItem[];
  isTrial?: boolean;
  trialDays?: number;
  currency?: string;
  /** Credits granted per period by this tier (e.g. "100 credits/month"). */
  creditsPerPeriod?: number;
  creditsPeriodUnit?: 'monthly' | 'yearly';
  /** Credits granted by this tier's free trial portion, if any. */
  trialCredits?: number;
  trialCreditsPeriodUnit?: 'monthly' | 'yearly';
}

export interface AppCreditPack {
  id: string;
  name: string;
  credit_amount: number;
  price: number;
  currency: string;
  description?: string | null;
}

export interface AppCustomCreditPricing {
  price_per_credit_cents: number;
  min: number;
  max: number;
  currency: string;
}

export interface AppWallet {
  total_available: number;
  plan_period_end?: string | null;
}

export interface App {
  id: string;
  slug?: string;
  name: string;
  description: string;
  icon: ReactNode;
  tiers: AppTier[];
  features: string[];
  status: "available" | "coming-soon";
  trialDays?: number;
  trialEligible?: boolean;
  trialCardRequired?: boolean;
  trialPlanId?: string;
  trialPlanInterval?: string;
  trialPlanDescription?: string;
  trialPlanCurrency?: string;
  /** Credits granted by the free trial (if any). */
  trialCredits?: number;
  trialCreditsPeriodUnit?: 'monthly' | 'yearly';
  /** Credit packs available for à-la-carte purchase against this tool's wallet. */
  creditPacks?: AppCreditPack[];
  /** Custom-amount per-credit pricing. Only set when the admin master switch is ON. */
  customCredits?: AppCustomCreditPricing;
  /** The signed-in org's current wallet snapshot for this tool, if any. */
  wallet?: AppWallet;
}

export interface CartItem {
  id: string;
  planId: string;
  type: "bundle" | "app" | "credit_pack" | "custom_credits";
  name: string;
  tierName: string;
  price: number;
  period: string;
  features?: FeatureItem[];
  limits?: string;
  isUpgrade?: boolean;
  isDowngrade?: boolean;
  currentPrice?: number;
  subscriptionId?: string;
  trialDays?: number;
  currency?: string;
  /** Credits included in this plan/tier per billing cycle, if any. */
  creditsPerPeriod?: number;
  creditsPeriodUnit?: 'monthly' | 'yearly';
  /** Credits granted by the free trial associated with this plan, if any. */
  trialCredits?: number;
  trialCreditsPeriodUnit?: 'monthly' | 'yearly';
  /** For custom_credits: the tool whose wallet should be credited. */
  toolId?: string;
  /** For custom_credits: how many credits to grant. */
  creditAmount?: number;
}
