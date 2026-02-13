import { Request, Response } from 'express';
import { Op } from 'sequelize';
import sequelize from '../config/db';
import { Tool } from '../models/tool';
import { Feature } from '../models/feature';
import { Plan } from '../models/plan';

import { Subscription } from '../models/subscription';
import { SubStatus } from '../models/enums';
import { getPaginationOptions, formatPaginationResponse } from '../utils/pagination';
import { handleError } from '../utils/error';
import { AuditService } from '../services/audit.service';

// ==========================
// Tool Config Controllers
// ==========================

export const getTools = async (req: Request, res: Response) => {
    try {
        const { page, limit, offset, sortBy, sortOrder } = getPaginationOptions(req);
        const search = req.query.search as string;
        const activeOnly = req.query.activeOnly === 'true';

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const whereClause: any = {};

        if (search) {
            whereClause[Op.or] = [
                { name: { [Op.iLike]: `%${search}%` } },
                { slug: { [Op.iLike]: `%${search}%` } }
            ];
        }

        if (activeOnly) {
            whereClause.is_active = true;
        }

        const { count, rows } = await Tool.findAndCountAll({
            where: whereClause,
            limit,
            offset,
            order: [[sortBy, sortOrder]],
            distinct: true
        });

        res.status(200).json(formatPaginationResponse(rows, count, page, limit, 'tools'));
    } catch (error) {
        handleError(res, error, 'Get Tools Error');
    }
};

export const getToolById = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const tool = await Tool.findByPk(id, {
            include: [{ model: Feature, as: 'features' }]
        });

        if (!tool) {
            return res.status(404).json({ message: 'Tool not found' });
        }

        res.status(200).json(tool);
    } catch (error) {
        handleError(res, error, 'Get Tool Error');
    }
};

export const createTool = async (req: Request, res: Response) => {
    try {
        const { name, slug, description, tool_link, is_active, required_integrations } = req.body;

        if (!name || !slug) {
            return res.status(400).json({ message: 'Name and slug are required' });
        }

        const tool = await sequelize.transaction(async (t) => {
            const existingTool = await Tool.findOne({ where: { slug }, transaction: t });
            if (existingTool) {
                throw new Error('ALREADY_EXISTS');
            }

            return await Tool.create({
                name,
                slug,
                description,
                tool_link,
                is_active: is_active !== undefined ? is_active : true,
                required_integrations: required_integrations || [],
            }, { transaction: t });
        });

        await AuditService.log({
            actorId: req.user?.id,
            action: 'CREATE_TOOL',
            entityType: 'Tool',
            entityId: tool.id,
            details: { name, slug, is_active },
            req
        });

        res.status(201).json(tool);
    } catch (error) {
        handleError(res, error, 'Create Tool Error');
    }
};

export const updateTool = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { name, slug, description, tool_link, is_active, required_integrations } = req.body;

        const updatedTool = await sequelize.transaction(async (t) => {
            const tool = await Tool.findByPk(id, { transaction: t });

            if (!tool) {
                throw new Error('NOT_FOUND');
            }

            if (slug && slug !== tool.slug) {
                const existingTool = await Tool.findOne({ where: { slug }, transaction: t });
                if (existingTool) {
                    throw new Error('ALREADY_EXISTS');
                }
            }

            return await tool.update({
                name: name ?? tool.name,
                slug: slug ?? tool.slug,
                description: description ?? tool.description,
                tool_link: tool_link ?? tool.tool_link,
                is_active: is_active ?? tool.is_active,
                required_integrations: required_integrations ?? tool.required_integrations,
            }, { transaction: t });
        });

        await AuditService.log({
            actorId: req.user?.id,
            action: 'UPDATE_TOOL',
            entityType: 'Tool',
            entityId: id,
            details: { updates: { name, slug, description, tool_link, is_active } },
            req
        });

        res.status(200).json(updatedTool);
    } catch (error) {
        handleError(res, error, 'Update Tool Error');
    }
};

export const deleteTool = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        await sequelize.transaction(async (t) => {
            const tool = await Tool.findByPk(id, { transaction: t });

            if (!tool) {
                throw new Error('NOT_FOUND');
            }

            // Check for associated Plans that have active Subscriptions
            const plans = await Plan.findAll({ where: { tool_id: id }, transaction: t });
            const planIds = plans.map(p => p.id);

            if (planIds.length > 0) {
                const activeSubscriptions = await Subscription.findOne({
                    where: {
                        plan_id: { [Op.in]: planIds },
                        status: { [Op.in]: [SubStatus.ACTIVE, SubStatus.TRIALING, SubStatus.PAST_DUE] }
                    },
                    transaction: t
                });

                if (activeSubscriptions) {
                    throw new Error('HAS_ACTIVE_SUBSCRIPTIONS');
                }
            }

            // If no active subscriptions, proceed with delete (DB Cascade will handle children)
            await tool.destroy({ transaction: t });
        });

        await AuditService.log({
            actorId: req.user?.id,
            action: 'DELETE_TOOL',
            entityType: 'Tool',
            entityId: id,
            details: {},
            req
        });

        res.status(200).json({ message: 'Tool and associated plans/features deleted successfully' });
    } catch (error) {
        const err = error as Error;
        if (err.message === 'HAS_ACTIVE_SUBSCRIPTIONS') {
            return res.status(400).json({
                message: 'Cannot delete tool. There are active subscriptions associated with plans for this tool. Please cancel subscriptions first.'
            });
        }
        handleError(res, error, 'Delete Tool Error');
    }
};
