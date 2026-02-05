'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // 1. organization_id: CASCADE on delete & update
    await queryInterface.removeConstraint('organization_members', 'organization_members_organization_id_fkey');
    await queryInterface.addConstraint('organization_members', {
      fields: ['organization_id'],
      type: 'foreign key',
      name: 'organization_members_organization_id_fkey',
      references: {
        table: 'organizations',
        field: 'id',
      },
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    });

    // 2. user_id: CASCADE on delete & update
    await queryInterface.removeConstraint('organization_members', 'organization_members_user_id_fkey');
    await queryInterface.addConstraint('organization_members', {
      fields: ['user_id'],
      type: 'foreign key',
      name: 'organization_members_user_id_fkey',
      references: {
        table: 'users',
        field: 'id',
      },
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    });

    // 3. role_id: RESTRICT on delete, CASCADE on update
    // Note: Assuming standard naming convention. If explicit name wasn't set, Sequelize often uses table_col_fkey
    try {
      await queryInterface.removeConstraint('organization_members', 'organization_members_role_id_fkey');
      await queryInterface.addConstraint('organization_members', {
        fields: ['role_id'],
        type: 'foreign key',
        name: 'organization_members_role_id_fkey',
        references: {
          table: 'roles',
          field: 'id',
        },
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE',
      });
    } catch (error) {
      // Fallback or ignore if constraint name differences exist, but mostly safe with standard naming
      console.warn('Could not replace role_id constraint on organization_members, might not exist or different name');
    }

    // 1. organization_id: CASCADE on delete & update
    await queryInterface.removeConstraint('invitations', 'invitations_organization_id_fkey');
    await queryInterface.addConstraint('invitations', {
      fields: ['organization_id'],
      type: 'foreign key',
      name: 'invitations_organization_id_fkey',
      references: {
        table: 'organizations',
        field: 'id',
      },
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    });

    // 2. invited_by: SET NULL on delete, CASCADE on update
    await queryInterface.changeColumn('invitations', 'invited_by', {
      type: Sequelize.UUID,
      allowNull: true,
    });

    await queryInterface.removeConstraint('invitations', 'invitations_invited_by_fkey');

    await queryInterface.addConstraint('invitations', {
      fields: ['invited_by'],
      type: 'foreign key',
      name: 'invitations_invited_by_fkey',
      references: {
        table: 'users',
        field: 'id',
      },
      onDelete: 'SET NULL',
      onUpdate: 'CASCADE',
    });

    // 3. role_id: RESTRICT on delete, CASCADE on update
    try {
      await queryInterface.removeConstraint('invitations', 'invitations_role_id_fkey');
      await queryInterface.addConstraint('invitations', {
        fields: ['role_id'],
        type: 'foreign key',
        name: 'invitations_role_id_fkey',
        references: {
          table: 'roles',
          field: 'id',
        },
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE',
      });
    } catch (error) {
      console.warn('Could not replace role_id constraint on invitations');
    }
  },

  async down(queryInterface, Sequelize) {
    // organization_id
    await queryInterface.removeConstraint('organization_members', 'organization_members_organization_id_fkey');
    await queryInterface.addConstraint('organization_members', {
      fields: ['organization_id'],
      type: 'foreign key',
      name: 'organization_members_organization_id_fkey',
      references: {
        table: 'organizations',
        field: 'id',
      },
    });

    // user_id
    await queryInterface.removeConstraint('organization_members', 'organization_members_user_id_fkey');
    await queryInterface.addConstraint('organization_members', {
      fields: ['user_id'],
      type: 'foreign key',
      name: 'organization_members_user_id_fkey',
      references: {
        table: 'users',
        field: 'id',
      },
    });

    // role_id
    await queryInterface.removeConstraint('organization_members', 'organization_members_role_id_fkey');
    await queryInterface.addConstraint('organization_members', {
      fields: ['role_id'],
      type: 'foreign key',
      name: 'organization_members_role_id_fkey',
      references: {
        table: 'roles',
        field: 'id',
      },
    });

    // organization_id
    await queryInterface.removeConstraint('invitations', 'invitations_organization_id_fkey');
    await queryInterface.addConstraint('invitations', {
      fields: ['organization_id'],
      type: 'foreign key',
      name: 'invitations_organization_id_fkey',
      references: {
        table: 'organizations',
        field: 'id',
      },
    });

    // invited_by
    await queryInterface.removeConstraint('invitations', 'invitations_invited_by_fkey');
    await queryInterface.addConstraint('invitations', {
      fields: ['invited_by'],
      type: 'foreign key',
      name: 'invitations_invited_by_fkey',
      references: {
        table: 'users',
        field: 'id',
      },
    });

    // role_id
    await queryInterface.removeConstraint('invitations', 'invitations_role_id_fkey');
    await queryInterface.addConstraint('invitations', {
      fields: ['role_id'],
      type: 'foreign key',
      name: 'invitations_role_id_fkey',
      references: {
        table: 'roles',
        field: 'id',
      },
    });
  }
};
