import { Request, Response } from 'express';
import { Op } from 'sequelize';
import sequelize from '../config/db';
import { Organization, OrganizationMember } from '../models/organization';
import { Subscription } from '../models/subscription';
import { OrganizationEntitlement } from '../models/organization_entitlement';
import { Plan } from '../models/plan';
import { Bundle } from '../models/bundle';
import { BundleGroup } from '../models/bundle_group';
import { BundlePlan } from '../models/bundle_plan';
import { Feature } from '../models/feature';
import { Tool, ToolUsage, User, Role } from '../models';
import { AuditService } from '../services/audit.service';
import { mailService } from '../services/mail.service';
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

export const getOrganizationMembers = async (req: Request, res: Response) => {
    try {
        const members = await OrganizationMember.findAll({
            where: {
                organization_id: req.params.id,
                is_active: true,
                deleted_at: null,
            },
            include: [
                { model: User, as: 'user', attributes: ['id', 'email', 'full_name'] },
                { model: Role, as: 'role', attributes: ['id', 'name'] },
            ],
            order: [['joined_at', 'ASC']],
        });

        const result = members.map((m) => ({
            id: m.id,
            user_id: m.user?.id,
            email: m.user?.email,
            full_name: m.user?.full_name,
            name: m.user?.full_name,
            role: m.role?.name,
            joined_at: m.joined_at,
        }));

        res.json(result);
    } catch (error) {
        handleError(res, error, 'Internal: Get Organization Members Error');
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

export const getSubscriptions = async (req: Request, res: Response) => {
    try {
        // Optional ?tool_slugs=slug1,slug2 — filters to subs whose plan's tool
        // or whose bundle contains a plan for one of the given tool slugs.
        const toolSlugsParam = req.query.tool_slugs as string | undefined;
        const toolSlugs = toolSlugsParam
            ? toolSlugsParam.split(',').map((s) => s.trim()).filter(Boolean)
            : null;

        // Resolve tool IDs from slugs (if provided) for efficient WHERE clauses
        let toolIds: string[] | null = null;
        if (toolSlugs && toolSlugs.length > 0) {
            const tools = await Tool.findAll({
                where: { slug: { [Op.in]: toolSlugs } },
                attributes: ['id'],
            });
            toolIds = tools.map((t) => t.id);
            if (toolIds.length === 0) {
                return res.json([]);
            }
        }

        // Build plan-level where clause for tool filtering
        const planToolInclude = toolIds
            ? { model: Tool, as: 'tool', attributes: ['id', 'name', 'slug'], where: { id: { [Op.in]: toolIds } } }
            : { model: Tool, as: 'tool', attributes: ['id', 'name', 'slug'] };

        // Fetch plan-based subscriptions (optionally filtered by tool)
        const planSubs = await Subscription.findAll({
            where: {
                organization_id: req.params.id,
                plan_id: { [Op.ne]: null },
            },
            include: [
                {
                    model: Plan,
                    as: 'plan',
                    attributes: ['id', 'name', 'tier'],
                    required: true,
                    include: [planToolInclude],
                },
                {
                    model: Plan,
                    as: 'upcoming_plan',
                    attributes: ['id', 'name', 'tier'],
                    include: [{ model: Tool, as: 'tool', attributes: ['id', 'name', 'slug'] }],
                },
                {
                    model: Bundle,
                    as: 'upcoming_bundle',
                    attributes: ['id', 'name', 'slug'],
                    include: [{ model: BundleGroup, as: 'group', attributes: ['id', 'name'] }],
                },
            ],
            order: [['created_at', 'DESC']],
        });

        // Fetch bundle-based subscriptions
        const bundleWhere: Record<string, unknown> = {
            organization_id: req.params.id,
            bundle_id: { [Op.ne]: null },
        };

        let bundleSubs = await Subscription.findAll({
            where: bundleWhere,
            include: [
                {
                    model: Bundle,
                    as: 'bundle',
                    attributes: ['id', 'name', 'slug'],
                    include: [
                        { model: BundleGroup, as: 'group', attributes: ['id', 'name'] },
                        {
                            model: Plan,
                            as: 'plans',
                            attributes: ['id', 'name', 'tier'],
                            through: { attributes: [] },
                            include: [{ model: Tool, as: 'tool', attributes: ['id', 'name', 'slug'] }],
                        },
                    ],
                },
                {
                    model: Plan,
                    as: 'upcoming_plan',
                    attributes: ['id', 'name', 'tier'],
                    include: [{ model: Tool, as: 'tool', attributes: ['id', 'name', 'slug'] }],
                },
                {
                    model: Bundle,
                    as: 'upcoming_bundle',
                    attributes: ['id', 'name', 'slug'],
                    include: [{ model: BundleGroup, as: 'group', attributes: ['id', 'name'] }],
                },
            ],
            order: [['created_at', 'DESC']],
        });

        // Filter bundle subs: keep only those whose bundle contains a plan for a matching tool
        if (toolIds) {
            const toolIdSet = new Set(toolIds);
            bundleSubs = bundleSubs.filter((sub) => {
                const bundle = (sub as any).bundle;
                if (!bundle?.plans) return false;
                return bundle.plans.some((p: any) => p.tool && toolIdSet.has(p.tool.id));
            });
        }

        // Merge and sort by created_at DESC
        const allSubs = [...planSubs, ...bundleSubs].sort(
            (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
        );

        res.json(allSubs);
    } catch (error) {
        handleError(res, error, 'Internal: Get Subscriptions Error');
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

        // Atomic check + increment inside a transaction with row-level lock
        // to prevent concurrent over-consumption
        const result = await sequelize.transaction(async (t) => {
            const entitlement = await OrganizationEntitlement.findOne({
                where: { organization_id },
                include: [{
                    model: Feature,
                    as: 'feature',
                    where: { slug: feature_slug },
                    required: true
                }],
                lock: t.LOCK.UPDATE,
                transaction: t,
            });

            if (!entitlement) {
                return {
                    allowed: false,
                    reason: 'no_entitlement',
                    message: 'No entitlement found for this feature.'
                };
            }

            const currentUsage = entitlement.usage_amount || 0;
            const limit = entitlement.limit_amount;

            // null limit means unlimited
            if (limit !== null && limit !== undefined && (currentUsage + amount) > limit) {
                return {
                    allowed: false,
                    reason: 'limit_exceeded',
                    usage_amount: currentUsage,
                    limit_amount: limit,
                    feature: entitlement.feature
                };
            }

            await entitlement.increment('usage_amount', { by: amount, transaction: t });
            await entitlement.reload({ transaction: t });

            return {
                allowed: true,
                usage_amount: entitlement.usage_amount,
                limit_amount: entitlement.limit_amount,
                feature: entitlement.feature
            };
        });

        res.status(200).json(result);
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

export const sendEmail = async (req: Request, res: Response) => {
    try {
        const { to, subject, html, text } = req.body;

        if (!to || !subject) {
            return res.status(400).json({ message: 'to and subject are required' });
        }

        if (!html && !text) {
            return res.status(400).json({ message: 'html or text body is required' });
        }

        await mailService.sendMail({ to, subject, html, text });

        res.json({ message: 'Email sent', source: req.serviceName });
    } catch (error) {
        handleError(res, error, 'Internal: Send Email Error');
    }
};

export const createAuditLog = async (req: Request, res: Response) => {
    try {
        const { actor_id, action, entity_type, entity_id, details, ip_address } = req.body;

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
            ipAddress: ip_address,
        });

        res.json({ message: 'Audit log created', source: req.serviceName });
    } catch (error) {
        handleError(res, error, 'Internal: Create Audit Log Error');
    }
};
