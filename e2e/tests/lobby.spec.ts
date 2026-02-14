import { test, expect } from '@playwright/test';
import { players } from '../config/players';
import { waitForPathname } from '../helpers/wait';
import { delay } from '../helpers/game-setup';

/**
 * Lobby tests – room lifecycle with 4 players.
 * Covers: creation, joining, room-code visibility,
 * and the admin-only "Start Game" gate.
 * Does NOT start the game – that is game.spec.ts's job.
 */

test('4 players create a room, join, and see the full lobby', async ({ browser }) => {
  // One context per player, pre-authenticated
  const contexts = await Promise.all(
    players.map((p) => browser.newContext({ storageState: p.storageStatePath }))
  );
  const pages = await Promise.all(contexts.map((c) => c.newPage()));
  const [p1, p2, p3, p4] = pages;

  // ── P1 creates a room ───────────────────────────────────────────
  await p1.goto('/room/create');
  await p1.click('button:has-text("Create")');

  // create/page.tsx does router.push after a 2 s delay – poll pathname, not load event.
  await waitForPathname(p1, '^/room/(?!create$|join$)[A-Za-z0-9]+$');
  const roomCode = p1.url().split('/room/')[1];
  expect(roomCode).toHaveLength(6);

  // ── P2 – P4 join one at a time ──────────────────────────────────
  for (const page of [p2, p3, p4]) {
    await page.goto('/room/join');
    await page.fill('input[placeholder="Room Code"]', roomCode);
    await page.fill('input[placeholder="Your Name"]', 'Player');
    await page.click('button:has-text("Join")');
    await waitForPathname(page, '^/room/(?!create$|join$)[A-Za-z0-9]+$');
  }

  // ── Admin sees "Start Game" button (≥2 players joined) ─────────
  await expect(p1.locator('button:has-text("Start Game")')).toBeVisible({
    timeout: 15_000,
  });
  // Brief delay for all joins to propagate
  await delay(500);

  // ── Room code is visible everywhere ─────────────────────────────
  await Promise.all(
    pages.map((page) =>
      expect(page.locator(`text=${roomCode}`).first()).toBeVisible()
    )
  );

  // ── Only the admin sees "Start Game" ─────────────────────────────
  await expect(p1.locator('button:has-text("Start Game")')).toBeVisible();
  await Promise.all(
    [p2, p3, p4].map((page) =>
      expect(
        page.locator(':text("Waiting for host")')
      ).toBeVisible()
    )
  );

  // ── Cleanup ─────────────────────────────────────────────────────
  await Promise.all(contexts.map((c) => c.close()));
});
