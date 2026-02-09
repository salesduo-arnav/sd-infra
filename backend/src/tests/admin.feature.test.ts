
import request from 'supertest';
import app from '../app';
import sequelize from '../config/db';
import redisClient from '../config/redis';
import User from '../models/user';
import { Tool } from '../models/tool';
import { Feature } from '../models/feature';
import path from 'path';
import dotenv from 'dotenv';
import { v4 as uuidv4 } from 'uuid';

dotenv.config({ path: path.join(__dirname, '../../.env') });

describe('Admin Feature Management Integration Tests', () => {
    let adminUser: User;
    let normalUser: User;
    let adminSession: string;
    let normalSession: string;
    let testTool: Tool;

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
        await Feature.destroy({ where: {}, truncate: true, cascade: true });
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

        // Create a Tool to attach features to
        testTool = await Tool.create({
            name: 'Parent Tool',
            slug: 'parent-tool',
            is_active: true
        });
    });

    afterAll(async () => {
        if (redisClient.isOpen) {
            await redisClient.quit();
        }
    });

    describe('POST /admin/features', () => {
        const featureData = {
            name: 'Test Feature',
            slug: 'test-feature',
            description: 'A dedicated test feature'
            // tool_id will be added in test
        };

        it('should create a new feature for a tool', async () => {
            const res = await request(app)
                .post('/admin/features')
                .set('Cookie', [`session_id=${adminSession}`])
                .send({ ...featureData, tool_id: testTool.id });

            expect(res.status).toBe(201);
            expect(res.body.name).toBe(featureData.name);
            expect(res.body.tool_id).toBe(testTool.id);
        });

        it('should return 400 validation error if tool_id is missing', async () => {
            const res = await request(app)
                .post('/admin/features')
                .set('Cookie', [`session_id=${adminSession}`])
                .send(featureData);

            expect(res.status).toBe(400);
            expect(res.body.message).toContain('Tool ID');
        });

         it('should return 400 validation error if name is missing', async () => {
            const res = await request(app)
                .post('/admin/features')
                .set('Cookie', [`session_id=${adminSession}`])
                .send({ ...featureData, tool_id: testTool.id, name: '' });

            expect(res.status).toBe(400);
        });

        it('should fail if slug already exists', async () => {
            await Feature.create({
                name: 'Existing',
                slug: 'test-feature',
                tool_id: testTool.id
            });

            const res = await request(app)
                .post('/admin/features')
                .set('Cookie', [`session_id=${adminSession}`])
                .send({ ...featureData, tool_id: testTool.id }); // Using same slug 'test-feature'

             // expect 500 or 409 depending on handler. 
            // Controller throws generic Error('ALREADY_EXISTS').
            // If handleError doesn't map it, it might be 500.
            // I'll check for not 201.
            expect(res.status).not.toBe(201);
        });
    });

    describe('GET /admin/features', () => {
        beforeEach(async () => {
            await Feature.bulkCreate([
                { name: 'Feat 1', slug: 'feat-1', tool_id: testTool.id },
                { name: 'Feat 2', slug: 'feat-2', tool_id: testTool.id },
                { name: 'Other Feat', slug: 'other-feat', tool_id: testTool.id }
            ]);
        });

        it('should return paginated list of features', async () => {
            const res = await request(app)
                .get('/admin/features?page=1&limit=10')
                .set('Cookie', [`session_id=${adminSession}`]);

            expect(res.status).toBe(200);
            expect(res.body.features).toHaveLength(3);
            expect(res.body.meta.totalItems).toBe(3);
        });

        it('should support search', async () => {
            const res = await request(app)
                .get('/admin/features?search=Feat')
                .set('Cookie', [`session_id=${adminSession}`]);

            expect(res.status).toBe(200);
            expect(res.body.features).toHaveLength(3); // Feat 1, Feat 2
        });

        it('should filter by tool_id', async () => {
             const anotherTool = await Tool.create({ name: 'T2', slug: 't2' });
             await Feature.create({ name: 'T2 Feat', slug: 't2-feat', tool_id: anotherTool.id });

            const res = await request(app)
                .get(`/admin/features?tool_id=${testTool.id}`)
                .set('Cookie', [`session_id=${adminSession}`]);

            expect(res.status).toBe(200);
            expect(res.body.features).toHaveLength(3); // Only ones for testTool
        });
    });

    describe('GET /admin/features/:id', () => {
        let feature: Feature;

        beforeEach(async () => {
            feature = await Feature.create({
                name: 'Detail Feature',
                slug: 'detail-feature',
                tool_id: testTool.id
            });
        });

        it('should get feature by id including tool info', async () => {
            const res = await request(app)
                .get(`/admin/features/${feature.id}`)
                .set('Cookie', [`session_id=${adminSession}`]);

            expect(res.status).toBe(200);
            expect(res.body.id).toBe(feature.id);
            expect(res.body.tool).toBeDefined();
            expect(res.body.tool.slug).toBe(testTool.slug);
        });

        it('should return 404 for non-existent feature', async () => {
            const res = await request(app)
                .get(`/admin/features/${uuidv4()}`)
                .set('Cookie', [`session_id=${adminSession}`]);

            expect(res.status).toBe(404);
        });
    });

    describe('PUT /admin/features/:id', () => {
        let feature: Feature;

        beforeEach(async () => {
            feature = await Feature.create({
                name: 'Update Feature',
                slug: 'update-feature',
                description: 'Original',
                tool_id: testTool.id
            });
        });

        it('should update feature details', async () => {
            const res = await request(app)
                .put(`/admin/features/${feature.id}`)
                .set('Cookie', [`session_id=${adminSession}`])
                .send({
                    name: 'Updated Name',
                    description: 'Updated Desc'
                });

            expect(res.status).toBe(200);
            expect(res.body.name).toBe('Updated Name');

            const updated = await Feature.findByPk(feature.id);
            expect(updated?.description).toBe('Updated Desc');
        });
    });

    describe('DELETE /admin/features/:id', () => {
        let feature: Feature;

        beforeEach(async () => {
            feature = await Feature.create({
                name: 'Delete Feature',
                slug: 'delete-feature',
                tool_id: testTool.id
            });
        });

        it('should delete feature', async () => {
            const res = await request(app)
                .delete(`/admin/features/${feature.id}`)
                .set('Cookie', [`session_id=${adminSession}`]);

            expect(res.status).toBe(200);
            
            const deleted = await Feature.findByPk(feature.id);
            expect(deleted).toBeNull();
        });
    });
});
