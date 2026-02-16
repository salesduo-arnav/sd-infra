import { Request, Response } from 'express';
import { IntegrationAccount, IntegrationType, IntegrationStatus, Marketplace } from '../models/integration_account';
import { GlobalIntegration, GlobalIntegrationStatus } from '../models/global_integration';
import { OrganizationMember } from '../models/organization';
import { handleError } from '../utils/error';
import sequelize from '../config/db';
import Logger from '../utils/logger';

// ================================
// Helpers
// ================================

const VALID_INTEGRATION_TYPES = Object.values(IntegrationType);
const VALID_MARKETPLACES = Object.values(Marketplace);

/**
 * Validates organization access from x-organization-id header.
 * Returns organization_id or sends error response and returns null.
 */
const getOrgId = async (req: Request, res: Response): Promise<string | null> => {
    const orgId = req.headers['x-organization-id'] as string;

    if (!orgId) {
        res.status(400).json({ message: 'x-organization-id header is required' });
        return null;
    }

    // Verify user is a member of this organization
    const membership = await OrganizationMember.findOne({
        where: { organization_id: orgId, user_id: req.user!.id },
    });

    if (!membership) {
        res.status(403).json({ message: 'You are not a member of this organization' });
        return null;
    }

    return orgId;
};

// ================================
// Account Level Integration CRUD
// ================================

/** GET /integrations/accounts */
export const getIntegrationAccounts = async (req: Request, res: Response) => {
    try {
        const orgId = await getOrgId(req, res);
        if (!orgId) return;

        const accounts = await IntegrationAccount.findAll({
            where: { organization_id: orgId },
            order: [['created_at', 'DESC']],
        });

        res.status(200).json({ accounts });
    } catch (error) {
        Logger.error('Get Integration Accounts Error', { error });
        handleError(res, error, 'Get Integration Accounts Error');
    }
};

/** POST /integrations/accounts */
export const createIntegrationAccount = async (req: Request, res: Response) => {
    Logger.info('Creating integration account', { ...req.body, userId: req.user?.id });
    try {
        const orgId = await getOrgId(req, res);
        if (!orgId) return;

        const { account_name, region, integration_type, marketplace } = req.body;

        if (!account_name || !region || !integration_type) {
            return res.status(400).json({ message: 'account_name, region, and integration_type are required' });
        }

        if (!VALID_INTEGRATION_TYPES.includes(integration_type)) {
            return res.status(400).json({
                message: `Invalid integration_type. Must be one of: ${VALID_INTEGRATION_TYPES.join(', ')}`,
            });
        }

        // Default to 'amazon' if not provided
        const resolvedMarketplace = marketplace || Marketplace.AMAZON;

        if (!VALID_MARKETPLACES.includes(resolvedMarketplace)) {
            return res.status(400).json({
                message: `Invalid marketplace. Must be one of: ${VALID_MARKETPLACES.join(', ')}`,
            });
        }

        const account = await sequelize.transaction(async (t) => {
            // Check for duplicate
            const existing = await IntegrationAccount.findOne({
                where: { organization_id: orgId, marketplace: resolvedMarketplace, account_name, integration_type },
                transaction: t,
            });

            if (existing) {
                throw new Error('ALREADY_EXISTS');
            }

            return await IntegrationAccount.create(
                {
                    organization_id: orgId,
                    account_name,
                    marketplace: resolvedMarketplace,
                    region,
                    integration_type,
                },
                { transaction: t }
            );
        });

        res.status(201).json({ account });
    } catch (error) {
        Logger.error('Create Integration Account Error', { error });
        handleError(res, error, 'Create Integration Account Error');
    }
};

/** DELETE /integrations/accounts/:id */
export const deleteIntegrationAccount = async (req: Request, res: Response) => {
    try {
        const orgId = await getOrgId(req, res);
        if (!orgId) return;

        const { id } = req.params;

        const account = await IntegrationAccount.findOne({
            where: { id, organization_id: orgId },
        });

        if (!account) {
            return res.status(404).json({ message: 'Integration account not found' });
        }

        await account.destroy();

        res.status(200).json({ message: 'Integration account deleted successfully' });
    } catch (error) {
        Logger.error('Delete Integration Account Error', { error });
        handleError(res, error, 'Delete Integration Account Error');
    }
};

