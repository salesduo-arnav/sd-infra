import { Transaction } from 'sequelize';
import { PlanLimit } from '../models/plan_limit';
import { OrganizationEntitlement } from '../models/organization_entitlement';
import { BundlePlan } from '../models/bundle_plan';
import { Feature } from '../models/feature';
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

                const defaultLimit = limit.default_limit;
                // If limit is null (unlimited), use 1 for boolean features, or keep null
                const newLimitAmount = defaultLimit !== null && defaultLimit !== undefined ? defaultLimit : null;

                // Upsert logic: Sequelize doesn't have a simple standard upsert for compound unqiue constraints 
                // easily across dialects, so we do a findOrCreate / update pattern for safety
                // We find by org_id + feature_id
                const entitlement = await OrganizationEntitlement.findOne({
                    where: {
                        organization_id: organizationId,
                        feature_id: limit.feature.id
                    },
                    transaction
                });

                if (entitlement) {
                    // Update only limit-related fields. Preserve usage and reset time.
                    Logger.info(`[EntitlementService] Updating existing entitlement for Org ${organizationId} / Feature ${limit.feature.slug}: Setting limit to ${newLimitAmount}`);
                    await entitlement.update({
                        limit_amount: newLimitAmount === null ? undefined : newLimitAmount,
                        reset_period: limit.reset_period
                    }, { transaction });
                } else {
                    // Create new entitlement
                    Logger.info(`[EntitlementService] Creating new entitlement for Org ${organizationId} / Feature ${limit.feature.slug}: Limit ${newLimitAmount}`);
                    await OrganizationEntitlement.create({
                        organization_id: organizationId,
                        tool_id: limit.feature.tool_id,
                        feature_id: limit.feature.id,
                        limit_amount: newLimitAmount === null ? undefined : newLimitAmount,
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
}

export const entitlementService = new EntitlementService();
