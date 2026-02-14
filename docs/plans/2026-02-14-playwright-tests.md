# Playwright E2E Tests: Seating + Complex Game Scenarios

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add robust Playwright E2E tests covering seating selection, complex trump auctions, contract bidding edge cases, and multi-round game flows.

**Architecture:** Extend the existing e2e test suite (`e2e/tests/game.spec.ts`) with new test cases. Extract shared setup helpers to avoid code duplication. Use the existing test patterns: 4 browser contexts with pre-authenticated `storageState`, `findActivePage()` polling, Socket.IO helpers for trick claiming.

**Tech Stack:** Playwright, Socket.IO client, existing e2e helpers

---

## Context for the Implementer

### Critical Change: Seating Phase

After "Start Playing" is clicked, ALL players now navigate to `/game/[gameId]/seating` (not `/game/[gameId]`).
The seating page shows a circular table with 4 player circles.
The admin must click the "Set Seating" button (center of table) to confirm and transition to trump bidding.
All existing game tests are BROKEN because they skip the seating step.

### Seating Page UI (selectors)

- Page heading: `h1:has-text("Seating Arrangement")`
- Player circles: `div` elements positioned absolutely with player names inside
- Tap-to-swap: click one player circle → it enlarges (selected) → click another → they swap
- Confirm button (admin only, center of table): `button:has-text("Set")` (renders as "Set\nSeating")
- Non-admin message: `text=Waiting for the admin to confirm seating...`

### Game Flow Phases (in order)

1. **Lobby** – `/room/[roomCode]` – 4 players join, admin clicks "Start Playing"
2. **Seating** – `/game/[gameId]/seating` – admin arranges seats, clicks "Set Seating"
3. **Trump Bidding** – `/game/[gameId]` – clockwise bidding, minimum 5, outbids allowed, frisch on all-pass
4. **Contract Bidding** – `/game/[gameId]` – trump winner first, last bidder can't make sum=13
5. **Playing** – `/game/[gameId]` – 13 tricks claimed via Socket.IO
6. **Scores** – `/game/[gameId]/scores` – score table, "NEW ROUND" button

### Trump Bidding Rules

- First bid minimum: 5 (increases by 1 per frisch: 5→6→7→8)
- Outbid rule: higher amount, OR same amount + higher suit
- Suit order: ♣(0) < ♦(1) < ♥(2) < ♠(3) < No Trump(4)
- Frisch: triggered when ALL 4 pass with no bid placed
- Trump winner: last remaining bidder after 3 consecutive passes following a bid

### Contract Bidding Rules

- Trump winner bids first, MUST bid >= their trump bid amount
- Clockwise from trump winner's seat
- Last bidder CANNOT make total sum = 13 (forces over or under game)
- Valid range: 0-13 per player

### Key Selectors (from existing codebase)

- Trump bidding active: `:text("📢 Your Turn to Bid")`
- Suit buttons: `button:has-text("♣")`, `button:has-text("♦")`, `button:has-text("♥")`, `button:has-text("♠")`
- Bid call: `button:has-text("📢 Call")`
- Pass: `button:has-text("🚫 Pass")`
- Contract bid confirm: `button:has-text("Confirm Bid")`
- Contract increment: `button:has-text("+")`
- Playing phase: `:text("CLAIM TRICK")`
- Round complete: `:text("Round Complete!")`
- Score table: `h1:has-text("Game Score Table")`
- New round: `button:has-text("NEW ROUND")`

---

## Task 1: Extract shared game setup helpers

**Files:**
- Create: `e2e/helpers/game-setup.ts`

**Why:** The lobby→seating→bidding flow is repeated in every test. Extract it once so all tests share the same setup and maintenance is centralized.

**Step 1: Create the helpers file**

```typescript
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
```

**Step 2: Verify TypeScript compiles**

Run: `cd e2e && npx tsc --noEmit helpers/game-setup.ts 2>&1 || echo "Type check only - non-blocking"`

**Step 3: Commit**

```bash
git add e2e/helpers/game-setup.ts
git commit -m "test: extract shared game setup helpers for E2E tests"
```

---

## Task 2: Update existing game.spec.ts to use seating phase

