'use strict';

/**
 * Renames the credit-grant `on_cancel` enum value `keep_till_period_end` to
 * `keep_till_grant_period_end`. The semantics shift from "Stripe subscription
 * period end" to "credit grant's own reset cadence" — see CreditService and
 * CronService for the new sweeper behavior.
 *
 * Any existing rows with reset_interval='never' + on_cancel='keep_till_period_end'
 * are migrated to 'keep_forever': under the new semantics, "wait until the grant
 * period ends" never fires when the grant has no cadence, which is functionally
 * identical to keep_forever. Storing it as keep_forever makes the admin UI honest.
 *
 * @type {import('sequelize-cli').Migration}
 */
module.exports = {
  async up(queryInterface) {
    const sequelize = queryInterface.sequelize;
    if (sequelize.getDialect() !== 'postgres') {
      throw new Error('This migration only supports postgres');
    }

    await sequelize.query(
      `UPDATE plan_credit_grants
          SET on_cancel = 'keep_forever'
        WHERE on_cancel = 'keep_till_period_end'
          AND reset_interval = 'never'`,
    );

    await sequelize.query(
      `ALTER TYPE "enum_plan_credit_grants_on_cancel"
         RENAME VALUE 'keep_till_period_end' TO 'keep_till_grant_period_end'`,
    );

    await sequelize.query(
      `ALTER TABLE plan_credit_grants
         ALTER COLUMN on_cancel SET DEFAULT 'keep_till_grant_period_end'`,
    );
  },

  async down(queryInterface) {
    const sequelize = queryInterface.sequelize;
    if (sequelize.getDialect() !== 'postgres') {
      throw new Error('This migration only supports postgres');
    }

    await sequelize.query(
      `ALTER TABLE plan_credit_grants
         ALTER COLUMN on_cancel SET DEFAULT 'keep_till_period_end'`,
    );

    await sequelize.query(
      `ALTER TYPE "enum_plan_credit_grants_on_cancel"
         RENAME VALUE 'keep_till_grant_period_end' TO 'keep_till_period_end'`,
    );
  },
};
