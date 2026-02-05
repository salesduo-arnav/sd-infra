import sequelize from '../config/db';
import { QueryTypes } from 'sequelize';

const cleanupOrphanedData = async () => {
    const transaction = await sequelize.transaction();

    try {
        console.log('Starting cleanup of orphaned data...');
        const results = {
            orphanedMembers: 0,
            orphanedInvitations: 0,
            expiredInvitations: 0
        };

        // Delete orphaned OrganizationMembers
        // Members associated with organizations that are either hard deleted (not in table) or soft deleted (deleted_at is not null)
        const activeOrgIdsQuery = 'SELECT "id" FROM "organizations" WHERE "deleted_at" IS NULL';

        const deleteMembersResult = await sequelize.query(`
            DELETE FROM "organization_members" 
            WHERE "organization_id" NOT IN (${activeOrgIdsQuery})
            RETURNING id;
        `, { type: QueryTypes.DELETE, transaction });

        results.orphanedMembers = Array.isArray(deleteMembersResult) ? deleteMembersResult.length : 0;
        console.log(`Deleted ${results.orphanedMembers} orphaned OrganizationMembers.`);

        // Delete orphaned Invitations
        const deleteInvitationsResult = await sequelize.query(`
            DELETE FROM "invitations" 
            WHERE "organization_id" NOT IN (${activeOrgIdsQuery})
            RETURNING id;
        `, { type: QueryTypes.DELETE, transaction });

        results.orphanedInvitations = Array.isArray(deleteInvitationsResult) ? deleteInvitationsResult.length : 0;
        console.log(`Deleted ${results.orphanedInvitations} orphaned Invitations.`);

        // Delete expired invitations that are still pending
        const deleteExpiredResult = await sequelize.query(`
            DELETE FROM "invitations"
            WHERE "expires_at" < NOW()
            AND "status" = 'pending'
            RETURNING id;
        `, { type: QueryTypes.DELETE, transaction });

        results.expiredInvitations = Array.isArray(deleteExpiredResult) ? deleteExpiredResult.length : 0;
        console.log(`Deleted ${results.expiredInvitations} expired pending Invitations.`);

        await transaction.commit();
        console.log('Cleanup completed successfully.');
        console.log('Summary:', results);

        return results;
    } catch (error) {
        await transaction.rollback();
        console.error('Error during cleanup:', error);
        throw error;
    } finally {
        await sequelize.close();
    }
};

if (require.main === module) {
    cleanupOrphanedData();
}

export default cleanupOrphanedData;
