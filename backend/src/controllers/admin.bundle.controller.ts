import { Request, Response } from 'express';
import { Op } from 'sequelize';
import sequelize from '../config/db';
import { Bundle } from '../models/bundle';
import { BundleGroup } from '../models/bundle_group';
import { Plan } from '../models/plan';
import { PlanLimit } from '../models/plan_limit';
import { stripeService } from '../services/stripe.service';
import { Feature } from '../models/feature';
import { BundlePlan } from '../models/bundle_plan';
import { PriceInterval } from '../models/enums';
import { getPaginationOptions, formatPaginationResponse } from '../utils/pagination';
import { handleError } from '../utils/error';
import { AuditService } from '../services/audit.service';

// ==========================
// Bundle Config Controllers
// ==========================

export const getBundleGroups = async (req: Request, res: Response) => {
    try {
        const groups = await BundleGroup.findAll({
            include: [{
                model: Bundle,
                as: 'bundles',
                include: [{
                    model: Plan,
                    as: 'plans',
                    through: { attributes: [] },
                    include: [{
                        model: PlanLimit,
                        as: 'limits',
                        include: [{
                            model: Feature,
                            as: 'feature'
                        }]
                    }]
                }]
            }],
            order: [['created_at', 'DESC']]
        });

        res.status(200).json(groups);
    } catch (error) {
        handleError(res, error, 'Get Bundle Groups Error');
    }
};

export const createBundleGroup = async (req: Request, res: Response) => {
    try {
        const { name, slug, description, active } = req.body;

        if (!name || !slug) {
            return res.status(400).json({ message: 'Name and Slug are required' });
        }

        const group = await BundleGroup.create({
            name,
            slug,
            description,
            active: active ?? true
        });

        await AuditService.log({
            actorId: req.user?.id,
            action: 'CREATE_BUNDLE_GROUP',
            entityType: 'BundleGroup',
            entityId: group.id,
            details: { name, slug },
            req
        });

        res.status(201).json(group);
    } catch (error) {
        handleError(res, error, 'Create Bundle Group Error');
    }
};

export const updateBundleGroup = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const updates = req.body;

        const group = await BundleGroup.findByPk(id);
        if (!group) {
            return res.status(404).json({ message: 'Bundle Group not found' });
        }

        await group.update(updates);

        await AuditService.log({
            actorId: req.user?.id,
            action: 'UPDATE_BUNDLE_GROUP',
            entityType: 'BundleGroup',
            entityId: group.id,
            details: { updates },
            req
        });

        res.status(200).json(group);
    } catch (error) {
        handleError(res, error, 'Update Bundle Group Error');
    }
};

export const deleteBundleGroup = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const group = await BundleGroup.findByPk(id);

        if (!group) {
            return res.status(404).json({ message: 'Bundle Group not found' });
        }

        const groupId = group.id;
        const groupName = group.name;
        await group.destroy();

        await AuditService.log({
            actorId: req.user?.id,
            action: 'DELETE_BUNDLE_GROUP',
            entityType: 'BundleGroup',
            entityId: groupId,
            details: { deleted_group_name: groupName },
            req
        });

        res.status(200).json({ message: 'Bundle Group deleted' });
    } catch (error) {
        handleError(res, error, 'Delete Bundle Group Error');
    }
};

export const getBundles = async (req: Request, res: Response) => {
    try {
        const { page, limit, offset, sortBy, sortOrder } = getPaginationOptions(req);

        const search = req.query.search as string;
        const activeOnly = req.query.activeOnly === 'true';

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const whereClause: any = {};

        if (activeOnly) {
            whereClause.active = true;
        }

        if (search) {
            whereClause[Op.or] = [
                { name: { [Op.iLike]: `%${search}%` } },
                { slug: { [Op.iLike]: `%${search}%` } }
            ];
        }

        const { count, rows } = await Bundle.findAndCountAll({
            where: whereClause,
            limit,
            offset,
            order: [[sortBy, sortOrder]],
            include: [{
                model: Plan,
                as: 'plans',
                through: { attributes: [] } // Hide join table attributes
            }],
            distinct: true // Important for correct count with includes
        });

        res.status(200).json(formatPaginationResponse(rows, count, page, limit, 'bundles'));
    } catch (error) {
        handleError(res, error, 'Get Bundles Error');
    }
};