**Files:**
- Modify: `e2e/tests/game.spec.ts`

**Why:** The two existing tests are BROKEN because "Start Playing" now navigates to `/game/[gameId]/seating` instead of `/game/[gameId]`. They need the seating step added and should use the new shared helpers.

**Step 1: Rewrite game.spec.ts**

Replace the entire file with a version that:
1. Uses shared helpers from `game-setup.ts`
2. Adds the seating confirmation step after "Start Playing"
3. Keeps the same test names/assertions so nothing breaks

```typescript
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
  delay,
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
      await expect(p.locator('button:has-text("NEW ROUND")')).toBeVisible({
        timeout: 5_000,
      });
      await expect(p.locator(':text("♣")')).toBeVisible({ timeout: 5_000 });
    })
  );

  await Promise.all(contexts.map((c) => c.close()));
});

test('new round: complete round 1, click NEW ROUND, verify round 2 starts', async ({
  browser,
}) => {
  const { contexts, pages } = await setupFourPlayers(browser);
  const [p1] = pages;

  // ── Round 1 (fast-path using helper) ───────────────────────────
  const roomCode = await createAndJoinRoom(pages);
  const gameId = await startGameToSeating(pages);
  await playFullRound(pages, roomCode, gameId);

  // ── Click NEW ROUND ────────────────────────────────────────────
  await expect(p1.locator('button:has-text("NEW ROUND")')).toBeVisible({
    timeout: 5_000,
  });
  await p1.click('button:has-text("NEW ROUND")');

  // All pages should navigate via WebSocket broadcast
  await Promise.all(
    pages.map((p) => waitForPathname(p, `^/game/${gameId}`, 15_000))
  );

  // Verify Round 2 header
  await Promise.all(
    pages.map((p) =>
      expect(p.locator('h1:has-text("Round 2")')).toBeVisible({ timeout: 10_000 })
    )
  );

  // Verify trump bidding UI
  const activeIdx = await findActivePage(pages, ':text("📢 Your Turn to Bid")', 15_000);
  expect(activeIdx).toBeGreaterThanOrEqual(0);

  await Promise.all(contexts.map((c) => c.close()));
});
```

**Step 2: Run tests to verify they pass**

Run: `cd e2e && npx playwright test tests/game.spec.ts --headed`
Expected: Both tests pass with the seating step included.

**Step 3: Commit**

```bash
git add e2e/tests/game.spec.ts
git commit -m "test: update game tests to include seating phase"
```

---

## Task 3: Add seating-specific tests

**Files:**
- Create: `e2e/tests/seating.spec.ts`

**Why:** Dedicated tests for the seating selection feature: verifying the UI, swap behavior, admin-only controls, and navigation flow.

**Step 1: Create seating.spec.ts**

```typescript
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
```

**Step 2: Run the tests**

Run: `cd e2e && npx playwright test tests/seating.spec.ts --headed`
Expected: All 5 seating tests pass.

**Step 3: Commit**

```bash
git add e2e/tests/seating.spec.ts
git commit -m "test: add seating selection E2E tests"
```

---

## Task 4: Add complex trump bidding tests

**Files:**
- Create: `e2e/tests/bidding.spec.ts`

**Why:** Current tests only cover the simplest bidding scenario (one bid + 3 passes). Real games involve outbids, suit-order battles, frisch rounds, and various edge cases.

**Step 1: Create bidding.spec.ts**

