import { Request, Response } from 'express';
import { Op } from 'sequelize';
import sequelize from '../config/db';
import { Plan } from '../models/plan';
import { PlanLimit } from '../models/plan_limit';
import { Tool } from '../models/tool';
import { Feature } from '../models/feature';
import { PriceInterval, TierType, FeatureResetPeriod } from '../models/enums';
import { stripeService } from '../services/stripe.service';
import { getPaginationOptions, formatPaginationResponse } from '../utils/pagination';
import { handleError } from '../utils/error';
import { SubStatus } from '../models/enums';
import { AuditService } from '../services/audit.service';
import Logger from '../utils/logger';

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
    Logger.info('Creating plan', { ...req.body, userId: req.user?.id });
    try {
        const {
            name,
            description,
            tool_id,
            tier,
            price,
            currency,
            interval,
            active,
            is_trial_plan
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

        // 1. Create Stripe Product & Prices
        const stripeProduct = await stripeService.createProduct(name, description);

        // Calculate amounts (simplified logic: if monthly plan, yearly = price * 12)
        // STRIPE EXPECTS AMOUNTS IN CENTS
        const PRICE_IN_CENTS = Math.round(price * 100);
        const monthlyAmount = interval === 'monthly' ? PRICE_IN_CENTS : Math.round(PRICE_IN_CENTS / 12);
        const yearlyAmount = interval === 'yearly' ? PRICE_IN_CENTS : PRICE_IN_CENTS * 12;

        const stripePriceMonthly = await stripeService.createPrice(stripeProduct.id, monthlyAmount, currency, 'month');
        const stripePriceYearly = await stripeService.createPrice(stripeProduct.id, yearlyAmount, currency, 'year');

        const plan = await sequelize.transaction(async (t) => {
            // Validate: Only one trial plan per tool
            if (is_trial_plan) {
                const existingTrialPlan = await Plan.findOne({
                    where: { tool_id, is_trial_plan: true },
                    transaction: t
                });

                if (existingTrialPlan) {
                    throw new Error(`The plan "${existingTrialPlan.name}" is already set as the trial plan for this tool.`);
                }
            }

            return await Plan.create({
                name,
                description,
                tool_id,
                tier,
                price,
                currency,
                interval,
                active: active ?? true,
                is_trial_plan: is_trial_plan ?? false,
                stripe_product_id: stripeProduct.id,
                stripe_price_id_monthly: stripePriceMonthly.id,
                stripe_price_id_yearly: stripePriceYearly.id
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
        const err = error as Error;
        if (err.message.includes('already set as the trial plan')) {
            return res.status(400).json({ message: err.message });
        }
        handleError(res, error, 'Create Plan Error');
    }
};

export const updatePlan = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const updates = req.body;
        Logger.info('Updating plan', { id, updates, userId: req.user?.id });

        const updatedPlan = await sequelize.transaction(async (t) => {
            const plan = await Plan.findByPk(id, { transaction: t });

            if (!plan) {
                throw new Error('NOT_FOUND');
            }

            // Check if price-affecting fields are changed
            if (
                (updates.price !== undefined && updates.price !== plan.price) ||
                (updates.currency && updates.currency !== plan.currency) ||
                (updates.interval && updates.interval !== plan.interval)
            ) {
                // Re-calculate prices
                const newPrice = updates.price !== undefined ? updates.price : plan.price;
                const newCurrency = updates.currency || plan.currency;
                const newInterval = updates.interval || plan.interval;
                const productId = plan.stripe_product_id;

                if (productId) {
                    // STRIPE EXPECTS AMOUNTS IN CENTS
                    const PRICE_IN_CENTS = Math.round(newPrice * 100);
                    const monthlyAmount = newInterval === 'monthly' ? PRICE_IN_CENTS : Math.round(PRICE_IN_CENTS / 12);
                    const yearlyAmount = newInterval === 'yearly' ? PRICE_IN_CENTS : PRICE_IN_CENTS * 12;

                    const stripePriceMonthly = await stripeService.createPrice(productId, monthlyAmount, newCurrency, 'month');
                    const stripePriceYearly = await stripeService.createPrice(productId, yearlyAmount, newCurrency, 'year');

                    updates.stripe_price_id_monthly = stripePriceMonthly.id;
                    updates.stripe_price_id_yearly = stripePriceYearly.id;
                }
            }

            // Validate: Only one trial plan per tool
            if (updates.is_trial_plan === true) {
                const existingTrialPlan = await Plan.findOne({
                    where: {
                        tool_id: plan.tool_id,
                        is_trial_plan: true,
                        id: { [Op.ne]: plan.id }
                    },
                    transaction: t
                });

                if (existingTrialPlan) {
                    throw new Error(`The plan "${existingTrialPlan.name}" is already set as the trial plan for this tool.`);
                }
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
        const err = error as Error;
        if (err.message.includes('already set as the trial plan')) {
            return res.status(400).json({ message: err.message });
        }
        handleError(res, error, 'Update Plan Error');
    }
};

export const deletePlan = async (req: Request, res: Response) => {
    const { id } = req.params;
    Logger.info('Deleting plan', { id, userId: req.user?.id });
    try {

        await sequelize.transaction(async (t) => {
            const plan = await Plan.findByPk(id, { transaction: t });

            if (!plan) {
                throw new Error('NOT_FOUND');
            }

            // Check for active subscriptions for this plan
            const activeSubscription = await import('../models/subscription').then(({ Subscription }) =>
                Subscription.findOne({
                    where: {
                        plan_id: id,
                        status: { [Op.in]: [SubStatus.ACTIVE, SubStatus.TRIALING, SubStatus.PAST_DUE] }
                    },
                    transaction: t
                })
            );

            if (activeSubscription) {
                throw new Error('HAS_ACTIVE_SUBSCRIPTIONS');
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
        const err = error as Error;
        if (err.message === 'HAS_ACTIVE_SUBSCRIPTIONS') {
            return res.status(400).json({
                message: 'Cannot delete plan. There are active subscriptions associated with this plan.'
            });
        }
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
        Logger.info('Upserting plan limit', { plan_id, feature_id, userId: req.user?.id });

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
        Logger.info('Deleting plan limit', { plan_id, feature_id, userId: req.user?.id });

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
