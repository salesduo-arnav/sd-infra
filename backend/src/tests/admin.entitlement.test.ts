
import request from 'supertest';
import app from '../app';
import sequelize from '../config/db';
import redisClient from '../config/redis';
import User from '../models/user';
import { Tool } from '../models/tool';
import { Feature } from '../models/feature';
import { Organization } from '../models/organization';
import { OrganizationEntitlement } from '../models/organization_entitlement';
import { FeatureResetPeriod } from '../models/enums';
import path from 'path';
import dotenv from 'dotenv';
import { v4 as uuidv4 } from 'uuid';

dotenv.config({ path: path.join(__dirname, '../../.env') });

describe('Admin Entitlement Management Integration Tests', () => {
    let adminUser: User;
    let normalUser: User;
    let adminSession: string;
    let normalSession: string;

    // Shared fixtures
    let org1: Organization;
    let org2: Organization;
    let tool1: Tool;
    let tool2: Tool;
    let feature1: Feature;
    let feature2: Feature;
    let feature3: Feature;

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
        // Clean up in dependency order
        await OrganizationEntitlement.destroy({ where: {}, truncate: true, cascade: true });
        await Feature.destroy({ where: {}, truncate: true, cascade: true });
        await Tool.destroy({ where: {}, truncate: true, cascade: true });
        await Organization.destroy({ where: {}, truncate: true, cascade: true });
        await User.destroy({ where: {}, truncate: true, cascade: true });
        await redisClient.flushDb();

        // Create Users
        adminUser = await User.create({
            email: `admin-${uuidv4()}@example.com`,
            full_name: 'Admin User',
            is_superuser: true
        });

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

        // Create Organizations
        org1 = await Organization.create({ name: 'Acme Corp', slug: 'acme-corp' });
        org2 = await Organization.create({ name: 'Beta LLC', slug: 'beta-llc' });

        // Create Tools
        tool1 = await Tool.create({ name: 'Image Generator', slug: 'image-gen', trial_days: 0 });
        tool2 = await Tool.create({ name: 'Listing Optimizer', slug: 'listing-opt', trial_days: 0 });

        // Create Features
        feature1 = await Feature.create({ name: 'Image Generation Count', slug: 'img_gen_count', tool_id: tool1.id });
        feature2 = await Feature.create({ name: 'HD Export', slug: 'hd_export', tool_id: tool1.id });
        feature3 = await Feature.create({ name: 'Listing Rewrites', slug: 'listing_rewrites', tool_id: tool2.id });

        // Create Entitlements
        await OrganizationEntitlement.bulkCreate([
            {
                organization_id: org1.id,
                tool_id: tool1.id,
                feature_id: feature1.id,
                limit_amount: 100,
                usage_amount: 45,
                reset_period: FeatureResetPeriod.MONTHLY,
            },
            {
                organization_id: org1.id,
                tool_id: tool1.id,
                feature_id: feature2.id,
                limit_amount: 50,
                usage_amount: 50,
                reset_period: FeatureResetPeriod.MONTHLY,
            },
            {
                organization_id: org1.id,
                tool_id: tool2.id,
                feature_id: feature3.id,
                limit_amount: 200,
                usage_amount: 10,
                reset_period: FeatureResetPeriod.YEARLY,
            },
            {
                organization_id: org2.id,
                tool_id: tool1.id,
                feature_id: feature1.id,
                limit_amount: 500,
                usage_amount: 0,
                reset_period: FeatureResetPeriod.NEVER,
            },
            {
                organization_id: org2.id,
                tool_id: tool2.id,
                feature_id: feature3.id,
                limit_amount: undefined,
                usage_amount: 25,
                reset_period: FeatureResetPeriod.NEVER,
            },
        ]);
    });

    afterAll(async () => {
        if (redisClient.isOpen) {
            await redisClient.quit();
        }
    });

    // ==================
    // Authentication & Authorization
    // ==================
    describe('Authentication & Authorization', () => {
        it('should return 401 for unauthenticated requests', async () => {
            const res = await request(app).get('/admin/entitlements');
            expect(res.status).toBe(401);
        });

        it('should return 403 for non-admin users', async () => {
            const res = await request(app)
                .get('/admin/entitlements')
                .set('Cookie', [`session_id=${normalSession}`]);
            expect(res.status).toBe(403);
        });

        it('should return 403 for non-admin PUT requests', async () => {
            const entitlement = await OrganizationEntitlement.findOne();
            const res = await request(app)
                .put(`/admin/entitlements/${entitlement!.id}`)
                .set('Cookie', [`session_id=${normalSession}`])
                .send({ limit_amount: 999 });
            expect(res.status).toBe(403);
        });
    });

    // ==================
    // GET /admin/entitlements
    // ==================
    describe('GET /admin/entitlements', () => {
        it('should return paginated list of entitlements with associations', async () => {
            const res = await request(app)
                .get('/admin/entitlements?page=1&limit=10')
                .set('Cookie', [`session_id=${adminSession}`]);

            expect(res.status).toBe(200);
            expect(res.body.entitlements).toHaveLength(5);
            expect(res.body.meta).toBeDefined();
            expect(res.body.meta.totalItems).toBe(5);
            expect(res.body.meta.currentPage).toBe(1);

            // Verify associations are included
            const first = res.body.entitlements[0];
            expect(first.organization).toBeDefined();
            expect(first.organization.name).toBeDefined();
            expect(first.tool).toBeDefined();
            expect(first.tool.name).toBeDefined();
            expect(first.feature).toBeDefined();
            expect(first.feature.name).toBeDefined();
        });

        it('should respect pagination limits', async () => {
            const res = await request(app)
                .get('/admin/entitlements?page=1&limit=2')
                .set('Cookie', [`session_id=${adminSession}`]);

            expect(res.status).toBe(200);
            expect(res.body.entitlements).toHaveLength(2);
            expect(res.body.meta.totalItems).toBe(5);
            expect(res.body.meta.totalPages).toBe(3);
        });

        it('should return correct second page', async () => {
            const res = await request(app)
                .get('/admin/entitlements?page=2&limit=2')
                .set('Cookie', [`session_id=${adminSession}`]);

            expect(res.status).toBe(200);
            expect(res.body.entitlements).toHaveLength(2);
            expect(res.body.meta.currentPage).toBe(2);
        });

        // Filtering
        it('should filter by organization_id', async () => {
            const res = await request(app)
                .get(`/admin/entitlements?organization_id=${org1.id}`)
                .set('Cookie', [`session_id=${adminSession}`]);

            expect(res.status).toBe(200);
            expect(res.body.entitlements).toHaveLength(3);
            res.body.entitlements.forEach((e: OrganizationEntitlement) => {
                expect(e.organization_id).toBe(org1.id);
            });
        });

        it('should filter by tool_id', async () => {
            const res = await request(app)
                .get(`/admin/entitlements?tool_id=${tool1.id}`)
                .set('Cookie', [`session_id=${adminSession}`]);

            expect(res.status).toBe(200);
            expect(res.body.entitlements).toHaveLength(3); // org1: feature1 + feature2; org2: feature1
            res.body.entitlements.forEach((e: OrganizationEntitlement) => {
                expect(e.tool_id).toBe(tool1.id);
            });
        });

        it('should filter by feature_id', async () => {
            const res = await request(app)
                .get(`/admin/entitlements?feature_id=${feature3.id}`)
                .set('Cookie', [`session_id=${adminSession}`]);

            expect(res.status).toBe(200);
            expect(res.body.entitlements).toHaveLength(2); // org1 + org2
            res.body.entitlements.forEach((e: OrganizationEntitlement) => {
                expect(e.feature_id).toBe(feature3.id);
            });
        });

        it('should combine multiple filters (org + tool)', async () => {
            const res = await request(app)
                .get(`/admin/entitlements?organization_id=${org1.id}&tool_id=${tool1.id}`)
                .set('Cookie', [`session_id=${adminSession}`]);

            expect(res.status).toBe(200);
            expect(res.body.entitlements).toHaveLength(2); // feature1 + feature2
            res.body.entitlements.forEach((e: OrganizationEntitlement) => {
                expect(e.organization_id).toBe(org1.id);
                expect(e.tool_id).toBe(tool1.id);
            });
        });

        it('should combine all three filters (org + tool + feature)', async () => {
            const res = await request(app)
                .get(`/admin/entitlements?organization_id=${org1.id}&tool_id=${tool1.id}&feature_id=${feature1.id}`)
                .set('Cookie', [`session_id=${adminSession}`]);

            expect(res.status).toBe(200);
            expect(res.body.entitlements).toHaveLength(1);
            expect(res.body.entitlements[0].organization_id).toBe(org1.id);
            expect(res.body.entitlements[0].tool_id).toBe(tool1.id);
            expect(res.body.entitlements[0].feature_id).toBe(feature1.id);
        });

        // Search
        it('should search by organization name', async () => {
            const res = await request(app)
                .get('/admin/entitlements?search=Acme')
                .set('Cookie', [`session_id=${adminSession}`]);

            expect(res.status).toBe(200);
            expect(res.body.entitlements).toHaveLength(3);
            res.body.entitlements.forEach((e: OrganizationEntitlement) => {
                expect(e.organization?.name).toBe('Acme Corp');
            });
        });

        it('should search by tool name', async () => {
            const res = await request(app)
                .get('/admin/entitlements?search=Listing Optimizer')
                .set('Cookie', [`session_id=${adminSession}`]);

            expect(res.status).toBe(200);
            expect(res.body.entitlements).toHaveLength(2);
            res.body.entitlements.forEach((e: OrganizationEntitlement) => {
                expect(e.tool?.name).toBe('Listing Optimizer');
            });
        });

        it('should search by feature slug', async () => {
            const res = await request(app)
                .get('/admin/entitlements?search=img_gen_count')
                .set('Cookie', [`session_id=${adminSession}`]);

            expect(res.status).toBe(200);
            expect(res.body.entitlements).toHaveLength(2); // org1 + org2 both have this feature
            res.body.entitlements.forEach((e: OrganizationEntitlement) => {
                expect(e.feature?.slug).toBe('img_gen_count');
            });
        });

        it('should return empty array when search matches nothing', async () => {
            const res = await request(app)
                .get('/admin/entitlements?search=nonexistent')
                .set('Cookie', [`session_id=${adminSession}`]);

            expect(res.status).toBe(200);
            expect(res.body.entitlements).toHaveLength(0);
            expect(res.body.meta.totalItems).toBe(0);
        });

        // Sorting
        it('should sort by limit_amount ascending', async () => {
            const res = await request(app)
                .get('/admin/entitlements?sort_by=limit_amount&sort_dir=asc')
                .set('Cookie', [`session_id=${adminSession}`]);

            expect(res.status).toBe(200);
            const limits = res.body.entitlements.map((e: OrganizationEntitlement) => e.limit_amount);
            expect(limits).toEqual([50, 100, 200, 500, null]);
            expect(res.body.entitlements.length).toBe(5);
        });

        it('should sort by usage_amount descending', async () => {
            const res = await request(app)
                .get('/admin/entitlements?sort_by=usage_amount&sort_dir=desc')
                .set('Cookie', [`session_id=${adminSession}`]);

            expect(res.status).toBe(200);
            const usages = res.body.entitlements.map((e: OrganizationEntitlement) => e.usage_amount);
            for (let i = 1; i < usages.length; i++) {
                expect(usages[i]).toBeLessThanOrEqual(usages[i - 1]);
            }
        });
    });

    // ==================
    // PUT /admin/entitlements/:id
    // ==================
    describe('PUT /admin/entitlements/:id', () => {
        it('should update limit_amount', async () => {
            const entitlement = await OrganizationEntitlement.findOne({
                where: { organization_id: org1.id, feature_id: feature1.id }
            });

            const res = await request(app)
                .put(`/admin/entitlements/${entitlement!.id}`)
                .set('Cookie', [`session_id=${adminSession}`])
                .send({ limit_amount: 250 });

            expect(res.status).toBe(200);
            expect(res.body.entitlement.limit_amount).toBe(250);

            // Verify in DB
            const updated = await OrganizationEntitlement.findByPk(entitlement!.id);
            expect(updated?.limit_amount).toBe(250);
        });

        it('should update usage_amount', async () => {
            const entitlement = await OrganizationEntitlement.findOne({
                where: { organization_id: org1.id, feature_id: feature1.id }
            });

            const res = await request(app)
                .put(`/admin/entitlements/${entitlement!.id}`)
                .set('Cookie', [`session_id=${adminSession}`])
                .send({ usage_amount: 0 });

            expect(res.status).toBe(200);
            expect(res.body.entitlement.usage_amount).toBe(0);

            const updated = await OrganizationEntitlement.findByPk(entitlement!.id);
            expect(updated?.usage_amount).toBe(0);
        });

        it('should update reset_period', async () => {
            const entitlement = await OrganizationEntitlement.findOne({
                where: { organization_id: org1.id, feature_id: feature1.id }
            });

            const res = await request(app)
                .put(`/admin/entitlements/${entitlement!.id}`)
                .set('Cookie', [`session_id=${adminSession}`])
                .send({ reset_period: 'yearly' });

            expect(res.status).toBe(200);
            expect(res.body.entitlement.reset_period).toBe('yearly');

            const updated = await OrganizationEntitlement.findByPk(entitlement!.id);
            expect(updated?.reset_period).toBe('yearly');
        });

        it('should update multiple fields at once', async () => {
            const entitlement = await OrganizationEntitlement.findOne({
                where: { organization_id: org2.id, feature_id: feature1.id }
            });

            const res = await request(app)
                .put(`/admin/entitlements/${entitlement!.id}`)
                .set('Cookie', [`session_id=${adminSession}`])
                .send({
                    limit_amount: 1000,
                    usage_amount: 50,
                    reset_period: 'monthly'
                });

            expect(res.status).toBe(200);
            expect(res.body.entitlement.limit_amount).toBe(1000);
            expect(res.body.entitlement.usage_amount).toBe(50);
            expect(res.body.entitlement.reset_period).toBe('monthly');
        });

        it('should set limit_amount to null (unlimited)', async () => {
            const entitlement = await OrganizationEntitlement.findOne({
                where: { organization_id: org1.id, feature_id: feature1.id }
            });

            const res = await request(app)
                .put(`/admin/entitlements/${entitlement!.id}`)
                .set('Cookie', [`session_id=${adminSession}`])
                .send({ limit_amount: null });

            expect(res.status).toBe(200);
            expect(res.body.entitlement.limit_amount).toBeNull();
        });

        it('should return associations in the response', async () => {
            const entitlement = await OrganizationEntitlement.findOne({
                where: { organization_id: org1.id, feature_id: feature1.id }
            });

            const res = await request(app)
                .put(`/admin/entitlements/${entitlement!.id}`)
                .set('Cookie', [`session_id=${adminSession}`])
                .send({ limit_amount: 300 });

            expect(res.status).toBe(200);
            expect(res.body.entitlement.organization).toBeDefined();
            expect(res.body.entitlement.organization.name).toBe('Acme Corp');
            expect(res.body.entitlement.tool).toBeDefined();
            expect(res.body.entitlement.tool.name).toBe('Image Generator');
            expect(res.body.entitlement.feature).toBeDefined();
            expect(res.body.entitlement.feature.name).toBe('Image Generation Count');
        });

        it('should return 404 for non-existent entitlement', async () => {
            const res = await request(app)
                .put(`/admin/entitlements/${uuidv4()}`)
                .set('Cookie', [`session_id=${adminSession}`])
                .send({ limit_amount: 999 });

            expect(res.status).toBe(404);
        });

        it('should not modify fields not included in the request body', async () => {
            const entitlement = await OrganizationEntitlement.findOne({
                where: { organization_id: org1.id, feature_id: feature1.id }
            });

            const originalLimit = entitlement!.limit_amount;
            const originalResetPeriod = entitlement!.reset_period;

            const res = await request(app)
                .put(`/admin/entitlements/${entitlement!.id}`)
                .set('Cookie', [`session_id=${adminSession}`])
                .send({ usage_amount: 99 });

            expect(res.status).toBe(200);
            expect(res.body.entitlement.usage_amount).toBe(99);
            expect(res.body.entitlement.limit_amount).toBe(originalLimit);
            expect(res.body.entitlement.reset_period).toBe(originalResetPeriod);
        });
    });

    // ==================
    // POST /admin/entitlements
    // ==================
    describe('POST /admin/entitlements', () => {
        it('should create new entitlements for multiple features', async () => {
            const res = await request(app)
                .post('/admin/entitlements')
                .set('Cookie', [`session_id=${adminSession}`])
                .send({
                    organization_id: org2.id,
                    tool_id: tool1.id,
                    feature_ids: [feature1.id, feature2.id],
                    limit_amount: 100,
                    reset_period: 'monthly'
                });

            expect(res.status).toBe(201);
            expect(res.body.message).toBe('Entitlements created successfully');
            expect(res.body.count).toBe(2);

            // Verify in DB
            const count = await OrganizationEntitlement.count({
                where: { organization_id: org2.id, tool_id: tool1.id }
            });
            // org2 already got feature1 via setup, so now it gets feature2 and feature1 gets updated.
            expect(count).toBe(2); 

            const f2Entitlement = await OrganizationEntitlement.findOne({
                where: { organization_id: org2.id, feature_id: feature2.id }
            });
            expect(f2Entitlement?.limit_amount).toBe(100);
            expect(f2Entitlement?.reset_period).toBe('monthly');
        });

        it('should update existing entitlements if they already exist', async () => {
             const res = await request(app)
                .post('/admin/entitlements')
                .set('Cookie', [`session_id=${adminSession}`])
                .send({
                    organization_id: org1.id,
                    tool_id: tool1.id,
                    feature_ids: [feature1.id], // Originally 100 limit, 45 usage
                    limit_amount: 999,
                    reset_period: 'yearly'
                });

            expect(res.status).toBe(201);

            const updated = await OrganizationEntitlement.findOne({
                 where: { organization_id: org1.id, feature_id: feature1.id }
            });

            expect(updated?.limit_amount).toBe(999);
            expect(updated?.reset_period).toBe('yearly');
            expect(updated?.usage_amount).toBe(45); // Should preserve usage count
        });

        it('should update existing entitlements to unlimited (null) if they already exist', async () => {
             const res = await request(app)
                .post('/admin/entitlements')
                .set('Cookie', [`session_id=${adminSession}`])
                .send({
                    organization_id: org1.id,
                    tool_id: tool1.id,
                    feature_ids: [feature1.id], // Originally 100 limit, 45 usage
                    limit_amount: null,
                    reset_period: null
                });

            expect(res.status).toBe(201);

            const updated = await OrganizationEntitlement.findOne({
                 where: { organization_id: org1.id, feature_id: feature1.id }
            });

            expect(updated?.limit_amount).toBe(null);
            expect(updated?.reset_period).toBe(null);
            expect(updated?.usage_amount).toBe(45); // Should preserve usage count
        });

        it('should restore and update soft-deleted entitlements', async () => {
            // Soft-delete an existing entitlement (simulates subscription cancellation)
            const entitlement = await OrganizationEntitlement.findOne({
                where: { organization_id: org1.id, feature_id: feature1.id }
            });
            await entitlement!.destroy(); // soft-delete

            // Verify it's soft-deleted
            const deleted = await OrganizationEntitlement.findOne({
                where: { organization_id: org1.id, feature_id: feature1.id }
            });
            expect(deleted).toBeNull();

            // Admin re-adds the entitlement
            const res = await request(app)
                .post('/admin/entitlements')
                .set('Cookie', [`session_id=${adminSession}`])
                .send({
                    organization_id: org1.id,
                    tool_id: tool1.id,
                    feature_ids: [feature1.id],
                    limit_amount: 200,
                    reset_period: 'monthly'
                });

            expect(res.status).toBe(201);

            // Verify the entitlement is restored with updated values
            const restored = await OrganizationEntitlement.findOne({
                where: { organization_id: org1.id, feature_id: feature1.id }
            });
            expect(restored).not.toBeNull();
            expect(restored!.limit_amount).toBe(200);
            expect(restored!.reset_period).toBe('monthly');
            expect(restored!.usage_amount).toBe(0); // Usage should be reset
            expect(restored!.deleted_at).toBeNull();
        });

         it('should return 400 if required fields are missing', async () => {
            const res = await request(app)
                .post('/admin/entitlements')
                .set('Cookie', [`session_id=${adminSession}`])
                .send({
                    organization_id: org2.id,
                    tool_id: tool1.id,
                    // missing feature_ids
                });

            expect(res.status).toBe(400);
        });
    });
});
