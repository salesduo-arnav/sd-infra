import { Op, Transaction } from 'sequelize';
import { PlanLimit } from '../models/plan_limit';
import { OrganizationEntitlement } from '../models/organization_entitlement';
import { Subscription } from '../models/subscription';
import { BundlePlan } from '../models/bundle_plan';
import { Plan } from '../models/plan';
import { Feature } from '../models/feature';
import { SubStatus } from '../models/enums';
import redisClient from '../config/redis';
import Logger from '../utils/logger';

export class EntitlementService {
    /**
     * Provisions entitlements for an organization based on a specific plan.
     * Upserts an OrganizationEntitlement for each Feature limit in the Plan.
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

                // Disabled features get limit_amount = 0 so the frontend can show them
                const newLimitAmount = limit.is_enabled === false
                    ? 0
                    : (limit.default_limit !== null && limit.default_limit !== undefined ? limit.default_limit : null);

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
                    Logger.info(`[EntitlementService] Updating existing entitlement for Org ${organizationId} / Feature ${limit.feature.slug}: Setting limit to ${newLimitAmount}`);
                    await entitlement.update({
                        limit_amount: newLimitAmount,
                        reset_period: limit.reset_period,
                        ...(wasDeleted && { usage_amount: 0 }), // Reset usage when restoring
                    }, { transaction });
                } else {
                    // Create new entitlement
                    Logger.info(`[EntitlementService] Creating new entitlement for Org ${organizationId} / Feature ${limit.feature.slug}: Limit ${newLimitAmount}`);
                    await OrganizationEntitlement.create({
                        organization_id: organizationId,
                        tool_id: limit.feature.tool_id,
                        feature_id: limit.feature.id,
                        limit_amount: newLimitAmount,
                        usage_amount: 0,
                        reset_period: limit.reset_period,
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
            for (const toolId of toolIds) {
                const activeSubForTool = await Subscription.findOne({
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

                if (activeSubForTool) {
                    Logger.info(`[EntitlementService] Org ${organizationId} still has active subscription for tool ${toolId}. Skipping revocation for this tool.`);
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
     */
    public async cascadePlanLimitUpdate(
        planId: string,
        featureId: string,
        newLimit: number | null | undefined,
        newResetPeriod?: string,
        isEnabled: boolean = true,
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

            const orgIdArray = Array.from(orgIds);

            // 4. Build update payload — disabled features get limit 0
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const updatePayload: any = {};
            if (!isEnabled) {
                updatePayload.limit_amount = 0;
                Logger.info(`[EntitlementService] Setting limit to 0 for disabled feature ${featureId} across ${orgIds.size} organizations`);
            } else {
                if (newLimit !== undefined) {
                    updatePayload.limit_amount = newLimit;
                }
                if (newResetPeriod) {
                    updatePayload.reset_period = newResetPeriod;
                }
            }

            if (Object.keys(updatePayload).length === 0) {
                return;
            }

            // 5. Bulk update all affected org entitlements
            await OrganizationEntitlement.update(updatePayload, {
                where: {
                    organization_id: { [Op.in]: orgIdArray },
                    feature_id: featureId
                },
                transaction
            });

            // 6. Invalidate Redis cache for affected orgs
            try {
                for (const orgId of orgIdArray) {
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
