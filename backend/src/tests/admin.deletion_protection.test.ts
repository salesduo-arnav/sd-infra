import request from 'supertest';
import app from '../app';
import sequelize from '../config/db';
import redisClient from '../config/redis';
import User from '../models/user';
import { Plan } from '../models/plan';
import { Tool } from '../models/tool';
import { Bundle } from '../models/bundle';
import { BundlePlan } from '../models/bundle_plan';
import { Subscription } from '../models/subscription';
import path from 'path';
import dotenv from 'dotenv';
import { v4 as uuidv4 } from 'uuid';
import { SubStatus, TierType, PriceInterval } from '../models/enums';

dotenv.config({ path: path.join(__dirname, '../../.env') });

describe('Admin Deletion Protection Integration Tests', () => {
    let adminUser: User;
    let adminSession: string;

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
        await Subscription.destroy({ where: {}, truncate: true, cascade: true });
        await BundlePlan.destroy({ where: {}, truncate: true, cascade: true }); // Manual clean for join table if needed
        await Bundle.destroy({ where: {}, truncate: true, cascade: true });
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

        // Mock Session
        adminSession = `session-${uuidv4()}`;
        await redisClient.set(`session:${adminSession}`, JSON.stringify(adminUser));
    });

    afterAll(async () => {
        if (redisClient.isOpen) {
            await redisClient.quit();
        }
    });

    // Helper to create organization (needed for subscription)
    const createOrg = async () => {
        const { Organization } = await import('../models/organization');
        return await Organization.create({
            name: `Org-${uuidv4()}`,
            slug: `org-${uuidv4()}`,
            website: 'https://test.com'
        });
    };

    describe('Plan Deletion Protection', () => {
        it('should perform deletion if no active subscriptions', async () => {
             const tool = await Tool.create({ name: 'T1', slug: 't1', trial_days: 0});
             const plan = await Plan.create({
                 name: 'P1', tool_id: tool.id, tier: TierType.BASIC, price: 10, currency: 'USD', interval: PriceInterval.MONTHLY, active: true
             });

             const res = await request(app)
                .delete(`/admin/plans/${plan.id}`)
                .set('Cookie', [`session_id=${adminSession}`]);

             expect(res.status).toBe(200);
             const check = await Plan.findByPk(plan.id);
             expect(check).toBeNull();
        });

        it('should REJECT deletion if active subscription exists', async () => {
            const tool = await Tool.create({ name: 'T2', slug: 't2', trial_days: 0});
            const plan = await Plan.create({
                name: 'P2', tool_id: tool.id, tier: TierType.BASIC, price: 10, currency: 'USD', interval: PriceInterval.MONTHLY, active: true
            });
            const org = await createOrg();

            await Subscription.create({
                organization_id: org.id,
                plan_id: plan.id,
                status: SubStatus.ACTIVE,
                stripe_subscription_id: 'sub_fake',
                current_period_start: new Date(),
                current_period_end: new Date(),
                cancel_at_period_end: false
            });

            const res = await request(app)
               .delete(`/admin/plans/${plan.id}`)
               .set('Cookie', [`session_id=${adminSession}`]);

            expect(res.status).toBe(400);
            expect(res.body.message).toMatch(/active subscriptions/i);

            const check = await Plan.findByPk(plan.id);
            expect(check).not.toBeNull();
        });
    });

    describe('Bundle Deletion Protection', () => {
        it('should perform deletion if no active subscriptions', async () => {
             const bundle = await Bundle.create({
                 name: 'B1', slug: 'b1', price: 100, currency: 'USD', interval: PriceInterval.YEARLY, active: true
             });

             const res = await request(app)
                .delete(`/admin/bundles/${bundle.id}`)
                .set('Cookie', [`session_id=${adminSession}`]);

             expect(res.status).toBe(200);
             const check = await Bundle.findByPk(bundle.id);
             expect(check).toBeNull();
        });

        it('should REJECT deletion if active subscription exists', async () => {
            const bundle = await Bundle.create({
                name: 'B2', slug: 'b2', price: 100, currency: 'USD', interval: PriceInterval.YEARLY, active: true
            });
            const org = await createOrg();

            await Subscription.create({
                organization_id: org.id,
                bundle_id: bundle.id,
                status: SubStatus.TRIALING, // Trialing is also active
                stripe_subscription_id: 'sub_fake_b',
                current_period_start: new Date(),
                current_period_end: new Date(),
                cancel_at_period_end: false
            });

            const res = await request(app)
               .delete(`/admin/bundles/${bundle.id}`)
               .set('Cookie', [`session_id=${adminSession}`]);

            expect(res.status).toBe(400);
            expect(res.body.message).toMatch(/active subscriptions/i);

            const check = await Bundle.findByPk(bundle.id);
            expect(check).not.toBeNull();
        });
    });

    describe('Bundle Group Deletion Protection', () => {
        it('should REJECT deletion if a bundle in the group has active subscriptions', async () => {
            const { BundleGroup } = await import('../models/bundle_group');
            const group = await BundleGroup.create({ name: 'G1', slug: 'g1', active: true });
            
            const bundle = await Bundle.create({
                name: 'B_In_Group', slug: 'b-in-group', price: 100, currency: 'USD', interval: PriceInterval.YEARLY, active: true,
                bundle_group_id: group.id
            });

            const org = await createOrg();
            await Subscription.create({
                organization_id: org.id,
                bundle_id: bundle.id,
                status: SubStatus.ACTIVE,
                stripe_subscription_id: 'sub_fake_group',
                current_period_start: new Date(),
                current_period_end: new Date(),
                cancel_at_period_end: false
            });

            const res = await request(app)
               .delete(`/admin/bundle-groups/${group.id}`)
               .set('Cookie', [`session_id=${adminSession}`]);

            expect(res.status).toBe(400);
            expect(res.body.message).toMatch(/active subscriptions/i);

            const check = await BundleGroup.findByPk(group.id);
            expect(check).not.toBeNull();
        });

        it('should allow deletion if no bundles have active subscriptions', async () => {
            const { BundleGroup } = await import('../models/bundle_group');
            // Use unique slug to avoid collision with previous test
            const group = await BundleGroup.create({ name: 'G2', slug: 'g2', active: true });
             
             // Empty group or group with inactive bundles should be deletable (cascade usually handles bundles)
             // But here we just test the guard.
            const res = await request(app)
                .delete(`/admin/bundle-groups/${group.id}`)
                .set('Cookie', [`session_id=${adminSession}`]);

            expect(res.status).toBe(200);
            const check = await BundleGroup.findByPk(group.id);
            expect(check).toBeNull();
        });
    });

    describe('Tool Deletion Protection', () => {
        it('should REJECT deletion if tool is part of a plan in an active BUNDLE subscription', async () => {
            const tool = await Tool.create({ name: 'T_Bundled', slug: 't-bundled', trial_days: 0 });
            const plan = await Plan.create({
                name: 'P_In_Bundle', tool_id: tool.id, tier: TierType.BASIC, price: 10, currency: 'USD', interval: PriceInterval.MONTHLY, active: true
            });
            const bundle = await Bundle.create({
                name: 'B_With_Tool', slug: 'b-with-tool', price: 100, currency: 'USD', interval: PriceInterval.YEARLY, active: true
            });

            // Add Plan to Bundle
            await BundlePlan.create({
                bundle_id: bundle.id,
                plan_id: plan.id
            });

            const org = await createOrg();

            // Subscribe to Bundle
            await Subscription.create({
                organization_id: org.id,
                bundle_id: bundle.id,
                status: SubStatus.ACTIVE,
                stripe_subscription_id: 'sub_fake_bundle_tool',
                current_period_start: new Date(),
                current_period_end: new Date(),
                cancel_at_period_end: false
            });

            // Attempt to delete Tool
            const res = await request(app)
               .delete(`/admin/tools/${tool.id}`)
               .set('Cookie', [`session_id=${adminSession}`]);

            expect(res.status).toBe(400);
            // Verify message refers to bundle subscription possibly, or just active subscriptions
            expect(res.body.message).toMatch(/active subscriptions/i);

            const check = await Tool.findByPk(tool.id);
            expect(check).not.toBeNull();
        });
    });
});
