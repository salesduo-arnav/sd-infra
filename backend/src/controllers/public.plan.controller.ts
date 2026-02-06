import { Request, Response } from 'express';
import { Plan, Bundle, BundlePlan, Tool, Feature, BundleGroup } from '../models';
import { Op } from 'sequelize';

// ==========================
// Public Plan Controllers
// ==========================

export const getPublicBundles = async (req: Request, res: Response) => {
    try {
        const bundleGroups = await BundleGroup.findAll({
            where: { active: true },
            include: [{
                model: Bundle,
                as: 'bundles',
                where: { active: true },
                required: false, // Show group even if no active bundles? Maybe not, usually only if actionable. Let's say false for now to filter out empty groups if that's desired, or true to ensure tiers. Let's stick to required: true to only show groups with content.
                include: [
                    {
                        model: BundlePlan,
                        as: 'bundle_plans',
                        include: [
                            {
                                model: Plan,
                                as: 'plan',
                                include: [
                                    {
                                        model: Tool,
                                        as: 'tool',
                                        include: [{ model: Feature, as: 'features' }]
                                    }
                                ]
                            }
                        ]
                    }
                ]
            }],
            order: [
                ['created_at', 'ASC'],
                [{ model: Bundle, as: 'bundles' }, 'price', 'ASC'] // Order tiers by price
            ]
        });
        
        res.status(200).json(bundleGroups);
    } catch (error) {
        console.error('Get Public Bundles Error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const getPublicPlans = async (req: Request, res: Response) => {
    try {
        const plans = await Plan.findAll({
            where: { 
                active: true 
            },
            include: [
                {
                    model: Tool,
                    as: 'tool',
                    where: { is_active: true },
                    include: [{ model: Feature, as: 'features' }]
                }
            ],
            order: [
                ['tool_id', 'ASC'], // Group by tool
                ['price', 'ASC'] // Order tiers by price
            ]
        });

        res.status(200).json(plans);
    } catch (error) {
        console.error('Get Public Plans Error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
