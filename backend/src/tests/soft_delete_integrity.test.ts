import request from 'supertest';
import app from '../app';
import sequelize, { closeDB } from '../config/db';
import redisClient from '../config/redis';
import User from '../models/user';
import { Organization, OrganizationMember } from '../models/organization';
import { Invitation } from '../models/invitation';
import { Role, Permission, RolePermission } from '../models/role';
import { seedPermissions } from './test-helpers';
import { SubStatus, PriceInterval, TierType } from '../models/enums';

describe('Soft Delete Integrity & Cascade Tests', () => {
    const testUser = {
        email: 'softdel_test@example.com',
        password: 'Password123!',
        full_name: 'Soft Delete User'
    };

    const testOrg = {
        name: 'Soft Delete Corp',
        website: 'https://sdcorp.com'
    };

    let authCookie: string[];

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
        // Clean up everything to start fresh
        await RolePermission.destroy({ where: {}, truncate: true, cascade: true, force: true });
        await Permission.destroy({ where: {}, truncate: true, cascade: true, force: true });
        await Invitation.destroy({ where: {}, truncate: true, cascade: true, force: true });
        await OrganizationMember.destroy({ where: {}, truncate: true, cascade: true, force: true });
        await Organization.destroy({ where: {}, truncate: true, cascade: true, force: true });
        await User.destroy({ where: {}, truncate: true, cascade: true, force: true });
        await Role.destroy({ where: {}, truncate: true, cascade: true, force: true }); // Roles might be needed, but usually seeded.

        // Ensure Roles exist
        await Role.findOrCreate({ where: { name: 'Owner' }, defaults: { name: 'Owner', description: 'desc' } });
        await Role.findOrCreate({ where: { name: 'Member' }, defaults: { name: 'Member', description: 'desc' } });
        await Role.findOrCreate({ where: { name: 'Admin' }, defaults: { name: 'Admin', description: 'desc' } });

        await redisClient.flushAll();

        await seedPermissions();
    });

    afterAll(async () => {
        if (redisClient.isOpen) {
            await redisClient.disconnect();
        }
        await closeDB();
    });

    describe('User Soft Delete & Re-Signup logic', () => {
        it('should soft delete a user and allow re-signup with same email', async () => {
            // 1. Register User
            const res1 = await request(app).post('/auth/register').send(testUser);
            expect(res1.statusCode).toEqual(201);
            const userId1 = res1.body.user.id;

            // 2. Delete User

            // Promote to superuser
            // Manually create session in Redis to bypass login controller's superuser sync logic
            const sessionId = 'admin-session-' + Date.now();
            const sessionData = {
                id: userId1,
                email: testUser.email,
                name: testUser.full_name,
                is_superuser: true
            };
            await redisClient.set(`session:${sessionId}`, JSON.stringify(sessionData), { EX: 3600 });
            const adminCookie = [`session_id=${sessionId}`];

            // Create DIFFERENT user to be deleted
            const victimUser = { email: 'victim@example.com', password: 'Password123!', full_name: 'Victim' };
            const resV = await request(app).post('/auth/register').send(victimUser);
            const victimId = resV.body.user.id;

            // Admin deletes Victim
            const delRes = await request(app)
                .delete(`/admin/users/${victimId}`)
                .set('Cookie', adminCookie);

            expect(delRes.statusCode).toEqual(200);

            // 3. Verify Victim is Soft Deleted
            // API should return 404 (assuming GET /users/:id checks existence)
            // Or just check DB.
            const dbVictim = await User.findOne({
                where: { id: victimId },
                paranoid: false // Include deleted
            });
            expect(dbVictim).toBeDefined();
            expect(dbVictim!.deleted_at).not.toBeNull();

            const activeVictim = await User.findOne({ where: { id: victimId } });
            expect(activeVictim).toBeNull();

            // 4. Re-Signup with SAME email
            const resReSignup = await request(app).post('/auth/register').send(victimUser);
            expect(resReSignup.statusCode).toEqual(201); // Success!
            const newVictimId = resReSignup.body.user.id;

            expect(newVictimId).not.toEqual(victimId);

            // 5. Verify both exist in DB (one deleted, one active)
            const allVictims = await User.findAll({
                where: { email: victimUser.email },
                paranoid: false
            });
            expect(allVictims.length).toBe(2);
        });

        it('should enforce uniqueness for Active users', async () => {
            // 1. Create User A
            await request(app).post('/auth/register').send(testUser);

            // 2. Try create User B with same email
            const res = await request(app).post('/auth/register').send(testUser);
            expect(res.statusCode).not.toEqual(201); // Should fail
            // Depending on implementation, might return 400 or 409
        });
    });

    describe('Organization Soft Delete & Cascade', () => {
        it('should soft delete organization and cascade to members and invitations', async () => {
            // 1. Register Owner
            const resReg = await request(app).post('/auth/register').send(testUser);
            authCookie = resReg.get('Set-Cookie') || [];

            // 2. Create Organization
            const resOrg = await request(app)
                .post('/organizations')
                .set('Cookie', authCookie)
                .send(testOrg);
            const orgId = resOrg.body.organization.id;

            // 3. Add a Member
            // Create another user
            const memberUser = { email: 'member@example.com', password: 'Password123!', full_name: 'Member' };
            const resMemReg = await request(app).post('/auth/register').send(memberUser);
            const memberUserId = resMemReg.body.user.id;

            // Helper to add member (since we need to be owner to add, or invite)
            // Let's use direct DB creation for simplicity of setup unless we want to test invite flow
            const memberRole = await Role.findOne({ where: { name: 'Member' } });
            await OrganizationMember.create({
                organization_id: orgId,
                user_id: memberUserId,
                role_id: memberRole!.id,
                is_active: true
            });

            // 4. Create Invitation
            const inviteToken = 'some-random-token';
            await Invitation.create({
                organization_id: orgId,
                email: 'invitee@example.com',
                role_id: memberRole!.id,
                token: inviteToken,
                status: 'pending',
                expires_at: new Date(Date.now() + 86400000)
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
            } as any);

            // 5. Delete Organization
            const resDel = await request(app)
                .delete('/organizations')
                .set('Cookie', authCookie)
                .set('x-organization-id', orgId);
            expect(resDel.statusCode).toEqual(200);

            // 6. Verify Cascade
            // Org should be soft deleted
            const dbOrg = await Organization.findOne({ where: { id: orgId }, paranoid: false });
            expect(dbOrg!.deleted_at).not.toBeNull();

            // Members should be soft deleted
            const dbMembers = await OrganizationMember.findAll({
                where: { organization_id: orgId },
                paranoid: false
            });
            // Should have 2 members (Owner + Member)
            expect(dbMembers.length).toBe(2);
            dbMembers.forEach(m => {
                expect(m.deleted_at).not.toBeNull();
            });

            // Invitations should be soft deleted
            const dbInvites = await Invitation.findAll({
                where: { organization_id: orgId },
                paranoid: false
            });
            expect(dbInvites.length).toBe(1);
            expect(dbInvites[0].deleted_at).not.toBeNull();
        });

        it('should allow reusing slug after soft delete', async () => {
            // 1. Register Owner
            const resReg = await request(app).post('/auth/register').send(testUser);
            authCookie = resReg.get('Set-Cookie') || [];

            // 2. Create Organization
            const resOrg1 = await request(app)
                .post('/organizations')
                .set('Cookie', authCookie)
                .send(testOrg);
            const orgId1 = resOrg1.body.organization.id;
            const slug = resOrg1.body.organization.slug;

            // 3. Delete Organization
            await request(app)
                .delete('/organizations')
                .set('Cookie', authCookie)
                .set('x-organization-id', orgId1);

            // 4. Create NEW Organization with same name/slug
            const resOrg2 = await request(app)
                .post('/organizations')
                .set('Cookie', authCookie)
                .send(testOrg);

            expect(resOrg2.statusCode).toEqual(201);
            expect(resOrg2.body.organization.slug).toEqual(slug); // Reuse success
            expect(resOrg2.body.organization.id).not.toEqual(orgId1);

            // 5. Verify both exist in DB
            const allOrgs = await Organization.findAll({
                where: { slug: slug },
                paranoid: false
            });
            expect(allOrgs.length).toBe(2);
        });
        describe('Billing & Tooling Soft Delete & Cascade', () => {
            let authCookie: string[];
            let orgId: string;

            beforeEach(async () => {
                // Register and Login to get cookie
                // Note: In real world, we might want to isolate this, but reusing helper or flow is fine.
                const user = { email: `billing_test_${Date.now()}@example.com`, password: 'Password123!', full_name: 'Billing Tester' };
                const resReg = await request(app).post('/auth/register').send(user);
                authCookie = resReg.get('Set-Cookie') || [];

                const resOrg = await request(app)
                    .post('/organizations')
                    .set('Cookie', authCookie)
                    .send({ name: 'Billing Corp', website: 'https://billing.com' });
                orgId = resOrg.body.organization.id;
            });

            it('should soft delete Subscription when Organization is deleted', async () => {
                // 1. Create Subscription directly (since we might not have full billing flow set up in tests)
                const { Subscription } = await import('../models/subscription');
                const { Plan } = await import('../models/plan');
                const { Tool } = await import('../models/tool');

                const tool = await Tool.create({ name: 'Sub Test Tool', slug: 'sub-test-tool', is_active: true, trial_days: 0 });
                const plan = await Plan.create({
                    name: 'Sub Test Plan',
                    tool_id: tool.id,
                    price: 2000,
                    tier: TierType.PREMIUM,
                    currency: 'usd',
                    interval: PriceInterval.MONTHLY,
                    active: true
                });

                const sub = await Subscription.create({
                    organization_id: orgId,
                    plan_id: plan.id,
                    stripe_subscription_id: 'sub_123',
                    status: SubStatus.ACTIVE,
                    current_period_start: new Date(),
                    current_period_end: new Date(Date.now() + 86400000),
                    cancel_at_period_end: false
                });

                // 2. Delete Organization
                const resDel = await request(app)
                    .delete('/organizations')
                    .set('Cookie', authCookie)
                    .set('x-organization-id', orgId);
                expect(resDel.statusCode).toEqual(200);

                // 3. Verify Subscription is soft deleted
                const dbSub = await Subscription.findOne({ where: { id: sub.id }, paranoid: false });
                expect(dbSub).toBeDefined();
                expect(dbSub!.deleted_at).not.toBeNull();
            });

            it('should soft delete Entitlements when Organization is deleted', async () => {
                // 1. Create Tool & Feature
                const { Tool } = await import('../models/tool');
                const { Feature } = await import('../models/feature');
                const { OrganizationEntitlement } = await import('../models/organization_entitlement');

                const tool = await Tool.create({ name: 'Test Tool', slug: 'test-tool', is_active: true, trial_days: 0 });
                const feature = await Feature.create({ name: 'Test Feature', slug: 'test-feature', tool_id: tool.id });

                // 2. Create Entitlement
                const entitlement = await OrganizationEntitlement.create({
                    organization_id: orgId,
                    feature_id: feature.id,
                    tool_id: tool.id,
                    limit_amount: 100,
                    usage_amount: 0
                });

                // 3. Delete Organization
                await request(app)
                    .delete('/organizations')
                    .set('Cookie', authCookie)
                    .set('x-organization-id', orgId);

                // 4. Verify Entitlement is soft deleted
                const dbEnt = await OrganizationEntitlement.findOne({ where: { id: entitlement.id }, paranoid: false });
                expect(dbEnt).toBeDefined();
                expect(dbEnt!.deleted_at).not.toBeNull();
            });

            it('should cascade Tool deletion to Feature and Plan', async () => {
                const { Tool } = await import('../models/tool');
                const { Feature } = await import('../models/feature');
                const { Plan } = await import('../models/plan');

                // 1. Create Tool, Feature, Plan
                const tool = await Tool.create({ name: 'Cascade Tool', slug: 'cascade-tool', is_active: true, trial_days: 0 });
                const feature = await Feature.create({ name: 'Cascade Feat', slug: 'cascade-feat', tool_id: tool.id });
                const plan = await Plan.create({
                    name: 'Cascade Plan',
                    tool_id: tool.id,
                    price: 1000,
                    tier: TierType.BASIC,
                    currency: 'usd',
                    interval: PriceInterval.MONTHLY,
                    active: true
                });

                // 2. Delete Tool
                await Tool.destroy({ where: { id: tool.id }, individualHooks: true }); // Ensure hooks run

                // 3. Verify Cascade
                const dbFeat = await Feature.findOne({ where: { id: feature.id }, paranoid: false });
                expect(dbFeat!.deleted_at).not.toBeNull();

                const dbPlan = await Plan.findOne({ where: { id: plan.id }, paranoid: false });
                expect(dbPlan!.deleted_at).not.toBeNull();
            });

            it('should cascade Feature deletion to PlanLimit and Entitlement', async () => {
                const { Tool } = await import('../models/tool');
                const { Feature } = await import('../models/feature');
                const { Plan } = await import('../models/plan');
                const { PlanLimit } = await import('../models/plan_limit');
                const { OrganizationEntitlement } = await import('../models/organization_entitlement');

                const tool = await Tool.create({ name: 'Feat Cascade Tool', slug: 'feat-cascade-tool', is_active: true, trial_days: 0 });
                const feature = await Feature.create({ name: 'Feat Cascade Feat', slug: 'feat-cascade-feat', tool_id: tool.id });
                const plan = await Plan.create({ name: 'Plan Limit Plan', tool_id: tool.id, price: 100, tier: TierType.BASIC, currency: 'usd', interval: PriceInterval.MONTHLY, active: true });

                const planLimit = await PlanLimit.create({ plan_id: plan.id, feature_id: feature.id, default_limit: 50 });
                const entitlement = await OrganizationEntitlement.create({ organization_id: orgId, feature_id: feature.id, tool_id: tool.id, limit_amount: 50 });

                // Delete Feature
                await Feature.destroy({ where: { id: feature.id }, individualHooks: true });

                // Verify
                const dbLimit = await PlanLimit.findOne({ where: { id: planLimit.id }, paranoid: false });
                expect(dbLimit!.deleted_at).not.toBeNull();

                const dbEnt = await OrganizationEntitlement.findOne({ where: { id: entitlement.id }, paranoid: false });
                expect(dbEnt!.deleted_at).not.toBeNull();
            });
        });
    });
});
