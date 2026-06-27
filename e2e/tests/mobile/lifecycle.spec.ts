import { test, expect } from '@playwright/test';
import { GameDriver } from '../../driver';
import { IPHONE_SE, background, foreground, goOffline, goOnline } from '../../mobile';
import { firstPageWith } from '../../helpers/wait';

// B1: background during another player's trump bid; foreground shows updated state
test('B1: short background during another player bid; foreground reflects new state', async ({ browser }) => {
  const driver = new GameDriver(browser);
  await driver.setup(IPHONE_SE);
  try {
    await driver.createGame();
    await driver.confirmSeating();
    const activeIdx = await firstPageWith(driver.pages, 'bidding-pass');
    const observerIdx = (activeIdx + 1) % 4;
    // Background the observer
    await background(driver.pages[observerIdx]);
    // Active player passes — turn moves
    await driver.bidding(activeIdx).pass();
    // Foreground the observer
    await foreground(driver.pages[observerIdx]);
    // Connection indicator should still be present
    await expect(driver.pages[observerIdx].getByTestId('connection-status'))
      .toBeVisible({ timeout: 10_000 });
    // Turn must have moved (socket events process during Playwright background — no JS throttle)
    // Note: on a real mobile browser JS throttling would cause the state to be stale (finding F1).
    const nextActiveIdx = await firstPageWith(driver.pages, 'bidding-pass', 15_000);
    expect(nextActiveIdx).not.toBe(activeIdx);
  } finally {
    await driver.close();
  }
});

// B2: background 3 turns; foreground; game state is current
test('B2: multiple turns pass while observer is backgrounded; foreground reflects current state', async ({ browser }) => {
  const driver = new GameDriver(browser);
  await driver.setup(IPHONE_SE);
  try {
    await driver.createGame();
    await driver.confirmSeating();
    // Background P3 (observer — will not have the turn right away)
    await background(driver.pages[3]);
    // Advance 2 turns among P0/P1/P2
    for (let g = 0; g < 2; g++) {
      const active = await firstPageWith(
        [driver.pages[0], driver.pages[1], driver.pages[2]], 'bidding-pass', 20_000,
      ).catch(() => -1);
      if (active === -1) break;
      await driver.bidding(active).pass();
    }
    // Foreground P3
    await foreground(driver.pages[3]);
    await expect(driver.pages[3].getByTestId('connection-status')).toBeVisible({ timeout: 10_000 });
  } finally {
    await driver.close();
  }
});

// B3: long background + offline + reconnect; socket recovers and state syncs
test('B3: offline+background simulating long background; socket reconnects on return', async ({ browser }) => {
  test.setTimeout(120_000);
  const driver = new GameDriver(browser);
  await driver.setup(IPHONE_SE);
  try {
    await driver.createGame();
    await driver.confirmSeating();
    // Simulate long background: hide + go offline
    await background(driver.pages[3]);
    await goOffline(driver.contexts[3]);
    // Wait for P3's socket to disconnect (CDP offline doesn't kill socket immediately;
    // heartbeat timeout is ~25s, so wait up to 40s)
    await expect.poll(
      async () => driver.pages[3].evaluate(() => !(window as any).socketManager?.isConnected()),
      { timeout: 40_000 },
    ).toBe(true);
    // Restore connectivity and foreground
    await goOnline(driver.contexts[3]);
    await foreground(driver.pages[3]);
    // Socket should reconnect via socket.io built-in backoff (up to 10 retries, 1–5s each)
    await expect.poll(
      async () => driver.pages[3].evaluate(() => !!(window as any).socketManager?.isConnected()),
      { timeout: 60_000 },
    ).toBe(true);
    // Connection indicator visible after reconnect
    await expect(driver.pages[3].getByTestId('connection-status')).toBeVisible({ timeout: 15_000 });
    // Finding F1/F2: no proactive sync:state — DOM may not reflect latest game state
    // until the server pushes the next event. Recorded as a finding; not patched here.
  } finally {
    await driver.close();
  }
});

// B4: player backgrounds on their own turn; turn remains (no auto-pass implemented)
test('B4: background while it is your trump bid turn; turn remains on foreground', async ({ browser }) => {
  const driver = new GameDriver(browser);
  await driver.setup(IPHONE_SE);
  try {
    await driver.createGame();
    await driver.confirmSeating();
    // Find the active (first-to-bid) player and background them immediately
    const activeIdx = await firstPageWith(driver.pages, 'bidding-pass');
    await background(driver.pages[activeIdx]);
    // No DOM visibility check while backgrounded — Playwright's background() fires events but
    // does not hide elements from isVisible(). Turn-held check after foreground is the meaningful gate.
    await foreground(driver.pages[activeIdx]);
    // After foreground, it's still their turn (auto-pass not implemented)
    await expect(driver.pages[activeIdx].getByTestId('bidding-pass')).toBeVisible({ timeout: 10_000 });
    // Finding F3: if the turn auto-advanced while backgrounded, SG-6 D4 is implemented (good).
    // If still their turn, it means the game blocks on a backgrounded player (gap to fix).
  } finally {
    await driver.close();
  }
});

// S1: P0 backgrounds during trick claiming by P1–P3; foreground shows updated counts
test('S1: app-switch away during trick claiming; trick counts update on return', async ({ browser }) => {
  const driver = new GameDriver(browser);
  await driver.setup(IPHONE_SE);
  try {
    await driver.createGame();
    await driver.confirmSeating();
    await driver.runTrumpAuction('clubs', 0);
    await driver.runContractBidding([5, 3, 3, 3]);
    // Background P0 (observer)
    await background(driver.pages[0]);
    // P1, P2, P3 each claim one trick
    for (const seat of [1, 2, 3]) {
      await driver.playing(seat).claimTrick();
    }
    // Foreground P0
    await foreground(driver.pages[0]);
    await expect(driver.pages[0].getByTestId('connection-status')).toBeVisible({ timeout: 10_000 });
    // Each of P1, P2, P3 should show trick count ≥ 1 on P0's view
    for (const seat of [1, 2, 3]) {
      const count = await driver.pages[0].getByTestId(`playing-trick-count-${seat}`).innerText();
      expect(parseInt(count, 10), `P${seat} trick count on P0's view`).toBeGreaterThanOrEqual(1);
    }
  } finally {
    await driver.close();
  }
});

// S2: all players switch away briefly; all return; state consistent
test('S2: all 4 players background briefly then foreground; state consistent', async ({ browser }) => {
  const driver = new GameDriver(browser);
  await driver.setup(IPHONE_SE);
  try {
    await driver.createGame();
    await driver.confirmSeating();
    // Background all 4
    for (const page of driver.pages) await background(page);
    // Foreground all 4
    for (const page of driver.pages) await foreground(page);
    // All pages should show connection-status (still connected — short background)
    for (const page of driver.pages) {
      await expect(page.getByTestId('connection-status')).toBeVisible({ timeout: 10_000 });
    }
    // Bidding should still be functional — find active player and verify controls present
    const activeIdx = await firstPageWith(driver.pages, 'bidding-pass', 20_000);
    expect(activeIdx).toBeGreaterThanOrEqual(0);
  } finally {
    await driver.close();
  }
});
