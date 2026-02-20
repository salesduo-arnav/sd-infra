import request from 'supertest';
import app from '../app';
import sequelize, { closeDB } from '../config/db';
import redisClient from '../config/redis';
import User from '../models/user';
import { Organization, OrganizationMember } from '../models/organization';
import { Role, Permission, RolePermission } from '../models/role';
import { Invitation, InvitationStatus } from '../models/invitation';
import { seedPermissions } from './test-helpers';

describe('Organization API Integration Tests', () => {
    const testUser = {
        email: 'orgowner@example.com',
        password: 'Password123!',
        full_name: 'Org Owner'
    };

    const testOrg = {
        name: 'Test Corp',
        website: 'https://testcorp.com'
    };

    let authCookie: string[];

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
        await RolePermission.destroy({ where: {}, truncate: true, cascade: true, force: true });
        await Permission.destroy({ where: {}, truncate: true, cascade: true, force: true });
        await Invitation.destroy({ where: {}, truncate: true, cascade: true, force: true });
        await OrganizationMember.destroy({ where: {}, truncate: true, cascade: true, force: true });
        await Organization.destroy({ where: {}, truncate: true, cascade: true, force: true });
        await User.destroy({ where: {}, truncate: true, cascade: true, force: true });
        await Role.destroy({ where: {}, truncate: true, cascade: true, force: true });
        await redisClient.flushAll();

        // Register and Login to get cookie
        const res = await request(app).post('/auth/register').send(testUser);
        authCookie = res.get('Set-Cookie') || [];

        // Seed permissions and role-permission mappings for permission middleware
        await seedPermissions();
    });

    afterAll(async () => {
        if (redisClient.isOpen) {
            await redisClient.disconnect();
        }
        // Force close DB if it takes too long
        await Promise.race([
            closeDB(),
            new Promise(resolve => setTimeout(resolve, 3000))
        ]);
    });

    describe('POST /organizations', () => {
        it('should create a new organization for an authenticated user', async () => {
            const res = await request(app)
                .post('/organizations')
                .set('Cookie', authCookie)
                .send(testOrg);

            expect(res.statusCode).toEqual(201);
            expect(res.body.message).toEqual('Organization created successfully');
            expect(res.body.organization.name).toEqual(testOrg.name);
            expect(res.body.organization.slug).toBeDefined();

            // Verify user is member and owner
            const user = await User.findOne({ where: { email: testUser.email } });
            const member = await OrganizationMember.findOne({ where: { user_id: user?.id } });
            expect(member).toBeDefined();

            const role = await Role.findByPk(member?.role_id);
            expect(role?.name).toEqual('Owner');
        });

        it('should allow user to create multiple organizations', async () => {
            // Create first org
            await request(app)
                .post('/organizations')
                .set('Cookie', authCookie)
                .send(testOrg);

            // Create second org
            const res = await request(app)
                .post('/organizations')
                .set('Cookie', authCookie)
                .send({ name: 'Another Corp' });

            expect(res.statusCode).toEqual(201);
            expect(res.body.organization.name).toEqual('Another Corp');

            // Verify memberships count
            const user = await User.findOne({ where: { email: testUser.email } });
            const members = await OrganizationMember.findAll({ where: { user_id: user?.id } });
            expect(members.length).toEqual(2);
        });

        it('should allow creating an organization with the same slug as a deleted one', async () => {
            // 1. Create org
            const res1 = await request(app)
                .post('/organizations')
                .set('Cookie', authCookie)
                .send(testOrg);
            expect(res1.statusCode).toEqual(201);
            const orgId = res1.body.organization.id;

            // 2. Delete org
            await request(app)
                .delete('/organizations')
                .set('Cookie', authCookie)
                .set('x-organization-id', orgId);

            // 3. Create same org again
            const res2 = await request(app)
                .post('/organizations')
                .set('Cookie', authCookie)
                .send(testOrg);

            expect(res2.statusCode).toEqual(201);
            expect(res2.body.organization.slug).toEqual(res1.body.organization.slug); // Same slug
            expect(res2.body.organization.id).not.toEqual(orgId); // Different ID
        });
    });

    describe('GET /organizations/me', () => {
        it('should return the current user organization', async () => {
            // Create org
            await request(app)
                .post('/organizations')
                .set('Cookie', authCookie)
                .send(testOrg);

            const res = await request(app)
                .get('/organizations/me')
                .set('Cookie', authCookie);

            expect(res.statusCode).toEqual(200);
            expect(res.body.organization.name).toEqual(testOrg.name);
            expect(res.body.role.name).toEqual('Owner');
        });

        it('should return null if user is not in an organization', async () => {
            const res = await request(app)
                .get('/organizations/me')
                .set('Cookie', authCookie);

            expect(res.statusCode).toEqual(200);
            expect(res.body.organization).toBeNull();
        });
    });

    describe('PUT /organizations', () => {
        it('should update organization name and website', async () => {
            // Create org
            const orgRes = await request(app)
                .post('/organizations')
                .set('Cookie', authCookie)
                .send(testOrg);
            const orgId = orgRes.body.organization.id;

            const updatedData = {
                name: 'Updated Corp',
                website: 'https://updated.com'
            };

            const res = await request(app)
                .put('/organizations')
                .set('Cookie', authCookie)
                .set('x-organization-id', orgId)
                .send(updatedData);

            expect(res.statusCode).toEqual(200);
            expect(res.body.message).toEqual('Organization updated successfully');
            expect(res.body.organization.name).toEqual(updatedData.name);
            expect(res.body.organization.website).toEqual(updatedData.website);
        });
    });

    describe('GET /organizations/members', () => {
        it('should list all members of the organization with pagination', async () => {
            // Create org
            const orgRes = await request(app)
                .post('/organizations')
                .set('Cookie', authCookie)
                .send(testOrg);
            const orgId = orgRes.body.organization.id;

            const res = await request(app)
                .get('/organizations/members')
                .set('Cookie', authCookie)
                .set('x-organization-id', orgId);

            expect(res.statusCode).toEqual(200);
            expect(res.body.members).toBeDefined();
            expect(res.body.meta).toBeDefined();
            expect(Array.isArray(res.body.members)).toBe(true);
            expect(res.body.members.length).toBe(1); // Only owner
            expect(res.body.members[0].user.email).toEqual(testUser.email);
            expect(res.body.members[0].role.name).toEqual('Owner');
            expect(res.body.meta.totalItems).toBe(1);
            expect(res.body.meta.currentPage).toBe(1);
        });

        it('should support search by name', async () => {
            // Create org
            const orgRes = await request(app)
                .post('/organizations')
                .set('Cookie', authCookie)
                .send(testOrg);
            const orgId = orgRes.body.organization.id;

            const res = await request(app)
                .get('/organizations/members?search=Org')
                .set('Cookie', authCookie)
                .set('x-organization-id', orgId);

            expect(res.statusCode).toEqual(200);
            expect(res.body.members.length).toBe(1);
            expect(res.body.members[0].user.full_name).toContain('Org');
        });
    });


    describe('DELETE /organizations/members/:memberId', () => {
        let orgId: string;
        let memberCookie: string[];
        let memberId: string;

        beforeEach(async () => {
            // Create org first
            const orgRes = await request(app)
                .post('/organizations')
                .set('Cookie', authCookie)
                .send(testOrg);
            orgId = orgRes.body.organization.id;

            // Create and add another user as Member
            const memberData = {
                email: 'member@example.com',
                password: 'Password123!',
                full_name: 'Test Member'
            };
            const memberReg = await request(app).post('/auth/register').send(memberData);
            memberCookie = memberReg.get('Set-Cookie') || [];

            // Get member role
            const memberRole = await Role.findOne({ where: { name: 'Member' } })
                || await Role.create({ name: 'Member', description: 'Regular Member' });

            // Add member to organization
            const memberUser = await User.findOne({ where: { email: memberData.email } });
            const orgMember = await OrganizationMember.create({
                organization_id: orgId,
                user_id: memberUser!.id,
                role_id: memberRole.id,
                is_active: true
            });
            memberId = orgMember.id;
        });

        it('should remove a member successfully as Owner', async () => {
            const res = await request(app)
                .delete(`/organizations/members/${memberId}`)
                .set('Cookie', authCookie)
                .set('x-organization-id', orgId);

            expect(res.statusCode).toEqual(200);
            expect(res.body.message).toEqual('Member removed successfully');

            // Verify member is removed
            const member = await OrganizationMember.findByPk(memberId);
            expect(member).toBeNull();
        });

        it('should remove member and their associated invitations', async () => {
            // Setup: Create an accepted invitation for the member
            const memberUser = await User.findOne({ where: { email: 'member@example.com' } });

            // Create a dummy accepted invitation
            await Invitation.create({
                organization_id: orgId,
                email: memberUser!.email,
                role_id: (await Role.findOne({ where: { name: 'Member' } }))!.id,
                token: 'some-random-token-for-test',
                invited_by: (await User.findOne({ where: { email: testUser.email } }))!.id,
                status: InvitationStatus.ACCEPTED,
                expires_at: new Date(Date.now() + 86400000) // Tomorrow
            });

            // Action: Remove member
            const res = await request(app)
                .delete(`/organizations/members/${memberId}`)
                .set('Cookie', authCookie)
                .set('x-organization-id', orgId);

            expect(res.statusCode).toEqual(200);

            // Verify invitation is soft-deleted
            const invite = await Invitation.findOne({
                where: {
                    organization_id: orgId,
                    email: memberUser!.email
                }
            });
            expect(invite).toBeNull(); // Should be null because of paranoid: true
        });

        it('should fail to remove member if not Owner/Admin', async () => {
            const res = await request(app)
                .delete(`/organizations/members/${memberId}`)
                .set('Cookie', memberCookie)
                .set('x-organization-id', orgId);

            expect(res.statusCode).toEqual(403);
        });

        it('should fail to remove the Owner', async () => {
            // Get owner membership ID
            const ownerUser = await User.findOne({ where: { email: testUser.email } });
            const ownerMember = await OrganizationMember.findOne({
                where: { user_id: ownerUser!.id, organization_id: orgId }
            });

            const res = await request(app)
                .delete(`/organizations/members/${ownerMember!.id}`)
                .set('Cookie', authCookie)
                .set('x-organization-id', orgId);

            expect(res.statusCode).toEqual(403);
            expect(res.body.message).toContain('Cannot remove the organization owner');
        });
    });

    describe('PATCH /organizations/members/:memberId', () => {
        let orgId: string;
        let memberId: string;
        let adminRoleId: number;

        beforeEach(async () => {
            // Create org
            const orgRes = await request(app)
                .post('/organizations')
                .set('Cookie', authCookie)
                .send(testOrg);
            orgId = orgRes.body.organization.id;

            // Create Admin role
            const adminRole = await Role.findOne({ where: { name: 'Admin' } })
                || await Role.create({ name: 'Admin', description: 'Administrator' });
            adminRoleId = adminRole.id;

            // Create and add member
            const memberData = {
                email: 'member2@example.com',
                password: 'Password123!',
                full_name: 'Test Member 2'
            };
            await request(app).post('/auth/register').send(memberData);

            const memberRole = await Role.findOne({ where: { name: 'Member' } })
                || await Role.create({ name: 'Member', description: 'Regular Member' });

            const memberUser = await User.findOne({ where: { email: memberData.email } });
            const orgMember = await OrganizationMember.create({
                organization_id: orgId,
                user_id: memberUser!.id,
                role_id: memberRole.id,
                is_active: true
            });
            memberId = orgMember.id;
        });

        it('should update member role successfully as Owner', async () => {
            const res = await request(app)
                .patch(`/organizations/members/${memberId}`)
                .set('Cookie', authCookie)
                .set('x-organization-id', orgId)
                .send({ role_id: adminRoleId });

            expect(res.statusCode).toEqual(200);
            expect(res.body.message).toEqual('Member role updated successfully');
            expect(res.body.member.role_name).toEqual('Admin');
        });

        it('should fail with invalid role_id', async () => {
            const res = await request(app)
                .patch(`/organizations/members/${memberId}`)
                .set('Cookie', authCookie)
                .set('x-organization-id', orgId)
                .send({ role_id: 99999 });

            expect(res.statusCode).toEqual(400);
            expect(res.body.message).toEqual('Invalid role');
        });
    });

    describe('POST /organizations/transfer-ownership', () => {
        let orgId: string;
        let newOwnerUserId: string;

        beforeEach(async () => {
            // Create org
            const orgRes = await request(app)
                .post('/organizations')
                .set('Cookie', authCookie)
                .send(testOrg);
            orgId = orgRes.body.organization.id;

            // Create and add new future owner as member
            const newOwnerData = {
                email: 'newowner@example.com',
                password: 'Password123!',
                full_name: 'New Owner'
            };
            await request(app).post('/auth/register').send(newOwnerData);

            const memberRole = await Role.findOne({ where: { name: 'Member' } })
                || await Role.create({ name: 'Member', description: 'Regular Member' });

            const newOwnerUser = await User.findOne({ where: { email: newOwnerData.email } });
            newOwnerUserId = newOwnerUser!.id;
            await OrganizationMember.create({
                organization_id: orgId,
                user_id: newOwnerUserId,
                role_id: memberRole.id,
                is_active: true
            });

            // Ensure Admin role exists (required for transfer ownership)
            await Role.findOrCreate({
                where: { name: 'Admin' },
                defaults: { name: 'Admin', description: 'Administrator' }
            });
        });

        it('should transfer ownership successfully', async () => {
            const res = await request(app)
                .post('/organizations/transfer-ownership')
                .set('Cookie', authCookie)
                .set('x-organization-id', orgId)
                .send({ new_owner_id: newOwnerUserId });

            expect(res.statusCode).toEqual(200);
            expect(res.body.message).toEqual('Ownership transferred successfully');

            // Verify roles swapped
            const ownerUser = await User.findOne({ where: { email: testUser.email } });
            const oldOwnerMember = await OrganizationMember.findOne({
                where: { user_id: ownerUser!.id, organization_id: orgId },
                include: [{ model: Role, as: 'role' }]
            });
            expect(oldOwnerMember?.role?.name).toEqual('Admin');

            const newOwnerMember = await OrganizationMember.findOne({
                where: { user_id: newOwnerUserId, organization_id: orgId },
                include: [{ model: Role, as: 'role' }]
            });
            expect(newOwnerMember?.role?.name).toEqual('Owner');
        });

        it('should fail if new owner is not a member', async () => {
            const res = await request(app)
                .post('/organizations/transfer-ownership')
                .set('Cookie', authCookie)
                .set('x-organization-id', orgId)
                .send({ new_owner_id: '00000000-0000-0000-0000-000000000000' });

            expect(res.statusCode).toEqual(404);
            expect(res.body.message).toContain('existing member');
        });
    });

    describe('DELETE /organizations', () => {
        let orgId: string;
        let memberCookie: string[];

        beforeEach(async () => {
            // Create org
            const orgRes = await request(app)
                .post('/organizations')
                .set('Cookie', authCookie)
                .send(testOrg);
            orgId = orgRes.body.organization.id;

            // Create member
            const memberData = {
                email: 'member3@example.com',
                password: 'Password123!',
                full_name: 'Test Member 3'
            };
            const memberReg = await request(app).post('/auth/register').send(memberData);
            memberCookie = memberReg.get('Set-Cookie') || [];
        });

        it('should delete organization successfully as Owner', async () => {
            const res = await request(app)
                .delete('/organizations')
                .set('Cookie', authCookie)
                .set('x-organization-id', orgId);

            expect(res.statusCode).toEqual(200);
            expect(res.body.message).toEqual('Organization deleted successfully');

            // Verify org is deleted (soft delete)
            const org = await Organization.findByPk(orgId);
            expect(org).toBeNull(); // paranoid mode hides soft-deleted
        });

        it('should fail to delete organization if not Owner', async () => {
            // Add member to org first
            const memberRole = await Role.findOne({ where: { name: 'Member' } })
                || await Role.create({ name: 'Member', description: 'Regular Member' });
            const memberUser = await User.findOne({ where: { email: 'member3@example.com' } });
            await OrganizationMember.create({
                organization_id: orgId,
                user_id: memberUser!.id,
                role_id: memberRole.id,
                is_active: true
            });

            const res = await request(app)
                .delete('/organizations')
                .set('Cookie', memberCookie)
                .set('x-organization-id', orgId);

            expect(res.statusCode).toEqual(403);
            expect(res.body.message).toContain('permissions');
        });
    });
});
