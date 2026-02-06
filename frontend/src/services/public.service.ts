import api from '../lib/api';
// Re-export types from admin.service that are needed
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

