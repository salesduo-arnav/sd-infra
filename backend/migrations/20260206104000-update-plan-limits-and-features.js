'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    /**
     * Add 'is_enabled' column to 'plan_limits' table.
     */
    await queryInterface.addColumn('plan_limits', 'is_enabled', {
      type: Sequelize.BOOLEAN,
      defaultValue: true,
      allowNull: false,
    });

    /**
     * Remove 'type' column from 'features' table.
     */
    await queryInterface.removeColumn('features', 'type');
  },

  down: async (queryInterface, Sequelize) => {
    /**
     * Revert: Add 'type' column back to 'features' table.
     * Note: Data in this column is lost on 'up'.
     */
    await queryInterface.addColumn('features', 'type', {
      type: Sequelize.ENUM('boolean', 'metered'),
      allowNull: true, 
    });

    /**
     * Revert: Remove 'is_enabled' column from 'plan_limits' table.
     */
    await queryInterface.removeColumn('plan_limits', 'is_enabled');
  }
};
