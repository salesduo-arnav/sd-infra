import request from 'supertest';
import app from '../app';
import sequelize, { closeDB } from '../config/db';
import redisClient from '../config/redis';
import User from '../models/user';
import { Organization, OrganizationMember } from '../models/organization';
import { Role } from '../models/role';
import { Invitation } from '../models/invitation';

describe('RBAC Integration Tests', () => {
    const ownerUser = {
        email: 'owner@example.com',
        password: 'Password123!',
        full_name: 'Owner User'
    };

    const memberUser = {
        email: 'member@example.com',
        password: 'Password123!',
        full_name: 'Member User'
    };

    let ownerCookie: string[];
    let memberCookie: string[];
    let orgId: string;

    beforeAll(async () => {
        if (process.env.PGDATABASE !== 'mydb_test') {
            throw new Error("CRITICAL: Tests must run against mydb_test!");
        }
        await sequelize.authenticate();
        if (!redisClient.isOpen) {
            await redisClient.connect();
        }
    });

    beforeEach(async () => {
        // Clean up
        await Invitation.destroy({ where: {}, truncate: true, cascade: true, force: true });
        await OrganizationMember.destroy({ where: {}, truncate: true, cascade: true, force: true });
        await Organization.destroy({ where: {}, truncate: true, cascade: true, force: true });
        await User.destroy({ where: {}, truncate: true, cascade: true, force: true });
        await Role.destroy({ where: {}, truncate: true, cascade: true, force: true });
        await redisClient.flushAll();

        // 1. Setup Owner
        const ownerRes = await request(app).post('/auth/register').send(ownerUser);
        ownerCookie = ownerRes.get('Set-Cookie') || [];

        // 2. Create Org
        const orgRes = await request(app)
            .post('/organizations')
            .set('Cookie', ownerCookie)
            .send({ name: 'RBAC Corp', website: 'https://rbac.com' });
        orgId = orgRes.body.organization.id;

        // 3. Setup Member Role & User
        const memberRole = await Role.create({ name: 'Member', description: 'Regular Member' });
        
        const memberRegisterRes = await request(app).post('/auth/register').send(memberUser);
        memberCookie = memberRegisterRes.get('Set-Cookie') || [];
        const memberUserId = memberRegisterRes.body.user.id; // Corrected path from auth.test logic

        // 4. Add Member to Org manually
        await OrganizationMember.create({
            organization_id: orgId,
            user_id: memberUserId,
            role_id: memberRole.id,
            is_active: true
        });
    });

    afterAll(async () => {
        await redisClient.quit();
        await closeDB();
    });

    describe('Member Role Constraints', () => {
        it('should NOT allow Member to update organization', async () => {
            const res = await request(app)
                .put('/organizations')
                .set('Cookie', memberCookie)
                .send({ name: 'Hacked Corp' });

            expect(res.statusCode).toEqual(403);
            expect(res.body.message).toEqual('Insufficient permissions');
        });

        it('should NOT allow Member to invite others', async () => {
            // Needed to find role ID for invite
            const role = await Role.findOne({ where: { name: 'Member' } });
            
            const res = await request(app)
                .post('/invitations')
                .set('Cookie', memberCookie)
                .send({ email: 'victim@example.com', role_id: role?.id });

            expect(res.statusCode).toEqual(403);
            expect(res.body.message).toEqual('Insufficient permissions');
        });

        it('should NOT allow Member to revoke invitations', async () => {
             // Owner creates an invite first
             const role = await Role.findOne({ where: { name: 'Member' } });
             const inviteRes = await request(app)
                .post('/invitations')
                .set('Cookie', ownerCookie)
                .send({ email: 'to_be_revoked@example.com', role_id: role?.id });
             
             const inviteId = inviteRes.body.invitation.id;

             // Member tries to revoke
             const res = await request(app)
                .delete(`/invitations/${inviteId}`)
                .set('Cookie', memberCookie);

            expect(res.statusCode).toEqual(403);
            expect(res.body.message).toEqual('Insufficient permissions');
        });
    });

    describe('Owner Role Privileges', () => {
        it('should allow Owner to update organization', async () => {
             const res = await request(app)
                .put('/organizations')
                .set('Cookie', ownerCookie)
                .send({ name: 'Legit Update' });

             expect(res.statusCode).toEqual(200);
             expect(res.body.organization.name).toEqual('Legit Update');
        });
    });
});
