import request from 'supertest';
import app from '../app';
import sequelize, { closeDB } from '../config/db';
import redisClient from '../config/redis';
import User from '../models/user';
import { Organization, OrganizationMember } from '../models/organization';
import { Role } from '../models/role';
import { IntegrationAccount, IntegrationType, IntegrationStatus, Marketplace } from '../models/integration_account';

describe('Integration Controller API Tests', () => {
    const testUser = {
        email: 'int_test@example.com',
        password: 'Password123!',
        full_name: 'Integration Test User'
    };

    const testOrg = {
        name: 'Integration Test Corp',
        website: 'https://int-test.com'
    };

    let authCookie: string[];
    let orgId: string;

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
        await IntegrationAccount.destroy({ where: {}, truncate: true, cascade: true, force: true });
        await OrganizationMember.destroy({ where: {}, truncate: true, cascade: true, force: true });
        await Organization.destroy({ where: {}, truncate: true, cascade: true, force: true });
        await User.destroy({ where: {}, truncate: true, cascade: true, force: true });
        await Role.destroy({ where: {}, truncate: true, cascade: true, force: true });
        await redisClient.flushAll();

        // Register and Login
        const res = await request(app).post('/auth/register').send(testUser);
        authCookie = res.get('Set-Cookie') || [];

        // Create Org
        const orgRes = await request(app)
            .post('/organizations')
            .set('Cookie', authCookie)
            .send(testOrg);
        orgId = orgRes.body.organization.id;
    });

    afterAll(async () => {
        if (redisClient.isOpen) {
            await redisClient.disconnect();
        }
        await closeDB();
    });

    describe('POST /integrations/accounts', () => {
        const accountData = {
            account_name: 'Test Store 1',
            marketplace: Marketplace.AMAZON,
            region: 'us',
            integration_type: IntegrationType.SP_API_SC
        };

        it('should create a new integration account successfully', async () => {
            const res = await request(app)
                .post('/integrations/accounts')
                .set('Cookie', authCookie)
                .set('x-organization-id', orgId)
                .send(accountData);

            expect(res.statusCode).toEqual(201);
            expect(res.body.account.account_name).toEqual(accountData.account_name);
            expect(res.body.account.integration_type).toEqual(accountData.integration_type);
            expect(res.body.account.status).toEqual(IntegrationStatus.DISCONNECTED);
        });

        it('should be idempotent: subsequent creations should return existing account', async () => {
            // 1. First Create
            const res1 = await request(app)
                .post('/integrations/accounts')
                .set('Cookie', authCookie)
                .set('x-organization-id', orgId)
                .send(accountData);

            expect(res1.statusCode).toEqual(201);
            const firstId = res1.body.account.id;

            // 2. Second Create (Duplicate)
            const res2 = await request(app)
                .post('/integrations/accounts')
                .set('Cookie', authCookie)
                .set('x-organization-id', orgId)
                .send(accountData);

            // Expect success, not error
            expect(res2.statusCode).toEqual(201); // or 200 depending on implementation, usually 201 or 200 for idempotent
            // In the controller we enter `IntegrationAccount.create` path which returns 201 usually vs `return existing` might still be returned as is.
            // Let's check the ID
            expect(res2.body.account.id).toEqual(firstId);

            // Verify only one entry in DB
            const count = await IntegrationAccount.count({
                where: {
                    organization_id: orgId,
                    account_name: accountData.account_name,
                    integration_type: accountData.integration_type
                }
            });
            expect(count).toEqual(1);
        });

        it('should allow same name for different integration type', async () => {
            // 1. Create Seller Central
            await request(app)
                .post('/integrations/accounts')
                .set('Cookie', authCookie)
                .set('x-organization-id', orgId)
                .send(accountData);

            // 2. Create Vendor Central with same name
            const vcData = { ...accountData, integration_type: IntegrationType.SP_API_VC };
            const res = await request(app)
                .post('/integrations/accounts')
                .set('Cookie', authCookie)
                .set('x-organization-id', orgId)
                .send(vcData);

            expect(res.statusCode).toEqual(201);

            const count = await IntegrationAccount.count({ where: { organization_id: orgId } });
            expect(count).toEqual(2);
        });
    });
});
