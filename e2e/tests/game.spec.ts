// e2e/tests/game.spec.ts
import { test, expect } from '@playwright/test';
import {
  setupFourPlayers,
  createAndJoinRoom,
  startGameToSeating,
  confirmSeating,
  simpleTrumpBidding,
  simpleContractBidding,
  playTricks,
  waitForScores,
  playFullRound,
  findActivePage,
} from '../helpers/game-setup';
import { waitForPathname } from '../helpers/wait';

test('full 4-player game round: seating → trump → contract → tricks → scores', async ({
  browser,
}) => {
  const { contexts, pages } = await setupFourPlayers(browser);

  // ── 1. Room + Lobby ────────────────────────────────────────────
  const roomCode = await createAndJoinRoom(pages);

  // ── 2. Seating ─────────────────────────────────────────────────
  const gameId = await startGameToSeating(pages);
  await confirmSeating(pages);

  // ── 3. Trump Bidding ───────────────────────────────────────────
  const trumpWinnerIdx = await simpleTrumpBidding(pages);

  await Promise.all(
    pages.map((p) =>
      expect(p.locator(':text("♣")').first()).toBeVisible({ timeout: 10_000 })
    )
  );

  // ── 4. Contract Bidding ────────────────────────────────────────
  await simpleContractBidding(pages, trumpWinnerIdx, 5, 2);

  // ── 5. Playing Phase ──────────────────────────────────────────
  await playTricks(roomCode, [4, 3, 3, 3]);

  // ── 6. Round Complete → Scores ────────────────────────────────
  await waitForScores(pages, gameId);

  await Promise.all(
    pages.map(async (p) => {
      await expect(p.locator('button:has-text("New Round")')).toBeVisible({
        timeout: 5_000,
      });
      await expect(p.locator(':text("♣")')).toBeVisible({ timeout: 5_000 });
    })
  );

  await Promise.all(contexts.map((c) => c.close()));
});

test('new round: complete round 1, click New Round, verify round 2 starts', async ({
  browser,
}) => {
  const { contexts, pages } = await setupFourPlayers(browser);
  const [p1] = pages;

  // ── Round 1 (fast-path using helper) ───────────────────────────
  const roomCode = await createAndJoinRoom(pages);
  const gameId = await startGameToSeating(pages);
  await playFullRound(pages, roomCode, gameId);

  // ── Click New Round ──────────────────────────────────────────
  await expect(p1.locator('button:has-text("New Round")')).toBeVisible({
    timeout: 5_000,
  });
  await p1.click('button:has-text("New Round")');

  // All pages should navigate via WebSocket broadcast
  await Promise.all(
    pages.map((p) => waitForPathname(p, `^/game/${gameId}`, 15_000))
  );

  // Verify trump bidding UI appears for Round 2
  const activeIdx = await findActivePage(pages, 'button:has-text("Pass")', 15_000);
  expect(activeIdx).toBeGreaterThanOrEqual(0);

  await Promise.all(contexts.map((c) => c.close()));
});
