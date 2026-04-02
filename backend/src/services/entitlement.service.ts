import { Op, Transaction } from 'sequelize';
import { PlanLimit } from '../models/plan_limit';
import { OrganizationEntitlement } from '../models/organization_entitlement';
import { Subscription } from '../models/subscription';
import { BundlePlan } from '../models/bundle_plan';
import { Plan } from '../models/plan';
import { Feature } from '../models/feature';
import { SubStatus, FeatureResetPeriod } from '../models/enums';
import redisClient from '../config/redis';
import Logger from '../utils/logger';

export class EntitlementService {
    /**
     * Computes the effective (highest) limit for a given org + feature across all
     * their active subscription plans. Handles null = unlimited as the highest value.
     */
    private async computeEffectiveLimit(
        organizationId: string,
        featureId: string,
        transaction?: Transaction
    ): Promise<{ limit_amount: number | null; reset_period: FeatureResetPeriod }> {
        // 1. Find all active subscriptions for this org
        const activeSubs = await Subscription.findAll({
            where: {
                organization_id: organizationId,
                status: { [Op.in]: [SubStatus.ACTIVE, SubStatus.TRIALING, SubStatus.PAST_DUE] }
            },
            attributes: ['plan_id', 'bundle_id'],
            transaction
        });

        // 2. Collect all plan IDs (direct + via bundles)
        const planIds = new Set<string>();
        const bundleIds: string[] = [];

        for (const sub of activeSubs) {
            if (sub.plan_id) planIds.add(sub.plan_id);
            if (sub.bundle_id) bundleIds.push(sub.bundle_id);
        }

        if (bundleIds.length > 0) {
            const bundlePlans = await BundlePlan.findAll({
                where: { bundle_id: { [Op.in]: bundleIds } },
                attributes: ['plan_id'],
                transaction
            });
            for (const bp of bundlePlans) {
                planIds.add(bp.plan_id);
            }
        }

        if (planIds.size === 0) {
            return { limit_amount: 0, reset_period: FeatureResetPeriod.MONTHLY };
        }

        // 3. Find all enabled PlanLimits for this feature across those plans
        const limits = await PlanLimit.findAll({
            where: {
                plan_id: { [Op.in]: Array.from(planIds) },
                feature_id: featureId,
                is_enabled: true
            },
            transaction
        });

        if (limits.length === 0) {
            return { limit_amount: 0, reset_period: FeatureResetPeriod.MONTHLY };
        }

        // 4. Find the max limit (null = unlimited = highest)
        let maxLimit: number | null = 0;
        let maxResetPeriod: FeatureResetPeriod = FeatureResetPeriod.MONTHLY;

        for (const pl of limits) {
            const lim = pl.default_limit !== null && pl.default_limit !== undefined ? pl.default_limit : null;
            if (lim === null) {
                // Unlimited beats everything
                return { limit_amount: null, reset_period: pl.reset_period };
            }
            if (maxLimit === null || lim > maxLimit) {
                maxLimit = lim;
                maxResetPeriod = pl.reset_period;
            }
        }

        return { limit_amount: maxLimit, reset_period: maxResetPeriod };
    }

    /**
     * Provisions entitlements for an organization based on a specific plan.
     * Upserts an OrganizationEntitlement for each Feature limit in the Plan.
     * Uses the effective (highest) limit across all active plans to avoid downgrading
     * entitlements when an org has multiple subscriptions.
     */
    public async provisionEntitlementsForPlan(organizationId: string, planId: string, transaction?: Transaction) {
        try {
            Logger.info(`[EntitlementService] Provisioning entitlements for Org ${organizationId} and Plan ${planId}`);

            // Fetch limits for this plan, including the feature to get the tool_id
            const limits = await PlanLimit.findAll({
                where: { plan_id: planId },
                include: [{ model: Feature, as: 'feature' }],
                transaction
            });

            if (!limits || limits.length === 0) {
                Logger.info(`[EntitlementService] No limits found for Plan ${planId}.`);
                return;
            }

            for (const limit of limits) {
                if (!limit.feature) continue;

                // Compute the effective limit across all active plans for this org + feature
                const effective = await this.computeEffectiveLimit(organizationId, limit.feature.id, transaction);

                // Disabled features in THIS plan get limit_amount = 0, but respect higher limits from other plans
                const planLimitAmount = limit.is_enabled === false
                    ? 0
                    : (limit.default_limit !== null && limit.default_limit !== undefined ? limit.default_limit : null);

                // Use the higher of this plan's limit vs the effective limit from all plans
                let finalLimit: number | null;
                let finalResetPeriod: FeatureResetPeriod;

                if (effective.limit_amount === null || planLimitAmount === null) {
                    // null = unlimited, which is the highest
                    finalLimit = null;
                    finalResetPeriod = planLimitAmount === null ? limit.reset_period : effective.reset_period;
                } else {
                    finalLimit = Math.max(planLimitAmount, effective.limit_amount);
                    finalResetPeriod = planLimitAmount >= effective.limit_amount ? limit.reset_period : effective.reset_period;
                }

                // Upsert logic
                const entitlement = await OrganizationEntitlement.findOne({
                    where: {
                        organization_id: organizationId,
                        feature_id: limit.feature.id
                    },
                    paranoid: false, // Include soft-deleted records to allow re-provisioning after cancellation
                    transaction
                });

                if (entitlement) {
                    const wasDeleted = !!entitlement.deleted_at;

                    // Restore soft-deleted entitlement before updating
                    if (wasDeleted) {
                        Logger.info(`[EntitlementService] Restoring soft-deleted entitlement for Org ${organizationId} / Feature ${limit.feature.slug}`);
                        await entitlement.restore({ transaction });
                    }

                    // Update only limit-related fields. Preserve usage and reset time.
                    Logger.info(`[EntitlementService] Updating existing entitlement for Org ${organizationId} / Feature ${limit.feature.slug}: Setting limit to ${finalLimit}`);
                    await entitlement.update({
                        limit_amount: finalLimit,
                        reset_period: finalResetPeriod,
                        ...(wasDeleted && { usage_amount: 0 }), // Reset usage when restoring
                    }, { transaction });
                } else {
                    // Create new entitlement
                    Logger.info(`[EntitlementService] Creating new entitlement for Org ${organizationId} / Feature ${limit.feature.slug}: Limit ${finalLimit}`);
                    await OrganizationEntitlement.create({
                        organization_id: organizationId,
                        tool_id: limit.feature.tool_id,
                        feature_id: limit.feature.id,
                        limit_amount: finalLimit,
                        usage_amount: 0,
                        reset_period: finalResetPeriod,
                        last_reset_at: new Date()
                    }, { transaction });
                }
            }
        } catch (error) {
            Logger.error(`[EntitlementService] Failed to provision entitlements for Plan ${planId}:`, error);
            throw error;
        }
    }

