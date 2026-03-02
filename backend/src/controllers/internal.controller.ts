import { Request, Response } from 'express';
import { Organization } from '../models/organization';
import { Subscription } from '../models/subscription';
import { OrganizationEntitlement } from '../models/organization_entitlement';
import { Plan } from '../models/plan';
import { Bundle } from '../models/bundle';
import { Feature } from '../models/feature';
import { Tool, ToolUsage } from '../models';
import { AuditService } from '../services/audit.service';
import { handleError } from '../utils/error';

/**
 * Internal controller — thin wrappers over existing models/services.
 * These endpoints are called by micro-tools via API key auth, NOT by end users.
 * Service attribution is tracked via req.serviceName (set by requireServiceAuth middleware).
 */

export const getOrganization = async (req: Request, res: Response) => {
    try {
        const org = await Organization.findByPk(req.params.id, {
            attributes: ['id', 'name', 'status', 'created_at'],
        });

        if (!org) {
            return res.status(404).json({ message: 'Organization not found' });
        }

        res.json(org);
    } catch (error) {
        handleError(res, error, 'Internal: Get Organization Error');
    }
};

export const getSubscription = async (req: Request, res: Response) => {
    try {
        const subscription = await Subscription.findOne({
            where: { organization_id: req.params.id },
            include: [
                { model: Plan, as: 'plan', attributes: ['id', 'name', 'tier'] },
                { model: Bundle, as: 'bundle', attributes: ['id', 'name', 'slug'] },
            ],
            order: [['created_at', 'DESC']],
        });

        if (!subscription) {
            return res.status(404).json({ message: 'No subscription found' });
        }

        res.json(subscription);
    } catch (error) {
        handleError(res, error, 'Internal: Get Subscription Error');
    }
};

export const getEntitlements = async (req: Request, res: Response) => {
    try {
        const entitlements = await OrganizationEntitlement.findAll({
            where: { organization_id: req.params.id },
            include: [
                { model: Feature, as: 'feature', attributes: ['id', 'name', 'slug', 'description'] },
                { model: Tool, as: 'tool', attributes: ['id', 'name', 'slug'] },
            ],
        });

        res.json(entitlements);
    } catch (error) {
        handleError(res, error, 'Internal: Get Entitlements Error');
    }
};

export const consumeEntitlement = async (req: Request, res: Response) => {
    try {
        const { id: organization_id } = req.params;
        const { feature_slug, amount = 1 } = req.body;

        if (!feature_slug) {
            return res.status(400).json({ message: 'feature_slug is required in body' });
        }

        // Find the entitlement for this org and feature slug
        const entitlement = await OrganizationEntitlement.findOne({
            where: { organization_id },
            include: [{
                model: Feature,
                as: 'feature',
                where: { slug: feature_slug },
                required: true
            }]
        });

        if (!entitlement) {
            // If they don't have an entitlement row, they don't have access
            return res.status(200).json({
                allowed: false,
                reason: 'no_entitlement',
                message: 'No entitlement found for this feature.'
            });
        }

        const currentUsage = entitlement.usage_amount || 0;
        const limit = entitlement.limit_amount;

        // Check if limit is exceeded (null limit means unlimited)
        if (limit !== null && limit !== undefined && (currentUsage + amount) > limit) {
            return res.status(200).json({
                allowed: false,
                reason: 'limit_exceeded',
                usage_amount: currentUsage,
                limit_amount: limit,
                feature: entitlement.feature
            });
        }

        // Increment usage
        await entitlement.increment('usage_amount', { by: amount });
        
        // Reload to get updated values
        await entitlement.reload();

        res.status(200).json({
            allowed: true,
            usage_amount: entitlement.usage_amount,
            limit_amount: entitlement.limit_amount,
            feature: entitlement.feature
        });
    } catch (error) {
        handleError(res, error, 'Internal: Consume Entitlement Error');
    }
};

export const trackUsage = async (req: Request, res: Response) => {
    try {
        const { tool_id, user_id, organization_id } = req.body;

        if (!tool_id || !organization_id) {
            return res.status(400).json({ message: 'tool_id and organization_id are required' });
        }

        // Resolve tool by ID or slug (same pattern as existing tool.controller)
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tool_id);
        const tool = isUuid
            ? await Tool.findByPk(tool_id)
            : await Tool.findOne({ where: { slug: tool_id } });

        if (!tool) {
            return res.status(404).json({ message: 'Tool not found' });
        }

        const today = new Date().toISOString().split('T')[0];

        const [usage, created] = await ToolUsage.findOrCreate({
            where: {
                tool_id: tool.id,
                user_id: user_id || null,
                organization_id,
                date: today,
            },
            defaults: {
                tool_id: tool.id,
                user_id: user_id || null,
                organization_id,
                date: today,
                count: 1,
            },
        });

        if (!created) {
            await usage.increment('count');
        }

        res.json({ message: 'Usage tracked', source: req.serviceName });
    } catch (error) {
        handleError(res, error, 'Internal: Track Usage Error');
    }
};

export const createAuditLog = async (req: Request, res: Response) => {
    try {
        const { actor_id, action, entity_type, entity_id, details } = req.body;

        if (!action || !entity_type || !entity_id) {
            return res.status(400).json({ message: 'action, entity_type, and entity_id are required' });
        }

        // Delegates to existing AuditService with service attribution
        await AuditService.log({
            actorId: actor_id,
            action,
            entityType: entity_type,
            entityId: entity_id,
            details: {
                ...details,
                source: req.serviceName,
            },
        });

        res.json({ message: 'Audit log created', source: req.serviceName });
    } catch (error) {
        handleError(res, error, 'Internal: Create Audit Log Error');
    }
};
