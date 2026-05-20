import api from '../lib/api';
import { BundleGroup as AdminBundleGroup, Bundle as AdminBundle, Plan as AdminPlan, Tool } from './admin.service';

export interface PublicPlan extends AdminPlan {
  tool: Tool;
}

export interface PublicBundlePlan {
    plan: PublicPlan;
}

export interface PublicBundle extends AdminBundle {
  bundle_plans: PublicBundlePlan[];
}

export interface PublicBundleGroup extends AdminBundleGroup {
    bundles: PublicBundle[];
}

export const getPublicBundles = async () => {
    const response = await api.get('/public/bundles');
    return response.data as PublicBundleGroup[];
};

export const getPublicPlans = async () => {
    const response = await api.get('/public/plans');
    return response.data as PublicPlan[];
};

export interface PublicPlanCreditGrant {
    plan_id: string;
    tool_id: string;
    tool_slug?: string;
    tool_name?: string;
    credits_per_period: number;
    period_unit: 'monthly' | 'yearly';
    is_trial_grant: boolean;
}

export const getPlanCreditGrants = async () => {
    const response = await api.get('/public/plan-credit-grants');
    return response.data as PublicPlanCreditGrant[];
};

export const getBundleCreditGrants = async (bundleId: string) => {
    const response = await api.get(`/public/bundles/${bundleId}/credit-grants`);
    return response.data as {
        bundle_id: string;
        grants: Array<{
            plan_id: string;
            tool_id: string;
            tool_slug?: string;
            tool_name?: string;
            credits_per_period: number;
            period_unit: 'monthly' | 'yearly';
        }>;
    };
};