    /**
     * Provisions entitlements for an organization based on a bundle.
     * Iterates through all plans in the bundle and provisions their limits.
     */
    public async provisionEntitlementsForBundle(organizationId: string, bundleId: string, transaction?: Transaction) {
        try {
            Logger.info(`[EntitlementService] Provisioning entitlements for Org ${organizationId} and Bundle ${bundleId}`);

            // Fetch all plans associated with this bundle
            const bundlePlans = await BundlePlan.findAll({
                where: { bundle_id: bundleId },
                transaction
            });

            if (!bundlePlans || bundlePlans.length === 0) {
                Logger.info(`[EntitlementService] No plans found for Bundle ${bundleId}.`);
                return;
            }

            // Provision limits for each plan
            for (const bundlePlan of bundlePlans) {
                await this.provisionEntitlementsForPlan(organizationId, bundlePlan.plan_id, transaction);
            }
        } catch (error) {
            Logger.error(`[EntitlementService] Failed to provision entitlements for Bundle ${bundleId}:`, error);
            throw error;
        }
    }
    /**
     * Revokes (soft-deletes) entitlements for an organization, scoped to the
     * tools associated with the canceled subscription's plan or bundle.
     * This ensures entitlements from other active tool subscriptions are preserved.
     */
    public async revokeEntitlements(
        organizationId: string,
        planId: string | null | undefined,
        bundleId: string | null | undefined,
        transaction?: Transaction
    ) {
        try {
            // 1. Resolve tool IDs from the canceled plan/bundle
            const toolIds: string[] = [];

            if (planId) {
                const plan = await Plan.findByPk(planId, { attributes: ['tool_id'], transaction });
                if (plan) toolIds.push(plan.tool_id);
            } else if (bundleId) {
                const bundlePlans = await BundlePlan.findAll({
                    where: { bundle_id: bundleId },
                    attributes: ['plan_id'],
                    transaction
                });
                for (const bp of bundlePlans) {
                    const plan = await Plan.findByPk(bp.plan_id, { attributes: ['tool_id'], transaction });
                    if (plan && !toolIds.includes(plan.tool_id)) toolIds.push(plan.tool_id);
                }
            }

            if (toolIds.length === 0) {
                Logger.warn(`[EntitlementService] Could not resolve tool IDs for revocation. Org ${organizationId}, Plan ${planId}, Bundle ${bundleId}`);
                return;
            }

            Logger.info(`[EntitlementService] Revoking entitlements for Org ${organizationId}, Tools [${toolIds.join(', ')}]`);

            // 2. For each tool, check if the org has another active subscription for that tool
            //    Must check both direct plan subscriptions AND bundle subscriptions
            for (const toolId of toolIds) {
                // Check direct plan subscriptions
                const directSub = await Subscription.findOne({
                    where: {
                        organization_id: organizationId,
                        status: { [Op.in]: [SubStatus.ACTIVE, SubStatus.TRIALING, SubStatus.PAST_DUE] }
                    },
                    include: [{
                        model: Plan,
                        as: 'plan',
                        where: { tool_id: toolId },
                        required: true
                    }],
                    transaction
                });

                // Check bundle subscriptions that include a plan for this tool
                let bundleSub = null;
                if (!directSub) {
                    const bundlePlanEntries = await BundlePlan.findAll({
                        include: [{
                            model: Plan,
                            as: 'plan',
                            where: { tool_id: toolId },
                            required: true
                        }],
                        attributes: ['bundle_id'],
                        transaction
                    });
                    const activeBundleIds = bundlePlanEntries.map(bp => bp.bundle_id);

                    if (activeBundleIds.length > 0) {
                        bundleSub = await Subscription.findOne({
                            where: {
                                organization_id: organizationId,
                                bundle_id: { [Op.in]: activeBundleIds },
                                status: { [Op.in]: [SubStatus.ACTIVE, SubStatus.TRIALING, SubStatus.PAST_DUE] }
                            },
                            transaction
                        });
                    }
                }

                const activeSubForTool = directSub || bundleSub;

                if (activeSubForTool) {
                    Logger.info(`[EntitlementService] Org ${organizationId} still has active subscription for tool ${toolId}. Recalculating limits instead of revoking.`);

                    // Recalculate limits for all entitlements under this tool to reflect
                    // the remaining active plans (the canceled plan's limits should no longer apply)
                    const entitlements = await OrganizationEntitlement.findAll({
                        where: { organization_id: organizationId, tool_id: toolId },
                        transaction
                    });
                    for (const ent of entitlements) {
                        const effective = await this.computeEffectiveLimit(organizationId, ent.feature_id, transaction);
                        await ent.update({
                            limit_amount: effective.limit_amount,
                            reset_period: effective.reset_period
                        }, { transaction });
                    }

                    continue;
                }

                // 3. Soft-delete entitlements scoped to this tool
                const deletedCount = await OrganizationEntitlement.destroy({
                    where: {
                        organization_id: organizationId,
                        tool_id: toolId
                    },
                    transaction
                });

                Logger.info(`[EntitlementService] Revoked ${deletedCount} entitlements for Org ${organizationId}, Tool ${toolId}`);
            }

            // 4. Invalidate Redis cache
            try {
                await redisClient.del(`cache:entitlements:${organizationId}`);
            } catch (cacheError) {
                Logger.warn(`[EntitlementService] Failed to invalidate cache during revocation:`, cacheError);
            }
        } catch (error) {
            Logger.error(`[EntitlementService] Failed to revoke entitlements for Org ${organizationId}:`, error);
            throw error;
        }
    }

