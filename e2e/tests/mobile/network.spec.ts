import { test, expect } from '@playwright/test';
import { GameDriver } from '../../driver';
import {
  IPHONE_SE, goOffline, goOnline, blockRoute, throttle3G,
} from '../../mobile';
import { firstPageWith } from '../../helpers/wait';

// N1: offline → online; socket reconnects and connection indicator recovers
test('N1: socket reconnects and connection indicator recovers after offline→online', async ({ browser }) => {
  test.setTimeout(180_000);
  const driver = new GameDriver(browser);
  await driver.setup(IPHONE_SE);
  try {
    await driver.createGame();
    await driver.confirmSeating();
    // Take P3 offline
    await goOffline(driver.contexts[3]);
    // Wait until P3's socket disconnects
    await expect.poll(
      async () => driver.pages[3].evaluate(() => !(window as any).socketManager?.isConnected()),
      { timeout: 40_000 },
    ).toBe(true);
    // Restore network
    await goOnline(driver.contexts[3]);
    // Socket reconnects via built-in backoff (reconnectionAttempts:10, delay 1–5s)
    await expect.poll(
      async () => driver.pages[3].evaluate(() => !!(window as any).socketManager?.isConnected()),
      { timeout: 60_000 },
    ).toBe(true);
    await expect(driver.pages[3].getByTestId('connection-status')).toBeVisible({ timeout: 10_000 });
    // Finding F2: no 'online' event listener — reconnect is via backoff, not instant.
    // The test still passes because socket.io reconnects within the 60s window.
  } finally {
    await driver.close();
  }
});

// N2: submit while disconnected; socket.io buffers at most one action and advances cleanly.
test('N2: mid-action connectivity loss neither drops nor duplicates a pass', async ({ browser }) => {
  test.setTimeout(180_000);
  const driver = new GameDriver(browser);
  await driver.setup(IPHONE_SE);
  try {
    await driver.createGame();
    await driver.confirmSeating();
    const activeIdx = await firstPageWith(driver.pages, 'bidding-pass');
    await goOffline(driver.contexts[activeIdx]);
    await expect.poll(
      async () => driver.pages[activeIdx].evaluate(
        () => !(window as Window & { socketManager?: { isConnected(): boolean } }).socketManager?.isConnected(),
      ),
      { timeout: 40_000 },
    ).toBe(true);

    await driver.pages[activeIdx].tap('[data-testid="bidding-pass"]');
    await goOnline(driver.contexts[activeIdx]);
    await expect.poll(
      async () => driver.pages[activeIdx].evaluate(
        () => !!(window as Window & { socketManager?: { isConnected(): boolean } }).socketManager?.isConnected(),
      ),
      { timeout: 60_000 },
    ).toBe(true);

    const nextIdx = await firstPageWith(driver.pages, 'bidding-pass', 20_000);
    expect(nextIdx).not.toBe(activeIdx);
    await driver.bidding(nextIdx).placeTrumpBid(5, 'clubs');
    expect(await firstPageWith(driver.pages, 'bidding-pass', 20_000)).not.toBe(nextIdx);
  } finally {
    await driver.close();
  }
});

// N3: score-table REST request blocked; error shown, not silent failure
test('N3: score-table fetch blocked mid-request; UI shows error (not silent failure)', async ({ browser }) => {
  const driver = new GameDriver(browser);
  await driver.setup(IPHONE_SE);
  try {
    await driver.createGame();
    await driver.confirmSeating();
    // Block the score-table endpoint on all 4 pages before the round ends
    const restores = await Promise.all(
      driver.pages.map((page) => blockRoute(page, '**/games/**/score-table**')),
    );
    let anyError = false;
    try {
      // Complete the round — score-table fetch will fail
      await driver.playRound({ trump: 'clubs', trumpWinner: 0, contracts: [5, 3, 3, 3], tricks: [5, 3, 3, 2] });
      // Finding: if the UI shows an error-toast, it's handling the failure correctly.
      // If it silently ignores it, that's a gap — scores may show empty/stale values.
      anyError = await driver.pages[0].getByTestId('error-toast').isVisible({ timeout: 5_000 }).catch(() => false);
    } finally {
      // Unblock routes whether or not playRound() threw
      await Promise.all(restores.map((r) => r()));
    }
    // Record the finding regardless — the test documents what happens, not just pass/fail.
    // If no error toast appears, that means the app fails silently — still a finding.
    expect(
      anyError,
      'N3 FINDING: score-table fetch failure not surfaced to user (silent failure)',
    ).toBe(true);
  } finally {
    await driver.close();
  }
});

// N4: 3G throttle for entire round; completes within extended timeout
// Finding: if this test fails, the Next.js bidding UI bundle is too heavy for slow connections.
test('N4: full round completes under 3G throttle (250kbps, 300ms RTT)', async ({ browser }) => {
  test.setTimeout(180_000);
  const driver = new GameDriver(browser);
  await driver.setup(IPHONE_SE);
  try {
    // Throttle applied after lobby setup so inner page-object timeouts are not starved during join/seat.
    // P0's default action timeout raised to 90s while throttled — Next.js may load additional JS
    // chunks for the bidding screen that are large on a slow connection.
    const { gameId } = await driver.createGame();
    await driver.confirmSeating();
    const restoreP0 = await throttle3G(driver.pages[0]);
    driver.pages[0].setDefaultTimeout(90_000);
    try {
      await driver.playRound({ trump: 'clubs', trumpWinner: 0, contracts: [5, 3, 3, 3], tricks: [5, 3, 3, 2] });
      const bt = await driver.backendScores(gameId);
      expect(bt.rounds[0].scores[0]).toBe(35);
    } finally {
      driver.pages[0].setDefaultTimeout(15_000);
      await restoreP0();
    }
  } finally {
    await driver.close();
  }
});

// N5: network-level drop; socket.io backoff reconnects automatically
// Note: socket.disconnect() is a voluntary close — socket.io does not auto-reconnect from it.
// Use CDP offline (involuntary) so socket.io's built-in reconnection backoff kicks in.
test('N5: network-level drop; socket.io reconnects automatically', async ({ browser }) => {
  test.setTimeout(120_000);
  const driver = new GameDriver(browser);
  await driver.setup(IPHONE_SE);
  try {
    await driver.createGame();
    await driver.confirmSeating();
    // Involuntary disconnect via CDP offline — this triggers socket.io reconnection backoff
    await goOffline(driver.contexts[3]);
    // Wait for disconnect to register (CDP heartbeat ~25s; wait up to 40s)
    await expect.poll(
      async () => driver.pages[3].evaluate(() => !(window as any).socketManager?.isConnected()),
      { timeout: 40_000 },
    ).toBe(true);
    // Restore network — socket.io reconnects via built-in backoff (reconnectionAttempts:10, 1–5s)
    await goOnline(driver.contexts[3]);
    await expect.poll(
      async () => driver.pages[3].evaluate(() => !!(window as any).socketManager?.isConnected()),
      { timeout: 60_000 },
    ).toBe(true);
    await expect(driver.pages[3].getByTestId('connection-status')).toBeVisible({ timeout: 10_000 });
  } finally {
    await driver.close();
  }
});
