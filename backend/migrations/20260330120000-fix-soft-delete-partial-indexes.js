'use strict';

/**
 * Fix non-partial unique indexes on paranoid (soft-delete) models.
 * These indexes must use WHERE deleted_at IS NULL so that soft-deleted
 * records don't block re-creation of the same logical record.
 *
 * Affected tables: plan_limits, bundle_plans, subscriptions
 *
 * @type {import('sequelize-cli').Migration}
 */
module.exports = {
    async up(queryInterface, Sequelize) {
        // 1. plan_limits(plan_id, feature_id) — convert to partial unique index
        try {
            await queryInterface.removeIndex('plan_limits', 'plan_limits_plan_id_feature_id');
        } catch (e) {
            try {
                await queryInterface.removeConstraint('plan_limits', 'plan_limits_plan_id_feature_id');
            } catch (e2) {
                console.warn('Could not remove plan_limits unique index/constraint by auto-generated name, trying alternative names');
                try { await queryInterface.removeIndex('plan_limits', 'plan_limits_plan_id_feature_id_unique'); } catch (e3) {
                    console.warn('Could not remove plan_limits_plan_id_feature_id_unique either:', e3.message);
                }
            }
        }
        await queryInterface.addIndex('plan_limits', ['plan_id', 'feature_id'], {
            unique: true,
            name: 'plan_limits_plan_feature_deleted_at_unique',
            where: { deleted_at: null },
        });

        // 2. bundle_plans(bundle_id, plan_id) — convert to partial unique index
        // Note: (bundle_id, plan_id) is also the composite PK, so the PK constraint
        // remains. This partial index allows the application-level restore pattern to
        // work correctly alongside the PK.
        try {
            await queryInterface.removeIndex('bundle_plans', 'bundle_plans_bundle_id_plan_id');
        } catch (e) {
            try {
                await queryInterface.removeConstraint('bundle_plans', 'bundle_plans_bundle_id_plan_id');
            } catch (e2) {
                console.warn('Could not remove bundle_plans unique index/constraint by auto-generated name, trying alternative names');
                try { await queryInterface.removeIndex('bundle_plans', 'bundle_plans_bundle_id_plan_id_unique'); } catch (e3) {
                    console.warn('Could not remove bundle_plans_bundle_id_plan_id_unique either:', e3.message);
                }
            }
        }
        await queryInterface.addIndex('bundle_plans', ['bundle_id', 'plan_id'], {
            unique: true,
            name: 'bundle_plans_bundle_plan_deleted_at_unique',
            where: { deleted_at: null },
        });

        // 3. subscriptions(stripe_subscription_id) — convert to partial unique index
        try {
            await queryInterface.removeConstraint('subscriptions', 'unique_stripe_subscription_id');
        } catch (e) {
            try {
                await queryInterface.removeIndex('subscriptions', 'unique_stripe_subscription_id');
            } catch (e2) {
                console.warn('Could not remove unique_stripe_subscription_id:', e2.message);
            }
        }
        await queryInterface.addIndex('subscriptions', ['stripe_subscription_id'], {
            unique: true,
            name: 'subscriptions_stripe_sub_id_deleted_at_unique',
            where: { deleted_at: null },
        });
    },

    async down(queryInterface, Sequelize) {
        // Revert plan_limits
        await queryInterface.removeIndex('plan_limits', 'plan_limits_plan_feature_deleted_at_unique');
        await queryInterface.addIndex('plan_limits', ['plan_id', 'feature_id'], {
            unique: true,
            name: 'plan_limits_plan_id_feature_id',
        });

        // Revert bundle_plans
        await queryInterface.removeIndex('bundle_plans', 'bundle_plans_bundle_plan_deleted_at_unique');
        await queryInterface.addIndex('bundle_plans', ['bundle_id', 'plan_id'], {
            unique: true,
            name: 'bundle_plans_bundle_id_plan_id',
        });

        // Revert subscriptions
        await queryInterface.removeIndex('subscriptions', 'subscriptions_stripe_sub_id_deleted_at_unique');
        await queryInterface.addConstraint('subscriptions', {
            fields: ['stripe_subscription_id'],
            type: 'unique',
            name: 'unique_stripe_subscription_id',
        });
    }
};
