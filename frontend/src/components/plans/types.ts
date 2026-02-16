import { ReactNode } from "react";

export interface FeatureItem {
  name: string;
  limit?: string;
  isEnabled: boolean;
  toolName?: string;
}

export interface BundleTier {
  id: string;
  name: string;
  price: number;
  period: string;
  limits: string;
  features?: FeatureItem[];
  currency?: string;
}

export interface Bundle {
  id: string;
  name: string;
  description: string;
  apps: { name: string; features: string[] }[];
  tiers: BundleTier[];
  popular?: boolean;
  icon: ReactNode;
}

export interface AppTier {
  id: string; // The Plan ID
  name: string;
  price: number;
  period: string;
  limits: string;
  features?: FeatureItem[];
  isTrial?: boolean;
  trialDays?: number;
  currency?: string;
}

export interface App {
  id: string;
  name: string;
  description: string;
  icon: ReactNode;
  tiers: AppTier[];
  features: string[]; // This might stay as string[] for the summary card
  status: "available" | "coming-soon";
  trialDays?: number;
  trialEligible?: boolean;
  trialCardRequired?: boolean;
  trialPlanId?: string;
  trialPlanInterval?: string;
  trialPlanDescription?: string;
}

export interface CartItem {
  id: string;
  planId: string;
  type: "bundle" | "app";
  name: string;
  tierName: string;
  price: number;
  period: string;
  features?: FeatureItem[];
  limits?: string;
  // Upgrade/Downgrade metadata
  isUpgrade?: boolean;
  isDowngrade?: boolean;
  currentPrice?: number;
  subscriptionId?: string;
  trialDays?: number;
  currency?: string;
}
