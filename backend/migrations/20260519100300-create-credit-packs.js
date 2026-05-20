'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.createTable('credit_packs', {
        id: {
          type: Sequelize.UUID,
          defaultValue: Sequelize.UUIDV4,
          primaryKey: true,
        },
        tool_id: {
          type: Sequelize.UUID,
          allowNull: false,
          references: { model: 'tools', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE',
        },
        name: { type: Sequelize.STRING, allowNull: false },
        credits: {
          type: Sequelize.INTEGER,
          allowNull: false,
        },
        price: {
          type: Sequelize.INTEGER,
          allowNull: false,
          comment: 'Price in smallest currency unit (cents).',
        },
        currency: {
          type: Sequelize.STRING(8),
          allowNull: false,
          defaultValue: 'usd',
        },
        stripe_product_id: { type: Sequelize.STRING, allowNull: true },
        stripe_price_id: { type: Sequelize.STRING, allowNull: true },
        active: {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: true,
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
        deleted_at: { type: Sequelize.DATE, allowNull: true },
      }, { transaction });

      // CHECK on credits > 0
      await queryInterface.sequelize.query(
        'ALTER TABLE credit_packs ADD CONSTRAINT credit_packs_credits_positive CHECK (credits > 0)',
        { transaction },
      );

      await queryInterface.addIndex('credit_packs', ['tool_id', 'active'], {
        name: 'credit_packs_tool_active_idx',
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
    await queryInterface.dropTable('credit_packs');
  },
};
