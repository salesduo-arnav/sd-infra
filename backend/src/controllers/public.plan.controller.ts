import { Request, Response } from 'express';
import { Plan, Bundle, BundlePlan, Tool, Feature } from '../models';
import { Op } from 'sequelize';

// ==========================
// Public Plan Controllers
// ==========================

export const getPublicBundles = async (req: Request, res: Response) => {
    try {
        const bundles = await Bundle.findAll({
            where: { active: true },
            include: [
                {
                    model: BundlePlan,
                    as: 'bundle_plans', // Make sure this alias matches your association in index.ts
                    include: [
                        {
                            model: Plan,
                            as: 'plan', // Fetch the actual plan details if needed or just go straight to tool
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
            ],
            order: [['price', 'ASC']]
        });
        
        res.status(200).json(bundles);
    } catch (error) {
        console.error('Get Public Bundles Error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const getPublicPlans = async (req: Request, res: Response) => {
    try {
        const plans = await Plan.findAll({
            where: { 
                is_public: true, 
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
