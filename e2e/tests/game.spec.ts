import { test, expect, Page } from '@playwright/test';
import { players, loadToken } from '../config/players';
import { connectSocket, claimTrick } from '../helpers/socket';
import { waitForPathname } from '../helpers/wait';

/**
 * Full-round game smoke test – the heaviest test in the suite.
 *
 * Flow
 * ────
 * 1  Room creation  + lobby (4 players)
 * 2  Trump bidding  – first bidder bids 5 ♣, the other three pass
 * 3  Contract bidding – trump winner bids 5, others bid 2 (total 11 → "under")
 * 4  Playing phase  – 13 tricks claimed via Socket.IO
 * 5  Round complete – scores page renders with Round 1 data
 *
 * Selectors used are driven by the actual component text:
 *   active-bidding-controls.tsx  →  "📢 Your Turn to Bid", "♣", "📢 Call", "🚫 Pass"
 *   contract-bidding-panel.tsx   →  BidCounter (+/-), "Confirm Bid"
 *   scores/page.tsx              →  "Game Score Table", "NEW ROUND"
 */

test('full 4-player game round: trump → contract → tricks → scores', async ({
  browser,
}) => {
  // ── 0. Setup – 4 authenticated contexts ──────────────────────────
  const contexts = await Promise.all(
    players.map((p) => browser.newContext({ storageState: p.storageStatePath }))
  );
  const pages = await Promise.all(contexts.map((c) => c.newPage()));
  const [p1, p2, p3, p4] = pages;

  // ── 1. Room + Lobby ─────────────────────────────────────────────
  await p1.goto('/room/create');
  await p1.click('button:has-text("Create Room")');
  // create/page.tsx router.push after 2 s delay – poll pathname.
  // Negative lookahead excludes /room/create and /room/join so the pattern
  // doesn't match the static route we're already sitting on.
  await waitForPathname(p1, '^/room/(?!create$|join$)[A-Za-z0-9]+$');
  const roomCode = p1.url().split('/room/')[1];

  // Sequential: concurrent joins cause "Failed to fetch" from the API proxy.
  for (const page of [p2, p3, p4]) {
    await page.goto('/room/join');
    await page.fill('input[placeholder="ABC123"]', roomCode);
    // displayName is required by the join-room zod schema (min 2 chars)
    await page.fill('input[placeholder="Your name"]', 'Player');
    await page.click('button:has-text("Join Room")');
    // join-room-form.tsx router.push – poll pathname
    await waitForPathname(page, '^/room/(?!create$|join$)[A-Za-z0-9]+$');
  }

  await Promise.all(
    pages.map((p) =>
      expect(p.locator('text=Players (4/4)')).toBeVisible({ timeout: 15_000 })
    )
  );

  // Admin starts the game.  The room layout listens for the
  // room:game_starting socket event and does router.push(`/game/${gameId}`).
  await p1.click('button:has-text("Start Playing")');
  await Promise.all(
    pages.map((p) => waitForPathname(p, '^/game/', 20_000))
  );

  // Capture gameId from the URL – needed later for the scores page
  const gameId = pages[0].url().split('/game/')[1];

  // ── 2. Trump Bidding ──────────────────────────────────────────
  // Strategy:  the first player whose page shows "📢 Your Turn to Bid"
  //            places a bid of 5 ♣.  Every subsequent bidder passes.
  //            After 3 consecutive passes the trump is locked.
  let trumpWinnerIdx = -1;

  for (let attempt = 0; attempt < 8; attempt++) {
    const activeIdx = await findActivePage(pages, ':text("📢 Your Turn to Bid")');
    if (activeIdx === -1) break; // no one has a turn → trump determined

    if (trumpWinnerIdx === -1) {
      // First bidder: select ♣ suit then call
      await pages[activeIdx].click('button:has-text("♣")');
      // The bid amount defaults to the displayed minimum (5) – click Call
      await pages[activeIdx].click('button:has-text("📢 Call")');
      trumpWinnerIdx = activeIdx;
    } else {
      // Everyone else passes
      await pages[activeIdx].click('button:has-text("🚫 Pass")');
    }

    // Give WebSocket events time to propagate to all contexts
    await delay(700);
  }

  expect(trumpWinnerIdx).toBeGreaterThanOrEqual(0);

  // Confirm all pages now show the clubs symbol (trump suit locked)
  await Promise.all(
    pages.map((p) =>
      expect(p.locator(':text("♣")').first()).toBeVisible({ timeout: 10_000 })
    )
  );

  // ── 3. Contract Bidding ─────────────────────────────────────────
  // Trump winner must bid ≥ 5 (their trump bid).  Others bid 2.
  // Total = 5 + 2 + 2 + 2 = 11  →  game_type = "under"
  //
  // The ContractBiddingPanel renders a BidCounter (starts at 0) and a
  // "Confirm Bid" button only for the current bidder.  We click "+"
  // the required number of times, then confirm.
  for (let round = 0; round < 4; round++) {
    const activeIdx = await findActivePage(pages, 'button:has-text("Confirm Bid")');
    if (activeIdx === -1) break;

    const targetBid = activeIdx === trumpWinnerIdx ? 5 : 2;
    const plusBtn = pages[activeIdx].locator('button:has-text("+")').first();

    for (let i = 0; i < targetBid; i++) {
      await plusBtn.click();
      await delay(60);
    }

    await pages[activeIdx].click('button:has-text("Confirm Bid")');
    await delay(700);
  }

  // All pages should now show the playing-phase UI
  await Promise.all(
    pages.map((p) =>
      expect(p.locator(':text("CLAIM TRICK")')).toBeVisible({
        timeout: 10_000,
      })
    )
  );

  // ── 4. Playing Phase – claim 13 tricks via Socket.IO ───────────
  // Trick claiming is driven via Socket.IO so tricks can be distributed
  // across players ([4, 3, 3, 3] = 13) without 13 separate browser clicks.
  // Each trick is credited to the user who owns the socket's token.
  const TRICKS_PER_PLAYER = [4, 3, 3, 3];

  const sockets = await Promise.all(
    players.map((p) => connectSocket(loadToken(p)))
  );

  for (let pIdx = 0; pIdx < 4; pIdx++) {
    for (let t = 0; t < TRICKS_PER_PLAYER[pIdx]; t++) {
      await claimTrick(sockets[pIdx], roomCode);
      await delay(120); // spread claims slightly to avoid Redis write collisions
    }
  }

  // Disconnect helper sockets – no longer needed
  sockets.forEach((s) => s.disconnect());

  // ── 5. Round Complete → Scores ────────────────────────────────
  // After the 13th trick the backend emits round:complete.
  // The frontend store sets phase → "complete", which renders
  // the "Round Complete!" heading in the game page.
  await pages[0].locator(':text("Round Complete!")').waitFor({ timeout: 20_000 });

  // Scores page lives at /game/{gameId}/scores (same base the layout navigated to)
  await Promise.all(
    pages.map((p) => p.goto(`/game/${gameId}/scores`))
  );

  // Every page should render the score table with Round 1 data.
  // "NEW ROUND" button only mounts when the score-table API response
  // is populated.  The ♣ symbol in the trump column confirms the
  // actual round row rendered (not just the page shell).
  await Promise.all(
    pages.map(async (p) => {
      await expect(p.locator('h1:has-text("Game Score Table")')).toBeVisible({
        timeout: 10_000,
      });
      await expect(p.locator('button:has-text("NEW ROUND")')).toBeVisible({
        timeout: 5_000,
      });
      await expect(p.locator(':text("♣")')).toBeVisible({
        timeout: 5_000,
      });
    })
  );

  // ── Cleanup ─────────────────────────────────────────────────────
  await Promise.all(contexts.map((c) => c.close()));
});

