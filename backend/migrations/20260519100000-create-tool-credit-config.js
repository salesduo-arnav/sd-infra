'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.createTable('tool_credit_configs', {
        tool_id: {
          type: Sequelize.UUID,
          primaryKey: true,
          allowNull: false,
          references: { model: 'tools', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE',
        },
        alacarte_enabled: {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: false,
        },
        price_per_credit: {
          type: Sequelize.INTEGER,
          allowNull: true,
          comment: 'Per-credit price in cents (currency units). Used for a-la-carte purchases.',
        },
        currency: {
          type: Sequelize.STRING(8),
          allowNull: false,
          defaultValue: 'usd',
        },
        alacarte_stripe_product_id: { type: Sequelize.STRING, allowNull: true },
        alacarte_stripe_price_id: { type: Sequelize.STRING, allowNull: true },
        min_credits: {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 1,
        },
        max_credits: { type: Sequelize.INTEGER, allowNull: true },
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

      await transaction.commit();
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  },

  async down(queryInterface) {
    await queryInterface.dropTable('tool_credit_configs');
  },
};
