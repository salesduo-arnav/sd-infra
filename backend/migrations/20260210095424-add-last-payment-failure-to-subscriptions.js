'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    await queryInterface.addColumn('subscriptions', 'last_payment_failure_at', {
      type: Sequelize.DATE,
      allowNull: true
    });
  },

  async down (queryInterface, Sequelize) {
    await queryInterface.removeColumn('subscriptions', 'last_payment_failure_at');
  }
};
