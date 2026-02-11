'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('subscriptions', 'upcoming_plan_id', {
      type: Sequelize.UUID,
      allowNull: true,
      references: {
        model: 'plans',
        key: 'id',
      },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    });

    await queryInterface.addColumn('subscriptions', 'upcoming_bundle_id', {
      type: Sequelize.UUID,
      allowNull: true,
      references: {
        model: 'bundles',
        key: 'id',
      },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('subscriptions', 'upcoming_plan_id');
    await queryInterface.removeColumn('subscriptions', 'upcoming_bundle_id');
  }
};