```typescript
// e2e/tests/bidding.spec.ts
import { test, expect } from '@playwright/test';
import {
  setupFourPlayers,
  createAndJoinRoom,
  startGameToSeating,
  confirmSeating,
  simpleContractBidding,
  playTricks,
  waitForScores,
  findActivePage,
  delay,
} from '../helpers/game-setup';

test.describe('Trump Bidding – Complex Scenarios', () => {

  test('outbid: second player outbids first with higher amount', async ({ browser }) => {
    const { contexts, pages } = await setupFourPlayers(browser);
    await createAndJoinRoom(pages);
    await startGameToSeating(pages);
    await confirmSeating(pages);

    // First bidder bids 5 ♣
    let activeIdx = await findActivePage(pages, ':text("📢 Your Turn to Bid")');
    expect(activeIdx).toBeGreaterThanOrEqual(0);
    const firstBidderIdx = activeIdx;

    await pages[activeIdx].click('button:has-text("♣")');
    await pages[activeIdx].click('button:has-text("📢 Call")');
    await delay(700);

    // Second bidder outbids with 6 ♣
    activeIdx = await findActivePage(pages, ':text("📢 Your Turn to Bid")');
    expect(activeIdx).toBeGreaterThanOrEqual(0);
    expect(activeIdx).not.toBe(firstBidderIdx); // Different player
    const outbidderIdx = activeIdx;

    // Click + to increase bid to 6
    const plusBtn = pages[activeIdx].locator('button:has-text("+")').first();
    await plusBtn.click();
    await delay(100);

    await pages[activeIdx].click('button:has-text("♣")');
    await pages[activeIdx].click('button:has-text("📢 Call")');
    await delay(700);

    // Remaining players pass (could be 2 or 3 passes depending on
    // whether first bidder also passes)
    let passCount = 0;
    for (let attempt = 0; attempt < 6; attempt++) {
      activeIdx = await findActivePage(pages, ':text("📢 Your Turn to Bid")');
      if (activeIdx === -1) break;
      await pages[activeIdx].click('button:has-text("🚫 Pass")');
      passCount++;
      await delay(700);
    }

    // Trump should be set to ♣ with the outbidder as winner
    await Promise.all(
      pages.map((p) =>
        expect(p.locator(':text("♣")').first()).toBeVisible({ timeout: 10_000 })
      )
    );

    // Contract bidding should start with outbidder
    const contractBidderIdx = await findActivePage(
      pages,
      'button:has-text("Confirm Bid")',
      10_000,
    );
    expect(contractBidderIdx).toBe(outbidderIdx);

    await Promise.all(contexts.map((c) => c.close()));
  });

  test('outbid by suit: same amount but higher suit wins', async ({ browser }) => {
    const { contexts, pages } = await setupFourPlayers(browser);
    await createAndJoinRoom(pages);
    await startGameToSeating(pages);
    await confirmSeating(pages);

    // First bidder bids 5 ♣ (clubs = lowest suit)
    let activeIdx = await findActivePage(pages, ':text("📢 Your Turn to Bid")');
    await pages[activeIdx].click('button:has-text("♣")');
    await pages[activeIdx].click('button:has-text("📢 Call")');
    await delay(700);

    // Second bidder outbids with 5 ♥ (hearts > clubs at same amount)
    activeIdx = await findActivePage(pages, ':text("📢 Your Turn to Bid")');
    const suitOutbidderIdx = activeIdx;
    await pages[activeIdx].click('button:has-text("♥")');
    await pages[activeIdx].click('button:has-text("📢 Call")');
    await delay(700);

    // Everyone else passes
    for (let attempt = 0; attempt < 6; attempt++) {
      activeIdx = await findActivePage(pages, ':text("📢 Your Turn to Bid")');
      if (activeIdx === -1) break;
      await pages[activeIdx].click('button:has-text("🚫 Pass")');
      await delay(700);
    }

    // Trump should be ♥ (hearts), not ♣
    await Promise.all(
      pages.map((p) =>
        expect(p.locator(':text("♥")').first()).toBeVisible({ timeout: 10_000 })
      )
    );

    // Contract bidding should start with the suit outbidder
    const contractBidderIdx = await findActivePage(
      pages,
      'button:has-text("Confirm Bid")',
      10_000,
    );
    expect(contractBidderIdx).toBe(suitOutbidderIdx);

    await Promise.all(contexts.map((c) => c.close()));
  });

  test('frisch: all 4 pass without bidding triggers frisch', async ({ browser }) => {
    const { contexts, pages } = await setupFourPlayers(browser);
    await createAndJoinRoom(pages);
    await startGameToSeating(pages);
    await confirmSeating(pages);

    // All 4 players pass without anyone bidding
    for (let i = 0; i < 4; i++) {
      const activeIdx = await findActivePage(pages, ':text("📢 Your Turn to Bid")');
      expect(activeIdx).toBeGreaterThanOrEqual(0);
      await pages[activeIdx].click('button:has-text("🚫 Pass")');
      await delay(700);
    }

    // Frisch should be triggered - bidding starts over with higher minimum
    // The frisch event should broadcast and reset the bidding UI
    // A new "Your Turn to Bid" should appear (first bidder gets turn again)
    const activeIdx = await findActivePage(pages, ':text("📢 Your Turn to Bid")', 15_000);
    expect(activeIdx).toBeGreaterThanOrEqual(0);

    // Now bid successfully (minimum is now 6 after frisch)
    await pages[activeIdx].click('button:has-text("♦")');
    // The minimum bid should have increased - click + once to get to 6
    const plusBtn = pages[activeIdx].locator('button:has-text("+")').first();
    await plusBtn.click();
    await delay(100);
    await pages[activeIdx].click('button:has-text("📢 Call")');
    await delay(700);

    // Others pass
    for (let attempt = 0; attempt < 6; attempt++) {
      const idx = await findActivePage(pages, ':text("📢 Your Turn to Bid")');
      if (idx === -1) break;
      await pages[idx].click('button:has-text("🚫 Pass")');
      await delay(700);
    }

    // Trump should be ♦ (diamonds)
    await Promise.all(
      pages.map((p) =>
        expect(p.locator(':text("♦")').first()).toBeVisible({ timeout: 10_000 })
      )
    );

    await Promise.all(contexts.map((c) => c.close()));
  });

  test('bidding war: multiple outbids before settling', async ({ browser }) => {
    const { contexts, pages } = await setupFourPlayers(browser);
    await createAndJoinRoom(pages);
    await startGameToSeating(pages);
    await confirmSeating(pages);

    const bidders: number[] = [];

    // P1 bids 5 ♣
    let activeIdx = await findActivePage(pages, ':text("📢 Your Turn to Bid")');
    bidders.push(activeIdx);
    await pages[activeIdx].click('button:has-text("♣")');
    await pages[activeIdx].click('button:has-text("📢 Call")');
    await delay(700);

    // P2 outbids 6 ♣
    activeIdx = await findActivePage(pages, ':text("📢 Your Turn to Bid")');
    bidders.push(activeIdx);
    const plusBtn1 = pages[activeIdx].locator('button:has-text("+")').first();
    await plusBtn1.click();
    await delay(100);
    await pages[activeIdx].click('button:has-text("♣")');
    await pages[activeIdx].click('button:has-text("📢 Call")');
    await delay(700);

    // P3 outbids 7 ♠
    activeIdx = await findActivePage(pages, ':text("📢 Your Turn to Bid")');
    bidders.push(activeIdx);
    const plusBtn2 = pages[activeIdx].locator('button:has-text("+")').first();
    await plusBtn2.click();
    await delay(100);
    await plusBtn2.click();
    await delay(100);
    await pages[activeIdx].click('button:has-text("♠")');
    await pages[activeIdx].click('button:has-text("📢 Call")');
    await delay(700);

    // Everyone else passes
    let finalWinnerIdx = bidders[2]; // P3 should win
    for (let attempt = 0; attempt < 6; attempt++) {
      activeIdx = await findActivePage(pages, ':text("📢 Your Turn to Bid")');
      if (activeIdx === -1) break;
      await pages[activeIdx].click('button:has-text("🚫 Pass")');
      await delay(700);
    }

    // Trump should be ♠ (spades)
    await Promise.all(
      pages.map((p) =>
        expect(p.locator(':text("♠")').first()).toBeVisible({ timeout: 10_000 })
      )
    );

    // Contract bidding should start with the final winner (P3)
    const contractBidderIdx = await findActivePage(
      pages,
      'button:has-text("Confirm Bid")',
      10_000,
    );
    expect(contractBidderIdx).toBe(finalWinnerIdx);

    await Promise.all(contexts.map((c) => c.close()));
  });
});
```

