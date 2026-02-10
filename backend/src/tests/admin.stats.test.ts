
import request from 'supertest';
import app from '../app';
import sequelize from '../config/db';
import redisClient from '../config/redis';
import User from '../models/user';
import { Organization, Subscription, ToolUsage, OneTimePurchase, Tool, Plan } from '../models';
import { SubStatus, PriceInterval, TierType } from '../models/enums';
import { OrgStatus } from '../models/organization';
import { Role } from '../models/role';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: path.join(__dirname, '../../.env') });

describe('Admin Stats Controller', () => {
    let adminUser: User;
    let adminSession: string;

    beforeAll(async () => {
        await sequelize.sync({ force: true });
        if (!redisClient.isOpen) {
            await redisClient.connect();
        }

        // Create Roles
        await Role.bulkCreate([
            { name: 'Owner', description: 'Organization Owner' },
            { name: 'Member', description: 'Organization Member' }
        ]);

        // Create Admin User
        adminUser = await User.create({
            email: 'admin@example.com',
            full_name: 'Admin User',
            is_superuser: true
        });

        // Mock Login / Session creation
        adminSession = 'admin-session-id';
        await redisClient.set(`session:${adminSession}`, JSON.stringify(adminUser));
    });

    afterAll(async () => {
        await sequelize.close();
        if (redisClient.isOpen) {
            await redisClient.quit();
        }
    });

    describe('GET /admin/stats/overview', () => {
        it('should return overview stats', async () => {
            // Seed some data
            const now = new Date();


            // Create Users
            await User.create({ email: 'u1@test.com', full_name: 'U1', created_at: now });
            await User.create({ email: 'u2@test.com', full_name: 'U2', created_at: new Date(now.getFullYear(), now.getMonth() - 1, 15) }); // Last month

            // Create Orgs
            const org = await Organization.create({ name: 'Org1', slug: 'org1', status: OrgStatus.ACTIVE, created_at: now });

            // Create Tool for Plan (Required)
            const tool = await Tool.create({ name: 'Plan Tool', slug: 'plan-tool', description: 'For Plans', is_active: true });

            // Create Plans
            const monthlyPlan = await Plan.create({
                name: 'Monthly',
                price: 100,
                interval: PriceInterval.MONTHLY,
                tool_id: tool.id,
                tier: TierType.BASIC,
                currency: 'USD'
            });

            const yearlyPlan = await Plan.create({
                name: 'Yearly',
                price: 1200,
                interval: PriceInterval.YEARLY,
                tool_id: tool.id,
                tier: TierType.PREMIUM,
                currency: 'USD'
            });

            // Create Subscriptions
            // Active Monthly (New)
            await Subscription.create({
                status: SubStatus.ACTIVE,
                current_period_end: new Date(),
                plan_id: monthlyPlan.id,
                created_at: now,
                organization_id: org.id
            });

            // Active Yearly (Old) - from last month
            await Subscription.create({
                status: SubStatus.ACTIVE,
                current_period_end: new Date(),
                plan_id: yearlyPlan.id,
                created_at: new Date(now.getFullYear(), now.getMonth() - 1, 15),
                organization_id: org.id
            });

            // One Time Purchase
            await OneTimePurchase.create({
                amount_paid: 50,
                status: 'succeeded',
                organization_id: org.id, // Linked to Org, not User directly
                created_at: now
            });

            const res = await request(app)
                .get('/admin/stats/overview')
                .set('Cookie', [`session_id=${adminSession}`]);

            expect(res.status).toBe(200);
            expect(res.body).toHaveProperty('totalUsers');
            expect(res.body.totalUsers).toBeGreaterThanOrEqual(3); // Admin + 2 created
            expect(res.body.activeSubs).toBe(2);

            // MRR Check: 100 (Monthly) + 1200/12 (Yearly) = 200
            expect(Number(res.body.mrr)).toBe(200);

            // One Time Revenue Check: 50
            expect(Number(res.body.oneTimeRevenue)).toBe(50);

            // Growth checks are trickier with minimal data, but we can check structure
            expect(res.body).toHaveProperty('userGrowth');
            expect(res.body).toHaveProperty('activeSubsGrowth');
            expect(res.body).toHaveProperty('mrrGrowth');
        });
    });

    describe('GET /admin/stats/revenue', () => {
        it('should return revenue chart data', async () => {
            const res = await request(app)
                .get('/admin/stats/revenue')
                .set('Cookie', [`session_id=${adminSession}`]);

            expect(res.status).toBe(200);
            expect(Array.isArray(res.body)).toBe(true);
            if (res.body.length > 0) {
                expect(res.body[0]).toHaveProperty('month');
                expect(res.body[0]).toHaveProperty('revenue');
            }
        });
    });

    describe('GET /admin/stats/users', () => {
        it('should return user growth chart data', async () => {
            const res = await request(app)
                .get('/admin/stats/users')
                .set('Cookie', [`session_id=${adminSession}`]);

            expect(res.status).toBe(200);
            expect(Array.isArray(res.body)).toBe(true);
        });
    });

    describe('GET /admin/stats/tools', () => {
        it('should return tool usage chart data', async () => {
            // Seed tool usage
            const tool = await Tool.create({ name: 'Test Tool', slug: 'test-tool-usage', description: 'desc', is_active: true });

            // Need an Org for usage
            const org = await Organization.findOne() || await Organization.create({ name: 'Usage Org', slug: 'usage-org', status: OrgStatus.ACTIVE });

            await ToolUsage.create({
                tool_id: tool.id,
                user_id: adminUser.id,
                organization_id: org.id,
                date: new Date().toISOString().split('T')[0],
                count: 5
            });

            const res = await request(app)
                .get('/admin/stats/tools')
                .set('Cookie', [`session_id=${adminSession}`]);

            expect(res.status).toBe(200);
            expect(Array.isArray(res.body)).toBe(true);
            expect(res.body.length).toBeGreaterThan(0);
            expect(res.body[0]).toHaveProperty('tool_id');
            expect(res.body[0]).toHaveProperty('total_usage');
        });
    });
});
