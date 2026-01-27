import { test, expect } from '@playwright/test';

test.describe('Item Manager App', () => {

    // Mock the initial data fetch before every test
    test.beforeEach(async ({ page }) => {
        // Mock GET /items
        await page.route('**/items', async route => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify([
                    { id: 1, name: 'Existing Item A' },
                    { id: 2, name: 'Existing Item B' }
                ]),
            });
        });

        await page.goto('/');
    });

    test('should display existing items on load', async ({ page }) => {
        await expect(page.getByText('Item Manager')).toBeVisible();
        await expect(page.getByText('Existing Item A')).toBeVisible();
        await expect(page.getByText('Existing Item B')).toBeVisible();
    });

    test('should add a new item to the list', async ({ page }) => {
        // Mock POST /items request
        await page.route('**/items', async route => {
            if (route.request().method() === 'POST') {
                const postData = route.request().postDataJSON();
                await route.fulfill({
                    status: 201,
                    contentType: 'application/json',
                    body: JSON.stringify({ id: 3, name: postData.name }),
                });
            } else {
                await route.continue();
            }
        });

        // Interact with UI
        const input = page.getByPlaceholder('Enter item name...');
        await input.fill('New SalesDuo Feature');
        await page.getByRole('button', { name: 'Add Item' }).click();

        // Verify UI update
        await expect(page.getByText('New SalesDuo Feature')).toBeVisible();

        // Optional: Verify the ID was rendered correctly (based on your mock)
        await expect(page.getByText('#3')).toBeVisible();
    });

    test('should handle API errors gracefully', async ({ page }) => {
        // Force the API to fail
        await page.route('**/items', async route => {
            await route.abort('failed');
        });

        await page.reload();
        await expect(page.locator('.error-message')).toContainText('Failed to connect to backend');
    });
});