'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.createTable('credit_reservations', {
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
        amount: { type: Sequelize.INTEGER, allowNull: false },
        plan_portion: {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 0,
          comment: 'Portion of amount held against plan_balance.',
        },
        purchased_portion: {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 0,
          comment: 'Portion of amount held against purchased_balance.',
        },
        status: {
          type: Sequelize.ENUM('held', 'settled', 'released', 'expired'),
          allowNull: false,
          defaultValue: 'held',
        },
        idempotency_key: { type: Sequelize.STRING, allowNull: false },
        expires_at: { type: Sequelize.DATE, allowNull: false },
        settled_at: { type: Sequelize.DATE, allowNull: true },
        released_at: { type: Sequelize.DATE, allowNull: true },
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
      }, { transaction });

      await queryInterface.sequelize.query(
        'ALTER TABLE credit_reservations ADD CONSTRAINT credit_reservations_amount_positive CHECK (amount > 0)',
        { transaction },
      );

      await queryInterface.addIndex('credit_reservations', ['organization_id', 'tool_id', 'idempotency_key'], {
        unique: true,
        name: 'credit_reservations_org_tool_idem_unique',
        transaction,
      });

      // Partial idx to speed up sweeper scan
      await queryInterface.sequelize.query(
        'CREATE INDEX credit_reservations_expires_held_idx ON credit_reservations (expires_at) WHERE status = \'held\'',
        { transaction },
      );

      await transaction.commit();
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  },

  async down(queryInterface) {
    await queryInterface.dropTable('credit_reservations');
    if (queryInterface.sequelize.getDialect() === 'postgres') {
      await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_credit_reservations_status"');
    }
  },
};