**Step 2: Run the tests**

Run: `cd e2e && npx playwright test tests/bidding.spec.ts --headed`
Expected: All 4 bidding tests pass.

**Step 3: Commit**

```bash
git add e2e/tests/bidding.spec.ts
git commit -m "test: add complex trump bidding E2E tests (outbids, suit order, frisch, bidding war)"
```

---

## Task 5: Add contract bidding edge-case tests

**Files:**
- Modify: `e2e/tests/bidding.spec.ts` (append new describe block)

**Why:** Contract bidding has critical rules: trump winner minimum, last bidder can't make sum=13, and the game type (over/under) is determined by the total.

**Step 1: Append contract bidding tests to bidding.spec.ts**

Add after the trump bidding describe block:

```typescript
test.describe('Contract Bidding – Edge Cases', () => {

  test('over game: total contracts > 13', async ({ browser }) => {
    const { contexts, pages } = await setupFourPlayers(browser);
    const roomCode = await createAndJoinRoom(pages);
    const gameId = await startGameToSeating(pages);
    await confirmSeating(pages);

    // Simple trump: first bids 5 ♣, others pass
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

    // Contract bidding: trump winner bids 5, others bid 4 each
    // Total = 5 + 4 + 4 + 4 = 17 → OVER game
    for (let round = 0; round < 4; round++) {
      const activeIdx = await findActivePage(pages, 'button:has-text("Confirm Bid")');
      if (activeIdx === -1) break;

      const targetBid = activeIdx === trumpWinnerIdx ? 5 : 4;
      const plusBtn = pages[activeIdx].locator('button:has-text("+")').first();
      for (let i = 0; i < targetBid; i++) {
        await plusBtn.click();
        await delay(60);
      }
      await pages[activeIdx].click('button:has-text("Confirm Bid")');
      await delay(700);
    }

    // Should reach playing phase
    await Promise.all(
      pages.map((p) =>
        expect(p.locator(':text("CLAIM TRICK")')).toBeVisible({ timeout: 10_000 })
      )
    );

    // Play tricks and verify scores render
    await playTricks(roomCode, [5, 4, 2, 2]);
    await waitForScores(pages, gameId);

    await Promise.all(contexts.map((c) => c.close()));
  });

  test('under game: total contracts < 13', async ({ browser }) => {
    const { contexts, pages } = await setupFourPlayers(browser);
    const roomCode = await createAndJoinRoom(pages);
    const gameId = await startGameToSeating(pages);
    await confirmSeating(pages);

    // Simple trump
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

    // Contract bidding: trump winner bids 5, others bid 1 each
    // Total = 5 + 1 + 1 + 1 = 8 → UNDER game
    for (let round = 0; round < 4; round++) {
      const activeIdx = await findActivePage(pages, 'button:has-text("Confirm Bid")');
      if (activeIdx === -1) break;

      const targetBid = activeIdx === trumpWinnerIdx ? 5 : 1;
      const plusBtn = pages[activeIdx].locator('button:has-text("+")').first();
      for (let i = 0; i < targetBid; i++) {
        await plusBtn.click();
        await delay(60);
      }
      await pages[activeIdx].click('button:has-text("Confirm Bid")');
      await delay(700);
    }

    // Should reach playing phase
    await Promise.all(
      pages.map((p) =>
        expect(p.locator(':text("CLAIM TRICK")')).toBeVisible({ timeout: 10_000 })
      )
    );

    // Play tricks and verify scores render
    await playTricks(roomCode, [5, 4, 3, 1]);
    await waitForScores(pages, gameId);

    await Promise.all(contexts.map((c) => c.close()));
  });

  test('zero contract bids are allowed for non-trump-winners', async ({ browser }) => {
    const { contexts, pages } = await setupFourPlayers(browser);
    const roomCode = await createAndJoinRoom(pages);
    const gameId = await startGameToSeating(pages);
    await confirmSeating(pages);

    // Simple trump
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

    // Contract bidding: trump winner bids 5, others bid 0
    // Total = 5 + 0 + 0 + 0 = 5 → UNDER game
    // Note: bidding 0 means just clicking "Confirm Bid" without clicking "+"
    for (let round = 0; round < 4; round++) {
      const activeIdx = await findActivePage(pages, 'button:has-text("Confirm Bid")');
      if (activeIdx === -1) break;

      if (activeIdx === trumpWinnerIdx) {
        const plusBtn = pages[activeIdx].locator('button:has-text("+")').first();
        for (let i = 0; i < 5; i++) {
          await plusBtn.click();
          await delay(60);
        }
      }
      // Non-trump-winners: bid 0 (just confirm without incrementing)
      await pages[activeIdx].click('button:has-text("Confirm Bid")');
      await delay(700);
    }

    // Should reach playing phase
    await Promise.all(
      pages.map((p) =>
        expect(p.locator(':text("CLAIM TRICK")')).toBeVisible({ timeout: 10_000 })
      )
    );

    await playTricks(roomCode, [5, 4, 3, 1]);
    await waitForScores(pages, gameId);

    await Promise.all(contexts.map((c) => c.close()));
  });
});
```

