'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.bulkInsert('system_configs', [
      {
        key: 'org_max_capacity',
        value: '50',
        description: 'Maximum number of members allowed in a single organization.',
        category: 'organization',
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        key: 'user_org_limit',
        value: '5',
        description: 'Maximum number of organizations a single user can belong to.',
        category: 'user',
        created_at: new Date(),
        updated_at: new Date()
      }
    ], {
      ignoreDuplicates: true
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.bulkDelete('system_configs', {
      key: ['org_max_capacity', 'user_org_limit']
    });
  }
};
