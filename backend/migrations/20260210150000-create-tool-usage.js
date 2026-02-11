'use strict';

module.exports = {
    up: async (queryInterface, Sequelize) => {
        await queryInterface.createTable('tool_usages', {
            id: {
                allowNull: false,
                primaryKey: true,
                type: Sequelize.UUID,
                defaultValue: Sequelize.UUIDV4,
            },
            tool_id: {
                type: Sequelize.UUID,
                allowNull: false,
                references: {
                    model: 'tools',
                    key: 'id',
                },
                onUpdate: 'CASCADE',
                onDelete: 'CASCADE',
            },
            user_id: {
                type: Sequelize.UUID,
                allowNull: false,
                references: {
                    model: 'users',
                    key: 'id',
                },
                onUpdate: 'CASCADE',
                onDelete: 'CASCADE',
            },
            organization_id: {
                type: Sequelize.UUID,
                allowNull: false,
                references: {
                    model: 'organizations',
                    key: 'id',
                },
                onUpdate: 'CASCADE',
                onDelete: 'CASCADE',
            },
            date: {
                type: Sequelize.DATEONLY,
                allowNull: false,
            },
            count: {
                type: Sequelize.INTEGER,
                defaultValue: 1,
                allowNull: false,
            },
            created_at: {
                allowNull: false,
                type: Sequelize.DATE,
                defaultValue: Sequelize.NOW,
            },
            updated_at: {
                allowNull: false,
                type: Sequelize.DATE,
                defaultValue: Sequelize.NOW,
            },
        });

        await queryInterface.addIndex('tool_usages', ['tool_id', 'user_id', 'organization_id', 'date'], {
            unique: true,
            name: 'unique_usage_per_day',
        });
    },

    down: async (queryInterface, Sequelize) => {
        await queryInterface.removeIndex('tool_usages', 'unique_usage_per_day');
        await queryInterface.dropTable('tool_usages');
    },
};
