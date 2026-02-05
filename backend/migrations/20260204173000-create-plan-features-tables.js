'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();

    try {
      // 1. Create Tools Table
      await queryInterface.createTable('tools', {
        id: {
          type: Sequelize.UUID,
          defaultValue: Sequelize.UUIDV4,
          primaryKey: true,
        },
        name: {
          type: Sequelize.STRING,
          allowNull: false,
        },
        slug: {
          type: Sequelize.STRING,
          allowNull: false,
          unique: true,
        },
        description: {
          type: Sequelize.TEXT,
          allowNull: true,
        },
        is_active: {
          type: Sequelize.BOOLEAN,
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
      }, { transaction });

      // 2. Create Features Table
      await queryInterface.createTable('features', {
        id: {
          type: Sequelize.UUID,
          defaultValue: Sequelize.UUIDV4,
          primaryKey: true,
        },
        tool_id: {
          type: Sequelize.UUID,
          allowNull: false,
          references: {
            model: 'tools',
            key: 'id',
          },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE',
        },
        name: {
          type: Sequelize.STRING,
          allowNull: false,
        },
        slug: {
          type: Sequelize.STRING,
          allowNull: false,
          unique: true,
        },
        type: {
          type: Sequelize.ENUM('boolean', 'metered'),
          allowNull: false,
        },
        description: {
          type: Sequelize.TEXT,
          allowNull: true,
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

      // 3. Create Plans Table
      await queryInterface.createTable('plans', {
        id: {
          type: Sequelize.UUID,
          defaultValue: Sequelize.UUIDV4,
          primaryKey: true,
        },
        name: {
          type: Sequelize.STRING,
          allowNull: false,
        },
        description: {
          type: Sequelize.TEXT,
          allowNull: true,
        },
        tool_id: {
          type: Sequelize.UUID,
          allowNull: false,
          references: {
            model: 'tools',
            key: 'id',
          },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE',
        },
        tier: {
          type: Sequelize.ENUM('basic', 'premium', 'platinum', 'diamond'),
          allowNull: false,
        },
        price: {
          type: Sequelize.INTEGER,
          allowNull: false,
        },
        currency: {
          type: Sequelize.STRING,
          allowNull: false,
        },
        interval: {
          type: Sequelize.ENUM('monthly', 'yearly', 'one_time'),
          allowNull: false,
        },
        trial_period_days: {
          type: Sequelize.INTEGER,
          defaultValue: 0,
        },
        is_public: {
          type: Sequelize.BOOLEAN,
          defaultValue: true,
        },
        active: {
          type: Sequelize.BOOLEAN,
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
      }, { transaction });

      // 4. Create Plan Limits Table
      await queryInterface.createTable('plan_limits', {
        id: {
          type: Sequelize.UUID,
          defaultValue: Sequelize.UUIDV4,
          primaryKey: true,
        },
        plan_id: {
          type: Sequelize.UUID,
          allowNull: false,
          references: {
            model: 'plans',
            key: 'id',
          },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE',
        },
        feature_id: {
          type: Sequelize.UUID,
          allowNull: false,
          references: {
            model: 'features',
            key: 'id',
          },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE',
        },
        default_limit: {
          type: Sequelize.INTEGER,
          allowNull: true,
        },
        reset_period: {
          type: Sequelize.ENUM('monthly', 'yearly', 'never'),
          defaultValue: 'monthly',
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
      
      // Add Unique Index for Plan Limits
      await queryInterface.addIndex('plan_limits', ['plan_id', 'feature_id'], {
        unique: true,
        transaction,
      });

      // 5. Create Bundles Table
      await queryInterface.createTable('bundles', {
        id: {
          type: Sequelize.UUID,
          defaultValue: Sequelize.UUIDV4,
          primaryKey: true,
        },
        name: {
          type: Sequelize.STRING,
          allowNull: false,
        },
        slug: {
          type: Sequelize.STRING,
          allowNull: false,
          unique: true,
        },
        price: {
          type: Sequelize.INTEGER,
          allowNull: false,
        },
        currency: {
          type: Sequelize.STRING,
          allowNull: false,
        },
        interval: {
          type: Sequelize.ENUM('monthly', 'yearly', 'one_time'),
          allowNull: false,
        },
        description: {
          type: Sequelize.TEXT,
          allowNull: true,
        },
        active: {
          type: Sequelize.BOOLEAN,
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
      }, { transaction });

      // 6. Create Bundle Plans Table
      await queryInterface.createTable('bundle_plans', {
         bundle_id: {
          type: Sequelize.UUID,
          allowNull: false,
          references: {
            model: 'bundles',
            key: 'id',
          },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE',
        },
        plan_id: {
          type: Sequelize.UUID,
          allowNull: false,
          references: {
            model: 'plans',
            key: 'id',
          },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE',
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
      
      // Add Unique Index for Bundle Plans
      await queryInterface.addIndex('bundle_plans', ['bundle_id', 'plan_id'], {
        unique: true,
        transaction,
      });

      // 7. Create Subscriptions Table
      await queryInterface.createTable('subscriptions', {
        id: {
          type: Sequelize.UUID,
          defaultValue: Sequelize.UUIDV4,
          primaryKey: true,
        },
        organization_id: {
          type: Sequelize.UUID,
          allowNull: false,
          references: {
            model: 'organizations',
            key: 'id',
          },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE',
        },
        plan_id: {
          type: Sequelize.UUID,
          allowNull: true,
          references: {
            model: 'plans',
            key: 'id',
          },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL',
        },
        bundle_id: {
          type: Sequelize.UUID,
          allowNull: true,
          references: {
            model: 'bundles',
            key: 'id',
          },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL',
        },
        stripe_subscription_id: {
          type: Sequelize.STRING,
          allowNull: true,
        },
        status: {
          type: Sequelize.ENUM('active', 'past_due', 'canceled', 'trialing', 'incomplete'),
          allowNull: false,
        },
        trial_start: {
          type: Sequelize.DATE,
          allowNull: true,
        },
        trial_end: {
          type: Sequelize.DATE,
          allowNull: true,
        },
        current_period_start: {
          type: Sequelize.DATE,
          allowNull: true,
        },
        current_period_end: {
          type: Sequelize.DATE,
          allowNull: true,
        },
        cancel_at_period_end: {
          type: Sequelize.BOOLEAN,
          defaultValue: false,
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

      // Add Check Constraint to ensure either plan_id or bundle_id is present
      await queryInterface.addConstraint('subscriptions', {
        fields: ['plan_id', 'bundle_id'],
        type: 'check',
        where: {
          [Sequelize.Op.or]: [
            { plan_id: { [Sequelize.Op.ne]: null } },
            { bundle_id: { [Sequelize.Op.ne]: null } }
          ]
        },
        name: 'check_subscription_plan_or_bundle',
        transaction,
      });

      // 8. Create Organization Entitlements Table
      await queryInterface.createTable('organization_entitlements', {
        id: {
          type: Sequelize.UUID,
          defaultValue: Sequelize.UUIDV4,
          primaryKey: true,
        },
        organization_id: {
          type: Sequelize.UUID,
          allowNull: false,
          references: {
            model: 'organizations',
            key: 'id',
          },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE',
        },
        tool_id: {
          type: Sequelize.UUID,
          allowNull: false,
          references: {
            model: 'tools',
            key: 'id',
          },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE',
        },
        feature_id: {
          type: Sequelize.UUID,
          allowNull: false,
          references: {
            model: 'features',
            key: 'id',
          },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE',
        },
        limit_amount: {
          type: Sequelize.INTEGER,
          allowNull: true,
        },
        usage_amount: {
          type: Sequelize.INTEGER,
          defaultValue: 0,
        },
        reset_period: {
          type: Sequelize.ENUM('monthly', 'yearly', 'never'),
          allowNull: true,
        },
        last_reset_at: {
          type: Sequelize.DATE,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
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
      
      // Add Unique Index for Organization Entitlements
      await queryInterface.addIndex('organization_entitlements', ['organization_id', 'feature_id'], {
        unique: true,
        transaction,
      });

      // 9. Create One Time Purchases Table
      await queryInterface.createTable('one_time_purchases', {
        id: {
          type: Sequelize.UUID,
          defaultValue: Sequelize.UUIDV4,
          primaryKey: true,
        },
        organization_id: {
          type: Sequelize.UUID,
          allowNull: false,
          references: {
            model: 'organizations',
            key: 'id',
          },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE',
        },
        plan_id: {
          type: Sequelize.UUID,
          allowNull: true,
          references: {
            model: 'plans',
            key: 'id',
          },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL',
        },
        bundle_id: {
          type: Sequelize.UUID,
          allowNull: true,
          references: {
            model: 'bundles',
            key: 'id',
          },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL',
        },
        stripe_payment_intent_id: {
          type: Sequelize.STRING,
          allowNull: true,
          unique: true,
        },
        amount_paid: {
          type: Sequelize.INTEGER,
          allowNull: true,
        },
        currency: {
          type: Sequelize.STRING,
          allowNull: true,
        },
        status: {
          type: Sequelize.STRING,
          allowNull: true,
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

      await transaction.commit();
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  },

  async down(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      // Drop all tables in reverse order of creation
      await queryInterface.dropTable('one_time_purchases', { transaction });
      await queryInterface.dropTable('organization_entitlements', { transaction });
      await queryInterface.dropTable('subscriptions', { transaction });
      await queryInterface.dropTable('bundle_plans', { transaction });
      await queryInterface.dropTable('bundles', { transaction });
      await queryInterface.dropTable('plan_limits', { transaction });
      await queryInterface.dropTable('plans', { transaction });
      await queryInterface.dropTable('features', { transaction });
      await queryInterface.dropTable('tools', { transaction });
      
      // Note: Depending on the DB config, we might want to drop ENUMS too if necessary.
      // But Sequelize usually leaves ENUM types unless explicitly dropped with raw query.
      // For safety, we'll leave them or use dropping if we want a clean state.
      // Postgres: DROP TYPE IF EXISTS "enum_name";
      
      await transaction.commit();
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  }
};
