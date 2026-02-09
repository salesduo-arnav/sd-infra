'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();

    try {
      // 1. Add columns to Organizations
      await queryInterface.addColumn('organizations', 'billing_email', {
        type: Sequelize.STRING,
        allowNull: true,
      }, { transaction });

      await queryInterface.addColumn('organizations', 'tax_id', {
        type: Sequelize.STRING,
        allowNull: true,
      }, { transaction });

      // 2. Add columns to Plans
      await queryInterface.addColumn('plans', 'stripe_product_id', {
        type: Sequelize.STRING,
        allowNull: true,
      }, { transaction });

      await queryInterface.addColumn('plans', 'stripe_price_id_monthly', {
        type: Sequelize.STRING,
        allowNull: true,
      }, { transaction });

      await queryInterface.addColumn('plans', 'stripe_price_id_yearly', {
        type: Sequelize.STRING,
        allowNull: true,
      }, { transaction });

      // 3. Add columns to Bundles
      await queryInterface.addColumn('bundles', 'stripe_product_id', {
        type: Sequelize.STRING,
        allowNull: true,
      }, { transaction });

      await queryInterface.addColumn('bundles', 'stripe_price_id_monthly', {
        type: Sequelize.STRING,
        allowNull: true,
      }, { transaction });

      await queryInterface.addColumn('bundles', 'stripe_price_id_yearly', {
        type: Sequelize.STRING,
        allowNull: true,
      }, { transaction });

      // 4. Update Subscriptions Enum (Postgres specific)
      // Check if dialect is postgres to run raw queries
      if (queryInterface.sequelize.getDialect() === 'postgres') {
        await queryInterface.sequelize.query("ALTER TYPE \"enum_subscriptions_status\" ADD VALUE IF NOT EXISTS 'unpaid'", { transaction });
        await queryInterface.sequelize.query("ALTER TYPE \"enum_subscriptions_status\" ADD VALUE IF NOT EXISTS 'incomplete_expired'", { transaction });
        await queryInterface.sequelize.query("ALTER TYPE \"enum_subscriptions_status\" ADD VALUE IF NOT EXISTS 'paused'", { transaction });
      }

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },

  async down (queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();

    try {
      // Remove columns
      await queryInterface.removeColumn('organizations', 'billing_email', { transaction });
      await queryInterface.removeColumn('organizations', 'tax_id', { transaction });

      await queryInterface.removeColumn('plans', 'stripe_product_id', { transaction });
      await queryInterface.removeColumn('plans', 'stripe_price_id_monthly', { transaction });
      await queryInterface.removeColumn('plans', 'stripe_price_id_yearly', { transaction });

      await queryInterface.removeColumn('bundles', 'stripe_product_id', { transaction });
      await queryInterface.removeColumn('bundles', 'stripe_price_id_monthly', { transaction });
      await queryInterface.removeColumn('bundles', 'stripe_price_id_yearly', { transaction });

      // Note: Removing ENUM values is complex and usually not done in down migrations easily without recreating the type.
      // We will skip removing enum values to avoid data loss or complexity.

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }
};