export const getBundleById = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const bundle = await Bundle.findByPk(id, {
            include: [{
                model: Plan,
                as: 'plans',
                through: { attributes: [] }
            }]
        });

        if (!bundle) {
            return res.status(404).json({ message: 'Bundle not found' });
        }

        res.status(200).json(bundle);
    } catch (error) {
        handleError(res, error, 'Get Bundle Error');
    }
};

export const createBundle = async (req: Request, res: Response) => {
    try {
        const { name, slug, price, currency, interval, description, active, bundle_group_id, tier_label } = req.body;

        if (!name || !slug) {
            // Fallback: if name/slug missing but tier_label present, derive them?
            // But for now, frontend sends them.
            if (tier_label && (!name || !slug)) {
                // Logic handled in frontend ideally, but strictly:
                if (!name) return res.status(400).json({ message: 'Name (Tier Label) is required' });
            }
            return res.status(400).json({ message: 'Name and Slug are required' });
        }

        if (!Object.values(PriceInterval).includes(interval)) {
            return res.status(400).json({ message: 'Invalid price interval' });
        }

        // 1. Create Stripe Product & Prices
        const stripeProduct = await stripeService.createProduct(name, description);
        
        let stripePriceMonthly;
        let stripePriceYearly;

        const monthlyAmount = interval === 'monthly' ? price : Math.round(price / 12);
        const yearlyAmount = interval === 'yearly' ? price : price * 12;

        stripePriceMonthly = await stripeService.createPrice(stripeProduct.id, monthlyAmount, currency, 'month');
        stripePriceYearly = await stripeService.createPrice(stripeProduct.id, yearlyAmount, currency, 'year');

        const bundle = await sequelize.transaction(async (t) => {
            const existingBundle = await Bundle.findOne({ where: { slug }, transaction: t });
            if (existingBundle) {
                throw new Error('ALREADY_EXISTS');
            }

            return await Bundle.create({
                name,
                slug,
                price,
                currency,
                interval,
                description,
                active: active ?? true,
                bundle_group_id,
                tier_label,
                stripe_product_id: stripeProduct.id,
                stripe_price_id_monthly: stripePriceMonthly.id,
                stripe_price_id_yearly: stripePriceYearly.id
            }, { transaction: t });
        });

        await AuditService.log({
            actorId: req.user?.id,
            action: 'CREATE_BUNDLE',
            entityType: 'Bundle',
            entityId: bundle.id,
            details: { name, slug, price, interval },
            req
        });

        res.status(201).json(bundle);
    } catch (error) {
        handleError(res, error, 'Create Bundle Error');
    }
};

