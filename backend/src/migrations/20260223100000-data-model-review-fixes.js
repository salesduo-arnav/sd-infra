'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    // Issue #11: Add indexes to audit_logs for efficient querying
    await queryInterface.addIndex('audit_logs', ['entity_type', 'entity_id'], {
      name: 'audit_logs_entity_type_entity_id',
    });
    await queryInterface.addIndex('audit_logs', ['created_at'], {
      name: 'audit_logs_created_at',
    });
  },

  async down(queryInterface) {
    // Reverse Issue #11: Remove audit_logs indexes
    await queryInterface.removeIndex('audit_logs', 'audit_logs_created_at');
    await queryInterface.removeIndex('audit_logs', 'audit_logs_entity_type_entity_id');
  },
};
