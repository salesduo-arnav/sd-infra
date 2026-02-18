import request from 'supertest';
import sequelize, { closeDB } from '../config/db';
import redisClient from '../config/redis';
import { IntegrationAccount, IntegrationStatus, IntegrationType } from '../models/integration_account';
import { Organization, OrgStatus, OrganizationMember } from '../models/organization';
import { User } from '../models/user';
import { Role } from '../models/role';
import app from '../app';

// Mock global fetch for token exchange
global.fetch = jest.fn();

describe('Ads Controller Integration Tests', () => {
    let user: User;
    let organization: Organization;
    let integrationAccount: IntegrationAccount;
    let authCookie: string;

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
        // Clear tables
        await IntegrationAccount.destroy({ where: {}, truncate: true, cascade: true, force: true });
        await OrganizationMember.destroy({ where: {}, truncate: true, cascade: true, force: true });
        await Organization.destroy({ where: {}, truncate: true, cascade: true, force: true });
        await User.destroy({ where: {}, truncate: true, cascade: true, force: true });
        await Role.destroy({ where: {}, truncate: true, cascade: true, force: true });
        await redisClient.flushAll();

        jest.clearAllMocks();

        // Setup User, Org, and Auth
        const role = await Role.create({ name: 'Owner' });

        const registerRes = await request(app).post('/auth/register').send({
            email: 'test@example.com',
            password: 'Password123!',
            full_name: 'Test User'
        });
        user = await User.findOne({ where: { email: 'test@example.com' } }) as User;
        const cookies = registerRes.get('Set-Cookie');
        if (!cookies) throw new Error('No cookies returned from register');
        authCookie = cookies[0];

        organization = await Organization.create({
            name: 'Test Org',
            slug: 'test-org',
            status: OrgStatus.ACTIVE
        });

        await OrganizationMember.create({
            user_id: user.id,
            organization_id: organization.id,
            role_id: role.id
        });

        // Create initial Integration Account
        integrationAccount = await IntegrationAccount.create({
            organization_id: organization.id,
            integration_type: IntegrationType.ADS_API,
            account_name: 'Test Ads Account',
            region: 'NA',
            status: IntegrationStatus.DISCONNECTED
        });
    });

    afterAll(async () => {
        await redisClient.quit();
        await closeDB();
    });

    describe('GET /integrations/amazon-ads/auth-url', () => {
        it('should return 401 if not authenticated', async () => {
            const res = await request(app)
                .get('/integrations/amazon-ads/auth-url')
                .query({ accountId: integrationAccount.id });

            expect(res.statusCode).toEqual(401);
        });

        it('should return 400 if accountId is missing', async () => {
            const res = await request(app)
                .get('/integrations/amazon-ads/auth-url')
                .set('Cookie', [authCookie]);

            expect(res.statusCode).toEqual(400);
            expect(res.body.message).toContain('accountId is required');
        });

        it('should return 404 if integration account not found', async () => {
            const res = await request(app)
                .get('/integrations/amazon-ads/auth-url')
                .set('Cookie', [authCookie])
                .query({ accountId: '00000000-0000-0000-0000-000000000000' }); // Non-existent UUID

            expect(res.statusCode).toEqual(404);
            expect(res.body.message).toContain('Integration account not found');
        });

        it('should return auth url and update account status', async () => {
            const res = await request(app)
                .get('/integrations/amazon-ads/auth-url')
                .set('Cookie', [authCookie])
                .query({ accountId: integrationAccount.id });

            expect(res.statusCode).toEqual(200);
            expect(res.body.url).toBeDefined();
            expect(res.body.url).toContain('https://www.amazon.com/ap/oa');
            expect(res.body.url).toContain(`state=${integrationAccount.id}`); // Check that state contains accountId

            // Verify DB updates
            const updatedAccount = await IntegrationAccount.findByPk(integrationAccount.id);
            expect(updatedAccount?.status).toEqual(IntegrationStatus.CONNECTING);
            expect(updatedAccount?.oauth_state).toBeDefined();
            expect(updatedAccount?.oauth_state).not.toBeNull();
        });
    });

    describe('GET /integrations/amazon-ads/callback', () => {
        let validState: string;
        let statePayload: string;

        beforeEach(async () => {
            // Setup account in CONNECTING state with a known oauth_state
            validState = 'valid_random_state_123';
            await integrationAccount.update({
                status: IntegrationStatus.CONNECTING,
                oauth_state: validState
            });
            statePayload = `${integrationAccount.id}##${validState}`;
        });

        it('should return error HTML if state is missing', async () => {
            const res = await request(app)
                .get('/integrations/amazon-ads/callback')
                .query({ code: 'some_code' });

            expect(res.text).toContain('Authentication Failed');
            expect(res.text).toContain('Missing state parameter');
        });

        it('should return error HTML if state format is invalid', async () => {
            const res = await request(app)
                .get('/integrations/amazon-ads/callback')
                .query({ code: 'some_code', state: 'invalid_format' });

            expect(res.text).toContain('Authentication Failed');
            expect(res.text).toContain('Invalid state format');
        });

        it('should return error HTML if integration account not found', async () => {
            const fakeState = `00000000-0000-0000-0000-000000000000##${validState}`;
            const res = await request(app)
                .get('/integrations/amazon-ads/callback')
                .query({ code: 'some_code', state: fakeState });

            expect(res.text).toContain('Authentication Failed');
            expect(res.text).toContain('Integration account not found');
        });

        it('should return error HTML if oauth_state mismatch', async () => {
            const mismatchState = `${integrationAccount.id}##invalid_state`;
            const res = await request(app)
                .get('/integrations/amazon-ads/callback')
                .query({ code: 'some_code', state: mismatchState });

            expect(res.text).toContain('Authentication Failed');
            expect(res.text).toContain('Invalid OAuth state');
        });

        it('should return error HTML if error param is present', async () => {
            const res = await request(app)
                .get('/integrations/amazon-ads/callback')
                .query({ state: statePayload, error: 'access_denied', error_description: 'User denied access' });

            expect(res.text).toContain('Authentication Failed');
            expect(res.text).toContain('User denied access');
        });

        it('should return error HTML if code is missing', async () => {
            const res = await request(app)
                .get('/integrations/amazon-ads/callback')
                .query({ state: statePayload });

            expect(res.text).toContain('Authentication Failed');
            expect(res.text).toContain('Missing authorization code');
        });

        it('should successfully connect account on valid callback', async () => {
            // Mock successful token response
            (global.fetch as jest.Mock).mockResolvedValue({
                ok: true,
                json: async () => ({
                    access_token: 'mock_access_token',
                    refresh_token: 'mock_refresh_token',
                    expires_in: 3600,
                    token_type: 'bearer'
                })
            });

            const res = await request(app)
                .get('/integrations/amazon-ads/callback')
                .query({ state: statePayload, code: 'valid_auth_code' });

            expect(res.text).toContain('Authentication Successful');
            expect(res.text).toContain('ADS_AUTH_SUCCESS');

            // Verify DB updates
            const updatedAccount = await IntegrationAccount.findByPk(integrationAccount.id);
            expect(updatedAccount?.status).toEqual(IntegrationStatus.CONNECTED);
            expect(updatedAccount?.oauth_state).toBeNull();
            expect(updatedAccount?.credentials).toEqual(expect.objectContaining({
                access_token: 'mock_access_token',
                refresh_token: 'mock_refresh_token'
            }));
        });

        it('should handle token exchange failure', async () => {
            // Mock failed token response
            (global.fetch as jest.Mock).mockResolvedValue({
                ok: false,
                text: async () => 'Invalid client'
            });

            const res = await request(app)
                .get('/integrations/amazon-ads/callback')
                .query({ state: statePayload, code: 'valid_auth_code' });

            expect(res.text).toContain('Authentication Failed');
            expect(res.text).toContain('Token exchange failed');

            // Verify DB updates
            const updatedAccount = await IntegrationAccount.findByPk(integrationAccount.id);
            expect(updatedAccount?.status).toEqual(IntegrationStatus.ERROR);
        });

        it('should handle fetch exception during token exchange', async () => {
            // Mock network error
            (global.fetch as jest.Mock).mockRejectedValue(new Error('Network error'));

            const res = await request(app)
                .get('/integrations/amazon-ads/callback')
                .query({ state: statePayload, code: 'valid_auth_code' });

            expect(res.text).toContain('Authentication Failed');
            expect(res.text).toContain('Token exchange failed');

            // Verify DB updates
            const updatedAccount = await IntegrationAccount.findByPk(integrationAccount.id);
            expect(updatedAccount?.status).toEqual(IntegrationStatus.ERROR);
        });
    });
});