    /**
     * Cascades a plan limit update to all organization entitlements that derive from this plan.
     * Called when an admin updates a PlanLimit — propagates the new limit to all affected orgs.
     * Computes the effective (highest) limit per org across all active plans to avoid
     * downgrading orgs that have higher limits from other subscriptions.
     */
    public async cascadePlanLimitUpdate(
        planId: string,
        featureId: string,
        transaction?: Transaction
    ) {
        try {
            // 1. Find all active subscriptions using this plan directly
            const directSubs = await Subscription.findAll({
                where: {
                    plan_id: planId,
                    status: { [Op.in]: [SubStatus.ACTIVE, SubStatus.TRIALING, SubStatus.PAST_DUE] }
                },
                attributes: ['organization_id'],
                transaction
            });

            // 2. Find subscriptions via bundles containing this plan
            const bundlePlans = await BundlePlan.findAll({
                where: { plan_id: planId },
                attributes: ['bundle_id'],
                transaction
            });
            const bundleIds = bundlePlans.map(bp => bp.bundle_id);

            let bundleSubs: Subscription[] = [];
            if (bundleIds.length > 0) {
                bundleSubs = await Subscription.findAll({
                    where: {
                        bundle_id: { [Op.in]: bundleIds },
                        status: { [Op.in]: [SubStatus.ACTIVE, SubStatus.TRIALING, SubStatus.PAST_DUE] }
                    },
                    attributes: ['organization_id'],
                    transaction
                });
            }

            // 3. Collect unique org IDs
            const orgIds = new Set([
                ...directSubs.map(s => s.organization_id),
                ...bundleSubs.map(s => s.organization_id),
            ]);

            if (orgIds.size === 0) {
                Logger.info(`[EntitlementService] No active subscriptions found for Plan ${planId}, skipping cascade.`);
                return;
            }

            // 4. For each org, compute the effective limit and update their entitlement
            for (const orgId of orgIds) {
                const effective = await this.computeEffectiveLimit(orgId, featureId, transaction);

                await OrganizationEntitlement.update(
                    {
                        limit_amount: effective.limit_amount,
                        reset_period: effective.reset_period
                    },
                    {
                        where: {
                            organization_id: orgId,
                            feature_id: featureId
                        },
                        transaction
                    }
                );
            }

            // 5. Invalidate Redis cache for affected orgs
            try {
                for (const orgId of orgIds) {
                    await redisClient.del(`cache:entitlements:${orgId}`);
                }
            } catch (cacheError) {
                Logger.warn(`[EntitlementService] Failed to invalidate cache during cascade:`, cacheError);
            }

            Logger.info(`[EntitlementService] Cascaded plan limit update for Plan ${planId}, Feature ${featureId} to ${orgIds.size} organizations`);
        } catch (error) {
            Logger.error(`[EntitlementService] Failed to cascade plan limit update for Plan ${planId}:`, error);
            throw error;
        }
    }
}

export const entitlementService = new EntitlementService();
