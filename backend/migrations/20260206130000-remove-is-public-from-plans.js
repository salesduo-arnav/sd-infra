'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('plans', 'is_public');
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('plans', 'is_public', {
      type: Sequelize.BOOLEAN,
      defaultValue: true,
      allowNull: false
    });
  }
};
