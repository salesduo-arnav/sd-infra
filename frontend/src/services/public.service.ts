import api from '../lib/api';
import { Bundle, Tool, Plan, Feature } from './admin.service';

export interface PublicBundle extends Bundle {
  bundle_plans: {
    plan: PublicPlan;
  }[];
}

export interface PublicPlan extends Plan {
  tool: Tool;
}

export const getPublicBundles = async () => {
    const response = await api.get('/public/bundles');
    return response.data as PublicBundle[];
};

export const getPublicPlans = async () => {
    const response = await api.get('/public/plans');
    return response.data as PublicPlan[];
};
