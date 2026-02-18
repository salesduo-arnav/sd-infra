'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.bulkInsert('system_configs', [
      {
        key: 'payment_grace_period_days',
        value: '3',
        description: 'Number of days to allow access after a failed payment before cancelling the subscription (You may have to update this in stripe)',
        category: 'payment',
        created_at: new Date(),
        updated_at: new Date()
      }
    ], {
      ignoreDuplicates: true // Postgres: ON CONFLICT DO NOTHING
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.bulkDelete('system_configs', {
      key: ['payment_grace_period_days']
    });
  }
};
