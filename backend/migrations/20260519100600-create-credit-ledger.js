'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.createTable('credit_ledger', {
        id: {
          type: Sequelize.BIGINT,
          autoIncrement: true,
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
        entry_type: {
          type: Sequelize.ENUM(
            'grant',
            'consume',
            'reserve',
            'release',
            'settle',
            'adjustment',
            'refund',
            'expire',
          ),
          allowNull: false,
        },
        bucket: {
          type: Sequelize.ENUM('plan', 'purchased', 'trial'),
          allowNull: false,
        },
        amount: {
          type: Sequelize.INTEGER,
          allowNull: false,
          comment: 'Signed: positive for credit-adding events, negative for credit-removing.',
        },
        balance_after_plan: { type: Sequelize.INTEGER, allowNull: false },
        balance_after_purchased: { type: Sequelize.INTEGER, allowNull: false },
        reservation_id: {
          type: Sequelize.UUID,
          allowNull: true,
          references: { model: 'credit_reservations', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL',
        },
        idempotency_key: { type: Sequelize.STRING, allowNull: true },
        source: {
          type: Sequelize.STRING(64),
          allowNull: false,
          comment: 'subscription_renewal, trial_grant, credit_pack_purchase, alacarte_purchase, admin_adjust, consume, reservation, sweeper, cancel_keep_forever, etc.',
        },
        related_subscription_id: {
          type: Sequelize.UUID,
          allowNull: true,
          references: { model: 'subscriptions', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL',
        },
        related_plan_id: {
          type: Sequelize.UUID,
          allowNull: true,
          references: { model: 'plans', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL',
        },
        related_purchase_id: {
          type: Sequelize.UUID,
          allowNull: true,
          references: { model: 'one_time_purchases', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL',
        },
        related_credit_pack_id: {
          type: Sequelize.UUID,
          allowNull: true,
          references: { model: 'credit_packs', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL',
        },
        admin_user_id: {
          type: Sequelize.UUID,
          allowNull: true,
          references: { model: 'users', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL',
        },
        reason: { type: Sequelize.TEXT, allowNull: true },
        metadata: {
          type: Sequelize.JSONB,
          allowNull: false,
          defaultValue: {},
        },
        operation_slug: {
          type: Sequelize.STRING(128),
          allowNull: true,
          comment: 'Feature slug for consume/reserve/settle entries — populated to drive usage analytics.',
        },
        created_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
        },
      }, { transaction });

      await queryInterface.addIndex('credit_ledger', ['organization_id', 'tool_id', 'created_at'], {
        name: 'credit_ledger_org_tool_created_idx',
        transaction,
      });
      await queryInterface.addIndex('credit_ledger', ['reservation_id'], {
        name: 'credit_ledger_reservation_idx',
        transaction,
      });
      // Idempotency: partial unique
      await queryInterface.sequelize.query(
        'CREATE UNIQUE INDEX credit_ledger_org_tool_idem_unique ON credit_ledger (organization_id, tool_id, idempotency_key) WHERE idempotency_key IS NOT NULL',
        { transaction },
      );

      await transaction.commit();
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  },

  async down(queryInterface) {
    await queryInterface.dropTable('credit_ledger');
    if (queryInterface.sequelize.getDialect() === 'postgres') {
      await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_credit_ledger_entry_type"');
      await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_credit_ledger_bucket"');
    }
  },
};
