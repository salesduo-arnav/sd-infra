'use strict';

module.exports = {
    async up(queryInterface) {
        await queryInterface.sequelize.query(`
            ALTER TABLE integration_accounts
                ADD COLUMN IF NOT EXISTS vendor_codes JSONB DEFAULT NULL,
                ADD COLUMN IF NOT EXISTS seller_id VARCHAR(100),
                ADD COLUMN IF NOT EXISTS marketplace_id VARCHAR(20);
        `);
    },

    async down(queryInterface) {
        await queryInterface.sequelize.query(`
            ALTER TABLE integration_accounts
                DROP COLUMN IF EXISTS vendor_codes,
                DROP COLUMN IF EXISTS seller_id,
                DROP COLUMN IF EXISTS marketplace_id;
        `);
    },
};
