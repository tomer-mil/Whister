import { test, expect } from '@playwright/test';
import { players } from '../config/players';
import { waitForPathname } from '../helpers/wait';

/**
 * Lobby tests – room lifecycle with 4 players.
 * Covers: creation, joining, player-count display, room-code visibility,
 * and the admin-only "Start Playing" gate.
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
  await p1.click('button:has-text("Create Room")');

  // create/page.tsx does router.push after a 2 s delay – poll pathname, not load event.
  // Negative lookahead excludes the static routes /room/create and /room/join, which
  // are already the current pathname at this point and would otherwise match instantly.
  await waitForPathname(p1, '^/room/(?!create$|join$)[A-Za-z0-9]+$');
  const roomCode = p1.url().split('/room/')[1];
  expect(roomCode).toHaveLength(6);

  // ── P2 – P4 join one at a time ──────────────────────────────────
  // Sequential: concurrent joins cause "Failed to fetch" from the API proxy.
  for (const page of [p2, p3, p4]) {
    await page.goto('/room/join');
    await page.fill('input[placeholder="ABC123"]', roomCode);
    // displayName is required by the join-room zod schema (min 2 chars)
    await page.fill('input[placeholder="Your name"]', 'Player');
    await page.click('button:has-text("Join Room")');
    // join-room-form.tsx uses router.push – poll, don't wait for load
    await waitForPathname(page, '^/room/(?!create$|join$)[A-Za-z0-9]+$');
  }

  // ── All 4 see the full player list ──────────────────────────────
  await Promise.all(
    pages.map((page) =>
      expect(page.locator('text=Players (4/4)')).toBeVisible({ timeout: 15_000 })
    )
  );

  // ── Room code is visible everywhere ─────────────────────────────
  // The code renders in both the header and the large copy-button display;
  // use .first() to satisfy Playwright strict mode.
  await Promise.all(
    pages.map((page) =>
      expect(page.locator(`text=${roomCode}`).first()).toBeVisible()
    )
  );

  // ── Only the admin sees "Start Playing" ────────────────────────
  await expect(p1.locator('button:has-text("Start Playing")')).toBeVisible();
  await Promise.all(
    [p2, p3, p4].map((page) =>
      expect(
        page.locator('text=Waiting for the room admin to start the game...')
      ).toBeVisible()
    )
  );

  // ── Cleanup ─────────────────────────────────────────────────────
  await Promise.all(contexts.map((c) => c.close()));
});
