'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Add trial_days to tools
    await queryInterface.addColumn('tools', 'trial_days', {
      type: Sequelize.INTEGER,
      defaultValue: 0,
      allowNull: false,
      comment: 'Default trial period in days for this tool',
    });

    // Remove trial_period_days from plans
    await queryInterface.removeColumn('plans', 'trial_period_days');
  },

  async down(queryInterface, Sequelize) {
    // Remove trial_days from tools
    await queryInterface.removeColumn('tools', 'trial_days');

    // Add trial_period_days back to plans
    await queryInterface.addColumn('plans', 'trial_period_days', {
      type: Sequelize.INTEGER,
      defaultValue: 0,
      allowNull: false,
    });
  }
};
