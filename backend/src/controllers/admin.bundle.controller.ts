import { Request, Response } from 'express';
import { Op } from 'sequelize';
import sequelize from '../config/db';
import { Bundle } from '../models/bundle';
import { BundleGroup } from '../models/bundle_group';
import { Plan } from '../models/plan';
import { BundlePlan } from '../models/bundle_plan';
import { PriceInterval } from '../models/enums';

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
                   through: { attributes: [] }
                }]
            }],
            order: [['created_at', 'DESC']]
        });
        res.status(200).json(groups);
    } catch (error) {
        console.error('Get Bundle Groups Error:', error);
        res.status(500).json({ message: 'Internal server error' });
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

        res.status(201).json(group);
    } catch (error: any) {
        if (error.name === 'SequelizeUniqueConstraintError') {
             return res.status(400).json({ message: 'Slug must be unique' });
        }
        console.error('Create Bundle Group Error:', error);
        res.status(500).json({ message: 'Internal server error' });
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
        res.status(200).json(group);
    } catch (error) {
        console.error('Update Bundle Group Error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const deleteBundleGroup = async (req: Request, res: Response) => {
     try {
        const { id } = req.params;
        const group = await BundleGroup.findByPk(id);
        
        if (!group) {
             return res.status(404).json({ message: 'Bundle Group not found' });
        }

        await group.destroy();
        res.status(200).json({ message: 'Bundle Group deleted' });
    } catch (error: any) {
        if (error.name === 'SequelizeForeignKeyConstraintError') {
             return res.status(400).json({ message: 'Cannot delete group with active bundles' });
        }
        console.error('Delete Bundle Group Error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const getBundles = async (req: Request, res: Response) => {
    try {
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 10;
        const offset = (page - 1) * limit;

        const search = req.query.search as string;
        const activeOnly = req.query.activeOnly === 'true';
        const sortBy = (req.query.sort_by as string) || 'created_at';
        const sortOrder = (req.query.sort_dir as string) === 'desc' ? 'DESC' : 'ASC';

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

        res.status(200).json({
            bundles: rows,
            meta: {
                totalItems: count,
                totalPages: Math.ceil(count / limit),
                currentPage: page,
                itemsPerPage: limit
            }
        });
    } catch (error) {
        console.error('Get Bundles Error:', error);
        res.status(500).json({ message: 'Internal server error' });
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
        console.error('Get Bundle Error:', error);
        res.status(500).json({ message: 'Internal server error' });
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
                tier_label
            }, { transaction: t });
        });

        res.status(201).json(bundle);
    } catch (error: any) {
        if (error.message === 'ALREADY_EXISTS') {
            return res.status(400).json({ message: 'Bundle with this slug already exists' });
        }
        console.error('Create Bundle Error:', error);
        res.status(500).json({ message: 'Internal server error' });
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

            return await bundle.update({
                name: name ?? bundle.name,
                slug: slug ?? bundle.slug,
                price: price !== undefined ? price : bundle.price,
                currency: currency ?? bundle.currency,
                interval: interval ?? bundle.interval,
                description: description ?? bundle.description,
                active: active ?? bundle.active,
                bundle_group_id: bundle_group_id !== undefined ? bundle_group_id : bundle.bundle_group_id,
                tier_label: tier_label !== undefined ? tier_label : bundle.tier_label
            }, { transaction: t });
        });

        res.status(200).json(updatedBundle);
    } catch (error: any) {
        if (error.message === 'NOT_FOUND') {
            return res.status(404).json({ message: 'Bundle not found' });
        }
        if (error.message === 'SLUG_EXISTS') {
            return res.status(400).json({ message: 'Bundle with this slug already exists' });
        }
        console.error('Update Bundle Error:', error);
        res.status(500).json({ message: 'Internal server error' });
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

        res.status(200).json({ message: 'Bundle deleted successfully' });
    } catch (error: any) {
        if (error.message === 'NOT_FOUND') {
            return res.status(404).json({ message: 'Bundle not found' });
        }
        console.error('Delete Bundle Error:', error);
        res.status(500).json({ message: 'Internal server error' });
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

        res.status(200).json({ message: 'Plan added to bundle' });
    } catch (error: any) {
        if (error.message === 'BUNDLE_NOT_FOUND') return res.status(404).json({ message: 'Bundle not found' });
        if (error.message === 'PLAN_NOT_FOUND') return res.status(404).json({ message: 'Plan not found' });
        
        console.error('Add Plan to Bundle Error:', error);
        res.status(500).json({ message: 'Internal server error' });
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

        res.status(200).json({ message: 'Plan removed from bundle' });
    } catch (error: any) {
        if (error.message === 'BUNDLE_NOT_FOUND') return res.status(404).json({ message: 'Bundle not found' });
        if (error.message === 'NOT_ASSOCIATED') return res.status(404).json({ message: 'Plan not associated with this bundle' });
        
        console.error('Remove Plan from Bundle Error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
