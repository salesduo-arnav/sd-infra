import api from '@/lib/api';

// ================================
// Types
// ================================

export interface IntegrationAccount {
    id: string;
    organization_id: string;
    account_name: string;
    marketplace: 'amazon' | 'walmart';
    region: string;
    integration_type: 'sp_api_sc' | 'sp_api_vc' | 'ads_api';
    status: 'connected' | 'disconnected' | 'error';
    credentials?: Record<string, unknown> | null;
    connected_at: string | null;
    created_at: string;
    updated_at: string;
}

export interface GlobalIntegration {
    id: string;
    organization_id: string;
    service_name: string;
    status: 'connected' | 'disconnected';
    config?: Record<string, unknown> | null;
    credentials?: Record<string, unknown> | null;
    connected_at: string | null;
    created_at: string;
    updated_at: string;
}

// ================================
// Helpers
// ================================

const orgHeaders = (orgId: string) => ({
    headers: { 'x-organization-id': orgId },
});

// ================================
// Account Level Integration API
// ================================

export const getIntegrationAccounts = async (orgId: string): Promise<IntegrationAccount[]> => {
    const { data } = await api.get('/integrations/accounts', orgHeaders(orgId));
    return data.accounts;
};

export const getAdsAuthUrl = async (orgId: string, accountId: string): Promise<string> => {
    const { data } = await api.get(`/integrations/amazon-ads/auth-url?accountId=${accountId}`, orgHeaders(orgId));
    return data.url;
};

export const getSpAuthUrl = async (orgId: string, accountId: string): Promise<string> => {
    const { data } = await api.get(`/integrations/sp-api/auth-url?accountId=${accountId}`, orgHeaders(orgId));
    return data.url;
};

export const createIntegrationAccount = async (
    orgId: string,
    payload: { account_name: string; marketplace?: string; region: string; integration_type: string }
): Promise<IntegrationAccount> => {
    const { data } = await api.post('/integrations/accounts', payload, orgHeaders(orgId));
    return data.account;
};

export const deleteIntegrationAccount = async (orgId: string, accountId: string): Promise<void> => {
    await api.delete(`/integrations/accounts/${accountId}`, orgHeaders(orgId));
};

export const connectIntegrationAccount = async (
    orgId: string,
    accountId: string,
    credentials?: Record<string, unknown>
): Promise<IntegrationAccount> => {
    const { data } = await api.post(
        `/integrations/accounts/${accountId}/connect`,
        { credentials },
        orgHeaders(orgId)
    );
    return data.account;
};

export const disconnectIntegrationAccount = async (
    orgId: string,
    accountId: string
): Promise<IntegrationAccount> => {
    const { data } = await api.post(
        `/integrations/accounts/${accountId}/disconnect`,
        {},
        orgHeaders(orgId)
    );
    return data.account;
};

// ================================
// Global Integration API
// ================================

export const getGlobalIntegrations = async (orgId: string): Promise<GlobalIntegration[]> => {
    const { data } = await api.get('/integrations/global', orgHeaders(orgId));
    return data.integrations;
};

export const connectGlobalIntegration = async (
    orgId: string,
    payload: { service_name: string; config?: Record<string, unknown>; credentials?: Record<string, unknown> }
): Promise<GlobalIntegration> => {
    const { data } = await api.post('/integrations/global', payload, orgHeaders(orgId));
    return data.integration;
};

export const disconnectGlobalIntegration = async (
    orgId: string,
    integrationId: string
): Promise<void> => {
    await api.delete(`/integrations/global/${integrationId}`, orgHeaders(orgId));
};
