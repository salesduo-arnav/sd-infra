import { Request, Response } from 'express';
import sequelize from '../config/db';
import { Organization, OrganizationMember } from '../models/organization';
import { Subscription } from '../models/subscription';
import { OrganizationEntitlement } from '../models/organization_entitlement';
import { Plan } from '../models/plan';
import { Bundle } from '../models/bundle';
import { Feature } from '../models/feature';
import { Tool, ToolUsage, User, Role } from '../models';
import { AuditService } from '../services/audit.service';
import { mailService } from '../services/mail.service';
import { slackService } from '../services/slack.service';
import { GlobalIntegration, GlobalIntegrationStatus } from '../models/global_integration';
import { handleError } from '../utils/error';

const MAX_SLACK_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50MB (Slack's limit)

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

// ================================
// Slack
// ================================

export const sendSlackToChannel = async (req: Request, res: Response) => {
    try {
        const { organization_id, channel, text, blocks } = req.body;

        if (!organization_id || !text) {
            return res.status(400).json({ message: 'organization_id and text are required' });
        }

        // If no channel specified, use the default notification channel
        let targetChannel = channel;
        if (!targetChannel) {
            const integration = await GlobalIntegration.findOne({
                where: { organization_id, service_name: 'slack', status: GlobalIntegrationStatus.CONNECTED },
            });
            targetChannel = (integration?.config as Record<string, unknown>)?.default_channel_id as string;
            if (!targetChannel) {
                return res.status(400).json({ message: 'channel is required (no default channel configured)' });
            }
        }

        await slackService.sendToChannel({ organization_id, channel: targetChannel, text, blocks });

        res.json({ message: 'Slack message sent to channel', source: req.serviceName });
    } catch (error) {
        handleError(res, error, 'Internal: Send Slack To Channel Error');
    }
};

export const sendSlackToUser = async (req: Request, res: Response) => {
    try {
        const { organization_id, user_email, user_id, text, blocks } = req.body;

        if (!organization_id || !text) {
            return res.status(400).json({ message: 'organization_id and text are required' });
        }

        if (!user_email && !user_id) {
            return res.status(400).json({ message: 'user_email or user_id is required' });
        }

        await slackService.sendToUser({ organization_id, user_email, user_id, text, blocks });

        res.json({ message: 'Slack DM sent', source: req.serviceName });
    } catch (error) {
        handleError(res, error, 'Internal: Send Slack To User Error');
    }
};

export const sendSlackFileToChannel = async (req: Request, res: Response) => {
    try {
        const { organization_id, channel, file, filename, title, initial_comment } = req.body;

        if (!organization_id || !file || !filename) {
            return res.status(400).json({ message: 'organization_id, file (base64), and filename are required' });
        }

        if (file.length * 0.95 > MAX_SLACK_FILE_SIZE_BYTES) {
            return res.status(400).json({ message: 'File exceeds maximum size of 50MB' });
        }

        // If no channel specified, use the default notification channel
        let targetChannel = channel;
        if (!targetChannel) {
            const integration = await GlobalIntegration.findOne({
                where: { organization_id, service_name: 'slack', status: GlobalIntegrationStatus.CONNECTED },
            });
            targetChannel = (integration?.config as Record<string, unknown>)?.default_channel_id as string;
            if (!targetChannel) {
                return res.status(400).json({ message: 'channel is required (no default channel configured)' });
            }
        }

        const fileBuffer = Buffer.from(file, 'base64');
        await slackService.sendFileToChannel({ organization_id, channel: targetChannel, file: fileBuffer, filename, title, initial_comment });

        res.json({ message: 'File sent to channel', source: req.serviceName });
    } catch (error) {
        handleError(res, error, 'Internal: Send Slack File To Channel Error');
    }
};

export const sendSlackFileToUser = async (req: Request, res: Response) => {
    try {
        const { organization_id, user_email, user_id, file, filename, title, initial_comment } = req.body;

        if (!organization_id || !file || !filename) {
            return res.status(400).json({ message: 'organization_id, file (base64), and filename are required' });
        }

        if (!user_email && !user_id) {
            return res.status(400).json({ message: 'user_email or user_id is required' });
        }

        if (file.length * 0.95 > MAX_SLACK_FILE_SIZE_BYTES) {
            return res.status(400).json({ message: 'File exceeds maximum size of 50MB' });
        }

        const fileBuffer = Buffer.from(file, 'base64');
        await slackService.sendFileToUser({ organization_id, user_email, user_id, file: fileBuffer, filename, title, initial_comment });

        res.json({ message: 'File sent to user', source: req.serviceName });
    } catch (error) {
        handleError(res, error, 'Internal: Send Slack File To User Error');
    }
};

export const listSlackChannels = async (req: Request, res: Response) => {
    try {
        const { organization_id } = req.params;

        if (!organization_id) {
            return res.status(400).json({ message: 'organization_id is required' });
        }

        const channels = await slackService.listChannels(organization_id);
        res.json({ channels });
    } catch (error) {
        handleError(res, error, 'Internal: List Slack Channels Error');
    }
};

export const lookupSlackUser = async (req: Request, res: Response) => {
    try {
        const { organization_id } = req.params;
        const { email } = req.query;

        if (!organization_id) {
            return res.status(400).json({ message: 'organization_id is required' });
        }

        if (!email) {
            return res.status(400).json({ message: 'email query parameter is required' });
        }

        const user = await slackService.lookupUserByEmail(organization_id, email as string);
        res.json({ user });
    } catch (error) {
        handleError(res, error, 'Internal: Lookup Slack User Error');
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
