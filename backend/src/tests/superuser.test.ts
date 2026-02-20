import request from 'supertest';
import app from '../app';
import sequelize from '../config/db';
import redisClient from '../config/redis';
import User from '../models/user';
import bcrypt from 'bcryptjs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: path.join(__dirname, '../../.env') });
describe('Superuser Logic', () => {
    let originalSuperuserEmails: string | undefined;

    beforeAll(async () => {
        // Save original env var
        originalSuperuserEmails = process.env.SUPERUSER_EMAILS;
        // Set test env var
        process.env.SUPERUSER_EMAILS = 'superuser@example.com,also.superuser@example.com';

        await sequelize.sync({ force: true });
        if (!redisClient.isOpen) {
            await redisClient.connect();
        }
    });

    afterAll(async () => {
        // Restore original env var
        process.env.SUPERUSER_EMAILS = originalSuperuserEmails;

        await sequelize.close();
        if (redisClient.isOpen) {
            await redisClient.quit();
        }
    });

    beforeEach(async () => {
        await User.destroy({ where: {} });
        await redisClient.flushAll();
    });

    it('should register a normal user as non-superuser', async () => {
        const res = await request(app)
            .post('/auth/register')
            .send({
                email: 'normal@example.com',
                password: 'Password123!',
                full_name: 'Normal User',
            });

        expect(res.status).toBe(201);
        expect(res.body.user.email).toBe('normal@example.com');

        const user = await User.findOne({ where: { email: 'normal@example.com' } });
        expect(user).not.toBeNull();
        expect(user!.is_superuser).toBe(false);
    });

    it('should register a superuser email as superuser', async () => {
        const res = await request(app)
            .post('/auth/register')
            .send({
                email: 'superuser@example.com',
                password: 'Password123!',
                full_name: 'Super User',
            });

        expect(res.status).toBe(201);
        expect(res.body.user.email).toBe('superuser@example.com');

        const user = await User.findOne({ where: { email: 'superuser@example.com' } });
        expect(user).not.toBeNull();
        expect(user!.is_superuser).toBe(true);
    });

    it('should handle case insensitivity', async () => {
        const res = await request(app)
            .post('/auth/register')
            .send({
                email: 'SUPERUSER@example.com', // Uppercase input
                password: 'Password123!',
                full_name: 'Super User Capitalized',
            });

        expect(res.status).toBe(201);

        const user = await User.findOne({ where: { email: 'SUPERUSER@example.com' } });

        expect(user).not.toBeNull();
        expect(user!.is_superuser).toBe(true);
    });

    it('should update user to superuser on login if config changes', async () => {
        const salt = await bcrypt.genSalt(10);
        const password_hash = await bcrypt.hash('Password123!', salt);

        await User.create({
            email: 'superuser@example.com',
            password_hash: password_hash,
            full_name: 'Future Super User',
            is_superuser: false, // Intentionally false initially
        });

        // Verify it is false in DB
        let user = await User.findOne({ where: { email: 'superuser@example.com' } });
        expect(user!.is_superuser).toBe(false);

        // Login
        const res = await request(app)
            .post('/auth/login')
            .send({
                email: 'superuser@example.com',
                password: 'Password123!',
            });

        expect(res.status).toBe(200);

        // Verify it is now true in DB because the email IS in our mocked (via process.env) list
        user = await User.findOne({ where: { email: 'superuser@example.com' } });
        expect(user!.is_superuser).toBe(true);
    });
});
