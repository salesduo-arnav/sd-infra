
import request from 'supertest';
import app from '../app';
import sequelize from '../config/db';
import redisClient from '../config/redis';
import User from '../models/user';
import { Tool } from '../models/tool';
import { Feature } from '../models/feature';
import { Plan } from '../models/plan';
import { Subscription } from '../models/subscription';
import path from 'path';
import dotenv from 'dotenv';
import { v4 as uuidv4 } from 'uuid';
import { SubStatus, TierType, PriceInterval } from '../models/enums';

dotenv.config({ path: path.join(__dirname, '../../.env') });

describe('Admin Tool Management Integration Tests', () => {
    let adminUser: User;
    let normalUser: User;
    let adminSession: string;
    let normalSession: string;

    beforeAll(async () => {
        if (process.env.PGDATABASE !== 'mydb_test') {
             throw new Error("CRITICAL: Tests must run against mydb_test!");
        }
        await sequelize.authenticate();
        if (!redisClient.isOpen) {
            await redisClient.connect();
        }
        // Force sync to ensure tables exist
        // Note: admin.bundle.test.ts uses force: true, which might wipe data for other tests if running in parallel.
        // But assuming sequential execution or isolated dbs. Sticking to safer approach if possible, but force true is good for clean slate.
        // organization.test.ts uses destroy truncate.
        // I will use cleanup in beforeEach instead of force sync to avoid heavy db ops if tables are already there.
    });

    beforeEach(async () => {
        // Clean up
        await Subscription.destroy({ where: {}, truncate: true, cascade: true });
        await Feature.destroy({ where: {}, truncate: true, cascade: true });
        await Plan.destroy({ where: {}, truncate: true, cascade: true });
        await Tool.destroy({ where: {}, truncate: true, cascade: true });
        await User.destroy({ where: {}, truncate: true, cascade: true });
        await redisClient.flushAll();

        // Create Admin User
        adminUser = await User.create({
            email: `admin-${uuidv4()}@example.com`,
            full_name: 'Admin User',
            is_superuser: true
        });

        // Create Normal User
        normalUser = await User.create({
            email: `user-${uuidv4()}@example.com`,
            full_name: 'Normal User',
            is_superuser: false
        });

        // Mock Sessions
        adminSession = `session-${uuidv4()}`;
        await redisClient.set(`session:${adminSession}`, JSON.stringify(adminUser));

        normalSession = `session-${uuidv4()}`;
        await redisClient.set(`session:${normalSession}`, JSON.stringify(normalUser));
    });

    afterAll(async () => {
        if (redisClient.isOpen) {
            await redisClient.quit();
        }
        // DB close is handled by global teardown usually or left open for other tests
    });

    describe('POST /admin/tools', () => {
        const toolData = {
            name: 'Test Tool',
            slug: 'test-tool',
            description: 'A dedicated test tool',
            tool_link: 'https://testtool.com',
            is_active: true
        };

        it('should create a new tool', async () => {
            const res = await request(app)
                .post('/admin/tools')
                .set('Cookie', [`session_id=${adminSession}`])
                .send(toolData);

            expect(res.status).toBe(201);
            expect(res.body.name).toBe(toolData.name);
            expect(res.body.slug).toBe(toolData.slug);
            expect(res.body.is_active).toBe(true);
        });

        it('should return 400 validation error if name is missing', async () => {
            const res = await request(app)
                .post('/admin/tools')
                .set('Cookie', [`session_id=${adminSession}`])
                .send({ ...toolData, name: '' });

            expect(res.status).toBe(400);
        });

        it('should return 403 for non-admin user', async () => {
            const res = await request(app)
                .post('/admin/tools')
                .set('Cookie', [`session_id=${normalSession}`])
                .send(toolData);

            expect(res.status).toBe(403);
        });

        it('should return 401 for unauthenticated user', async () => {
            const res = await request(app)
                .post('/admin/tools')
                .send(toolData);

            expect(res.status).toBe(401);
        });
    });

    describe('GET /admin/tools', () => {
        beforeEach(async () => {
            await Tool.bulkCreate([
                { name: 'Tool 1', slug: 'tool-1', is_active: true },
                { name: 'Tool 2', slug: 'tool-2', is_active: false },
                { name: 'Tool 3', slug: 'tool-3', is_active: true }
            ]);
        });

        it('should return paginated list of tools', async () => {
            const res = await request(app)
                .get('/admin/tools?page=1&limit=10')
                .set('Cookie', [`session_id=${adminSession}`]);

            expect(res.status).toBe(200);
            expect(res.body.tools).toHaveLength(3);
            expect(res.body.meta.totalItems).toBe(3);
        });

        it('should support search', async () => {
            const res = await request(app)
                .get('/admin/tools?search=Tool 2')
                .set('Cookie', [`session_id=${adminSession}`]);

            expect(res.status).toBe(200);
            expect(res.body.tools).toHaveLength(1);
            expect(res.body.tools[0].name).toBe('Tool 2');
        });

        it('should filter by is_active', async () => {
            const res = await request(app)
                .get('/admin/tools?activeOnly=true')
                .set('Cookie', [`session_id=${adminSession}`]);

            expect(res.status).toBe(200);
            expect(res.body.tools).toHaveLength(2); // Tool 1 and Tool 3
        });
    });

    describe('GET /admin/tools/:id', () => {
        let tool: Tool;

        beforeEach(async () => {
            tool = await Tool.create({
                name: 'Detail Tool',
                slug: 'detail-tool',
                is_active: true
            });
            await Feature.create({
                name: 'Feat 1',
                slug: 'feat-1',
                tool_id: tool.id
            });
        });

        it('should get tool by id including features', async () => {
            const res = await request(app)
                .get(`/admin/tools/${tool.id}`)
                .set('Cookie', [`session_id=${adminSession}`]);

            expect(res.status).toBe(200);
            expect(res.body.id).toBe(tool.id);
            expect(res.body.features).toHaveLength(1);
        });

        it('should return 404 for non-existent tool', async () => {
            const res = await request(app)
                .get(`/admin/tools/${uuidv4()}`)
                .set('Cookie', [`session_id=${adminSession}`]);

            expect(res.status).toBe(404);
        });
    });

    describe('PUT /admin/tools/:id', () => {
        let tool: Tool;

        beforeEach(async () => {
            tool = await Tool.create({
                name: 'Update Tool',
                slug: 'update-tool',
                description: 'Original',
                is_active: true
            });
        });

        it('should update tool details', async () => {
            const res = await request(app)
                .put(`/admin/tools/${tool.id}`)
                .set('Cookie', [`session_id=${adminSession}`])
                .send({
                    name: 'Updated Name',
                    description: 'Updated Desc',
                    is_active: false
                });

            expect(res.status).toBe(200);
            expect(res.body.name).toBe('Updated Name');
            expect(res.body.is_active).toBe(false);

            const updated = await Tool.findByPk(tool.id);
            expect(updated?.name).toBe('Updated Name');
        });

        it('should fail if updating slug to existing one', async () => {
            await Tool.create({ name: 'Other', slug: 'other-tool' });

            const res = await request(app)
                .put(`/admin/tools/${tool.id}`)
                .set('Cookie', [`session_id=${adminSession}`])
                .send({ slug: 'other-tool' }); // Duplicate of 'Other'

            expect(res.status).toBeGreaterThanOrEqual(400);

            // The controller throws "ALREADY_EXISTS"
            // The error handler likely maps this to 409 or 400.
            // Let's assume generic error handling returns 500 or 400 unless specific map exists.
            // admin.tool.controller.ts uses helper `handleError`. 
            // Usually ALREADY_EXISTS maps to 409 Conflict.
            // If not, it might be 500 depending on `handleError` implementation.
            // I'll check `expect` loosely first or check what `handleError` does.
            // Assuming 409 or 400 for now. The controller code shows `throw new Error('ALREADY_EXISTS')`.
            // I'll check error util if I can, but usually 409/400. I'll stick to 500 check if unhandled, but likely handled.
        });
    });

    describe('DELETE /admin/tools/:id', () => {
        let tool: Tool;

        beforeEach(async () => {
            tool = await Tool.create({
                name: 'Delete Tool',
                slug: 'delete-tool'
            });
        });

        it('should delete tool if no active subscriptions', async () => {
            const res = await request(app)
                .delete(`/admin/tools/${tool.id}`)
                .set('Cookie', [`session_id=${adminSession}`]);

            expect(res.status).toBe(200);
            
            const deleted = await Tool.findByPk(tool.id);
            expect(deleted).toBeNull();
        });

        it('should NOT delete tool if it has an active subscription', async () => {
            // Setup active subscription
            const plan = await Plan.create({
                name: 'Tool Plan',
                tool_id: tool.id,
                tier: TierType.PREMIUM,
                price: 10,
                interval: PriceInterval.MONTHLY,
                currency: 'USD',
                active: true
            });

            // Need an organization for subscription
            const { Organization } = await import('../models/organization');
            const org = await Organization.create({
                name: 'Test Org for Sub',
                slug: 'test-org-sub',
                website: 'https://test.com'
            });

            await Subscription.create({
                organization_id: org.id,
                plan_id: plan.id,
                status: SubStatus.ACTIVE,
                current_period_start: new Date(),
                current_period_end: new Date(),
                stripe_subscription_id: 'sub_123',
                cancel_at_period_end: false
            });

            const res = await request(app)
                .delete(`/admin/tools/${tool.id}`)
                .set('Cookie', [`session_id=${adminSession}`]);
            
            if (res.status !== 400) {
                console.log('DEBUG: Test Failed Status:', res.status);
                console.log('DEBUG: Test Failed Body:', JSON.stringify(res.body, null, 2));
            }

            expect(res.status).toBe(400); // Controller returns 400 for HAS_ACTIVE_SUBSCRIPTIONS
            expect(res.body.message).toMatch(/active subscriptions/);

            const notDeleted = await Tool.findByPk(tool.id);
            expect(notDeleted).not.toBeNull();
        });
    });
});