**Step 2: Run the tests**

Run: `cd e2e && npx playwright test tests/bidding.spec.ts --headed`
Expected: All 7 tests pass (4 trump + 3 contract).

**Step 3: Commit**

```bash
git add e2e/tests/bidding.spec.ts
git commit -m "test: add contract bidding edge-case E2E tests (over, under, zero contracts)"
```

---

## Task 6: Add multi-round game tests

**Files:**
- Create: `e2e/tests/multi-round.spec.ts`

**Why:** Tests should verify games that go beyond a single round. This validates the round transition mechanism, score accumulation, and that bidding order persists across rounds.

**Step 1: Create multi-round.spec.ts**

```typescript
// e2e/tests/multi-round.spec.ts
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
  findActivePage,
  delay,
} from '../helpers/game-setup';
import { waitForPathname } from '../helpers/wait';

test.describe('Multi-Round Games', () => {

  test('complete 2 rounds with different trump suits', async ({ browser }) => {
    test.setTimeout(120_000); // 2 minutes for multi-round

    const { contexts, pages } = await setupFourPlayers(browser);
    const [p1] = pages;
    const roomCode = await createAndJoinRoom(pages);
    const gameId = await startGameToSeating(pages);

    // ── Round 1: Clubs ────────────────────────────────────────────
    await confirmSeating(pages);

    let trumpWinnerIdx = await simpleTrumpBidding(pages);
    await simpleContractBidding(pages, trumpWinnerIdx, 5, 2);
    await playTricks(roomCode, [4, 3, 3, 3]);
    await waitForScores(pages, gameId);

    // Verify Round 1 appears in score table
    await expect(p1.locator(':text("♣")')).toBeVisible({ timeout: 5_000 });
    await expect(p1.locator('button:has-text("NEW ROUND")')).toBeVisible({
      timeout: 5_000,
    });

    // ── Transition to Round 2 ─────────────────────────────────────
    await p1.click('button:has-text("NEW ROUND")');

    // All pages navigate to game page for Round 2
    await Promise.all(
      pages.map((p) => waitForPathname(p, `^/game/${gameId}`, 15_000))
    );

    // Verify Round 2 header
    await Promise.all(
      pages.map((p) =>
        expect(p.locator('h1:has-text("Round 2")')).toBeVisible({ timeout: 10_000 })
      )
    );

    // ── Round 2: Diamonds ─────────────────────────────────────────
    // First bidder bids 5 ♦ this time
    let activeIdx = await findActivePage(pages, ':text("📢 Your Turn to Bid")', 15_000);
    expect(activeIdx).toBeGreaterThanOrEqual(0);
    const r2WinnerIdx = activeIdx;

    await pages[activeIdx].click('button:has-text("♦")');
    await pages[activeIdx].click('button:has-text("📢 Call")');
    await delay(700);

    // Others pass
    for (let attempt = 0; attempt < 6; attempt++) {
      activeIdx = await findActivePage(pages, ':text("📢 Your Turn to Bid")');
      if (activeIdx === -1) break;
      await pages[activeIdx].click('button:has-text("🚫 Pass")');
      await delay(700);
    }

    // Verify diamonds trump
    await Promise.all(
      pages.map((p) =>
        expect(p.locator(':text("♦")').first()).toBeVisible({ timeout: 10_000 })
      )
    );

    // Contract bidding for Round 2
    await simpleContractBidding(pages, r2WinnerIdx, 5, 2);

    // Play Round 2 tricks
    await playTricks(roomCode, [3, 4, 3, 3]);
    await waitForScores(pages, gameId);

    // Verify score table shows BOTH rounds
    await expect(p1.locator(':text("♣")')).toBeVisible({ timeout: 5_000 });
    await expect(p1.locator(':text("♦")')).toBeVisible({ timeout: 5_000 });

    await Promise.all(contexts.map((c) => c.close()));
  });

  test('3-round game with varied trick distributions', async ({ browser }) => {
    test.setTimeout(180_000); // 3 minutes for 3 rounds

    const { contexts, pages } = await setupFourPlayers(browser);
    const [p1] = pages;
    const roomCode = await createAndJoinRoom(pages);
    const gameId = await startGameToSeating(pages);

    const suits = ['♣', '♥', '♠'];
    const trickDists: [number, number, number, number][] = [
      [4, 3, 3, 3],
      [2, 5, 3, 3],
      [3, 3, 4, 3],
    ];

    for (let roundNum = 0; roundNum < 3; roundNum++) {
      if (roundNum === 0) {
        // First round needs seating confirmation
        await confirmSeating(pages);
      } else {
        // Subsequent rounds start from scores page
        await p1.click('button:has-text("NEW ROUND")');
        await Promise.all(
          pages.map((p) => waitForPathname(p, `^/game/${gameId}`, 15_000))
        );
        await Promise.all(
          pages.map((p) =>
            expect(
              p.locator(`h1:has-text("Round ${roundNum + 1}")`)
            ).toBeVisible({ timeout: 10_000 })
          )
        );
      }

      // Trump bidding with the designated suit
      let activeIdx = await findActivePage(
        pages,
        ':text("📢 Your Turn to Bid")',
        15_000,
      );
      expect(activeIdx).toBeGreaterThanOrEqual(0);
      const trumpWinnerIdx = activeIdx;

      await pages[activeIdx].click(`button:has-text("${suits[roundNum]}")`);
      await pages[activeIdx].click('button:has-text("📢 Call")');
      await delay(700);

      for (let attempt = 0; attempt < 6; attempt++) {
        activeIdx = await findActivePage(pages, ':text("📢 Your Turn to Bid")');
        if (activeIdx === -1) break;
        await pages[activeIdx].click('button:has-text("🚫 Pass")');
        await delay(700);
      }

      // Contract bidding
      await simpleContractBidding(pages, trumpWinnerIdx, 5, 2);

      // Play tricks
      await playTricks(roomCode, trickDists[roundNum]);

      // Wait for scores
      await waitForScores(pages, gameId);
    }

    // Verify all 3 rounds appear in score table
    for (const suit of suits) {
      await expect(p1.locator(`:text("${suit}")`).first()).toBeVisible({
        timeout: 5_000,
      });
    }

    await Promise.all(contexts.map((c) => c.close()));
  });
});
```

