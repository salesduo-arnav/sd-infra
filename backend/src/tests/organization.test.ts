import request from 'supertest';
import app from '../app';
import sequelize, { closeDB } from '../config/db';
import redisClient from '../config/redis';
import User from '../models/user';
import { Organization, OrganizationMember } from '../models/organization';
import { Role } from '../models/role';

import { Invitation } from '../models/invitation';

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
        await Invitation.destroy({ where: {}, truncate: true, cascade: true, force: true });
        await OrganizationMember.destroy({ where: {}, truncate: true, cascade: true, force: true });
        await Organization.destroy({ where: {}, truncate: true, cascade: true, force: true });
        await User.destroy({ where: {}, truncate: true, cascade: true, force: true });
        await Role.destroy({ where: {}, truncate: true, cascade: true, force: true });
        await redisClient.flushAll();

        // Register and Login to get cookie
        const res = await request(app).post('/auth/register').send(testUser);
        authCookie = res.get('Set-Cookie') || [];
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
            await request(app)
                .post('/organizations')
                .set('Cookie', authCookie)
                .send(testOrg);

            const updatedData = {
                name: 'Updated Corp',
                website: 'https://updated.com'
            };

            const res = await request(app)
                .put('/organizations')
                .set('Cookie', authCookie)
                .send(updatedData);

            expect(res.statusCode).toEqual(200);
            expect(res.body.message).toEqual('Organization updated successfully');
            expect(res.body.organization.name).toEqual(updatedData.name);
            expect(res.body.organization.website).toEqual(updatedData.website);
        });
    });

    describe('GET /organizations/members', () => {
        it('should list all members of the organization', async () => {
            // Create org
            await request(app)
                .post('/organizations')
                .set('Cookie', authCookie)
                .send(testOrg);

            const res = await request(app)
                .get('/organizations/members')
                .set('Cookie', authCookie);

            expect(res.statusCode).toEqual(200);
            expect(Array.isArray(res.body)).toBe(true);
            expect(res.body.length).toBe(1); // Only owner
            expect(res.body[0].user.email).toEqual(testUser.email);
            expect(res.body[0].role.name).toEqual('Owner');
        });
    });
});
