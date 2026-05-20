'use strict';

/**
 * Extend the `features` table for the credit-based metering system:
 *
 *  - Adds `credit_cost`           (INT,  default 0)     credits charged per invocation
 *  - Adds `requires_subscription` (BOOL, default true)  if true, credit-only fallback is disabled
 *  - Adds `use_credit_system`     (BOOL, default false) if true, this feature is credit-metered
 *  - Replaces the legacy partial unique index on (slug) with a per-tool scoped
 *    one on (tool_id, slug). Different tools may share an operation slug.
 *  - Adds a (tool_id, credit_cost) index to speed up admin/feature queries.
 *
 * All column defaults are chosen to preserve behaviour for tools that don't opt
 * in to credit metering — pre-existing features rows and features inserted by
 * other micro-tools continue to flow through the entitlement / plan-limit path.
 *
 * @type {import('sequelize-cli').Migration}
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      // 1. New columns -------------------------------------------------------
      await queryInterface.addColumn(
        'features',
        'credit_cost',
        {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 0,
          comment: 'Credits consumed per unit of this feature. 0 = free.',
        },
        { transaction },
      );

      await queryInterface.addColumn(
        'features',
        'requires_subscription',
        {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: true,
          comment:
            'When true, the credit-only fallback is disabled — users must have an active subscription regardless of wallet balance.',
        },
        { transaction },
      );

      await queryInterface.addColumn(
        'features',
        'use_credit_system',
        {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: false,
          comment:
            'When true, this feature is metered via credits (cost charged per invocation). When false, falls back to the entitlement / plan-limit flow.',
        },
        { transaction },
      );

      // 2. Index: (tool_id, credit_cost) ------------------------------------
      await queryInterface.addIndex('features', ['tool_id', 'credit_cost'], {
        name: 'features_tool_id_credit_cost_idx',
        transaction,
      });

      // 3. Rebuild the slug uniqueness as (tool_id, slug) -------------------
      // Drop any legacy partial unique index on just (slug). We do this by
      // name AND by definition so we catch indexes created by older Sequelize
      // versions under auto-generated names.
      const sql = queryInterface.sequelize;
      const legacyNames = [
        'features_slug',
        'features_slug_unique',
        'features_slug_deleted_at',
        'features_slug_deleted_at_unique',
      ];
      for (const name of legacyNames) {
        await sql.query(`DROP INDEX IF EXISTS "${name}";`, { transaction });
      }
      const [rows] = await sql.query(
        `SELECT indexname FROM pg_indexes
           WHERE tablename = 'features'
             AND indexdef ILIKE '%UNIQUE INDEX%(slug)%WHERE%deleted_at IS NULL%'
             AND indexname <> 'features_tool_slug_active_unique';`,
        { transaction },
      );
      for (const row of rows) {
        await sql.query(`DROP INDEX IF EXISTS "${row.indexname}";`, { transaction });
      }
      await sql.query(
        `CREATE UNIQUE INDEX IF NOT EXISTS features_tool_slug_active_unique
           ON features (tool_id, slug) WHERE deleted_at IS NULL;`,
        { transaction },
      );

      await transaction.commit();
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  },

  async down(queryInterface) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      const sql = queryInterface.sequelize;

      // Restore the legacy partial unique on (slug)
      await sql.query(`DROP INDEX IF EXISTS features_tool_slug_active_unique;`, { transaction });
      await sql.query(
        `CREATE UNIQUE INDEX IF NOT EXISTS features_slug_deleted_at_unique
           ON features (slug) WHERE deleted_at IS NULL;`,
        { transaction },
      );

      await queryInterface.removeIndex('features', 'features_tool_id_credit_cost_idx', { transaction });
      await queryInterface.removeColumn('features', 'use_credit_system', { transaction });
      await queryInterface.removeColumn('features', 'requires_subscription', { transaction });
      await queryInterface.removeColumn('features', 'credit_cost', { transaction });

      await transaction.commit();
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  },
};
