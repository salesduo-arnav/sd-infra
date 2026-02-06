'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Users: Email
    try { await queryInterface.removeConstraint('users', 'users_email_key'); } catch (e) {
      try { await queryInterface.removeIndex('users', 'users_email_key'); } catch (e2) { console.warn('Could not remove users_email_key', e2); }
    }
    await queryInterface.addIndex('users', ['email'], {
      unique: true,
      name: 'users_email_deleted_at_unique',
      where: { deleted_at: null },
    });

    // Organizations: Slug, Stripe Customer ID
    try { await queryInterface.removeConstraint('organizations', 'organizations_slug_key'); } catch (e) { console.warn('Could not remove organizations_slug_key'); }
    await queryInterface.addIndex('organizations', ['slug'], {
      unique: true,
      name: 'organizations_slug_deleted_at_unique',
      where: { deleted_at: null },
    });

    try { await queryInterface.removeConstraint('organizations', 'organizations_stripe_customer_id_key'); } catch (e) { console.warn('Could not remove organizations_stripe_customer_id_key'); }
    await queryInterface.addIndex('organizations', ['stripe_customer_id'], {
      unique: true,
      name: 'organizations_stripe_customer_id_deleted_at_unique',
      where: { deleted_at: null },
    });

    // Organization Members: Org + User
    try { await queryInterface.removeConstraint('organization_members', 'organization_members_organization_id_user_id_key'); } catch (e) { console.warn('Could not remove organization_members_organization_id_user_id_key'); }
    await queryInterface.addIndex('organization_members', ['organization_id', 'user_id'], {
      unique: true,
      name: 'organization_members_org_user_deleted_at_unique',
      where: { deleted_at: null },
    });

    // Invitations: Token, Org+Email
    try { await queryInterface.removeConstraint('invitations', 'invitations_token_key'); } catch (e) { console.warn('Could not remove invitations_token_key'); }
    await queryInterface.addIndex('invitations', ['token'], {
      unique: true,
      name: 'invitations_token_deleted_at_unique',
      where: { deleted_at: null },
    });

    try { await queryInterface.removeConstraint('invitations', 'invitations_organization_id_email'); } catch (e) {
      // Try removing index if constraint doesn't exist (Sequelize sometimes creates index with same name)
      try { await queryInterface.removeIndex('invitations', 'invitations_organization_id_email'); } catch (e2) { console.warn('Could not remove invitations_organization_id_email'); }
    }
    await queryInterface.addIndex('invitations', ['organization_id', 'email'], {
      unique: true,
      name: 'invitations_org_email_deleted_at_unique',
      where: { deleted_at: null },
    });

    // Invitations: Org + Token (Additional index added in model)
    await queryInterface.addIndex('invitations', ['organization_id', 'token'], {
      unique: true,
      name: 'invitations_org_token_deleted_at_unique',
      where: { deleted_at: null },
    });
  },

  async down(queryInterface, Sequelize) {
    // Revert invitations
    await queryInterface.removeIndex('invitations', 'invitations_org_token_deleted_at_unique');
    await queryInterface.removeIndex('invitations', 'invitations_org_email_deleted_at_unique');
    await queryInterface.removeIndex('invitations', 'invitations_token_deleted_at_unique');
    await queryInterface.addConstraint('invitations', {
      fields: ['organization_id', 'email'],
      type: 'unique',
      name: 'invitations_organization_id_email'
    });
    await queryInterface.addConstraint('invitations', {
      fields: ['token'],
      type: 'unique',
      name: 'invitations_token_key'
    });

    // Revert Organization Members
    await queryInterface.removeIndex('organization_members', 'organization_members_org_user_deleted_at_unique');
    await queryInterface.addConstraint('organization_members', {
      fields: ['organization_id', 'user_id'],
      type: 'unique',
      name: 'organization_members_organization_id_user_id_key'
    });

    // Revert Organizations
    await queryInterface.removeIndex('organizations', 'organizations_stripe_customer_id_deleted_at_unique');
    await queryInterface.removeIndex('organizations', 'organizations_slug_deleted_at_unique');
    await queryInterface.addConstraint('organizations', {
      fields: ['slug'],
      type: 'unique',
      name: 'organizations_slug_key'
    });
    await queryInterface.addConstraint('organizations', {
      fields: ['stripe_customer_id'],
      type: 'unique',
      name: 'organizations_stripe_customer_id_key'
    });

    // Revert Users
    await queryInterface.removeIndex('users', 'users_email_deleted_at_unique');
    await queryInterface.addConstraint('users', {
      fields: ['email'],
      type: 'unique',
      name: 'users_email_key'
    });
  }
};
