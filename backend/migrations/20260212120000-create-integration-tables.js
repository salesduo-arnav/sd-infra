'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface, Sequelize) {
        // 1. Create integration_accounts table
        await queryInterface.createTable('integration_accounts', {
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
            integration_type: {
                type: Sequelize.ENUM('sp_api_sc', 'sp_api_vc', 'ads_api'),
                allowNull: false,
            },
            status: {
                type: Sequelize.ENUM('connected', 'disconnected', 'error'),
                defaultValue: 'disconnected',
                allowNull: false,
            },
            credentials: {
                type: Sequelize.JSONB,
                allowNull: true,
                defaultValue: null,
            },
            connected_at: {
                type: Sequelize.DATE,
                allowNull: true,
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

        // Partial unique index for integration_accounts
        await queryInterface.addIndex('integration_accounts', {
            fields: ['organization_id', 'marketplace', 'account_name', 'integration_type'],
            unique: true,
            where: { deleted_at: null },
            name: 'unique_org_marketplace_account_type',
        });

        // 2. Create global_integrations table
        await queryInterface.createTable('global_integrations', {
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
            service_name: {
                type: Sequelize.STRING,
                allowNull: false,
            },
            status: {
                type: Sequelize.ENUM('connected', 'disconnected'),
                defaultValue: 'disconnected',
                allowNull: false,
            },
            config: {
                type: Sequelize.JSONB,
                allowNull: true,
                defaultValue: null,
            },
            credentials: {
                type: Sequelize.JSONB,
                allowNull: true,
                defaultValue: null,
            },
            connected_at: {
                type: Sequelize.DATE,
                allowNull: true,
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

        // Partial unique index for global_integrations
        await queryInterface.addIndex('global_integrations', {
            fields: ['organization_id', 'service_name'],
            unique: true,
            where: { deleted_at: null },
            name: 'unique_org_service',
        });

        // 3. Add required_integrations column to tools table
        await queryInterface.addColumn('tools', 'required_integrations', {
            type: Sequelize.JSONB,
            allowNull: true,
            defaultValue: [],
            comment: 'Array of integration type slugs required for this tool',
        });
    },

    async down(queryInterface) {
        await queryInterface.removeColumn('tools', 'required_integrations');
        await queryInterface.dropTable('global_integrations');
        await queryInterface.dropTable('integration_accounts');
    },
};
