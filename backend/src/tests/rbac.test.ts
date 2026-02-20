import request from 'supertest';
import app from '../app';
import sequelize, { closeDB } from '../config/db';
import redisClient from '../config/redis';
import User from '../models/user';
import { Organization, OrganizationMember } from '../models/organization';
import { Role, Permission, RolePermission } from '../models/role';
import { Invitation } from '../models/invitation';
import { RoleType, ALL_PERMISSIONS, DEFAULT_ROLE_PERMISSIONS } from '../constants/rbac.constants';

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
        await RolePermission.destroy({ where: {}, truncate: true, cascade: true, force: true });
        await Permission.destroy({ where: {}, truncate: true, cascade: true, force: true });
        await Role.destroy({ where: {}, truncate: true, cascade: true, force: true });
        await redisClient.flushAll();

        // Seed permissions
        for (const perm of ALL_PERMISSIONS) {
            await Permission.findOrCreate({
                where: { id: perm.id },
                defaults: { id: perm.id, description: perm.description, category: perm.category },
            });
        }

        // 1. Setup Owner
        const ownerRes = await request(app).post('/auth/register').send(ownerUser);
        ownerCookie = ownerRes.get('Set-Cookie') || [];

        // 2. Create Org (this creates Owner role and assigns it)
        const orgRes = await request(app)
            .post('/organizations')
            .set('Cookie', ownerCookie)
            .send({ name: 'RBAC Corp', website: 'https://rbac.com' });
        orgId = orgRes.body.organization.id;

        // Seed role permissions for Owner role
        const ownerRole = await Role.findOne({ where: { name: RoleType.OWNER } });
        if (ownerRole) {
            const ownerPerms = DEFAULT_ROLE_PERMISSIONS[RoleType.OWNER];
            for (const permId of ownerPerms) {
                await RolePermission.findOrCreate({
                    where: { role_id: ownerRole.id, permission_id: permId },
                    defaults: { role_id: ownerRole.id, permission_id: permId },
                });
            }
        }

        // 3. Setup Member Role & User
        const [memberRole] = await Role.findOrCreate({
            where: { name: RoleType.MEMBER },
            defaults: { name: RoleType.MEMBER, description: 'Regular Member' }
        });

        // Seed member role permissions
        const memberPerms = DEFAULT_ROLE_PERMISSIONS[RoleType.MEMBER];
        for (const permId of memberPerms) {
            await RolePermission.findOrCreate({
                where: { role_id: memberRole.id, permission_id: permId },
                defaults: { role_id: memberRole.id, permission_id: permId },
            });
        }

        const memberRegisterRes = await request(app).post('/auth/register').send(memberUser);
        memberCookie = memberRegisterRes.get('Set-Cookie') || [];
        const memberUserId = memberRegisterRes.body.user.id;

        // 4. Add Member to Org
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
                .set('x-organization-id', orgId)
                .send({ name: 'Hacked Corp' });

            expect(res.statusCode).toEqual(403);
            expect(res.body.message).toEqual('Insufficient permissions');
        });

        it('should NOT allow Member to invite others', async () => {
            const role = await Role.findOne({ where: { name: RoleType.MEMBER } });

            const res = await request(app)
                .post('/invitations')
                .set('Cookie', memberCookie)
                .set('x-organization-id', orgId)
                .send({ email: 'victim@example.com', role_id: role?.id });

            expect(res.statusCode).toEqual(403);
            expect(res.body.message).toEqual('Insufficient permissions');
        });

        it('should NOT allow Member to revoke invitations', async () => {
             const role = await Role.findOne({ where: { name: RoleType.MEMBER } });
             const inviteRes = await request(app)
                .post('/invitations')
                .set('Cookie', ownerCookie)
                .set('x-organization-id', orgId)
                .send({ email: 'to_be_revoked@example.com', role_id: role?.id });

             const inviteId = inviteRes.body.invitation.id;

             // Member tries to revoke
             const res = await request(app)
                .delete(`/invitations/${inviteId}`)
                .set('Cookie', memberCookie)
                .set('x-organization-id', orgId);

            expect(res.statusCode).toEqual(403);
            expect(res.body.message).toEqual('Insufficient permissions');
        });
    });

    describe('Owner Role Privileges', () => {
        it('should allow Owner to update organization', async () => {
             const res = await request(app)
                .put('/organizations')
                .set('Cookie', ownerCookie)
                .set('x-organization-id', orgId)
                .send({ name: 'Legit Update' });

             expect(res.statusCode).toEqual(200);
             expect(res.body.organization.name).toEqual('Legit Update');
        });
    });
});
