'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('subscriptions', 'card_fingerprint', {
      type: Sequelize.STRING,
      allowNull: true,
      comment: 'Stripe card fingerprint for duplicate trial detection',
    });

    await queryInterface.addColumn('subscriptions', 'cancellation_reason', {
      type: Sequelize.STRING,
      allowNull: true,
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('subscriptions', 'card_fingerprint');
    await queryInterface.removeColumn('subscriptions', 'cancellation_reason');
  }
};
