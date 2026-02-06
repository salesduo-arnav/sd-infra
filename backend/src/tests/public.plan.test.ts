
import request from 'supertest';
import app from '../app';
import sequelize from '../config/db';
import redisClient from '../config/redis';
import { Plan } from '../models/plan';
import { Tool } from '../models/tool';
import { PriceInterval, TierType } from '../models/enums';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: path.join(__dirname, '../../.env') });

describe('Public Plan Access', () => {
    let testTool: Tool;

    beforeAll(async () => {
        await sequelize.sync({ force: true });
        if (!redisClient.isOpen) {
            await redisClient.connect();
        }

        // Create Test Tool
        testTool = await Tool.create({
            name: 'Public Test Tool',
            slug: 'public-test-tool',
            description: 'Tool for Public Tests',
            tool_link: 'http://example.com',
            is_active: true
        });

        // Create Active Plan
        await Plan.create({
            name: 'Active Plan',
            tool_id: testTool.id,
            tier: TierType.BASIC,
            price: 100,
            currency: 'USD',
            interval: PriceInterval.MONTHLY,
            active: true
        });

        // Create Inactive Plan
        await Plan.create({
            name: 'Inactive Plan',
            tool_id: testTool.id,
            tier: TierType.BASIC,
            price: 200,
            currency: 'USD',
            interval: PriceInterval.MONTHLY,
            active: false
        });
    });

    afterAll(async () => {
        await sequelize.close();
        if (redisClient.isOpen) {
            await redisClient.quit();
        }
    });

    describe('GET /public/plans', () => {
        it('should get all active plans', async () => {
            const res = await request(app).get('/public/plans');

            expect(res.status).toBe(200);
            expect(Array.isArray(res.body)).toBe(true);
            
            // Should contain Active Plan but NOT Inactive Plan
            const planNames = res.body.map((p: any) => p.name);
            expect(planNames).toContain('Active Plan');
            expect(planNames).not.toContain('Inactive Plan');
        });

        it('should filter by tool_id', async () => {
             const res = await request(app).get(`/public/plans?tool_id=${testTool.id}`);
             
             expect(res.status).toBe(200);
             res.body.forEach((p: any) => {
                 expect(p.tool_id).toBe(testTool.id);
             });
        });
    });
});
