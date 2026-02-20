import request from 'supertest';
import app from '../app';
import sequelize, { closeDB } from '../config/db';
import redisClient from '../config/redis';
import User from '../models/user';
import { Organization, OrganizationMember } from '../models/organization';
import { Role, Permission, RolePermission } from '../models/role';
import { Invitation } from '../models/invitation';
import { mailService } from '../services/mail.service';
import { seedPermissions } from './test-helpers';

describe('Invitation API Integration Tests', () => {
    const ownerUser = {
        email: 'owner@example.com',
        password: 'Password123!',
        full_name: 'Owner User'
    };

    const invitedUserEmail = 'newhire@example.com';

    let authCookie: string[];
    let memberRoleId: number;
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
        await RolePermission.destroy({ where: {}, truncate: true, cascade: true, force: true });
        await Permission.destroy({ where: {}, truncate: true, cascade: true, force: true });
        await Invitation.destroy({ where: {}, truncate: true, cascade: true, force: true });
        await OrganizationMember.destroy({ where: {}, truncate: true, cascade: true, force: true });
        await Organization.destroy({ where: {}, truncate: true, cascade: true, force: true });
        await User.destroy({ where: {}, truncate: true, cascade: true, force: true });
        await Role.destroy({ where: {}, truncate: true, cascade: true, force: true });
        await redisClient.flushAll();

        // Register Owner
        const res = await request(app).post('/auth/register').send(ownerUser);
        authCookie = res.get('Set-Cookie') || [];

        // Create Organization
        const orgRes = await request(app)
            .post('/organizations')
            .set('Cookie', authCookie)
            .send({ name: 'Tech Corp', website: 'https://tech.com' });
        orgId = orgRes.body.organization.id;

        // Create Member role
        const memberRole = await Role.create({ name: 'Member', description: 'Regular Member' });
        memberRoleId = memberRole.id;

        // Seed permissions and role-permission mappings for permission middleware
        await seedPermissions();
    });

    afterAll(async () => {
        await redisClient.quit();
        await closeDB();
    });

    describe('POST /invitations', () => {
        it('should send an invitation email and create record', async () => {
            const sendMailSpy = jest.spyOn(mailService, 'sendMail').mockResolvedValue();

            const res = await request(app)
                .post('/invitations')
                .set('Cookie', authCookie)
                .set('x-organization-id', orgId)
                .send({ email: invitedUserEmail, role_id: memberRoleId });

            expect(res.statusCode).toEqual(201);
            expect(res.body.message).toEqual('Invitation sent');
            expect(res.body.invitation.email).toEqual(invitedUserEmail);
            expect(res.body.invitation.status).toEqual('pending');

            expect(sendMailSpy).toHaveBeenCalled();
            expect(sendMailSpy.mock.calls[0][0].to).toEqual(invitedUserEmail);

            sendMailSpy.mockRestore();
        });

        it('should fail if user processes validation error (already invited)', async () => {
            // Invite once
            await request(app)
                .post('/invitations')
                .set('Cookie', authCookie)
                .set('x-organization-id', orgId)
                .send({ email: invitedUserEmail, role_id: memberRoleId });

            // Invite again
            const res = await request(app)
                .post('/invitations')
                .set('Cookie', authCookie)
                .set('x-organization-id', orgId)
                .send({ email: invitedUserEmail, role_id: memberRoleId });

            expect(res.statusCode).toEqual(400);
            expect(res.body.message).toEqual('User already invited');
        });
    });

    describe('GET /invitations', () => {
        it('should list pending invitations', async () => {
             await request(app)
                .post('/invitations')
                .set('Cookie', authCookie)
                .set('x-organization-id', orgId)
                .send({ email: invitedUserEmail, role_id: memberRoleId });

            const res = await request(app)
                .get('/invitations')
                .set('Cookie', authCookie)
                .set('x-organization-id', orgId);

            expect(res.statusCode).toEqual(200);
            expect(res.body.length).toBe(1);
            expect(res.body[0].email).toEqual(invitedUserEmail);
        });
    });

    describe('DELETE /invitations/:id', () => {
        it('should revoke an invitation', async () => {
            const inviteRes = await request(app)
                .post('/invitations')
                .set('Cookie', authCookie)
                .set('x-organization-id', orgId)
                .send({ email: invitedUserEmail, role_id: memberRoleId });
            
            const inviteId = inviteRes.body.invitation.id;

            const res = await request(app)
                .delete(`/invitations/${inviteId}`)
                .set('Cookie', authCookie)
                .set('x-organization-id', orgId);

            expect(res.statusCode).toEqual(200);
            expect(res.body.message).toEqual('Invitation revoked');

            // Verify it's gone
            const listRes = await request(app).get('/invitations').set('Cookie', authCookie).set('x-organization-id', orgId);
            expect(listRes.body.length).toBe(0);
        });
    });
});
