
import { Request, Response } from 'express';
import { Tool, ToolUsage } from '../models';
import { handleError } from '../utils/error';

export const getTools = async (req: Request, res: Response) => {
    try {
        const tools = await Tool.findAll({
            where: { is_active: true },
            order: [['name', 'ASC']]
        });
        res.status(200).json(tools);
    } catch (error) {
        handleError(res, error, 'Get Tools Error');
    }
};

export const getToolBySlug = async (req: Request, res: Response) => {
    try {
        const { slug } = req.params;
        const tool = await Tool.findOne({
            where: { slug, is_active: true },
        });
        if (!tool) {
            return res.status(404).json({ message: 'Tool not found' });
        }
        res.status(200).json(tool);
    } catch (error) {
        handleError(res, error, 'Get Tool By Slug Error');
    }
};

export const trackToolUsage = async (req: Request, res: Response) => {
    try {
        const { id } = req.params; // tool_id
        const userId = req.user?.id;
        const organizationId = req.user?.organization_id;

        if (!userId || !organizationId) {
            return res.status(400).json({ message: 'User or Organization context missing' });
        }

        const isUuid = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(id);

        let tool;
        if (isUuid) {
            tool = await Tool.findByPk(id);
        } else {
            tool = await Tool.findOne({ where: { slug: id } });
        }

        if (!tool) {
            return res.status(404).json({ message: 'Tool not found' });
        }

        // Check if usage record exists for today
        const today = new Date().toISOString().split('T')[0];

        const [usage, created] = await ToolUsage.findOrCreate({
            where: {
                tool_id: id,
                user_id: userId,
                organization_id: organizationId,
                date: today
            },
            defaults: {
                tool_id: id,
                user_id: userId,
                organization_id: organizationId,
                date: today,
                count: 1
            }
        });

        if (!created) {
            await usage.increment('count');
        }

        res.status(200).json({ message: 'Usage tracked successfully' });
    } catch (error) {
        handleError(res, error, 'Track Tool Usage Error');
    }
};
