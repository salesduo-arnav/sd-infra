'use strict';

module.exports = {
    async up(queryInterface, Sequelize) {
        // vendor_codes: User-provided vendor codes for Vendor Central accounts (can have multiple)
        await queryInterface.addColumn('integration_accounts', 'vendor_codes', {
            type: Sequelize.JSONB,
            allowNull: true,
            defaultValue: null,
        });

        // seller_id: Amazon seller/vendor ID (e.g., A1B2C3D4E5)
        await queryInterface.addColumn('integration_accounts', 'seller_id', {
            type: Sequelize.STRING(100),
            allowNull: true,
        });

        // marketplace_id: Amazon marketplace ID (e.g., ATVPDKIKX0DER for US)
        await queryInterface.addColumn('integration_accounts', 'marketplace_id', {
            type: Sequelize.STRING(20),
            allowNull: true,
        });
    },

    async down(queryInterface) {
        await queryInterface.removeColumn('integration_accounts', 'vendor_codes');
        await queryInterface.removeColumn('integration_accounts', 'seller_id');
        await queryInterface.removeColumn('integration_accounts', 'marketplace_id');
    },
};
