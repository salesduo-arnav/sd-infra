import request from 'supertest';
import app from '../app';
import sequelize, { closeDB } from '../config/db';

// Setup: Clean DB before running tests
beforeAll(async () => {
    // Check we are NOT in production or using the main DB accidentally
    if (process.env.NODE_ENV === 'production' || process.env.PGDATABASE !== 'mydb_test') {
        throw new Error("CRITICAL: Attempting to run tests against non-test database!");
    }
    // This ensures we start with a clean slate
    await sequelize.authenticate();
    await sequelize.sync({ force: true }); // Recreates tables, ensuring clean state
});

describe('Item API Integration Tests', () => {
    it('POST /items - should create a new item', async () => {
        const res = await request(app)
            .post('/items')
            .send({
                name: 'Test Widget',
                description: 'A widget for testing'
            });

        expect(res.statusCode).toEqual(201);
        expect(res.body).toHaveProperty('id');
        expect(res.body.name).toEqual('Test Widget');
    });

    it('GET /items - should retrieve the created item', async () => {
        const res = await request(app).get('/items');

        expect(res.statusCode).toEqual(200);
        expect(Array.isArray(res.body)).toBe(true);
        expect(res.body.length).toBeGreaterThan(0);
        expect(res.body[0].name).toEqual('Test Widget');
    });
});

// Teardown: Close connection after tests to prevent hangs
afterAll(async () => {
    await closeDB();
});
