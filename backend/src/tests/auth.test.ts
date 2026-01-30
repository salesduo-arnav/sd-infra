import request from 'supertest';
import sequelize, { closeDB } from '../config/db';
import redisClient from '../config/redis';
import User from '../models/user';
import { mailService } from '../services/mail.service';

// Create mock functions that will be shared across tests
const mockGetToken = jest.fn();
const mockVerifyIdToken = jest.fn();
const mockSetCredentials = jest.fn();

// Mock the google-auth-library BEFORE importing app
jest.mock('google-auth-library', () => {
    return {
        OAuth2Client: jest.fn().mockImplementation(() => ({
            getToken: mockGetToken,
            verifyIdToken: mockVerifyIdToken,
            setCredentials: mockSetCredentials,
        })),
    };
});

// Import app AFTER setting up the mock
import app from '../app';

describe('Authentication API Integration Tests', () => {
    const testUser = {
        email: 'test@example.com',
        password: 'Password123!',
        full_name: 'Test User'
    };

    beforeAll(async () => {
        // Ensure test environment safety
        if (process.env.PGDATABASE !== 'mydb_test') {
            throw new Error("CRITICAL: Tests must run against mydb_test!");
        }
        await sequelize.authenticate();
        // Ensure Redis is connected
        if (!redisClient.isOpen) {
            await redisClient.connect();
        }
    });

    beforeEach(async () => {
        // Clear User table and Redis before each test for isolation
        await User.destroy({ where: {}, truncate: true, cascade: true });
        await redisClient.flushAll();
    });

    afterAll(async () => {
        await redisClient.quit();
        await closeDB();
    });

    describe('POST /auth/register', () => {
        it('should register a new user and set a session cookie', async () => {
            const res = await request(app)
                .post('/auth/register')
                .send(testUser);

            expect(res.statusCode).toEqual(201);
            expect(res.body.message).toEqual('Registered successfully');
            expect(res.body.user).toHaveProperty('id');
            expect(res.body.user.email).toEqual(testUser.email);

            // Verify session cookie is set
            const cookies = res.get('Set-Cookie') || [];
            expect(cookies.some(c => c.includes('session_id'))).toBe(true);
        });

        it('should return 400 if user already exists', async () => {
            await request(app).post('/auth/register').send(testUser);
            const res = await request(app).post('/auth/register').send(testUser);

            expect(res.statusCode).toEqual(400);
            expect(res.body.message).toEqual('User already exists');
        });
    });

    describe('POST /auth/login', () => {
        beforeEach(async () => {
            await request(app).post('/auth/register').send(testUser);
        });

        it('should login successfully with correct credentials', async () => {
            const res = await request(app)
                .post('/auth/login')
                .send({ email: testUser.email, password: testUser.password });

            expect(res.statusCode).toEqual(200);
            expect(res.body.message).toEqual('Logged in successfully');
            expect(res.get('Set-Cookie')).toBeDefined();
        });

        it('should return 401 for invalid password', async () => {
            const res = await request(app)
                .post('/auth/login')
                .send({ email: testUser.email, password: 'wrongpassword' });

            expect(res.statusCode).toEqual(401);
            expect(res.body.message).toEqual('Invalid credentials');
        });
    });

    describe('GET /auth/me', () => {
        it('should retrieve the current user session details', async () => {
            // 1. Register/Login to get a cookie
            const loginRes = await request(app)
                .post('/auth/register')
                .send(testUser);

            const cookie = loginRes.get('Set-Cookie');

            // 2. Access protected route
            const res = await request(app)
                .get('/auth/me')
                .set('Cookie', cookie || []);

            expect(res.statusCode).toEqual(200);
            expect(res.body.email).toEqual(testUser.email);
            expect(res.body.name).toEqual(testUser.full_name);
        });

        it('should return 401 if no session cookie is provided', async () => {
            const res = await request(app).get('/auth/me');
            expect(res.statusCode).toEqual(401);
        });
    });

    describe('POST /auth/logout', () => {
        it('should clear the session in Redis and the cookie', async () => {
            const loginRes = await request(app)
                .post('/auth/register')
                .send(testUser);

            const cookie = loginRes.get('Set-Cookie');

            const res = await request(app)
                .post('/auth/logout')
                .set('Cookie', cookie || [])
                .send();

            expect(res.statusCode).toEqual(200);

            // Verify cookie is cleared
            const cookies = res.get('Set-Cookie') || [];
            expect(cookies.some(c => c.includes('session_id=;'))).toBe(true);

            // Verify access is now denied
            const meRes = await request(app)
                .get('/auth/me')
                .set('Cookie', cookies);
            expect(meRes.statusCode).toEqual(401);
        });
    });

    describe('POST /auth/forgot-password', () => {
        it('should send a reset email if user exists', async () => {
            // Register user first
            await request(app).post('/auth/register').send(testUser);

            const sendMailSpy = jest.spyOn(mailService, 'sendMail').mockResolvedValue();

            const res = await request(app)
                .post('/auth/forgot-password')
                .send({ email: testUser.email });

            expect(res.statusCode).toEqual(200);
            expect(res.body.message).toEqual('If an account exists, a reset link has been sent.');

            expect(sendMailSpy).toHaveBeenCalledTimes(1);
            expect(sendMailSpy).toHaveBeenCalledWith(expect.objectContaining({
                to: testUser.email,
                subject: 'Password Reset Request'
            }));

            sendMailSpy.mockRestore();
        });

        it('should return 200 message even if user does not exist (enumeration protection)', async () => {
            const sendMailSpy = jest.spyOn(mailService, 'sendMail').mockResolvedValue();

            const res = await request(app)
                .post('/auth/forgot-password')
                .send({ email: 'nonexistent@example.com' });

            expect(res.statusCode).toEqual(200);
            expect(res.body.message).toEqual('If an account exists, a reset link has been sent.');

            expect(sendMailSpy).not.toHaveBeenCalled();

            sendMailSpy.mockRestore();
        });
    });

    describe('POST /auth/google', () => {
        const mockGoogleUser = {
            email: 'googleuser@gmail.com',
            name: 'Google User'
        };

        beforeEach(() => {
            // Reset mocks before each test
            jest.clearAllMocks();
        });

        const setupSuccessfulGoogleAuth = () => {
            mockGetToken.mockResolvedValue({
                tokens: {
                    id_token: 'mock_id_token',
                    access_token: 'mock_access_token'
                }
            });

            mockVerifyIdToken.mockResolvedValue({
                getPayload: () => ({
                    email: mockGoogleUser.email,
                    name: mockGoogleUser.name,
                    sub: '123456789'
                })
            });
        };

        it('should register a new user via Google and set session cookie', async () => {
            setupSuccessfulGoogleAuth();

            const res = await request(app)
                .post('/auth/google')
                .send({ code: 'valid_auth_code' });

            expect(res.statusCode).toEqual(200);
            expect(res.body.message).toEqual('Logged in with Google successfully');
            expect(res.body.user).toHaveProperty('id');
            expect(res.body.user.email).toEqual(mockGoogleUser.email);

            // Verify session cookie is set
            const cookies = res.get('Set-Cookie') || [];
            expect(cookies.some(c => c.includes('session_id'))).toBe(true);

            // Verify user was created in database
            const user = await User.findOne({ where: { email: mockGoogleUser.email } });
            expect(user).not.toBeNull();
            expect(user?.full_name).toEqual(mockGoogleUser.name);
            expect(user?.password_hash).toBeNull(); // Google users don't have password
        });

        it('should login existing user via Google', async () => {
            // First, create a user that was previously registered via Google
            await User.create({
                email: mockGoogleUser.email,
                full_name: mockGoogleUser.name,
                password_hash: null,
                is_superuser: false
            });

            setupSuccessfulGoogleAuth();

            const res = await request(app)
                .post('/auth/google')
                .send({ code: 'valid_auth_code' });

            expect(res.statusCode).toEqual(200);
            expect(res.body.message).toEqual('Logged in with Google successfully');
            expect(res.body.user.email).toEqual(mockGoogleUser.email);

            // Verify no duplicate user was created
            const userCount = await User.count({ where: { email: mockGoogleUser.email } });
            expect(userCount).toEqual(1);
        });

        it('should login existing password-based user via Google', async () => {
            // Create a user that originally registered with password
            await User.create({
                email: mockGoogleUser.email,
                full_name: 'Original Name',
                password_hash: 'some_hashed_password',
                is_superuser: false
            });

            setupSuccessfulGoogleAuth();

            const res = await request(app)
                .post('/auth/google')
                .send({ code: 'valid_auth_code' });

            expect(res.statusCode).toEqual(200);
            expect(res.body.message).toEqual('Logged in with Google successfully');

            // User should keep their original password hash (linking accounts)
            const user = await User.findOne({ where: { email: mockGoogleUser.email } });
            expect(user?.password_hash).toEqual('some_hashed_password');
        });

        it('should return 400 if Google token verification fails (no payload)', async () => {
            mockGetToken.mockResolvedValue({
                tokens: {
                    id_token: 'mock_id_token',
                    access_token: 'mock_access_token'
                }
            });

            mockVerifyIdToken.mockResolvedValue({
                getPayload: () => null // No payload
            });

            const res = await request(app)
                .post('/auth/google')
                .send({ code: 'valid_auth_code' });

            expect(res.statusCode).toEqual(400);
            expect(res.body.message).toEqual('Invalid Google Token');
        });

        it('should return 400 if Google token has no email', async () => {
            mockGetToken.mockResolvedValue({
                tokens: {
                    id_token: 'mock_id_token',
                    access_token: 'mock_access_token'
                }
            });

            mockVerifyIdToken.mockResolvedValue({
                getPayload: () => ({
                    name: 'User Without Email',
                    sub: '123456789'
                    // No email field
                })
            });

            const res = await request(app)
                .post('/auth/google')
                .send({ code: 'valid_auth_code' });

            expect(res.statusCode).toEqual(400);
            expect(res.body.message).toEqual('Invalid Google Token');
        });

        it('should return 500 if Google token exchange fails', async () => {
            mockGetToken.mockRejectedValue(new Error('Token exchange failed'));

            const res = await request(app)
                .post('/auth/google')
                .send({ code: 'invalid_auth_code' });

            expect(res.statusCode).toEqual(500);
            expect(res.body.message).toEqual('Google authentication failed');
        });

        it('should return 500 if ID token verification fails', async () => {
            mockGetToken.mockResolvedValue({
                tokens: {
                    id_token: 'mock_id_token',
                    access_token: 'mock_access_token'
                }
            });

            mockVerifyIdToken.mockRejectedValue(new Error('ID token verification failed'));

            const res = await request(app)
                .post('/auth/google')
                .send({ code: 'valid_auth_code' });

            expect(res.statusCode).toEqual(500);
            expect(res.body.message).toEqual('Google authentication failed');
        });

        it('should allow access to protected routes after Google login', async () => {
            setupSuccessfulGoogleAuth();

            const loginRes = await request(app)
                .post('/auth/google')
                .send({ code: 'valid_auth_code' });

            const cookie = loginRes.get('Set-Cookie');

            // Access protected /auth/me route
            const meRes = await request(app)
                .get('/auth/me')
                .set('Cookie', cookie || []);

            expect(meRes.statusCode).toEqual(200);
            expect(meRes.body.email).toEqual(mockGoogleUser.email);
            expect(meRes.body.name).toEqual(mockGoogleUser.name);
        });

        it('should properly logout after Google login', async () => {
            setupSuccessfulGoogleAuth();

            const loginRes = await request(app)
                .post('/auth/google')
                .send({ code: 'valid_auth_code' });

            const cookie = loginRes.get('Set-Cookie');

            // Logout
            const logoutRes = await request(app)
                .post('/auth/logout')
                .set('Cookie', cookie || []);

            expect(logoutRes.statusCode).toEqual(200);

            // Verify session is invalidated
            const meRes = await request(app)
                .get('/auth/me')
                .set('Cookie', logoutRes.get('Set-Cookie') || []);

            expect(meRes.statusCode).toEqual(401);
        });
    });
});