test('new round: complete round 1, click NEW ROUND, verify round 2 starts', async ({
  browser,
}) => {
  // ── 0. Setup – 4 authenticated contexts ──────────────────────────
  const contexts = await Promise.all(
    players.map((p) => browser.newContext({ storageState: p.storageStatePath }))
  );
  const pages = await Promise.all(contexts.map((c) => c.newPage()));
  const [p1, p2, p3, p4] = pages;

  // ── 1. Room + Lobby ─────────────────────────────────────────────
  await p1.goto('/room/create');
  await p1.click('button:has-text("Create Room")');
  await waitForPathname(p1, '^/room/(?!create$|join$)[A-Za-z0-9]+$');
  const roomCode = p1.url().split('/room/')[1];

  for (const page of [p2, p3, p4]) {
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

  await p1.click('button:has-text("Start Playing")');
  await Promise.all(pages.map((p) => waitForPathname(p, '^/game/', 20_000)));
  const gameId = pages[0].url().split('/game/')[1];

  // ── 2. Round 1: Trump Bidding ───────────────────────────────────
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
  await Promise.all(
    pages.map((p) =>
      expect(p.locator(':text("♣")').first()).toBeVisible({ timeout: 10_000 })
    )
  );

  // ── 3. Round 1: Contract Bidding ────────────────────────────────
  for (let round = 0; round < 4; round++) {
    const activeIdx = await findActivePage(pages, 'button:has-text("Confirm Bid")');
    if (activeIdx === -1) break;

    const targetBid = activeIdx === trumpWinnerIdx ? 5 : 2;
    const plusBtn = pages[activeIdx].locator('button:has-text("+")').first();

    for (let i = 0; i < targetBid; i++) {
      await plusBtn.click();
      await delay(60);
    }

    await pages[activeIdx].click('button:has-text("Confirm Bid")');
    await delay(700);
  }

  await Promise.all(
    pages.map((p) =>
      expect(p.locator(':text("CLAIM TRICK")')).toBeVisible({
        timeout: 10_000,
      })
    )
  );

  // ── 4. Round 1: Playing Phase ───────────────────────────────────
  const TRICKS_PER_PLAYER = [4, 3, 3, 3];
  const sockets = await Promise.all(
    players.map((p) => connectSocket(loadToken(p)))
  );

  for (let pIdx = 0; pIdx < 4; pIdx++) {
    for (let t = 0; t < TRICKS_PER_PLAYER[pIdx]; t++) {
      await claimTrick(sockets[pIdx], roomCode);
      await delay(120);
    }
  }

  sockets.forEach((s) => s.disconnect());

  // ── 5. Round 1: Complete → Scores ───────────────────────────────
  await pages[0].locator(':text("Round Complete!")').waitFor({ timeout: 20_000 });
  await Promise.all(pages.map((p) => p.goto(`/game/${gameId}/scores`)));

  await Promise.all(
    pages.map(async (p) => {
      await expect(p.locator('h1:has-text("Game Score Table")')).toBeVisible({
        timeout: 10_000,
      });
      await expect(p.locator('button:has-text("NEW ROUND")')).toBeVisible({
        timeout: 5_000,
      });
    })
  );

  // ── 6. Click NEW ROUND and verify Round 2 starts ────────────────
  // When one player clicks NEW ROUND, the backend should broadcast a
  // WebSocket event (e.g., game:round_started) so ALL players navigate
  // to the new round automatically. This test verifies that behavior.
  await p1.click('button:has-text("NEW ROUND")');

  // All pages should navigate automatically via WebSocket broadcast
  await Promise.all(
    pages.map((p) => waitForPathname(p, `^/game/${gameId}`, 15_000))
  );

  // Verify Round 2 header appears
  await Promise.all(
    pages.map((p) =>
      expect(p.locator('h1:has-text("Round 2")')).toBeVisible({
        timeout: 10_000,
      })
    )
  );

  // Verify trump bidding UI appears (Round 2 should start in trump bidding)
  const activeIdx = await findActivePage(pages, ':text("📢 Your Turn to Bid")', 15_000);
  expect(activeIdx).toBeGreaterThanOrEqual(0);

  // ── Cleanup ─────────────────────────────────────────────────────
  await Promise.all(contexts.map((c) => c.close()));
});

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Poll all pages until one of them has `selector` visible.
 * Returns the 0-based page index, or -1 if nothing matched within the timeout.
 */
async function findActivePage(
  pages: Page[],
  selector: string,
  timeoutMs = 10_000
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

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
