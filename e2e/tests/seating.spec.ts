// e2e/tests/seating.spec.ts
import { test, expect } from '@playwright/test';
import {
  setupFourPlayers,
  createAndJoinRoom,
  startGameToSeating,
  findActivePage,
  delay,
} from '../helpers/game-setup';

test.describe('Seating Selection', () => {
  test('seating page shows all 4 players', async ({ browser }) => {
    const { contexts, pages } = await setupFourPlayers(browser);
    await createAndJoinRoom(pages);
    await startGameToSeating(pages);

    // All players should see the seating page (verified by URL in helper)
    // Verify 4 PlayerShape SVGs are visible on admin page
    const shapes = pages[0].locator('svg');
    await expect(shapes.first()).toBeVisible({ timeout: 10_000 });

    // Verify player names are visible
    // Each player has a <span> with their display name below the shape
    const nameSpans = pages[0].locator('section span.text-xs');
    const count = await nameSpans.count();
    expect(count).toBeGreaterThanOrEqual(4);

    await Promise.all(contexts.map((c) => c.close()));
  });

  test('only admin sees the Confirm button', async ({ browser }) => {
    const { contexts, pages } = await setupFourPlayers(browser);
    const [p1, p2, p3, p4] = pages;
    await createAndJoinRoom(pages);
    await startGameToSeating(pages);

    // Admin (p1) sees the Confirm button
    await expect(p1.locator('button:has-text("Confirm")')).toBeVisible({
      timeout: 10_000,
    });

    // Non-admins see "Waiting for host" message
    for (const page of [p2, p3, p4]) {
      await expect(
        page.locator(':text("Waiting for host")')
      ).toBeVisible({ timeout: 10_000 });
    }

    await Promise.all(contexts.map((c) => c.close()));
  });

  test('admin can swap two players by tap-to-swap', async ({ browser }) => {
    const { contexts, pages } = await setupFourPlayers(browser);
    const [p1] = pages;
    await createAndJoinRoom(pages);
    await startGameToSeating(pages);

    // Get initial player names in seat order
    await delay(1000); // Let all players render

    // Player names are in <span> elements with class text-xs inside the compass section
    const getPlayerNames = async () => {
      const names: string[] = [];
      const nameSpans = p1.locator('section span.text-xs.font-medium');
      const count = await nameSpans.count();
      for (let i = 0; i < count; i++) {
        const text = await nameSpans.nth(i).textContent();
        if (text?.trim()) names.push(text.trim());
      }
      return names;
    };

    const namesBefore = await getPlayerNames();
    expect(namesBefore.length).toBe(4);

    // Click first player's name span's parent div to select
    const firstNameSpan = p1.locator('section span.text-xs.font-medium').first();
    const firstContainer = firstNameSpan.locator('xpath=ancestor::div[contains(@class, "absolute")]');
    await firstContainer.click();
    await delay(300);

    // Click second player to swap
    const secondNameSpan = p1.locator('section span.text-xs.font-medium').nth(1);
    const secondContainer = secondNameSpan.locator('xpath=ancestor::div[contains(@class, "absolute")]');
    await secondContainer.click();
    await delay(1000); // Wait for WebSocket round-trip

    const namesAfter = await getPlayerNames();
    expect(namesAfter.length).toBe(4);

    // The first two names should be swapped
    expect(namesAfter[0]).toBe(namesBefore[1]);
    expect(namesAfter[1]).toBe(namesBefore[0]);
    // The last two should remain unchanged
    expect(namesAfter[2]).toBe(namesBefore[2]);
    expect(namesAfter[3]).toBe(namesBefore[3]);

    await Promise.all(contexts.map((c) => c.close()));
  });

  test('non-admin players see swap updates in real time', async ({ browser }) => {
    const { contexts, pages } = await setupFourPlayers(browser);
    const [p1, p2] = pages;
    await createAndJoinRoom(pages);
    await startGameToSeating(pages);

    await delay(1000);

    const getPlayerNames = async (page: typeof p1) => {
      const names: string[] = [];
      const nameSpans = page.locator('section span.text-xs.font-medium');
      const count = await nameSpans.count();
      for (let i = 0; i < count; i++) {
        const text = await nameSpans.nth(i).textContent();
        if (text?.trim()) names.push(text.trim());
      }
      return names;
    };

    const namesBefore = await getPlayerNames(p2);

    // Admin swaps first two players
    const firstNameSpan = p1.locator('section span.text-xs.font-medium').first();
    const firstContainer = firstNameSpan.locator('xpath=ancestor::div[contains(@class, "absolute")]');
    await firstContainer.click();
    await delay(300);
    const secondNameSpan = p1.locator('section span.text-xs.font-medium').nth(1);
    const secondContainer = secondNameSpan.locator('xpath=ancestor::div[contains(@class, "absolute")]');
    await secondContainer.click();
    await delay(1500); // Wait for WebSocket broadcast to reach p2

    // Non-admin should see the updated order
    const namesAfter = await getPlayerNames(p2);
    expect(namesAfter[0]).toBe(namesBefore[1]);
    expect(namesAfter[1]).toBe(namesBefore[0]);

    await Promise.all(contexts.map((c) => c.close()));
  });

  test('confirm seating navigates all players to game page', async ({ browser }) => {
    const { contexts, pages } = await setupFourPlayers(browser);
    const [p1] = pages;
    await createAndJoinRoom(pages);
    await startGameToSeating(pages);

    // Admin clicks Confirm
    await p1.click('button:has-text("Confirm")');

    // All players should end up on the game page with trump bidding
    const activeIdx = await findActivePage(
      pages,
      'button:has-text("Pass")',
      20_000,
    );
    expect(activeIdx).toBeGreaterThanOrEqual(0);

    await Promise.all(contexts.map((c) => c.close()));
  });
});
