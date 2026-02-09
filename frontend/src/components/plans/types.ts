import { ReactNode } from "react";

export interface BundleTier {
  id: string;
  name: string;
  price: number;
  period: string;
  limits: string;
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
}

export interface App {
  id: string;
  name: string;
  description: string;
  icon: ReactNode;
  tiers: AppTier[];
  features: string[];
  status: "available" | "coming-soon";
}

export interface CartItem {
  id: string;
  planId: string;
  type: "bundle" | "app";
  name: string;
  tierName: string;
  price: number;
  period: string;
}
