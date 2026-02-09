'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // 1. Create bundle_groups table
    await queryInterface.createTable('bundle_groups', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      name: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      slug: {
        type: Sequelize.STRING,
        allowNull: false,
        unique: true,
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      active: {
        type: Sequelize.BOOLEAN,
        defaultValue: true,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
    });

    // 2. Add columns to bundles table
    await queryInterface.addColumn('bundles', 'bundle_group_id', {
      type: Sequelize.UUID,
      allowNull: true,
      references: {
        model: 'bundle_groups',
        key: 'id',
      },
      onUpdate: 'CASCADE',
      onDelete: 'RESTRICT',
    });

    await queryInterface.addColumn('bundles', 'tier_label', {
      type: Sequelize.STRING,
      allowNull: true,
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('bundles', 'tier_label');
    await queryInterface.removeColumn('bundles', 'bundle_group_id');
    await queryInterface.dropTable('bundle_groups');
  },
};
