'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface, Sequelize) {
        // 1. Create integration_account_groups table
        await queryInterface.createTable('integration_account_groups', {
            id: {
                type: Sequelize.UUID,
                defaultValue: Sequelize.UUIDV4,
                primaryKey: true,
                allowNull: false,
            },
            organization_id: {
                type: Sequelize.UUID,
                allowNull: false,
                references: { model: 'organizations', key: 'id' },
                onDelete: 'CASCADE',
                onUpdate: 'CASCADE',
            },
            account_name: {
                type: Sequelize.STRING,
                allowNull: false,
            },
            marketplace: {
                type: Sequelize.ENUM('amazon', 'walmart'),
                allowNull: false,
                defaultValue: 'amazon',
            },
            region: {
                type: Sequelize.STRING,
                allowNull: false,
            },
            deleted_at: {
                type: Sequelize.DATE,
                allowNull: true,
            },
            created_at: {
                type: Sequelize.DATE,
                allowNull: false,
                defaultValue: Sequelize.fn('NOW'),
            },
            updated_at: {
                type: Sequelize.DATE,
                allowNull: false,
                defaultValue: Sequelize.fn('NOW'),
            },
        });

        // Partial unique index: one group per org + marketplace + name + region
        await queryInterface.addIndex('integration_account_groups', {
            fields: ['organization_id', 'marketplace', 'account_name', 'region'],
            unique: true,
            where: { deleted_at: null },
            name: 'unique_org_marketplace_account_region',
        });

        // 2. Add group_id FK to integration_accounts
        await queryInterface.addColumn('integration_accounts', 'group_id', {
            type: Sequelize.UUID,
            allowNull: true,
            references: { model: 'integration_account_groups', key: 'id' },
            onDelete: 'SET NULL',
            onUpdate: 'CASCADE',
        });

        await queryInterface.addIndex('integration_accounts', {
            fields: ['group_id'],
            name: 'ix_integration_accounts_group_id',
        });
    },

    async down(queryInterface) {
        await queryInterface.removeIndex('integration_accounts', 'ix_integration_accounts_group_id');
        await queryInterface.removeColumn('integration_accounts', 'group_id');
        await queryInterface.dropTable('integration_account_groups');
    },
};
