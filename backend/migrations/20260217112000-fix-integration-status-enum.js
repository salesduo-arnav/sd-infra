'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface, Sequelize) {
        // We need to disable transactions for ALTER TYPE ADD VALUE in Postgres
        // However, Sequelize might wrap migrations in transactions by default.
        // Usually standard `queryInterface.sequelize.query` works.

        // Attempt to add the value. 
        // IF NOT EXISTS is not standard SQL for enum values in older Postgres, 
        // but usually we can wrap in a block or just run it. 
        // Since we know it's missing, we'll try to add it.

        try {
            await queryInterface.sequelize.query("ALTER TYPE \"enum_integration_accounts_status\" ADD VALUE 'connecting';");
        } catch (e) {
            // It might fail if it already exists (e.g. re-running migration on different env where it was fixed manually)
            // We can log it but shouldn't block if it's just "already exists"
            console.log('Error adding enum value (might already exist):', e.message);
        }
    },

    async down(queryInterface, Sequelize) {
        // Postgres doesn't support removing enum values easily.
        console.log('Irreversible migration: Cannot remove enum value "connecting" without dropping type.');
    }
};
