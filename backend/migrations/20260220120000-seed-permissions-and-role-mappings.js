'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const now = new Date();

    // 1. Seed permissions
    const permissions = [
      { id: 'org.update', description: 'Update organization details', category: 'Organization', created_at: now, updated_at: now },
      { id: 'org.delete', description: 'Delete the organization', category: 'Organization', created_at: now, updated_at: now },
      { id: 'members.invite', description: 'Invite new members', category: 'Members', created_at: now, updated_at: now },
      { id: 'members.remove', description: 'Remove members from the organization', category: 'Members', created_at: now, updated_at: now },
      { id: 'members.update_role', description: 'Change member roles', category: 'Members', created_at: now, updated_at: now },
      { id: 'ownership.transfer', description: 'Transfer organization ownership', category: 'Members', created_at: now, updated_at: now },
      { id: 'billing.view', description: 'View billing and subscription info', category: 'Billing', created_at: now, updated_at: now },
      { id: 'billing.manage', description: 'Manage subscriptions and payments', category: 'Billing', created_at: now, updated_at: now },
      { id: 'plans.view', description: 'View available plans and pricing', category: 'Billing', created_at: now, updated_at: now },
    ];

    for (const perm of permissions) {
      const exists = await queryInterface.rawSelect('permissions', { where: { id: perm.id } }, ['id']);
      if (!exists) {
        await queryInterface.bulkInsert('permissions', [perm]);
      }
    }

    // 2. Ensure default roles exist
    const roleNames = ['Owner', 'Admin', 'Member'];
    for (const name of roleNames) {
      const exists = await queryInterface.rawSelect('roles', { where: { name } }, ['id']);
      if (!exists) {
        await queryInterface.bulkInsert('roles', [{
          name,
          description: `${name} role`,
          created_at: now,
          updated_at: now,
        }]);
      }
    }

    // 3. Fetch role IDs
    const ownerRoleId = await queryInterface.rawSelect('roles', { where: { name: 'Owner' } }, ['id']);
    const adminRoleId = await queryInterface.rawSelect('roles', { where: { name: 'Admin' } }, ['id']);
    const memberRoleId = await queryInterface.rawSelect('roles', { where: { name: 'Member' } }, ['id']);

    // All permission IDs
    const allPermIds = permissions.map(p => p.id);

    // Admin permissions
    const adminPermIds = [
      'org.update', 'members.invite', 'members.remove',
      'billing.view', 'billing.manage', 'plans.view',
    ];

    // Member permissions
    const memberPermIds = ['billing.view'];

    // 4. Seed role_permissions (idempotent)
    const rolePermMappings = [
      ...allPermIds.map(pid => ({ role_id: ownerRoleId, permission_id: pid })),
      ...adminPermIds.map(pid => ({ role_id: adminRoleId, permission_id: pid })),
      ...memberPermIds.map(pid => ({ role_id: memberRoleId, permission_id: pid })),
    ];

    for (const rp of rolePermMappings) {
      const exists = await queryInterface.rawSelect('role_permissions', {
        where: { role_id: rp.role_id, permission_id: rp.permission_id }
      }, ['role_id']);

      if (!exists) {
        await queryInterface.bulkInsert('role_permissions', [{
          ...rp,
          created_at: now,
          updated_at: now,
        }]);
      }
    }
  },

  async down(queryInterface, Sequelize) {
    // Remove seeded role_permissions
    await queryInterface.bulkDelete('role_permissions', {}, {});

    // Remove seeded permissions
    await queryInterface.bulkDelete('permissions', {
      id: {
        [Sequelize.Op.in]: [
          'org.update', 'org.delete', 'members.invite', 'members.remove',
          'members.update_role', 'ownership.transfer', 'billing.view',
          'billing.manage', 'plans.view'
        ]
      }
    }, {});
  }
};
