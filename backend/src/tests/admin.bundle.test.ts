
import request from 'supertest';
import app from '../app';
import sequelize from '../config/db';
import redisClient from '../config/redis';
import User from '../models/user';

import { Bundle } from '../models/bundle';
import { Plan } from '../models/plan';
import { Tool } from '../models/tool';
import { PriceInterval, TierType } from '../models/enums';
import path from 'path';
import dotenv from 'dotenv';
import { v4 as uuidv4 } from 'uuid';

dotenv.config({ path: path.join(__dirname, '../../.env') });

describe('Admin Bundle Management', () => {
    let adminUser: User;
    let normalUser: User;
    let adminSession: string;
    let normalSession: string;
    let testTool: Tool;
    let testPlan: Plan;

    beforeAll(async () => {
        await sequelize.sync({ force: true });
        if (!redisClient.isOpen) {
            await redisClient.connect();
        }

        // Create Admin User
        adminUser = await User.create({
            email: 'admin@example.com',
            full_name: 'Admin User',
            is_superuser: true
        });

        // Create Normal User
        normalUser = await User.create({
            email: 'user@example.com',
            full_name: 'Normal User',
            is_superuser: false
        });

        // Create Test Tool and Plan for association tests
        testTool = await Tool.create({
            name: 'Test Tool',
            slug: 'test-tool',
            description: 'Test Tool Description',
            tool_link: 'http://example.com'
        });

        testPlan = await Plan.create({
            name: 'Test Plan',
            tool_id: testTool.id,
            tier: TierType.BASIC,
            price: 1000,
            currency: 'USD',
            interval: PriceInterval.MONTHLY,
            active: true
        });

        // Mock Login / Session creation
        adminSession = 'admin-session-id';
        await redisClient.set(`session:${adminSession}`, JSON.stringify(adminUser));

        normalSession = 'normal-session-id';
        await redisClient.set(`session:${normalSession}`, JSON.stringify(normalUser));
    });

    afterAll(async () => {
        await sequelize.close();
        if (redisClient.isOpen) {
            await redisClient.quit();
        }
    });

    describe('Bundle Groups', () => {
        let groupId: string;

        it('should create a bundle group', async () => {
            const res = await request(app)
                .post('/admin/bundle-groups')
                .set('Cookie', [`session_id=${adminSession}`])
                .send({
                    name: 'Test Group',
                    slug: 'test-group',
                    description: 'Test Description',
                    active: true
                });

            expect(res.status).toBe(201);
            expect(res.body.name).toBe('Test Group');
            groupId = res.body.id;
        });

        it('should get bundle groups', async () => {
            const res = await request(app)
                .get('/admin/bundle-groups')
                .set('Cookie', [`session_id=${adminSession}`]);

            expect(res.status).toBe(200);
            expect(Array.isArray(res.body)).toBe(true);
            expect(res.body.length).toBeGreaterThan(0);
        });

        it('should update a bundle group', async () => {
            const res = await request(app)
                .put(`/admin/bundle-groups/${groupId}`)
                .set('Cookie', [`session_id=${adminSession}`])
                .send({
                    name: 'Updated Group',
                    description: 'Updated Description'
                });

            expect(res.status).toBe(200);
            expect(res.body.name).toBe('Updated Group');
        });
        
        // We'll delete strictly at the end or use force:true in beforeAll
    });

    describe('Bundles', () => {
        let bundleId: string;
        const bundleSlug = `test-bundle-${uuidv4()}`;

        it('should create a bundle', async () => {
            const res = await request(app)
                .post('/admin/bundles')
                .set('Cookie', [`session_id=${adminSession}`])
                .send({
                    name: 'Test Bundle',
                    slug: bundleSlug,
                    price: 2000,
                    currency: 'USD',
                    interval: PriceInterval.YEARLY,
                    description: 'Test Bundle Desc',
                    active: true
                });

            expect(res.status).toBe(201);
            expect(res.body.name).toBe('Test Bundle');
            bundleId = res.body.id;
        });

        it('should create a bundle in a bundle group', async () => {
             // 1. Create Group
             const groupRes = await request(app)
                .post('/admin/bundle-groups')
                .set('Cookie', [`session_id=${adminSession}`])
                .send({
                    name: 'Group 1',
                    slug: `group-1-${uuidv4()}`,
                    active: true
                });
             expect(groupRes.status).toBe(201);
             const groupId = groupRes.body.id;

             // 2. Create Bundle in Group
             const bundleRes = await request(app)
                .post('/admin/bundles')
                .set('Cookie', [`session_id=${adminSession}`])
                .send({
                    name: 'Bundle Inside Group',
                    slug: `bundle-in-group-${uuidv4()}`,
                    price: 3000,
                    currency: 'USD',
                    interval: PriceInterval.MONTHLY,
                    bundle_group_id: groupId,
                    tier_label: 'Pro Tier'
                });
            
            expect(bundleRes.status).toBe(201);
            expect(bundleRes.body.bundle_group_id).toBe(groupId);
            // This implicitly tests that the controller logic for fetching group and creating product didn't throw
        });

        it('should get bundles (paginated)', async () => {
            const res = await request(app)
                .get('/admin/bundles?page=1&limit=10')
                .set('Cookie', [`session_id=${adminSession}`]);

            expect(res.status).toBe(200);
            expect(res.body.bundles).toBeDefined();
            expect(res.body.bundles.length).toBeGreaterThan(0);
        });

        it('should get bundle by id', async () => {
             const res = await request(app)
                .get(`/admin/bundles/${bundleId}`)
                .set('Cookie', [`session_id=${adminSession}`]);

            expect(res.status).toBe(200);
            expect(res.body.id).toBe(bundleId);
        });

        it('should update a bundle', async () => {
            const res = await request(app)
                .put(`/admin/bundles/${bundleId}`)
                .set('Cookie', [`session_id=${adminSession}`])
                .send({
                    price: 2500
                });

            expect(res.status).toBe(200);
            expect(res.body.price).toBe(2500);
        });

        it('should add plan to bundle', async () => {
            const res = await request(app)
                .post(`/admin/bundles/${bundleId}/plans`)
                .set('Cookie', [`session_id=${adminSession}`])
                .send({
                    plan_id: testPlan.id
                });
            
            expect(res.status).toBe(200);
            expect(res.body.message).toContain('added to bundle');
        });

        it('should remove plan from bundle', async () => {
             const res = await request(app)
                .delete(`/admin/bundles/${bundleId}/plans/${testPlan.id}`)
                .set('Cookie', [`session_id=${adminSession}`]);

            expect(res.status).toBe(200);
            expect(res.body.message).toContain('removed from bundle');
        });

        it('should delete a bundle', async () => {
            const bundleToDelete = await Bundle.create({
                name: 'Delete Me',
                slug: `delete-me-${uuidv4()}`,
                price: 100,
                currency: 'USD',
                interval: PriceInterval.MONTHLY,
                active: true
            });

            const res = await request(app)
                .delete(`/admin/bundles/${bundleToDelete.id}`)
                .set('Cookie', [`session_id=${adminSession}`]);

            expect(res.status).toBe(200);
            
            const check = await Bundle.findByPk(bundleToDelete.id);
            expect(check).toBeNull();
        });
    });
});
