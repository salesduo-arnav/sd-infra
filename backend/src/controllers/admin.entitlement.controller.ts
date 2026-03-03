import { Request, Response } from 'express';
import { Op } from 'sequelize';
import { OrganizationEntitlement } from '../models/organization_entitlement';
import { Organization } from '../models/organization';
import { Tool } from '../models/tool';
import { Feature } from '../models/feature';
import { FeatureResetPeriod } from '../models/enums';
import { getPaginationOptions, formatPaginationResponse } from '../utils/pagination';
import { handleError } from '../utils/error';
import { AuditService } from '../services/audit.service';
import Logger from '../utils/logger';

export const getEntitlements = async (req: Request, res: Response) => {
    try {
        const { page, limit, offset, sortBy, sortOrder } = getPaginationOptions(req);
        const search = req.query.search as string;
        const organizationId = req.query.organization_id as string;
        const toolId = req.query.tool_id as string;
        const featureId = req.query.feature_id as string;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const whereClause: any = {};

        if (organizationId) {
            whereClause.organization_id = organizationId;
        }
        if (toolId) {
            whereClause.tool_id = toolId;
        }
        if (featureId) {
            whereClause.feature_id = featureId;
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const includeClause: any[] = [
            {
                model: Organization,
                as: 'organization',
                attributes: ['id', 'name', 'slug'],
                ...(search ? { where: {}, required: false } : {}),
            },
            {
                model: Tool,
                as: 'tool',
                attributes: ['id', 'name', 'slug'],
            },
            {
                model: Feature,
                as: 'feature',
                attributes: ['id', 'name', 'slug'],
            },
        ];

        // For search, we need to search across associated model names
        if (search) {
            whereClause[Op.or] = [
                { '$organization.name$': { [Op.iLike]: `%${search}%` } },
                { '$organization.slug$': { [Op.iLike]: `%${search}%` } },
                { '$tool.name$': { [Op.iLike]: `%${search}%` } },
                { '$feature.name$': { [Op.iLike]: `%${search}%` } },
                { '$feature.slug$': { [Op.iLike]: `%${search}%` } },
            ];
        }

        const { count, rows } = await OrganizationEntitlement.findAndCountAll({
            where: whereClause,
            include: includeClause,
            limit,
            offset,
            order: [[sortBy, sortOrder]],
            distinct: true,
            subQuery: false,
        });

        res.status(200).json(formatPaginationResponse(rows, count, page, limit, 'entitlements'));
    } catch (error) {
        handleError(res, error, 'Get Entitlements Error');
    }
};

export const updateEntitlement = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { limit_amount, usage_amount, reset_period } = req.body;
        Logger.info('Updating entitlement', { id, ...req.body, userId: req.user?.id });

        const entitlement = await OrganizationEntitlement.findByPk(id, {
            include: [
                { model: Organization, as: 'organization', attributes: ['id', 'name', 'slug'] },
                { model: Tool, as: 'tool', attributes: ['id', 'name', 'slug'] },
                { model: Feature, as: 'feature', attributes: ['id', 'name', 'slug'] },
            ],
        });

        if (!entitlement) {
            return res.status(404).json({ message: 'Entitlement not found' });
        }

        const oldValues = {
            limit_amount: entitlement.limit_amount,
            usage_amount: entitlement.usage_amount,
            reset_period: entitlement.reset_period,
        };

        await entitlement.update({
            limit_amount: limit_amount !== undefined ? limit_amount : entitlement.limit_amount,
            usage_amount: usage_amount !== undefined ? usage_amount : entitlement.usage_amount,
            reset_period: reset_period !== undefined ? reset_period as FeatureResetPeriod : entitlement.reset_period,
        });

        // Reload to get fresh association data
        await entitlement.reload({
            include: [
                { model: Organization, as: 'organization', attributes: ['id', 'name', 'slug'] },
                { model: Tool, as: 'tool', attributes: ['id', 'name', 'slug'] },
                { model: Feature, as: 'feature', attributes: ['id', 'name', 'slug'] },
            ],
        });

        await AuditService.log({
            actorId: req.user?.id,
            action: 'UPDATE_ENTITLEMENT',
            entityType: 'OrganizationEntitlement',
            entityId: entitlement.id,
            details: {
                organization_id: entitlement.organization_id,
                organization_name: entitlement.organization?.name,
                feature_name: entitlement.feature?.name,
                old_values: oldValues,
                new_values: { limit_amount, usage_amount, reset_period },
            },
            req
        });

        res.status(200).json({ message: 'Entitlement updated successfully', entitlement });
    } catch (error) {
        handleError(res, error, 'Update Entitlement Error');
    }
};