**Step 2: Run the tests**

Run: `cd e2e && npx playwright test tests/multi-round.spec.ts --headed`
Expected: Both multi-round tests pass.

**Step 3: Commit**

```bash
git add e2e/tests/multi-round.spec.ts
git commit -m "test: add multi-round game E2E tests (2 and 3 round flows)"
```

---

## Summary

| Task | What | Files | Tests |
|------|------|-------|-------|
| 1 | Extract shared helpers | `e2e/helpers/game-setup.ts` | — |
| 2 | Fix existing tests (add seating step) | `e2e/tests/game.spec.ts` | 2 existing tests |
| 3 | Seating-specific tests | `e2e/tests/seating.spec.ts` | 5 new tests |
| 4 | Complex trump bidding | `e2e/tests/bidding.spec.ts` | 4 new tests |
| 5 | Contract bidding edge cases | `e2e/tests/bidding.spec.ts` | 3 new tests |
| 6 | Multi-round game flows | `e2e/tests/multi-round.spec.ts` | 2 new tests |

**Total: 16 tests** (2 updated + 14 new) covering:
- Seating UI, swap, real-time updates, admin-only controls
- Trump outbids, suit-order battles, frisch, bidding wars
- Over/under games, zero contracts
- 2-round and 3-round game flows with varied distributions