/** POST /integrations/accounts/:id/connect */
export const connectIntegrationAccount = async (req: Request, res: Response) => {
    const { id } = req.params;
    Logger.info('Connecting integration account', { id, userId: req.user?.id });
    try {
        const orgId = await getOrgId(req, res);
        if (!orgId) return;

        const { id } = req.params;
        const { credentials } = req.body;

        const account = await IntegrationAccount.findOne({
            where: { id, organization_id: orgId },
        });

        if (!account) {
            return res.status(404).json({ message: 'Integration account not found' });
        }

        await account.update({
            status: IntegrationStatus.CONNECTED,
            credentials: credentials || null,
            connected_at: new Date(),
        });

        res.status(200).json({ account });
    } catch (error) {
        Logger.error('Connect Integration Account Error', { error });
        handleError(res, error, 'Connect Integration Account Error');
    }
};

/** POST /integrations/accounts/:id/disconnect */
export const disconnectIntegrationAccount = async (req: Request, res: Response) => {
    const { id } = req.params;
    Logger.info('Disconnecting integration account', { id, userId: req.user?.id });
    try {
        const orgId = await getOrgId(req, res);
        if (!orgId) return;

        const { id } = req.params;

        const account = await IntegrationAccount.findOne({
            where: { id, organization_id: orgId },
        });

        if (!account) {
            return res.status(404).json({ message: 'Integration account not found' });
        }

        await account.update({
            status: IntegrationStatus.DISCONNECTED,
            connected_at: null,
        });

        res.status(200).json({ account });
    } catch (error) {
        Logger.error('Disconnect Integration Account Error', { error });
        handleError(res, error, 'Disconnect Integration Account Error');
    }
};

// ================================
// Global Integration CRUD
// ================================

/** GET /integrations/global */
export const getGlobalIntegrations = async (req: Request, res: Response) => {
    try {
        const orgId = await getOrgId(req, res);
        if (!orgId) return;

        const integrations = await GlobalIntegration.findAll({
            where: { organization_id: orgId },
            order: [['created_at', 'DESC']],
        });

        res.status(200).json({ integrations });
    } catch (error) {
        Logger.error('Get Global Integrations Error', { error });
        handleError(res, error, 'Get Global Integrations Error');
    }
};

/** POST /integrations/global */
export const connectGlobalIntegration = async (req: Request, res: Response) => {
    Logger.info('Connecting global integration', { service_name: req.body.service_name, userId: req.user?.id });
    try {
        const orgId = await getOrgId(req, res);
        if (!orgId) return;

        const { service_name, config, credentials } = req.body;

        if (!service_name) {
            return res.status(400).json({ message: 'service_name is required' });
        }

        const integration = await sequelize.transaction(async (t) => {
            // Check if already exists (upsert-like: reconnect if disconnected)
            const existing = await GlobalIntegration.findOne({
                where: { organization_id: orgId, service_name },
                transaction: t,
            });

            if (existing) {
                await existing.update(
                    {
                        status: GlobalIntegrationStatus.CONNECTED,
                        config: config || existing.config,
                        credentials: credentials || existing.credentials,
                        connected_at: new Date(),
                    },
                    { transaction: t }
                );
                return existing;
            }

            return await GlobalIntegration.create(
                {
                    organization_id: orgId,
                    service_name,
                    status: GlobalIntegrationStatus.CONNECTED,
                    config: config || null,
                    credentials: credentials || null,
                    connected_at: new Date(),
                },
                { transaction: t }
            );
        });

        res.status(200).json({ integration });
    } catch (error) {
        Logger.error('Connect Global Integration Error', { error });
        handleError(res, error, 'Connect Global Integration Error');
    }
};

/** DELETE /integrations/global/:id */
export const disconnectGlobalIntegration = async (req: Request, res: Response) => {
    Logger.info('Disconnecting global integration', { id: req.params.id, userId: req.user?.id });
    try {
        const orgId = await getOrgId(req, res);
        if (!orgId) return;

        const { id } = req.params;

        const integration = await GlobalIntegration.findOne({
            where: { id, organization_id: orgId },
        });

        if (!integration) {
            return res.status(404).json({ message: 'Global integration not found' });
        }

        await integration.update({
            status: GlobalIntegrationStatus.DISCONNECTED,
            connected_at: null,
        });

        res.status(200).json({ message: 'Global integration disconnected successfully' });
    } catch (error) {
        Logger.error('Disconnect Global Integration Error', { error });
        handleError(res, error, 'Disconnect Global Integration Error');
    }
};
