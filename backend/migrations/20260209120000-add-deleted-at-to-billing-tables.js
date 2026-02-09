'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface, Sequelize) {
        const tables = [
            'subscriptions',
            'one_time_purchases',
            'plans',
            'plan_limits',
            'bundles',
            'bundle_groups',
            'bundle_plans',
            'tools',
            'features',
            'organization_entitlements'
        ];

        // 1. Add deleted_at column
        for (const table of tables) {
            await queryInterface.addColumn(table, 'deleted_at', {
                type: Sequelize.DATE,
                allowNull: true,
            });
        }

        // 2. Update unique indexes to be partial (Where deleted_at IS NULL)

        // Tools: slug
        try { await queryInterface.removeConstraint('tools', 'tools_slug_key'); } catch (e) {
            try { await queryInterface.removeIndex('tools', 'tools_slug_key'); } catch (e2) { console.warn('Could not remove tools_slug_key', e2); }
        }
        await queryInterface.addIndex('tools', ['slug'], {
            unique: true,
            name: 'tools_slug_deleted_at_unique',
            where: { deleted_at: null },
        });

        // Features: slug
        try { await queryInterface.removeConstraint('features', 'features_slug_key'); } catch (e) {
            try { await queryInterface.removeIndex('features', 'features_slug_key'); } catch (e2) { console.warn('Could not remove features_slug_key', e2); }
        }
        await queryInterface.addIndex('features', ['slug'], {
            unique: true,
            name: 'features_slug_deleted_at_unique',
            where: { deleted_at: null },
        });

        // Bundles: slug
        try { await queryInterface.removeConstraint('bundles', 'bundles_slug_key'); } catch (e) {
            try { await queryInterface.removeIndex('bundles', 'bundles_slug_key'); } catch (e2) { console.warn('Could not remove bundles_slug_key', e2); }
        }
        await queryInterface.addIndex('bundles', ['slug'], {
            unique: true,
            name: 'bundles_slug_deleted_at_unique',
            where: { deleted_at: null },
        });

        // Bundle Groups: slug
        try { await queryInterface.removeConstraint('bundle_groups', 'bundle_groups_slug_key'); } catch (e) {
            try { await queryInterface.removeIndex('bundle_groups', 'bundle_groups_slug_key'); } catch (e2) { console.warn('Could not remove bundle_groups_slug_key', e2); }
        }
        await queryInterface.addIndex('bundle_groups', ['slug'], {
            unique: true,
            name: 'bundle_groups_slug_deleted_at_unique',
            where: { deleted_at: null },
        });

        // OneTimePurchase: stripe_payment_intent_id
        try { await queryInterface.removeConstraint('one_time_purchases', 'one_time_purchases_stripe_payment_intent_id_key'); } catch (e) {
            try { await queryInterface.removeIndex('one_time_purchases', 'one_time_purchases_stripe_payment_intent_id_key'); } catch (e2) { console.warn('Could not remove one_time_purchases_stripe_payment_intent_id_key', e2); }
        }
        await queryInterface.addIndex('one_time_purchases', ['stripe_payment_intent_id'], {
            unique: true,
            name: 'otp_stripe_pi_deleted_at_unique',
            where: { deleted_at: null },
        });

        // OrganizationEntitlement: org_id + feature_id
        try { await queryInterface.removeConstraint('organization_entitlements', 'organization_entitlements_organization_id_feature_id_key'); } catch (e) {
            try { await queryInterface.removeIndex('organization_entitlements', 'os_entitlements_org_id_feat_id_unique'); } catch (e2) { console.warn('Could not remove os_entitlements_org_id_feat_id_unique', e2); }
        }
        await queryInterface.addIndex('organization_entitlements', ['organization_id', 'feature_id'], {
            unique: true,
            name: 'os_entitlements_org_feat_deleted_at_unique',
            where: { deleted_at: null },
        });

    },

    async down(queryInterface, Sequelize) {
        const tables = [
            'subscriptions',
            'one_time_purchases',
            'plans',
            'plan_limits',
            'bundles',
            'bundle_groups',
            'bundle_plans',
            'tools',
            'features',
            'organization_entitlements'
        ];

        // Revert Indexes
        await queryInterface.removeIndex('organization_entitlements', 'os_entitlements_org_feat_deleted_at_unique');
        await queryInterface.addIndex('organization_entitlements', ['organization_id', 'feature_id'], {
            unique: true,
            name: 'os_entitlements_org_id_feat_id_unique'
        });

        await queryInterface.removeIndex('one_time_purchases', 'otp_stripe_pi_deleted_at_unique');
        await queryInterface.addConstraint('one_time_purchases', {
            fields: ['stripe_payment_intent_id'],
            type: 'unique',
            name: 'one_time_purchases_stripe_payment_intent_id_key'
        });

        await queryInterface.removeIndex('bundle_groups', 'bundle_groups_slug_deleted_at_unique');
        await queryInterface.addConstraint('bundle_groups', {
            fields: ['slug'],
            type: 'unique',
            name: 'bundle_groups_slug_key'
        });

        await queryInterface.removeIndex('bundles', 'bundles_slug_deleted_at_unique');
        await queryInterface.addConstraint('bundles', {
            fields: ['slug'],
            type: 'unique',
            name: 'bundles_slug_key'
        });

        await queryInterface.removeIndex('features', 'features_slug_deleted_at_unique');
        await queryInterface.addConstraint('features', {
            fields: ['slug'],
            type: 'unique',
            name: 'features_slug_key'
        });

        await queryInterface.removeIndex('tools', 'tools_slug_deleted_at_unique');
        await queryInterface.addConstraint('tools', {
            fields: ['slug'],
            type: 'unique',
            name: 'tools_slug_key'
        });

        // Remove Columns
        for (const table of tables) {
            await queryInterface.removeColumn(table, 'deleted_at');
        }
    }
};
