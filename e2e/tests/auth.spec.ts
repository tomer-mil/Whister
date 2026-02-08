import { test, expect } from '@playwright/test';
import { players } from '../config/players';

/**
 * Auth smoke tests.
 * Each test reuses the storageState that globalSetup captured after
 * a successful browser login – no credentials are typed here.
 */

for (const player of players) {
  test(`player ${player.index + 1} is authenticated and sees the home page`, async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: player.storageStatePath });
    const page = await ctx.newPage();

    await page.goto('/');

    // Home page heading
    await expect(page.locator('h1')).toContainText('Whist Score Keeper');

    // Action cards present
    await expect(page.locator('a:has-text("Create Room")')).toBeVisible();
    await expect(page.locator('a:has-text("Join Room")')).toBeVisible();

    // Logout button confirms the session is live
    await expect(page.locator('button:has-text("Logout")')).toBeVisible();

    await ctx.close();
  });
}

test('unauthenticated visitor is redirected to /login', async ({ page }) => {
  // page comes with an empty context – no saved auth
  await page.goto('/');
  await expect(page).toHaveURL(/\/login/);
});
