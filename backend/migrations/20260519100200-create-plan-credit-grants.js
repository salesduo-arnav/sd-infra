'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.createTable('plan_credit_grants', {
        id: {
          type: Sequelize.UUID,
          defaultValue: Sequelize.UUIDV4,
          primaryKey: true,
        },
        plan_id: {
          type: Sequelize.UUID,
          allowNull: false,
          references: { model: 'plans', key: 'id' },
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
        credits_per_cycle: {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 0,
        },
        trial_credits: {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 0,
          comment: 'Credits granted on trial start; expire at trial_end if not converted.',
        },
        reset_interval: {
          type: Sequelize.ENUM('monthly', 'yearly', 'never'),
          allowNull: false,
          defaultValue: 'monthly',
        },
        carry_over: {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: true,
          comment: 'If true, unused plan credits roll into the next cycle.',
        },
        on_cancel: {
          type: Sequelize.ENUM('forfeit_immediate', 'keep_till_period_end', 'keep_forever'),
          allowNull: false,
          defaultValue: 'keep_till_period_end',
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
        deleted_at: {
          type: Sequelize.DATE,
          allowNull: true,
        },
      }, { transaction });

      await queryInterface.addIndex('plan_credit_grants', ['plan_id', 'tool_id'], {
        unique: true,
        name: 'plan_credit_grants_plan_tool_unique',
        where: { deleted_at: null },
        transaction,
      });

      await transaction.commit();
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  },

  async down(queryInterface) {
    await queryInterface.dropTable('plan_credit_grants');
    if (queryInterface.sequelize.getDialect() === 'postgres') {
      await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_plan_credit_grants_reset_interval"');
      await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_plan_credit_grants_on_cancel"');
    }
  },
};
