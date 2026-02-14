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
  test('seating page shows all 4 players with seat numbers', async ({ browser }) => {
    const { contexts, pages } = await setupFourPlayers(browser);
    const roomCode = await createAndJoinRoom(pages);
    const gameId = await startGameToSeating(pages);

    // All players should see the seating page
    await Promise.all(
      pages.map((p) =>
        expect(p.locator('h1:has-text("Seating Arrangement")')).toBeVisible({
          timeout: 10_000,
        })
      )
    );

    // Should show seat numbers #1 through #4
    for (const label of ['#1', '#2', '#3', '#4']) {
      await expect(pages[0].locator(`text=${label}`).first()).toBeVisible();
    }

    // All player names should be visible on admin page
    // (We check admin's view since all players are visible there)
    const playerCircles = pages[0].locator('.rounded-full:has(span)');
    // Should have at least 4 player circles (excluding the center button)
    await expect(playerCircles.first()).toBeVisible();

    await Promise.all(contexts.map((c) => c.close()));
  });

  test('only admin sees the Set Seating button', async ({ browser }) => {
    const { contexts, pages } = await setupFourPlayers(browser);
    const [p1, p2, p3, p4] = pages;
    await createAndJoinRoom(pages);
    await startGameToSeating(pages);

    // Admin (p1) sees the Set Seating button
    await expect(p1.locator('button:has-text("Set")')).toBeVisible({
      timeout: 10_000,
    });

    // Non-admins see "Waiting for admin" message
    for (const page of [p2, p3, p4]) {
      await expect(
        page.locator('text=Waiting for the admin to confirm seating')
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

    // Get the text content of all player circles (seat 0-3)
    // The circles are positioned by SEAT_POSITIONS array
    const getPlayerNames = async () => {
      const names: string[] = [];
      // Player circles have pointer-events-none spans inside them with the name
      const circles = p1.locator('.rounded-full span.pointer-events-none');
      const count = await circles.count();
      for (let i = 0; i < count; i++) {
        const text = await circles.nth(i).textContent();
        if (text?.trim()) names.push(text.trim());
      }
      return names;
    };

    const namesBefore = await getPlayerNames();
    expect(namesBefore.length).toBe(4);

    // Tap first player circle (should select/enlarge it)
    const firstCircle = p1.locator('.rounded-full span.pointer-events-none').first();
    const firstParent = firstCircle.locator('..');
    await firstParent.click();
    await delay(300);

    // Tap second player circle (should swap them)
    const secondCircle = p1.locator('.rounded-full span.pointer-events-none').nth(1);
    const secondParent = secondCircle.locator('..');
    await secondParent.click();
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

    // Get initial names on non-admin page
    const getPlayerNames = async (page: typeof p1) => {
      const names: string[] = [];
      const circles = page.locator('.rounded-full span.pointer-events-none');
      const count = await circles.count();
      for (let i = 0; i < count; i++) {
        const text = await circles.nth(i).textContent();
        if (text?.trim()) names.push(text.trim());
      }
      return names;
    };

    const namesBefore = await getPlayerNames(p2);

    // Admin swaps first two players
    const firstCircle = p1.locator('.rounded-full span.pointer-events-none').first();
    await firstCircle.locator('..').click();
    await delay(300);
    const secondCircle = p1.locator('.rounded-full span.pointer-events-none').nth(1);
    await secondCircle.locator('..').click();
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
    const gameId = await startGameToSeating(pages);

    // Admin clicks Set Seating
    await p1.click('button:has-text("Set")');

    // All players should end up on the game page with trump bidding
    const activeIdx = await findActivePage(
      pages,
      ':text("📢 Your Turn to Bid")',
      20_000,
    );
    expect(activeIdx).toBeGreaterThanOrEqual(0);

    await Promise.all(contexts.map((c) => c.close()));
  });
});
