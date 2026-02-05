import { Request, Response } from 'express';
import { Op } from 'sequelize';
import { Plan } from '../models/plan';
import { PlanLimit } from '../models/plan_limit';
import { Tool } from '../models/tool';
import { Feature } from '../models/feature';
import { PriceInterval, TierType, FeatureResetPeriod } from '../models/enums';

// ==========================
// Plan Config Controllers
// ==========================

export const getPlans = async (req: Request, res: Response) => {
  try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;
      const offset = (page - 1) * limit;

      const search = req.query.search as string;
      const sortBy = (req.query.sortBy as string) || 'tool_id'; // Default sort by tool
      const sortOrder = (req.query.sortOrder as string) === 'desc' ? 'DESC' : 'ASC';

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

      const totalPages = Math.ceil(count / limit);

      res.status(200).json({
          plans: rows,
          meta: {
              totalItems: count,
              totalPages,
              currentPage: page,
              itemsPerPage: limit
          }
      });
  } catch (error) {
      console.error('Get Plans Error:', error);
      res.status(500).json({ message: 'Internal server error' });
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
        console.error('Get Plan Error:', error);
        res.status(500).json({ message: 'Internal server error' });
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
            is_public,
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

        const plan = await Plan.create({
            name,
            description,
            tool_id,
            tier,
            price,
            currency,
            interval,
            trial_period_days: trial_period_days ?? 0,
            is_public: is_public ?? true,
            active: active ?? true
        });

        res.status(201).json(plan);
    } catch (error) {
        console.error('Create Plan Error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const updatePlan = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const updates = req.body;

        const plan = await Plan.findByPk(id);

        if (!plan) {
            return res.status(404).json({ message: 'Plan not found' });
        }

        await plan.update(updates);

        res.status(200).json(plan);
    } catch (error) {
        console.error('Update Plan Error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const deletePlan = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const plan = await Plan.findByPk(id);

        if (!plan) {
            return res.status(404).json({ message: 'Plan not found' });
        }

        await plan.destroy();
        res.status(200).json({ message: 'Plan deleted successfully' });
    } catch (error) {
        console.error('Delete Plan Error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// ==========================
// Plan Limits Controllers
// ==========================

export const upsertPlanLimit = async (req: Request, res: Response) => {
    try {
        const { plan_id } = req.params;
        const { feature_id, default_limit, reset_period } = req.body;

        if (!feature_id) {
            return res.status(400).json({ message: 'Feature ID is required' });
        }

        const plan = await Plan.findByPk(plan_id);
        if (!plan) {
            return res.status(404).json({ message: 'Plan not found' });
        }

        // Check if limit exists
        const [limit, created] = await PlanLimit.findOrCreate({
            where: { plan_id, feature_id },
            defaults: {
                plan_id,
                feature_id,
                default_limit,
                reset_period: reset_period || FeatureResetPeriod.MONTHLY
            }
        });

        if (!created) {
            await limit.update({
                default_limit: default_limit !== undefined ? default_limit : limit.default_limit,
                reset_period: reset_period || limit.reset_period
            });
        }

        res.status(200).json(limit);
    } catch (error) {
        console.error('Upsert Plan Limit Error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const deletePlanLimit = async (req: Request, res: Response) => {
    try {
        const { plan_id, feature_id } = req.params;

        const limit = await PlanLimit.findOne({ where: { plan_id, feature_id } });

        if (!limit) {
            return res.status(404).json({ message: 'Plan Limit not found' });
        }

        await limit.destroy();
        res.status(200).json({ message: 'Plan Limit deleted successfully' });
    } catch (error) {
        console.error('Delete Plan Limit Error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
