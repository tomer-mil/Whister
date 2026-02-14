// e2e/helpers/game-setup.ts
import { expect, Page, Browser, BrowserContext } from '@playwright/test';
import { players, loadToken, PlayerConfig } from '../config/players';
import { connectSocket, claimTrick } from './socket';
import { waitForPathname } from './wait';

/**
 * Set up 4 browser contexts with pre-authenticated storage state.
 * Returns contexts and pages arrays.
 */
export async function setupFourPlayers(browser: Browser): Promise<{
  contexts: BrowserContext[];
  pages: Page[];
}> {
  const contexts = await Promise.all(
    players.map((p) => browser.newContext({ storageState: p.storageStatePath }))
  );
  const pages = await Promise.all(contexts.map((c) => c.newPage()));
  return { contexts, pages };
}

/**
 * Create a room with player 1 and have players 2-4 join.
 * Returns the room code.
 */
export async function createAndJoinRoom(pages: Page[]): Promise<string> {
  const [p1, ...others] = pages;

  await p1.goto('/room/create');
  await p1.click('button:has-text("Create Room")');
  await waitForPathname(p1, '^/room/(?!create$|join$)[A-Za-z0-9]+$');
  const roomCode = p1.url().split('/room/')[1];

  for (const page of others) {
    await page.goto('/room/join');
    await page.fill('input[placeholder="ABC123"]', roomCode);
    await page.fill('input[placeholder="Your name"]', 'Player');
    await page.click('button:has-text("Join Room")');
    await waitForPathname(page, '^/room/(?!create$|join$)[A-Za-z0-9]+$');
  }

  await Promise.all(
    pages.map((p) =>
      expect(p.locator('text=Players (4/4)')).toBeVisible({ timeout: 15_000 })
    )
  );

  return roomCode;
}

/**
 * Admin clicks "Start Playing" and all players wait for the seating page.
 * Returns the gameId extracted from the URL.
 */
