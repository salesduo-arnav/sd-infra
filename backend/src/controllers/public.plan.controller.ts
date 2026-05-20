import { Request, Response } from 'express';
import { Op } from 'sequelize';
import { Plan, Bundle, BundlePlan, Tool, Feature, BundleGroup, PlanLimit, PlanCreditGrant } from '../models';
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
                ['id', 'ASC'],
                [{ model: Bundle, as: 'bundles' }, 'price', 'ASC']
            ]
        });
        
        res.status(200).json(bundleGroups);
    } catch (error) {
        handleError(res, error, 'Get Public Bundles Error');
    }
};

/**
 * Returns one row per (plan_id, tool_id) credit grant for every active plan
 * tied to an active tool. Includes both the regular per-cycle grant and any
 * trial grant (marked is_trial_grant=true). The Plans page indexes by plan_id
 * to hydrate per-tier "X credits / month" labels and per-bundle composition.
 */
export const getPublicPlanCreditGrants = async (_req: Request, res: Response) => {
    try {
        const grants = await PlanCreditGrant.findAll({
            include: [
                { model: Tool, as: 'tool', where: { is_active: true }, attributes: ['id', 'slug', 'name'] },
                { model: Plan, as: 'plan', where: { active: true }, attributes: ['id'] },
            ],
            where: {
                [Op.or]: [
                    { credits_per_cycle: { [Op.gt]: 0 } },
                    { trial_credits: { [Op.gt]: 0 } },
                ],
            },
        });

        const rows: Array<{
            plan_id: string;
            tool_id: string;
            tool_slug?: string;
            tool_name?: string;
            credits_per_period: number;
            period_unit: 'monthly' | 'yearly';
            is_trial_grant: boolean;
        }> = [];

        for (const g of grants) {
            const periodUnit: 'monthly' | 'yearly' = g.reset_interval === 'yearly' ? 'yearly' : 'monthly';
            if (g.credits_per_cycle > 0) {
                rows.push({
                    plan_id: g.plan_id,
                    tool_id: g.tool_id,
                    tool_slug: g.tool?.slug,
                    tool_name: g.tool?.name,
                    credits_per_period: g.credits_per_cycle,
                    period_unit: periodUnit,
                    is_trial_grant: false,
                });
            }
            if (g.trial_credits > 0) {
                rows.push({
                    plan_id: g.plan_id,
                    tool_id: g.tool_id,
                    tool_slug: g.tool?.slug,
                    tool_name: g.tool?.name,
                    credits_per_period: g.trial_credits,
                    period_unit: periodUnit,
                    is_trial_grant: true,
                });
            }
        }

        res.status(200).json(rows);
    } catch (error) {
        handleError(res, error, 'Get Public Plan Credit Grants Error');
    }
};

/**
 * Returns the per-tool credit grants conferred by a specific bundle (sums of
 * its constituent plan grants). Used when the frontend wants a per-bundle view
 * without indexing the global grants list.
 */
export const getPublicBundleCreditGrants = async (req: Request, res: Response) => {
    try {
        const { bundleId } = req.params;
        const bundle = await Bundle.findByPk(bundleId);
        if (!bundle) return res.status(404).json({ message: 'Bundle not found' });

        const bundlePlans = await BundlePlan.findAll({
            where: { bundle_id: bundleId },
            attributes: ['plan_id'],
        });
        const planIds = bundlePlans.map((bp) => bp.plan_id);
        if (planIds.length === 0) {
            return res.json({ bundle_id: bundleId, grants: [] });
        }

        const grants = await PlanCreditGrant.findAll({
            where: { plan_id: { [Op.in]: planIds }, credits_per_cycle: { [Op.gt]: 0 } },
            include: [{ model: Tool, as: 'tool', attributes: ['id', 'slug', 'name'] }],
        });

        res.json({
            bundle_id: bundleId,
            grants: grants.map((g) => ({
                plan_id: g.plan_id,
                tool_id: g.tool_id,
                tool_slug: g.tool?.slug,
                tool_name: g.tool?.name,
                credits_per_period: g.credits_per_cycle,
                period_unit: g.reset_interval === 'yearly' ? 'yearly' : 'monthly',
            })),
        });
    } catch (error) {
        handleError(res, error, 'Get Public Bundle Credit Grants Error');
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
                    attributes: { include: ['trial_card_required', 'trial_days'] },
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
                ['price', 'ASC'],
                ['id', 'ASC']
            ]
        });

        res.status(200).json(plans);
    } catch (error) {
        handleError(res, error, 'Get Public Plans Error');
    }
};
