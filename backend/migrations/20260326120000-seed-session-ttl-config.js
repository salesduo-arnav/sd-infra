'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.bulkInsert('system_configs', [
      {
        key: 'session_ttl_seconds',
        value: '86400',
        description: 'Session duration in seconds. Minimum 300 (5 min), maximum 604800 (7 days). Default: 86400 (24 hours).',
        category: 'auth',
        created_at: new Date(),
        updated_at: new Date()
      }
    ], {
      ignoreDuplicates: true
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.bulkDelete('system_configs', {
      key: ['session_ttl_seconds']
    });
  }
};
