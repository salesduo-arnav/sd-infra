'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const roles = [
      {
        name: 'Owner',
        description: 'Organization Owner with full access',
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        name: 'Member',
        description: 'Standard Organization Member',
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        name: 'Admin',
        description: 'Organization Administrator',
        created_at: new Date(),
        updated_at: new Date()
      }
    ];

    await queryInterface.bulkInsert('roles', roles, {});
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.bulkDelete('roles', {
        name: {
            [Sequelize.Op.in]: ['Owner', 'Member', 'Admin']
        }
    }, {});
  }
};
