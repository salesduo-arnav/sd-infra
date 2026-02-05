import { Request, Response } from 'express';
import { Op } from 'sequelize';
import sequelize from '../config/db';
import { Tool } from '../models/tool';
import { Feature } from '../models/feature';
import { Plan } from '../models/plan';
import { PlanLimit } from '../models/plan_limit';
import { Subscription } from '../models/subscription';
import { SubStatus } from '../models/enums';

// ==========================
// Tool Config Controllers
// ==========================

export const getTools = async (req: Request, res: Response) => {
    try {
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 10;
        const offset = (page - 1) * limit;

        const search = req.query.search as string;
        const sortBy = (req.query.sortBy as string) || 'created_at';
        const sortOrder = (req.query.sortOrder as string) === 'asc' ? 'ASC' : 'DESC';
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

        const totalPages = Math.ceil(count / limit);

        res.status(200).json({
            tools: rows,
            meta: {
                totalItems: count,
                totalPages,
                currentPage: page,
                itemsPerPage: limit
            }
        });
    } catch (error) {
        console.error('Get Tools Error:', error);
        res.status(500).json({ message: 'Internal server error' });
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
    console.error('Get Tool Error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const createTool = async (req: Request, res: Response) => {
  const t = await sequelize.transaction();
  try {
    const { name, slug, description, is_active } = req.body;

    if (!name || !slug) {
        await t.rollback();
        return res.status(400).json({ message: 'Name and slug are required' });
    }

    const existingTool = await Tool.findOne({ where: { slug }, transaction: t });
    if (existingTool) {
        await t.rollback();
        return res.status(400).json({ message: 'Tool with this slug already exists' });
    }

    const tool = await Tool.create({
      name,
      slug,
      description,
      is_active: is_active !== undefined ? is_active : true,
    }, { transaction: t });

    await t.commit();
    res.status(201).json(tool);
  } catch (error) {
    await t.rollback();
    console.error('Create Tool Error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const updateTool = async (req: Request, res: Response) => {
  const t = await sequelize.transaction();
  try {
    const { id } = req.params;
    const { name, slug, description, is_active } = req.body;

    const tool = await Tool.findByPk(id, { transaction: t });

    if (!tool) {
        await t.rollback();
        return res.status(404).json({ message: 'Tool not found' });
    }

    if (slug && slug !== tool.slug) {
        const existingTool = await Tool.findOne({ where: { slug }, transaction: t });
        if (existingTool) {
            await t.rollback();
            return res.status(400).json({ message: 'Tool with this slug already exists' });
        }
    }

    await tool.update({
      name: name ?? tool.name,
      slug: slug ?? tool.slug,
      description: description ?? tool.description,
      is_active: is_active ?? tool.is_active,
    }, { transaction: t });

    await t.commit();
    res.status(200).json(tool);
  } catch (error) {
    await t.rollback();
    console.error('Update Tool Error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const deleteTool = async (req: Request, res: Response) => {
    const t = await sequelize.transaction();
    try {
        const { id } = req.params;

        const tool = await Tool.findByPk(id, { transaction: t });

        if (!tool) {
            await t.rollback();
            return res.status(404).json({ message: 'Tool not found' });
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
                await t.rollback();
                return res.status(400).json({ 
                    message: 'Cannot delete tool. There are active subscriptions associated with plans for this tool. Please cancel subscriptions first.' 
                });
            }
        }

        // If no active subscriptions, proceed with delete (DB Cascade will handle children)
        
        await tool.destroy({ transaction: t });

        await t.commit();
        res.status(200).json({ message: 'Tool and associated plans/features deleted successfully' });
    } catch (error) {
        await t.rollback();
        // Handle constraint error if any (e.g. if DB restrict triggers unexpectedly)
        console.error('Delete Tool Error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