export async function startGameToSeating(pages: Page[]): Promise<string> {
  const [p1] = pages;
  await p1.click('button:has-text("Start Playing")');

  // All players should navigate to /game/[gameId]/seating
  await Promise.all(
    pages.map((p) => waitForPathname(p, '/game/[^/]+/seating', 20_000))
  );

  // Verify seating page loaded
  await expect(pages[0].locator('h1:has-text("Seating Arrangement")')).toBeVisible({
    timeout: 10_000,
  });

  // Extract gameId from URL: /game/<gameId>/seating
  const url = pages[0].url();
  const match = url.match(/\/game\/([^/]+)\//);
  if (!match) throw new Error(`Could not extract gameId from URL: ${url}`);
  return match[1];
}

/**
 * Admin confirms seating (no swaps). All players wait for game page.
 */
export async function confirmSeating(pages: Page[]): Promise<void> {
  const [p1] = pages;

  // Admin clicks "Set Seating" button (renders as "Set\nSeating")
  await p1.click('button:has-text("Set")');

  // All players should navigate to /game/[gameId] (trump bidding)
  // Wait for the trump bidding UI to appear on at least one page
  const activeIdx = await findActivePage(pages, ':text("📢 Your Turn to Bid")', 20_000);
  expect(activeIdx).toBeGreaterThanOrEqual(0);
}

/**
 * Run a simple trump bidding round: first bidder bids minimum with clubs,
 * everyone else passes. Returns the winner's page index.
 */
export async function simpleTrumpBidding(pages: Page[]): Promise<number> {
  let trumpWinnerIdx = -1;

  for (let attempt = 0; attempt < 8; attempt++) {
    const activeIdx = await findActivePage(pages, ':text("📢 Your Turn to Bid")');
    if (activeIdx === -1) break;

    if (trumpWinnerIdx === -1) {
      await pages[activeIdx].click('button:has-text("♣")');
      await pages[activeIdx].click('button:has-text("📢 Call")');
      trumpWinnerIdx = activeIdx;
    } else {
      await pages[activeIdx].click('button:has-text("🚫 Pass")');
    }

    await delay(700);
  }

  expect(trumpWinnerIdx).toBeGreaterThanOrEqual(0);
  return trumpWinnerIdx;
}

/**
 * Run contract bidding. Trump winner bids `winnerBid`, others bid `otherBid`.
 */
export async function simpleContractBidding(
  pages: Page[],
  trumpWinnerIdx: number,
  winnerBid: number,
  otherBid: number,
): Promise<void> {
  for (let round = 0; round < 4; round++) {
    const activeIdx = await findActivePage(pages, 'button:has-text("Confirm Bid")');
    if (activeIdx === -1) break;

    const targetBid = activeIdx === trumpWinnerIdx ? winnerBid : otherBid;
    const plusBtn = pages[activeIdx].locator('button:has-text("+")').first();

    for (let i = 0; i < targetBid; i++) {
      await plusBtn.click();
      await delay(60);
    }

    await pages[activeIdx].click('button:has-text("Confirm Bid")');
    await delay(700);
  }

  // Verify playing phase starts
  await Promise.all(
    pages.map((p) =>
      expect(p.locator(':text("CLAIM TRICK")')).toBeVisible({ timeout: 10_000 })
    )
  );
}

/**
 * Claim 13 tricks distributed as specified.
 * @param distribution - Array of 4 numbers summing to 13, e.g. [4,3,3,3]
 */
export async function playTricks(
  roomCode: string,
  distribution: [number, number, number, number],
): Promise<void> {
  const total = distribution.reduce((a, b) => a + b, 0);
  if (total !== 13) throw new Error(`Trick distribution must sum to 13, got ${total}`);

  const sockets = await Promise.all(
    players.map((p) => connectSocket(loadToken(p)))
  );

  for (let pIdx = 0; pIdx < 4; pIdx++) {
    for (let t = 0; t < distribution[pIdx]; t++) {
      await claimTrick(sockets[pIdx], roomCode);
      await delay(120);
    }
  }

  sockets.forEach((s) => s.disconnect());
}

/**
 * Wait for round complete and navigate to scores page.
 */
export async function waitForScores(pages: Page[], gameId: string): Promise<void> {
  await pages[0].locator(':text("Round Complete!")').waitFor({ timeout: 20_000 });
  await Promise.all(pages.map((p) => p.goto(`/game/${gameId}/scores`)));

  await Promise.all(
    pages.map(async (p) => {
      await expect(p.locator('h1:has-text("Game Score Table")')).toBeVisible({
        timeout: 10_000,
      });
    })
  );
}

/**
 * Run one complete round end-to-end (seating through scores).
 * Used to quickly get through Round 1 when testing Round 2+ behavior.
 */
export async function playFullRound(
  pages: Page[],
  roomCode: string,
  gameId: string,
  opts?: {
    skipSeating?: boolean;
    winnerBid?: number;
    otherBid?: number;
    trickDistribution?: [number, number, number, number];
  },
): Promise<{ trumpWinnerIdx: number }> {
  if (!opts?.skipSeating) {
    await confirmSeating(pages);
  }

  const trumpWinnerIdx = await simpleTrumpBidding(pages);

  await simpleContractBidding(
    pages,
    trumpWinnerIdx,
    opts?.winnerBid ?? 5,
    opts?.otherBid ?? 2,
  );

  await playTricks(roomCode, opts?.trickDistribution ?? [4, 3, 3, 3]);
  await waitForScores(pages, gameId);

  return { trumpWinnerIdx };
}

// ── Shared utilities ──────────────────────────────────────────────

/**
 * Poll all pages until one has `selector` visible.
 * Returns the 0-based index, or -1 if timeout.
 */
export async function findActivePage(
  pages: Page[],
  selector: string,
  timeoutMs = 10_000,
): Promise<number> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    for (let i = 0; i < pages.length; i++) {
      try {
        if (await pages[i].isVisible(selector)) return i;
      } catch {
        // Element does not exist yet – keep polling.
      }
    }
    await delay(200);
  }
  return -1;
}

export function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