export const updateBundle = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { name, slug, price, currency, interval, description, active, bundle_group_id, tier_label } = req.body;

        const updatedBundle = await sequelize.transaction(async (t) => {
            const bundle = await Bundle.findByPk(id, { transaction: t });

            if (!bundle) {
                throw new Error('NOT_FOUND');
            }

            if (slug && slug !== bundle.slug) {
                const existingBundle = await Bundle.findOne({ where: { slug }, transaction: t });
                if (existingBundle) {
                    throw new Error('SLUG_EXISTS');
                }
            }

            const updates: any = {
                name: name ?? bundle.name,
                slug: slug ?? bundle.slug,
                price: price !== undefined ? price : bundle.price,
                currency: currency ?? bundle.currency,
                interval: interval ?? bundle.interval,
                description: description ?? bundle.description,
                active: active ?? bundle.active,
                bundle_group_id: bundle_group_id !== undefined ? bundle_group_id : bundle.bundle_group_id,
                tier_label: tier_label !== undefined ? tier_label : bundle.tier_label
            };

            // Check if price-affecting fields are changed
             if (
                (updates.price !== undefined && updates.price !== bundle.price) ||
                (updates.currency && updates.currency !== bundle.currency) ||
                (updates.interval && updates.interval !== bundle.interval)
            ) {
                 const productId = bundle.stripe_product_id;
                 if (productId) {
                     const newPrice = updates.price;
                     const newCurrency = updates.currency;
                     const newInterval = updates.interval;

                     const monthlyAmount = newInterval === 'monthly' ? newPrice : Math.round(newPrice / 12);
                     const yearlyAmount = newInterval === 'yearly' ? newPrice : newPrice * 12;

                     const stripePriceMonthly = await stripeService.createPrice(productId, monthlyAmount, newCurrency, 'month');
                     const stripePriceYearly = await stripeService.createPrice(productId, yearlyAmount, newCurrency, 'year');
                     
                     updates.stripe_price_id_monthly = stripePriceMonthly.id;
                     updates.stripe_price_id_yearly = stripePriceYearly.id;
                 }
            }

            return await bundle.update(updates, { transaction: t });
        });

        await AuditService.log({
            actorId: req.user?.id,
            action: 'UPDATE_BUNDLE',
            entityType: 'Bundle',
            entityId: id,
            details: { updates: { name, slug, price, interval, active, bundle_group_id, tier_label } },
            req
        });

        res.status(200).json(updatedBundle);
    } catch (error) {
        handleError(res, error, 'Update Bundle Error');
    }
};

export const deleteBundle = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        await sequelize.transaction(async (t) => {
            const bundle = await Bundle.findByPk(id, { transaction: t });

            if (!bundle) {
                throw new Error('NOT_FOUND');
            }

            await bundle.destroy({ transaction: t });
        });

        await AuditService.log({
            actorId: req.user?.id,
            action: 'DELETE_BUNDLE',
            entityType: 'Bundle',
            entityId: id,
            details: {},
            req
        });

        res.status(200).json({ message: 'Bundle deleted successfully' });
    } catch (error) {
        handleError(res, error, 'Delete Bundle Error');
    }
};

// ==========================
// Bundle Plan Association
// ==========================

export const addPlanToBundle = async (req: Request, res: Response) => {
    try {
        const { id } = req.params; // Bundle ID
        const { plan_id } = req.body;

        if (!plan_id) {
            return res.status(400).json({ message: 'Plan ID is required' });
        }

        await sequelize.transaction(async (t) => {
            const bundle = await Bundle.findByPk(id, { transaction: t });
            if (!bundle) throw new Error('BUNDLE_NOT_FOUND');

            const plan = await Plan.findByPk(plan_id, { transaction: t });
            if (!plan) throw new Error('PLAN_NOT_FOUND');

            await BundlePlan.findOrCreate({
                where: {
                    bundle_id: id,
                    plan_id: plan_id
                },
                transaction: t
            });
        });

        await AuditService.log({
            actorId: req.user?.id,
            action: 'ADD_PLAN_TO_BUNDLE',
            entityType: 'Bundle',
            entityId: id,
            details: { plan_id },
            req
        });

        res.status(200).json({ message: 'Plan added to bundle' });
    } catch (error) {
        handleError(res, error, 'Add Plan to Bundle Error');
    }
};

export const removePlanFromBundle = async (req: Request, res: Response) => {
    try {
        const { id, planId } = req.params; // Bundle ID, Plan ID

        await sequelize.transaction(async (t) => {
            const bundle = await Bundle.findByPk(id, { transaction: t });
            if (!bundle) throw new Error('BUNDLE_NOT_FOUND');

            const deleted = await BundlePlan.destroy({
                where: {
                    bundle_id: id,
                    plan_id: planId
                },
                transaction: t
            });

            if (deleted === 0) {
                throw new Error('NOT_ASSOCIATED');
            }
        });

        await AuditService.log({
            actorId: req.user?.id,
            action: 'REMOVE_PLAN_FROM_BUNDLE',
            entityType: 'Bundle',
            entityId: id,
            details: { plan_id: planId },
            req
        });

        res.status(200).json({ message: 'Plan removed from bundle' });
    } catch (error) {
        handleError(res, error, 'Remove Plan from Bundle Error');
    }
};
