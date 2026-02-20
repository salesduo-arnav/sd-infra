import request from 'supertest';
import app from '../app';
import { Organization, OrganizationMember } from '../models/organization';
import { OrgStatus } from '../models/enums';
import { Invitation } from '../models/invitation';
import { Role } from '../models/role';
import User from '../models/user';
import sequelize from '../config/db';
import redisClient from '../config/redis';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: path.join(__dirname, '../../.env') });

describe('Admin Organization Management', () => {
    let adminUser: User;
    let regularUser: User;
    let adminSession: string;
    let regularSession: string;
    let testRole: Role;

    beforeAll(async () => {
        await sequelize.sync({ force: true });
        if (!redisClient.isOpen) {
            await redisClient.connect();
        }

        // Create Role
        testRole = await Role.create({
            name: 'admin',
        });

        // Create Admin User
        adminUser = await User.create({
            email: 'admin@example.com',
            full_name: 'Admin User',
            is_superuser: true
        });

        // Create Regular User
        regularUser = await User.create({
            email: 'user@example.com',
            full_name: 'Regular User',
            is_superuser: false
        });

        // Create some organizations
        await Organization.bulkCreate([
            { name: 'Org A', slug: 'org-a', status: OrgStatus.ACTIVE },
            { name: 'Org B', slug: 'org-b', status: OrgStatus.SUSPENDED },
            { name: 'Test Org', slug: 'test-org', status: OrgStatus.ACTIVE }
        ]);

        // Mock Login / Session creation
        adminSession = 'admin-session-id-org-test';
        await redisClient.set(`session:${adminSession}`, JSON.stringify(adminUser));

        regularSession = 'regular-session-id-org-test';
        await redisClient.set(`session:${regularSession}`, JSON.stringify(regularUser));
    });

    afterAll(async () => {
        await sequelize.close();
        if (redisClient.isOpen) {
            await redisClient.quit();
        }
    });

    describe('GET /admin/organizations', () => {
        it('should deny access to regular users', async () => {
            const res = await request(app)
                .get('/admin/organizations')
                .set('Cookie', [`session_id=${regularSession}`]);

            expect(res.status).toBe(403);
        });

        it('should allow access to admin users', async () => {
            const res = await request(app)
                .get('/admin/organizations')
                .set('Cookie', [`session_id=${adminSession}`]);

            expect(res.status).toBe(200);
            expect(res.body.organizations).toBeDefined();
            expect(res.body.organizations.length).toBe(3);
        });

        it('should return paginated results', async () => {
            const res = await request(app)
                .get('/admin/organizations?limit=2&page=1')
                .set('Cookie', [`session_id=${adminSession}`]);

            expect(res.status).toBe(200);
            expect(res.body.organizations.length).toBe(2);
            expect(res.body.meta.totalPages).toBeGreaterThan(1);
        });

        it('should filter organizations by search term', async () => {
            const res = await request(app)
                .get('/admin/organizations?search=Org A')
                .set('Cookie', [`session_id=${adminSession}`]);

            expect(res.status).toBe(200);
            expect(res.body.organizations.length).toBe(1);
            expect(res.body.organizations[0].name).toBe('Org A');
        });
    });

    describe('PATCH /admin/organizations/:id', () => {
        it('should update organization status', async () => {
            const org = await Organization.findOne({ where: { slug: 'org-a' } });

            const res = await request(app)
                .patch(`/admin/organizations/${org!.id}`)
                .set('Cookie', [`session_id=${adminSession}`])
                .send({ status: OrgStatus.SUSPENDED });

            expect(res.status).toBe(200);
            expect(res.body.organization.status).toBe(OrgStatus.SUSPENDED);

            const updatedOrg = await Organization.findByPk(org!.id);
            expect(updatedOrg?.status).toBe(OrgStatus.SUSPENDED);
        });
    });

    describe('DELETE /admin/organizations/:id', () => {
        it('should delete organization and related data', async () => {
            const org = await Organization.create({
                name: 'Delete Me',
                slug: 'delete-me',
                status: OrgStatus.ACTIVE
            });

            // Create related data (Member)
            const member = await OrganizationMember.create({
                organization_id: org.id,
                user_id: regularUser.id,
                role_id: testRole.id
            });

            const invite = await Invitation.create({
                organization_id: org.id,
                email: 'invite@example.com',
                role_id: testRole.id,
                token: 'some-token-delete',
                invited_by: adminUser.id,
                status: 'pending',
                expires_at: new Date()
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
            } as any);

            const res = await request(app)
                .delete(`/admin/organizations/${org.id}`)
                .set('Cookie', [`session_id=${adminSession}`]);

            expect(res.status).toBe(200);

            // Verify logic
            const deletedOrg = await Organization.findByPk(org.id);
            expect(deletedOrg).toBeNull();

            const deletedMember = await OrganizationMember.findByPk(member.id);
            expect(deletedMember).toBeNull();

            const deletedInvite = await Invitation.findByPk(invite.id);
            expect(deletedInvite).toBeNull();
        });
    });
});
