'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      // 1. Remove the existing unique constraint on slug
      await queryInterface.removeConstraint('organizations', 'organizations_slug_key', { transaction });

      // 2. Add a unique index that ignores soft-deleted records
      await queryInterface.addIndex('organizations', ['slug'], {
        unique: true,
        where: {
          deleted_at: null,
        },
        name: 'organizations_slug_unique_active', // Custom name
        transaction,
      });

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      // 1. Remove the custom partial index
      await queryInterface.removeIndex('organizations', 'organizations_slug_unique_active', { transaction });

      // 2. Add back the strict unique constraint
      await queryInterface.addConstraint('organizations', {
        fields: ['slug'],
        type: 'unique',
        name: 'organizations_slug_key',
        transaction,
      });

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }
};
