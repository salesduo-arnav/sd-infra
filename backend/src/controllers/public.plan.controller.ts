import { Request, Response } from 'express';
import { Plan, Bundle, BundlePlan, Tool, Feature, BundleGroup, PlanLimit } from '../models';
import { handleError } from '../utils/error';


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
                required: true,
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
                                    },
                                    {
                                        model: PlanLimit,
                                        as: 'limits',
                                        include: [{ model: Feature, as: 'feature' }]
                                    }
                                ]
                            }
                        ]
                    }
                ]
            }],
            order: [
                ['created_at', 'ASC'],
                [{ model: Bundle, as: 'bundles' }, 'price', 'ASC']
            ]
        });
        
        res.status(200).json(bundleGroups);
    } catch (error) {
        handleError(res, error, 'Get Public Bundles Error');
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
                },
                {
                    model: PlanLimit,
                    as: 'limits',
                    include: [{ model: Feature, as: 'feature' }]
                }
            ],
            order: [
                ['tool_id', 'ASC'],
                ['price', 'ASC']
            ]
        });

        res.status(200).json(plans);
    } catch (error) {
        handleError(res, error, 'Get Public Plans Error');
    }
};
