import { Request, Response } from 'express';
import { Op } from 'sequelize';
import sequelize from '../config/db';
import { Plan } from '../models/plan';
import { PlanLimit } from '../models/plan_limit';
import { Tool } from '../models/tool';
import { Feature } from '../models/feature';
import { PriceInterval, TierType, FeatureResetPeriod } from '../models/enums';
import { getPaginationOptions, formatPaginationResponse } from '../utils/pagination';
import { handleError } from '../utils/error';
import { AuditService } from '../services/audit.service';

// ==========================
// Plan Config Controllers
// ==========================

export const getPlans = async (req: Request, res: Response) => {
    try {
        const { page, limit, offset, sortBy, sortOrder } = getPaginationOptions(req, 'tool_id');
        const search = req.query.search as string;
        const { tool_id } = req.query;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const whereClause: any = {};

        if (tool_id) {
            whereClause.tool_id = tool_id;
        }

        if (search) {
            whereClause[Op.or] = [
                { name: { [Op.iLike]: `%${search}%` } },
                { description: { [Op.iLike]: `%${search}%` } }
            ];
        }

        const { count, rows } = await Plan.findAndCountAll({
            where: whereClause,
            limit,
            offset,
            order: [[sortBy, sortOrder]],
            include: [
                { model: Tool, as: 'tool', attributes: ['name', 'slug'] },
                { model: PlanLimit, as: 'limits', include: [{ model: Feature, as: 'feature' }] }
            ],
            distinct: true
        });

        res.status(200).json(formatPaginationResponse(rows, count, page, limit, 'plans'));
    } catch (error) {
        handleError(res, error, 'Get Plans Error');
    }
};

export const getPlanById = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const plan = await Plan.findByPk(id, {
            include: [
                { model: Tool, as: 'tool' },
                { model: PlanLimit, as: 'limits', include: [{ model: Feature, as: 'feature' }] }
            ]
        });

        if (!plan) {
            return res.status(404).json({ message: 'Plan not found' });
        }

        res.status(200).json(plan);
    } catch (error) {
        handleError(res, error, 'Get Plan Error');
    }
};

export const createPlan = async (req: Request, res: Response) => {
    try {
        const {
            name,
            description,
            tool_id,
            tier,
            price,
            currency,
            interval,
            trial_period_days,
            active
        } = req.body;

        // Basic validation
        if (!name || !tool_id || !tier || price === undefined || !currency || !interval) {
            return res.status(400).json({ message: 'Missing required fields' });
        }

        // Validate Enums
        if (!Object.values(TierType).includes(tier)) {
            return res.status(400).json({ message: 'Invalid tier type' });
        }
        if (!Object.values(PriceInterval).includes(interval)) {
            return res.status(400).json({ message: 'Invalid price interval' });
        }

        const plan = await sequelize.transaction(async (t) => {
            return await Plan.create({
                name,
                description,
                tool_id,
                tier,
                price,
                currency,
                interval,
                trial_period_days: trial_period_days ?? 0,
                active: active ?? true
            }, { transaction: t });
        });

        await AuditService.log({
            actorId: req.user?.id,
            action: 'CREATE_PLAN',
            entityType: 'Plan',
            entityId: plan.id,
            details: {
                name,
                tier,
                price,
                interval
            },
            req
        });

        res.status(201).json(plan);
    } catch (error) {
        handleError(res, error, 'Create Plan Error');
    }
};

export const updatePlan = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const updates = req.body;

        const updatedPlan = await sequelize.transaction(async (t) => {
            const plan = await Plan.findByPk(id, { transaction: t });

            if (!plan) {
                throw new Error('NOT_FOUND');
            }

            return await plan.update(updates, { transaction: t });
        });

        await AuditService.log({
            actorId: req.user?.id,
            action: 'UPDATE_PLAN',
            entityType: 'Plan',
            entityId: id,
            details: {
                updates
            },
            req
        });

        res.status(200).json(updatedPlan);
    } catch (error) {
        handleError(res, error, 'Update Plan Error');
    }
};

export const deletePlan = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        await sequelize.transaction(async (t) => {
            const plan = await Plan.findByPk(id, { transaction: t });

            if (!plan) {
                throw new Error('NOT_FOUND');
            }

            await plan.destroy({ transaction: t });
        });

        await AuditService.log({
            actorId: req.user?.id,
            action: 'DELETE_PLAN',
            entityType: 'Plan',
            entityId: id,
            details: {},
            req
        });

        res.status(200).json({ message: 'Plan deleted successfully' });
    } catch (error) {
        handleError(res, error, 'Delete Plan Error');
    }
};

// ==========================
// Plan Limits Controllers
// ==========================

export const upsertPlanLimit = async (req: Request, res: Response) => {
    try {
        const { plan_id } = req.params;
        const { feature_id, default_limit, reset_period, is_enabled } = req.body;

        if (!feature_id) {
            return res.status(400).json({ message: 'Feature ID is required' });
        }

        const limit = await sequelize.transaction(async (t) => {
            const plan = await Plan.findByPk(plan_id, { transaction: t });
            if (!plan) {
                throw new Error('PLAN_NOT_FOUND');
            }

            // Check if limit exists
            const [limitInstance, created] = await PlanLimit.findOrCreate({
                where: { plan_id, feature_id },
                defaults: {
                    plan_id,
                    feature_id,
                    default_limit,
                    is_enabled: is_enabled !== undefined ? is_enabled : true,
                    reset_period: reset_period || FeatureResetPeriod.MONTHLY
                },
                transaction: t
            });

            if (!created) {
                return await limitInstance.update({
                    default_limit: default_limit !== undefined ? default_limit : limitInstance.default_limit,
                    is_enabled: is_enabled !== undefined ? is_enabled : limitInstance.is_enabled,
                    reset_period: reset_period || limitInstance.reset_period
                }, { transaction: t });
            }

            return limitInstance;
        });

        await AuditService.log({
            actorId: req.user?.id,
            action: 'UPSERT_PLAN_LIMIT',
            entityType: 'PlanLimit',
            entityId: limit.id,
            details: { plan_id, feature_id, default_limit, is_enabled, reset_period },
            req
        });

        res.status(200).json(limit);
    } catch (error) {
        handleError(res, error, 'Upsert Plan Limit Error');
    }
};

export const deletePlanLimit = async (req: Request, res: Response) => {
    try {
        const { plan_id, feature_id } = req.params;

        await sequelize.transaction(async (t) => {
            const limit = await PlanLimit.findOne({ where: { plan_id, feature_id }, transaction: t });

            if (!limit) {
                throw new Error('NOT_FOUND');
            }

            await limit.destroy({ transaction: t });
        });

        await AuditService.log({
            actorId: req.user?.id,
            action: 'DELETE_PLAN_LIMIT',
            entityType: 'PlanLimit',
            entityId: `${plan_id}_${feature_id}`,
            details: { plan_id, feature_id },
            req
        });

        res.status(200).json({ message: 'Plan Limit deleted successfully' });
    } catch (error) {
        handleError(res, error, 'Delete Plan Limit Error');
    }
};
