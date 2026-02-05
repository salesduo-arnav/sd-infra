import { Request, Response } from 'express';
import { Op } from 'sequelize';
import { Bundle } from '../models/bundle';
import { Plan } from '../models/plan';
import { BundlePlan } from '../models/bundle_plan';
import { PriceInterval } from '../models/enums';

// ==========================
// Bundle Config Controllers
// ==========================

export const getBundles = async (req: Request, res: Response) => {
    try {
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 10;
        const offset = (page - 1) * limit;

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
            order: [['created_at', 'DESC']],
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
        const { name, slug, price, currency, interval, description, active } = req.body;

        if (!name || !slug || price === undefined || !currency || !interval) {
            return res.status(400).json({ message: 'Name, Slug, Price, Currency, and Interval are required' });
        }

        if (!Object.values(PriceInterval).includes(interval)) {
             return res.status(400).json({ message: 'Invalid price interval' });
        }

        const existingBundle = await Bundle.findOne({ where: { slug } });
        if (existingBundle) {
            return res.status(400).json({ message: 'Bundle with this slug already exists' });
        }

        const bundle = await Bundle.create({
            name,
            slug,
            price,
            currency,
            interval,
            description,
            active: active ?? true
        });

        res.status(201).json(bundle);
    } catch (error) {
        console.error('Create Bundle Error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const updateBundle = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { name, slug, price, currency, interval, description, active } = req.body;

        const bundle = await Bundle.findByPk(id);

        if (!bundle) {
            return res.status(404).json({ message: 'Bundle not found' });
        }

        if (slug && slug !== bundle.slug) {
            const existingBundle = await Bundle.findOne({ where: { slug } });
            if (existingBundle) {
                return res.status(400).json({ message: 'Bundle with this slug already exists' });
            }
        }

        await bundle.update({
            name: name ?? bundle.name,
            slug: slug ?? bundle.slug,
            price: price !== undefined ? price : bundle.price,
            currency: currency ?? bundle.currency,
            interval: interval ?? bundle.interval,
            description: description ?? bundle.description,
            active: active ?? bundle.active
        });

        res.status(200).json(bundle);
    } catch (error) {
        console.error('Update Bundle Error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const deleteBundle = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const bundle = await Bundle.findByPk(id);

        if (!bundle) {
            return res.status(404).json({ message: 'Bundle not found' });
        }

        await bundle.destroy();
        res.status(200).json({ message: 'Bundle deleted successfully' });
    } catch (error) {
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

        const bundle = await Bundle.findByPk(id);
        if (!bundle) return res.status(404).json({ message: 'Bundle not found' });

        const plan = await Plan.findByPk(plan_id);
        if (!plan) return res.status(404).json({ message: 'Plan not found' });

        await BundlePlan.findOrCreate({
            where: {
                bundle_id: id,
                plan_id: plan_id
            }
        });

        res.status(200).json({ message: 'Plan added to bundle' });
    } catch (error) {
        console.error('Add Plan to Bundle Error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const removePlanFromBundle = async (req: Request, res: Response) => {
    try {
        const { id, planId } = req.params; // Bundle ID, Plan ID

        const bundle = await Bundle.findByPk(id);
        if (!bundle) return res.status(404).json({ message: 'Bundle not found' });

        const deleted = await BundlePlan.destroy({
            where: {
                bundle_id: id,
                plan_id: planId
            }
        });

        if (deleted === 0) {
            return res.status(404).json({ message: 'Plan not associated with this bundle' });
        }

        res.status(200).json({ message: 'Plan removed from bundle' });
    } catch (error) {
        console.error('Remove Plan from Bundle Error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
