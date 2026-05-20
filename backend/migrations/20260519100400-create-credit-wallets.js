'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.createTable('credit_wallets', {
        id: {
          type: Sequelize.UUID,
          defaultValue: Sequelize.UUIDV4,
          primaryKey: true,
        },
        organization_id: {
          type: Sequelize.UUID,
          allowNull: false,
          references: { model: 'organizations', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE',
        },
        tool_id: {
          type: Sequelize.UUID,
          allowNull: false,
          references: { model: 'tools', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE',
        },
        plan_balance: {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 0,
        },
        purchased_balance: {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 0,
        },
        reserved_amount: {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 0,
          comment: 'Sum of currently-held reservations.',
        },
        next_reset_at: {
          type: Sequelize.DATE,
          allowNull: true,
          comment: 'Cached. Authoritative source is the linked subscription period_end.',
        },
        last_granted_period_start: {
          type: Sequelize.DATE,
          allowNull: true,
          comment: 'Idempotency anchor for plan-grant on subscription renewal webhooks.',
        },
        metadata: {
          type: Sequelize.JSONB,
          allowNull: false,
          defaultValue: {},
        },
        created_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
        },
        updated_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
        },
      }, { transaction });

      await queryInterface.sequelize.query(
        'ALTER TABLE credit_wallets ADD CONSTRAINT credit_wallets_plan_balance_nonneg CHECK (plan_balance >= 0)',
        { transaction },
      );
      await queryInterface.sequelize.query(
        'ALTER TABLE credit_wallets ADD CONSTRAINT credit_wallets_purchased_balance_nonneg CHECK (purchased_balance >= 0)',
        { transaction },
      );
      await queryInterface.sequelize.query(
        'ALTER TABLE credit_wallets ADD CONSTRAINT credit_wallets_reserved_nonneg CHECK (reserved_amount >= 0)',
        { transaction },
      );

      await queryInterface.addIndex('credit_wallets', ['organization_id', 'tool_id'], {
        unique: true,
        name: 'credit_wallets_org_tool_unique',
        transaction,
      });
      await queryInterface.addIndex('credit_wallets', ['organization_id'], {
        name: 'credit_wallets_org_idx',
        transaction,
      });

      await transaction.commit();
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  },

  async down(queryInterface) {
    await queryInterface.dropTable('credit_wallets');
  },
};
