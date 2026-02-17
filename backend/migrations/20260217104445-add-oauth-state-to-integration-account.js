'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.addColumn('integration_accounts', 'oauth_state', {
            type: Sequelize.STRING,
            allowNull: true,
        });
        await queryInterface.changeColumn('integration_accounts', 'status', {
            type: Sequelize.ENUM('connected', 'disconnected', 'error', 'connecting'),
            allowNull: false,
            defaultValue: 'disconnected',
        });
    },

    async down(queryInterface, Sequelize) {
        await queryInterface.removeColumn('integration_accounts', 'oauth_state');
        await queryInterface.changeColumn('integration_accounts', 'status', {
            type: Sequelize.ENUM('connected', 'disconnected', 'error'),
            allowNull: false,
            defaultValue: 'disconnected',
        });
    },
};