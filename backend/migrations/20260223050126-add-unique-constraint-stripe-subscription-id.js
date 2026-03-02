'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    // Add unique constraint to stripe_subscription_id
    await queryInterface.addConstraint('subscriptions', {
      fields: ['stripe_subscription_id'],
      type: 'unique',
      name: 'unique_stripe_subscription_id'
    });
  },

  async down (queryInterface, Sequelize) {
    // Remove unique constraint from stripe_subscription_id
    await queryInterface.removeConstraint('subscriptions', 'unique_stripe_subscription_id');
  }
};
