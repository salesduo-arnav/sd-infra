
import request from 'supertest';
import app from '../app';
import sequelize from '../config/db';
import redisClient from '../config/redis';
import User from '../models/user';
import { Organization, OrganizationMember } from '../models/organization'; // Ensure named export if that's how it is
import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: path.join(__dirname, '../../.env') });

describe('Admin User Management', () => {
    let adminUser: User;
    let normalUser: User;
    let adminSession: string;
    let normalSession: string;

    beforeAll(async () => {
        await sequelize.sync({ force: true });
        if (!redisClient.isOpen) {
            await redisClient.connect();
        }

        // Create Admin User
        adminUser = await User.create({
            email: 'admin@example.com',
            full_name: 'Admin User',
            is_superuser: true
        });

        // Create Normal User
        normalUser = await User.create({
            email: 'user@example.com',
            full_name: 'Normal User',
            is_superuser: false
        });

        // Create extra users for pagination
        for (let i = 0; i < 15; i++) {
            await User.create({
                email: `user${i}@example.com`,
                full_name: `User ${i}`,
                is_superuser: false
            });
        }

        // Mock Login / Session creation (since we use cookie based auth)
        // We will manually set the session in Redis and Cookie
        adminSession = 'admin-session-id';
        await redisClient.set(`session:${adminSession}`, JSON.stringify(adminUser));

        normalSession = 'normal-session-id';
        await redisClient.set(`session:${normalSession}`, JSON.stringify(normalUser));
    });

    afterAll(async () => {
        await sequelize.close();
        if (redisClient.isOpen) {
            await redisClient.quit();
        }
    });

    describe('GET /admin/users', () => {
        it('should deny access to normal users', async () => {
            const res = await request(app)
                .get('/admin/users')
                .set('Cookie', [`session_id=${normalSession}`]);

            expect(res.status).toBe(403);
        });

        it('should allow access to admin users', async () => {
            const res = await request(app)
                .get('/admin/users')
                .set('Cookie', [`session_id=${adminSession}`]);

            expect(res.status).toBe(200);
            expect(res.body.users).toBeDefined();
            expect(Array.isArray(res.body.users)).toBe(true);
        });

        it('should return paginated results', async () => {
            const res = await request(app)
                .get('/admin/users?page=1&limit=10')
                .set('Cookie', [`session_id=${adminSession}`]);

            expect(res.status).toBe(200);
            expect(res.body.users.length).toBe(10);
            expect(res.body.meta.totalItems).toBeGreaterThan(15);
            expect(res.body.meta.totalPages).toBeGreaterThan(1);
        });

        it('should filter users by search term', async () => {
            const res = await request(app)
                .get('/admin/users?search=User 1')
                .set('Cookie', [`session_id=${adminSession}`]);

            // Should match 'User 1', 'User 10', 'User 11'...
            expect(res.status).toBe(200);
            expect(res.body.users.length).toBeGreaterThan(0);
            res.body.users.forEach((u: any) => {
                expect(u.full_name).toContain('User 1');
            });
        });

        it('should sort users', async () => {
            const res = await request(app)
                .get('/admin/users?sortBy=email&sortOrder=asc&limit=5')
                .set('Cookie', [`session_id=${adminSession}`]);

            expect(res.status).toBe(200);
            const users = res.body.users;
            // Check if sorted by email
            const emails = users.map((u: any) => u.email);
            const sortedEmails = [...emails].sort();
            expect(emails).toEqual(sortedEmails);
        });
    });

    describe('PATCH /admin/users/:id', () => {
        it('should update user details', async () => {
            const newName = 'Updated Name';
            const res = await request(app)
                .patch(`/admin/users/${normalUser.id}`)
                .set('Cookie', [`session_id=${adminSession}`])
                .send({ full_name: newName });

            expect(res.status).toBe(200);
            expect(res.body.user.full_name).toBe(newName);

            const updatedUser = await User.findByPk(normalUser.id);
            expect(updatedUser?.full_name).toBe(newName);

        });

        it('should prevent admin from revoking their own superuser status', async () => {
            const res = await request(app)
                .patch(`/admin/users/${adminUser.id}`)
                .set('Cookie', [`session_id=${adminSession}`])
                .send({ is_superuser: false });

            expect(res.status).toBe(403);
            expect(res.body.message).toContain('cannot revoke your own admin privileges');

            const refetchedAdmin = await User.findByPk(adminUser.id);
            expect(refetchedAdmin?.is_superuser).toBe(true);
        });
    });

    describe('DELETE /admin/users/:id', () => {
        it('should delete user', async () => {
            // Create a dummy user to delete
            const userToDelete = await User.create({
                email: 'delete@example.com',
                full_name: 'To Delete',
                is_superuser: false
            });

            const res = await request(app)
                .delete(`/admin/users/${userToDelete.id}`)
                .set('Cookie', [`session_id=${adminSession}`]);

            expect(res.status).toBe(200);

            const checks = await User.findByPk(userToDelete.id);
            expect(checks).toBeNull();
        });

        it('should prevent admin from deleting themselves', async () => {
            const res = await request(app)
                .delete(`/admin/users/${adminUser.id}`)
                .set('Cookie', [`session_id=${adminSession}`]);

            expect(res.status).toBe(403);
            expect(res.body.message).toContain('cannot delete your own account');

            const refetchedAdmin = await User.findByPk(adminUser.id);
            expect(refetchedAdmin).not.toBeNull();
        });
    });
});
