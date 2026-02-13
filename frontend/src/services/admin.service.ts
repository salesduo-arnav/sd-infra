import api from '../lib/api';

// Types
export interface PaginationParams {
  page?: number;
  limit?: number;
  search?: string;
  activeOnly?: boolean;
  sort_by?: string;
  sort_dir?: 'asc' | 'desc';
}

export interface PaginatedResponse<T> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: T[] | any; // Dynamic key like 'tools', 'plans' etc. + meta
  meta: {
    totalItems: number;
    totalPages: number;
    currentPage: number;
    itemsPerPage: number;
  };
}

export interface Tool {
  id: string;
  name: string;
  slug: string;
  description: string;
  tool_link?: string;
  is_active: boolean;
  required_integrations?: string[];
  features?: Feature[];
  created_at: string;
}

export interface Feature {
  id: string;
  tool_id: string;
  name: string;
  slug: string;
  description?: string;
}

export interface Plan {
  id: string;
  name: string;
  description: string;
  tool_id: string;
  tier: 'basic' | 'premium' | 'platinum' | 'diamond';
  price: number;
  currency: string;
  interval: 'monthly' | 'yearly' | 'one_time';
  trial_period_days: number;
  active: boolean;
  tool?: Tool;
  limits?: PlanLimit[];
  features?: string[]; // For UI display mostly
}

export interface PlanLimit {
  id: string;
  plan_id: string;
  feature_id: string;
  default_limit: number | null;
  is_enabled: boolean;
  reset_period: 'monthly' | 'yearly' | 'never';
  feature?: Feature;
}

export interface BundleGroup {
  id: string;
  name: string;
  slug: string;
  description: string;
  active: boolean;
  bundles?: Bundle[]; // Tiers
}

export interface Bundle {
  id: string;
  name: string;
  slug: string;
  description: string;
  price: number;
  currency: string;
  interval: 'monthly' | 'yearly' | 'one_time';
  active: boolean;
  plans?: Plan[];
  category?: string; // Optional categorizer if not using group for everything
  bundle_group_id?: string;
  tier_label?: string;
}

export interface AuditLog {
  id: string;
  actor_id?: string | null;
  action: string;
  entity_type: string;
  entity_id: string;
  details?: object;
  ip_address?: string | null;
  created_at: string;
  actor?: {
    id: string;
    full_name: string;
    email: string;
  };
}

// Service Methods

// Tools
export const getTools = async (params?: PaginationParams) => {
  const response = await api.get('/admin/tools', { params });
  return response.data; // Now returns { tools: [], meta: {} }
};

export const createTool = async (data: Partial<Tool>) => {
  const response = await api.post('/admin/tools', data);
  return response.data;
};

export const updateTool = async (id: string, data: Partial<Tool>) => {
  const response = await api.put(`/admin/tools/${id}`, data);
  return response.data;
};

export const deleteTool = async (id: string) => {
  const response = await api.delete(`/admin/tools/${id}`);
  return response.data;
};

// Features
export const getFeatures = async (toolId?: string, params?: PaginationParams) => {
  const response = await api.get('/admin/features', { params: { ...params, tool_id: toolId } });
  return response.data;
};

export const createFeature = async (data: Partial<Feature>) => {
  const response = await api.post('/admin/features', data);
  return response.data;
};

export const updateFeature = async (id: string, data: Partial<Feature>) => {
  const response = await api.put(`/admin/features/${id}`, data);
  return response.data;
};

export const deleteFeature = async (id: string) => {
  const response = await api.delete(`/admin/features/${id}`);
  return response.data;
};


// Plans
export const getPlans = async (toolId?: string, params?: PaginationParams) => {
  const response = await api.get('/admin/plans', { params: { ...params, tool_id: toolId } });
  return response.data; // { plans: [], meta: {} }
};

export const createPlan = async (data: Partial<Plan>) => {
  const response = await api.post('/admin/plans', data);
  return response.data;
};

export const updatePlan = async (id: string, data: Partial<Plan>) => {
  const response = await api.put(`/admin/plans/${id}`, data);
  return response.data;
};

export const deletePlan = async (id: string) => {
  const response = await api.delete(`/admin/plans/${id}`);
  return response.data;
};

// Plan Limits
export const upsertPlanLimit = async (planId: string, data: { feature_id: string; default_limit: number | null; is_enabled: boolean; reset_period?: string }) => {
  const response = await api.put(`/admin/plans/${planId}/limits`, data);
  return response.data;
};

export const deletePlanLimit = async (planId: string, featureId: string) => {
  const response = await api.delete(`/admin/plans/${planId}/limits/${featureId}`);
  return response.data;
};

// Bundle Groups
export const getBundleGroups = async () => {
  const response = await api.get('/admin/bundle-groups');
  return response.data;
};

export const createBundleGroup = async (data: Partial<BundleGroup>) => {
  const response = await api.post('/admin/bundle-groups', data);
  return response.data;
};

export const updateBundleGroup = async (id: string, data: Partial<BundleGroup>) => {
  const response = await api.put(`/admin/bundle-groups/${id}`, data);
  return response.data;
};

export const deleteBundleGroup = async (id: string) => {
  const response = await api.delete(`/admin/bundle-groups/${id}`);
  return response.data;
};

// Bundles
export const getBundles = async (params?: PaginationParams) => {
  const response = await api.get('/admin/bundles', { params });
  return response.data; // { bundles: [], meta: {} }
};

export const getBundleById = async (id: string) => {
  const response = await api.get(`/admin/bundles/${id}`);
  return response.data;
};

export const createBundle = async (data: Partial<Bundle>) => {
  const response = await api.post('/admin/bundles', data);
  return response.data;
};

export const updateBundle = async (id: string, data: Partial<Bundle>) => {
  const response = await api.put(`/admin/bundles/${id}`, data);
  return response.data;
};

export const deleteBundle = async (id: string) => {
  const response = await api.delete(`/admin/bundles/${id}`);
  return response.data;
};

// Bundle Plans
export const addPlanToBundle = async (bundleId: string, planId: string) => {
  const response = await api.post(`/admin/bundles/${bundleId}/plans`, { plan_id: planId });
  return response.data;
};

export const removePlanFromBundle = async (bundleId: string, planId: string) => {
  const response = await api.delete(`/admin/bundles/${bundleId}/plans/${planId}`);
  return response.data;
};

// Audit Logs
export const getAuditLogs = async (params?: PaginationParams & { action?: string; entity_type?: string; actor_id?: string; start_date?: string; end_date?: string; search?: string }) => {
  const response = await api.get('/admin/audit-logs', { params });
  return response.data; // { audit_logs: [], meta: {} }
};

export const getAuditLogById = async (id: string) => {
  const response = await api.get(`/admin/audit-logs/${id}`);
  return response.data;
};

// Stats
export const getOverviewStats = async () => {
  const response = await api.get('/admin/stats/overview');
  return response.data;
};

export const getRevenueChart = async () => {
  const response = await api.get('/admin/stats/revenue');
  return response.data;
};

export const getUserGrowthChart = async () => {
  const response = await api.get('/admin/stats/users');
  return response.data;
};

export const getToolUsageChart = async () => {
  const response = await api.get('/admin/stats/tools');
  return response.data;
};

