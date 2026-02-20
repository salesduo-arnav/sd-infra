'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface, Sequelize) {
        try {
            await queryInterface.removeConstraint('invitations', 'invitations_org_email_unique');
        } catch (e) {
            try {
                await queryInterface.removeIndex('invitations', 'invitations_org_email_unique');
            } catch (e2) {
                console.warn('Could not remove invitations_org_email_unique constraint or index', e2);
            }
        }
    },

    async down(queryInterface, Sequelize) {
        // Optionally restore it, but it was replaced by partial index in a previous migration
        // So down() might logically do nothing since partial index is the intended behavior
        // But for completeness, we can add it back (though it will break partial indexing)
        try {
            await queryInterface.addConstraint('invitations', {
                fields: ['organization_id', 'email'],
                type: 'unique',
                name: 'invitations_org_email_unique'
            });
        } catch (e) {
            console.warn('Could not restore invitations_org_email_unique', e);
        }
    }
};
