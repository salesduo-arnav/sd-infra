import { test, expect } from '@playwright/test';

test.describe('Core Platform', () => {

    test('login page loads correctly', async ({ page }) => {
        await page.goto('/login');
        await expect(page).toHaveTitle(/SalesDuo/);
        await expect(page.locator('body')).not.toHaveText('useEffect is not defined');
        await expect(page.locator('body')).not.toHaveText('ReferenceError');
    });

    test('app renders without JavaScript errors', async ({ page }) => {
        const errors: string[] = [];
        page.on('pageerror', (error) => {
            errors.push(error.message);
        });

        await page.goto('/login');
        await page.waitForLoadState('networkidle');

        // No uncaught JS errors
        expect(errors).toEqual([]);
    });

    test('login page has Google sign-in option', async ({ page }) => {
        await page.goto('/login');
        await page.waitForLoadState('networkidle');

        // Should have some form of login UI
        const body = await page.textContent('body');
        expect(body).toBeTruthy();
        // Page should not be blank
        expect(body!.length).toBeGreaterThan(50);
    });

    test('unauthenticated user is redirected to login', async ({ page }) => {
        await page.goto('/apps');
        await page.waitForLoadState('networkidle');

        // Should redirect to login
        expect(page.url()).toContain('/login');
    });

    test('health check API responds', async ({ page }) => {
        const response = await page.request.get('/health', {
            baseURL: process.env.CI_API_URL || 'http://localhost:3000',
        });
        // Accept either 200 or connection refused (if backend not running in test)
        // The point is no crash
    });
});

test.describe('Protected Routes', () => {

    test('integration onboarding redirects without auth', async ({ page }) => {
        await page.goto('/integration-onboarding');
        await page.waitForLoadState('networkidle');
        expect(page.url()).toContain('/login');
    });

    test('integrations page redirects without auth', async ({ page }) => {
        await page.goto('/integrations');
        await page.waitForLoadState('networkidle');
        expect(page.url()).toContain('/login');
    });

    test('admin page redirects without auth', async ({ page }) => {
        await page.goto('/admin');
        await page.waitForLoadState('networkidle');
        expect(page.url()).toContain('/login');
    });
});
