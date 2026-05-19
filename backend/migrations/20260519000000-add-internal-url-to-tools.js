'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    await queryInterface.addColumn('tools', 'internal_url', {
      type: Sequelize.STRING,
      allowNull: true,
      comment: 'Service-to-service base URL for backend-only calls (e.g. feature discovery). Distinct from tool_link which is the browser-facing URL.',
    });
  },

  async down (queryInterface, Sequelize) {
    await queryInterface.removeColumn('tools', 'internal_url');
  }
};
