
import request from 'supertest';
import app from '../app';
import sequelize from '../config/db';
import redisClient from '../config/redis';
import User from '../models/user';
import { Plan } from '../models/plan';
import { Tool } from '../models/tool';
import { Feature } from '../models/feature';
import { PlanLimit } from '../models/plan_limit';
import { PriceInterval, TierType, FeatureResetPeriod } from '../models/enums';
import path from 'path';
import dotenv from 'dotenv';


dotenv.config({ path: path.join(__dirname, '../../.env') });

describe('Admin Plan Management', () => {
    let adminUser: User;
    let normalUser: User;
    let adminSession: string;
    let normalSession: string;
    let testTool: Tool;
    let testFeature: Feature;

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

        // Create Test Tool
        testTool = await Tool.create({
            name: 'Plan Test Tool',
            slug: 'plan-test-tool',
            description: 'Tool for Plan Tests',
            tool_link: 'http://example.com'
        });

        // Create Test Feature
        testFeature = await Feature.create({
            name: 'Test Feature',
            slug: 'test-feature',
            description: 'Feature for limits',
            tool_id: testTool.id
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

    describe('Plans', () => {
        let planId: string;

        it('should create a plan', async () => {
            const res = await request(app)
                .post('/admin/plans')
                .set('Cookie', [`session_id=${adminSession}`])
                .send({
                    name: 'New Plan',
                    tool_id: testTool.id,
                    tier: TierType.BASIC,
                    price: 500,
                    currency: 'USD',
                    interval: PriceInterval.MONTHLY,
                    trial_period_days: 14,
                    active: true,
                    description: 'Basic Plan Desc'
                });

            expect(res.status).toBe(201);
            expect(res.body.name).toBe('New Plan');
            planId = res.body.id;
        });

        it('should get plans', async () => {
            const res = await request(app)
                .get('/admin/plans')
                .set('Cookie', [`session_id=${adminSession}`]);

            expect(res.status).toBe(200);
            expect(res.body.plans.length).toBeGreaterThan(0);
        });

        it('should get plan by id', async () => {
            const res = await request(app)
                .get(`/admin/plans/${planId}`)
                .set('Cookie', [`session_id=${adminSession}`]);

            expect(res.status).toBe(200);
            expect(res.body.id).toBe(planId);
        });

        it('should update a plan', async () => {
            const res = await request(app)
                .put(`/admin/plans/${planId}`)
                .set('Cookie', [`session_id=${adminSession}`])
                .send({
                    price: 600,
                    description: 'Updated Desc'
                });

            expect(res.status).toBe(200);
            expect(res.body.price).toBe(600);
        });

        // Plan Limits Tests within Plan context
        describe('Plan Limits', () => {
            it('should upsert a plan limit', async () => {
                const res = await request(app)
                    .put(`/admin/plans/${planId}/limits`)
                    .set('Cookie', [`session_id=${adminSession}`])
                    .send({
                        feature_id: testFeature.id,
                        default_limit: 100,
                        reset_period: FeatureResetPeriod.MONTHLY,
                        is_enabled: true
                    });

                expect(res.status).toBe(200);
                expect(res.body.default_limit).toBe(100);
            });

            it('should update existing limit', async () => {
                 const res = await request(app)
                    .put(`/admin/plans/${planId}/limits`)
                    .set('Cookie', [`session_id=${adminSession}`])
                    .send({
                        feature_id: testFeature.id,
                        default_limit: 200
                    });

                expect(res.status).toBe(200);
                expect(res.body.default_limit).toBe(200);
            });

            it('should delete a plan limit', async () => {
                 const res = await request(app)
                    .delete(`/admin/plans/${planId}/limits/${testFeature.id}`)
                    .set('Cookie', [`session_id=${adminSession}`]);

                expect(res.status).toBe(200);
                
                // Verify deletion
                const check = await PlanLimit.findOne({ 
                    where: { plan_id: planId, feature_id: testFeature.id } 
                });
                expect(check).toBeNull();
            });
        });

        it('should delete a plan', async () => {
             // Create dummy plan to delete
             const planToDelete = await Plan.create({
                name: 'Delete Me Plan',
                tool_id: testTool.id,
                tier: TierType.BASIC,
                price: 9999,
                currency: 'USD',
                interval: PriceInterval.YEARLY,
                active: true
             });

             const res = await request(app)
                .delete(`/admin/plans/${planToDelete.id}`)
                .set('Cookie', [`session_id=${adminSession}`]);

             expect(res.status).toBe(200);
             
             const check = await Plan.findByPk(planToDelete.id);
             expect(check).toBeNull();
        });
    });
});
