
import request from 'supertest';
import app from '../app';
import User from '../models/user';
import { Organization, OrganizationMember } from '../models/organization';
import { Role } from '../models/role';
import { closeDB, connectDB } from '../config/db';
import { closeRedis, connectRedis } from '../config/redis';
import bcrypt from 'bcryptjs';

let user: User;
let token: string;
let organization: Organization;

beforeAll(async () => {
    await connectDB();
    await connectRedis();
});

afterAll(async () => {
    await closeDB();
    await closeRedis();
});

beforeEach(async () => {
    // Clear DB
    await User.destroy({ where: {}, truncate: true, cascade: true });
    await Organization.destroy({ where: {}, truncate: true, cascade: true });

    // Create user
    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash('password123', salt);

    user = await User.create({
        email: 'test@example.com',
        password_hash,
        full_name: 'Test User'
    });

    // Login to get session cookie
    const res = await request(app)
        .post('/auth/login')
        .send({
            email: 'test@example.com',
            password: 'password123'
        });

    const cookies = res.headers['set-cookie'];
    if (Array.isArray(cookies)) {
        token = cookies.find((c: string) => c.startsWith('session_id')) || '';
    } else if (typeof cookies === 'string') {
        token = cookies.startsWith('session_id') ? cookies : '';
    }
});

describe('User Controller', () => {
    describe('PUT /users/me', () => {
        it('should update user profile successfully', async () => {
            const res = await request(app)
                .put('/users/me')
                .set('Cookie', [token])
                .send({
                    full_name: 'Updated Name',
                    email: 'updated@example.com'
                });

            expect(res.status).toBe(200);
            expect(res.body.user.full_name).toBe('Updated Name');
            expect(res.body.user.email).toBe('updated@example.com');

            const updatedUser = await User.findByPk(user.id);
            expect(updatedUser?.full_name).toBe('Updated Name');
            expect(updatedUser?.email).toBe('updated@example.com');
        });

        it('should fail with invalid email', async () => {
            const res = await request(app)
                .put('/users/me')
                .set('Cookie', [token])
                .send({
                    email: 'invalid-email'
                });

            expect(res.status).toBe(400);
            expect(res.body.message).toBe('Invalid email format');
        });

        it('should fail if email is already taken', async () => {
            // Create another user
            await User.create({
                email: 'other@example.com',
                full_name: 'Other User'
            });

            const res = await request(app)
                .put('/users/me')
                .set('Cookie', [token])
                .send({
                    email: 'other@example.com'
                });

            expect(res.status).toBe(400);
            expect(res.body.message).toBe('Email already in use');
        });
    });

    describe('PUT /users/me/password', () => {
        it('should update password successfully', async () => {
            const res = await request(app)
                .put('/users/me/password')
                .set('Cookie', [token])
                .send({
                    currentPassword: 'password123',
                    newPassword: 'newpassword123'
                });

            expect(res.status).toBe(200);
            expect(res.body.message).toBe('Password changed successfully');

            // Verify login with new password
            const loginRes = await request(app)
                .post('/auth/login')
                .send({
                    email: 'test@example.com', // email wasn't changed
                    password: 'newpassword123'
                });

            expect(loginRes.status).toBe(200);
        });

        it('should fail with incorrect current password', async () => {
            const res = await request(app)
                .put('/users/me/password')
                .set('Cookie', [token])
                .send({
                    currentPassword: 'wrongpassword',
                    newPassword: 'newpassword123'
                });

            expect(res.status).toBe(400);
            expect(res.body.message).toBe('Incorrect current password');
        });
    });

    describe('DELETE /users/me', () => {
        it('should delete user account successfully', async () => {
            const res = await request(app)
                .delete('/users/me')
                .set('Cookie', [token]);

            expect(res.status).toBe(200);
            expect(res.body.message).toBe('Account deleted successfully');

            // Verify session cookie is cleared
            // const cookies = res.headers['set-cookie'];
            // expect(JSON.stringify(cookies)).toMatch(/session_id=;/);

            // Verify user is deleted from DB
            const deletedUser = await User.findByPk(user.id);
            expect(deletedUser).toBeNull();

            // Verify cascade delete (OrganizationMember)
            const members = await OrganizationMember.findAll({ where: { user_id: user.id } });
            expect(members.length).toBe(0);
        });

        it('should fail if not authenticated', async () => {
            const res = await request(app)
                .delete('/users/me');

            expect(res.status).toBe(401);
        });
    });
});
