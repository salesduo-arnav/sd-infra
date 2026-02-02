import request from 'supertest';
import sequelize, { closeDB } from '../config/db';
import redisClient from '../config/redis';
import User from '../models/user';
import { Organization, OrganizationMember, OrgStatus } from '../models/organization';
import { Role } from '../models/role';
import { Invitation, InvitationStatus } from '../models/invitation';
import { mailService } from '../services/mail.service';
import '../models'; // Ensure associations are registered

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
        await Invitation.destroy({ where: {}, truncate: true, cascade: true, force: true });
        await OrganizationMember.destroy({ where: {}, truncate: true, cascade: true, force: true });
        await Organization.destroy({ where: {}, truncate: true, cascade: true, force: true });
        await User.destroy({ where: {}, truncate: true, cascade: true, force: true });
        await Role.destroy({ where: {}, truncate: true, cascade: true, force: true });
        await redisClient.flushAll();
    });

    afterAll(async () => {
        await redisClient.quit();
        await closeDB();
    });

    describe('POST /auth/register with Invitation', () => {
        it('should register user and add to organization if token is valid', async () => {
            // 1. Setup Org and Invitation
            const ownerRes = await request(app).post('/auth/register').send({
                email: 'owner@example.com',
                password: 'Password123!',
                full_name: 'Owner User'
            });
            const ownerCookie = ownerRes.get('Set-Cookie') || [];

            const orgRes = await request(app)
                .post('/organizations')
                .set('Cookie', ownerCookie)
                .send({ name: 'Invite Corp' });
            const orgId = orgRes.body.organization.id;

            // Create Member Role
            const role = await Role.create({ name: 'Member' });

            // Create Invitation directly in DB
            const token = 'valid-token-123';
            await Invitation.create({
                organization_id: orgId,
                email: 'invitee@example.com',
                role_id: role.id,
                token,
                invited_by: ownerRes.body.user.id,
                status: InvitationStatus.PENDING,
                expires_at: new Date(Date.now() + 86400000)
            });

            // 2. Register with Token
            const res = await request(app)
                .post('/auth/register')
                .send({
                    email: 'invitee@example.com',
                    password: 'Password123!',
                    full_name: 'Invited User',
                    token
                });

            expect(res.statusCode).toEqual(201);
            expect(res.body.user.memberships).toBeDefined();
            expect(res.body.user.memberships[0].organization.id).toEqual(orgId);

            // Verify Invitation Updated
            const invite = await Invitation.findOne({ where: { token } });
            expect(invite?.status).toEqual(InvitationStatus.ACCEPTED);
        });

        it('should fail if email does not match invitation', async () => {
             // 1. Setup Org and Invitation
             const ownerRes = await request(app).post('/auth/register').send({
                email: 'owner2@example.com',
                password: 'Password123!',
                full_name: 'Owner User'
            });
            const ownerCookie = ownerRes.get('Set-Cookie') || [];

            const orgRes = await request(app)
                .post('/organizations')
                .set('Cookie', ownerCookie)
                .send({ name: 'Invite Corp 2' });
            const orgId = orgRes.body.organization.id;
            const role = await Role.create({ name: 'Member2' });

            const token = 'valid-token-456';
            await Invitation.create({
                organization_id: orgId,
                email: 'intended@example.com',
                role_id: role.id,
                token,
                invited_by: ownerRes.body.user.id,
                status: InvitationStatus.PENDING,
                expires_at: new Date(Date.now() + 86400000)
            });

             const res = await request(app)
                .post('/auth/register')
                .send({
                    email: 'hacker@example.com',
                    password: 'Password123!',
                    full_name: 'Hacker User',
                    token
                });

            expect(res.statusCode).toEqual(400);
            expect(res.body.message).toEqual('Email does not match invitation');
        });
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

        it('should return user with membership details after login', async () => {
             // 1. Register User
             const reg = await request(app).post('/auth/register').send({
                 email: 'owner-login@test.com',
                 password: 'password123',
                 full_name: 'Owner Only'
             });
             const userId = reg.body.user.id;
             
             // 2. Create Org and Membership manually
             const org = await Organization.create({
                 name: 'Login Org',
                 slug: 'login-org',
                 status: OrgStatus.ACTIVE,
                 website: 'https://login.com',
                 stripe_customer_id: 'cus_login_123'
             });
             
             const role = await Role.create({ name: 'Owner', description: 'desc' });
             
             await OrganizationMember.create({
                 user_id: userId,
                 organization_id: org.id,
                 role_id: role.id
             });
             
             // 3. Login
             const res = await request(app).post('/auth/login').send({
                 email: 'owner-login@test.com',
                 password: 'password123'
             });
             
             expect(res.status).toBe(200);
             expect(res.body.user.memberships).toBeDefined();
             expect(res.body.user.memberships.length).toBeGreaterThan(0);
             expect(res.body.user.memberships[0].organization.slug).toBe('login-org');
             expect(res.body.user.memberships[0].role.name).toBe('Owner');
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
            expect(res.body.full_name).toEqual(testUser.full_name);
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
            // Suppress expected console.error output
            const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => { });

            mockGetToken.mockRejectedValue(new Error('Token exchange failed'));

            const res = await request(app)
                .post('/auth/google')
                .send({ code: 'invalid_auth_code' });

            expect(res.statusCode).toEqual(500);
            expect(res.body.message).toEqual('Google authentication failed');

            consoleSpy.mockRestore();
        });

        it('should return 500 if ID token verification fails', async () => {
            // Suppress expected console.error output
            const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => { });

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

            consoleSpy.mockRestore();
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
            expect(meRes.body.full_name).toEqual(mockGoogleUser.name);
        });

        it('should join organization if invite token is provided during Google Auth', async () => {
             // 1. Setup Org and Invitation
             const ownerRes = await request(app).post('/auth/register').send({
                email: 'owner-google-invite@example.com',
                password: 'Password123!',
                full_name: 'Owner User'
            });
            const ownerCookie = ownerRes.get('Set-Cookie') || [];

            const orgRes = await request(app)
                .post('/organizations')
                .set('Cookie', ownerCookie)
                .send({ name: 'Google Invite Corp' });
            const orgId = orgRes.body.organization.id;
            const role = await Role.create({ name: 'GoogleMember' });

            const token = 'google-invite-token-123';
            await Invitation.create({
                organization_id: orgId,
                email: mockGoogleUser.email, // Matches google mock
                role_id: role.id,
                token,
                invited_by: ownerRes.body.user.id,
                status: InvitationStatus.PENDING,
                expires_at: new Date(Date.now() + 86400000)
            });

            setupSuccessfulGoogleAuth();

            const res = await request(app)
                .post('/auth/google')
                .send({ 
                    code: 'valid_auth_code',
                    token: token
                });

            expect(res.statusCode).toEqual(200);
            expect(res.body.user.memberships).toBeDefined();
            expect(res.body.user.memberships[0].organization.id).toEqual(orgId);

            // Verify Invitation Updated
            const invite = await Invitation.findOne({ where: { token } });
            expect(invite?.status).toEqual(InvitationStatus.ACCEPTED);
        });

        it('should return 400 if google email does not match invite email', async () => {
             // 1. Setup Org and Invitation
             const ownerRes = await request(app).post('/auth/register').send({
                email: 'owner-google-fail@example.com',
                password: 'Password123!',
                full_name: 'Owner User'
            });
            const ownerCookie = ownerRes.get('Set-Cookie') || [];

            const orgRes = await request(app)
                .post('/organizations')
                .set('Cookie', ownerCookie)
                .send({ name: 'Google Fail Corp' });
            const orgId = orgRes.body.organization.id;
            const role = await Role.create({ name: 'FailMember' });

            const token = 'google-fail-token-123';
            await Invitation.create({
                organization_id: orgId,
                email: 'other-email@example.com', // Different email
                role_id: role.id,
                token,
                invited_by: ownerRes.body.user.id,
                status: InvitationStatus.PENDING,
                expires_at: new Date(Date.now() + 86400000)
            });

            setupSuccessfulGoogleAuth(); // Returns mockGoogleUser.email

            const res = await request(app)
                .post('/auth/google')
                .send({ 
                    code: 'valid_auth_code',
                    token: token
                });

            expect(res.statusCode).toEqual(400);
            expect(res.body.message).toEqual('Google email does not match invitation email');
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