
import request from 'supertest';
import sequelize from '../config/db';
import redisClient from '../config/redis';
import User from '../models/user';
import path from 'path';
import dotenv from 'dotenv';
import '../models';

// Mock google-auth-library
const mockGetToken = jest.fn();
const mockVerifyIdToken = jest.fn();
const mockSetCredentials = jest.fn();

jest.mock('google-auth-library', () => {
    return {
        OAuth2Client: jest.fn().mockImplementation(() => ({
            getToken: mockGetToken,
            verifyIdToken: mockVerifyIdToken,
            setCredentials: mockSetCredentials,
        })),
    };
});

import app from '../app';

dotenv.config({ path: path.join(__dirname, '../../.env') });

describe('Superuser Google Sync Logic', () => {
    let originalSuperuserEmails: string | undefined;
    const testEmail = 'sync_test_user@example.com';

    beforeAll(async () => {
        originalSuperuserEmails = process.env.SUPERUSER_EMAILS;
        process.env.SUPERUSER_EMAILS = `${testEmail},other@example.com`;

        await sequelize.sync({ force: true });
        if (!redisClient.isOpen) {
            await redisClient.connect();
        }
    });

    afterAll(async () => {
        process.env.SUPERUSER_EMAILS = originalSuperuserEmails;
        await sequelize.close();
        if (redisClient.isOpen) {
            await redisClient.quit();
        }
    });

    beforeEach(async () => {
        await User.destroy({ where: {} });
        await redisClient.flushAll();
        jest.clearAllMocks();
    });

    it('should update existing user to superuser on Google login if config changes', async () => {
        // 1. Create user initially as normal user (NOT superuser)
        await User.create({
            email: testEmail,
            full_name: 'Sync Test User',
            is_superuser: false,
            password_hash: null
        });

        const userBefore = await User.findOne({ where: { email: testEmail } });
        expect(userBefore?.is_superuser).toBe(false);

        // 2. Setup Google Mock
        mockGetToken.mockResolvedValue({
            tokens: { id_token: 'mock_token', access_token: 'mock_access' }
        });
        mockVerifyIdToken.mockResolvedValue({
            getPayload: () => ({
                email: testEmail,
                name: 'Sync Test User',
                sub: '12345'
            })
        });

        // 3. Login via Google
        const res = await request(app)
            .post('/auth/google')
            .send({ code: 'valid_code' });

        expect(res.status).toBe(200);

        // 4. Check if user is now superuser
        const userAfter = await User.findOne({ where: { email: testEmail } });
        expect(userAfter?.is_superuser).toBe(true);
    });
});
