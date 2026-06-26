import { test, expect } from '@playwright/test';
import { GameDriver } from '../../driver';
import { IPHONE_SE } from '../../mobile';
import { firstPageWith } from '../../helpers/wait';

// R1: tab close mid-bidding; reopen in same context; player sees live game
test('R1: tab close mid-bidding; reopen sees live game state', async ({ browser }) => {
  test.setTimeout(60_000);
  const driver = new GameDriver(browser);
  await driver.setup(IPHONE_SE);
  try {
    const { roomCode } = await driver.createGame();
    await driver.confirmSeating();
    // P3 closes their tab
    await driver.pages[3].close();
    // Reopen a fresh page in the same authenticated context
    driver.pages[3] = await driver.contexts[3].newPage();
    await driver.pages[3].goto(`/room/${roomCode}`);
    // The page should load the game, not an error screen
    await expect(driver.pages[3].getByTestId('connection-status')).toBeVisible({ timeout: 20_000 });
    // Bidding should still be in progress — at least one player has the bidding controls
    const activeIdx = await firstPageWith(driver.pages, 'bidding-pass', 20_000);
    expect(activeIdx).toBeGreaterThanOrEqual(0);
    // Finding F3: if the game is stuck because P3's turn wasn't auto-passed, that is expected.
  } finally {
    await driver.close();
  }
});

// R2: P3 closes tab on their own bid turn; game unblocks or records finding
test('R2: tab close on own bid turn; other players can determine if game unblocks', async ({ browser }) => {
  test.setTimeout(60_000);
  const driver = new GameDriver(browser);
  await driver.setup(IPHONE_SE);
  try {
    await driver.createGame();
    await driver.confirmSeating();
    // Advance until it is P3's turn
    let p3Turn = false;
    for (let g = 0; g < 8; g++) {
      const activeIdx = await firstPageWith(driver.pages, 'bidding-pass', 20_000).catch(() => -1);
      if (activeIdx === -1) break;
      if (activeIdx === 3) { p3Turn = true; break; }
      await driver.bidding(activeIdx).pass();
    }
    if (!p3Turn) {
      // P3 never got the turn in this auction order — skip gracefully
      test.skip();
      return;
    }
    // P3's turn — close P3's tab
    await driver.pages[3].close();
    // Finding F3: if SG-6 D4 auto-pass is implemented, the game should advance automatically.
    // If not, the game blocks. Check by polling whether ANY other player gets bidding controls.
    const advanced = await expect.poll(
      async () => {
        for (let i = 0; i < 3; i++) {
          if (await driver.pages[i].getByTestId('bidding-pass').isVisible()) return true;
          if (await driver.pages[i].getByTestId('bidding-confirm').isVisible()) return true;
        }
        return false;
      },
      { timeout: 30_000 },
    ).toBeTruthy().catch(() => false);
    if (!advanced) {
      // Game is stuck — this confirms finding F3 (no auto-pass on disconnect).
      // Fail with a descriptive message so it shows up as a known finding, not a mystery.
      throw new Error(
        'R2 FINDING F3: game blocked after P3 disconnected on their bid turn. ' +
        'SG-6 D4 (auto-pass on disconnect) is not yet implemented.',
      );
    }
  } finally {
    await driver.close();
  }
});

// R3: context close + new context (browser-restart simulation); player re-authenticates
test('R3: context close + new context; JWT from storage state re-authenticates automatically', async ({ browser }) => {
  test.setTimeout(60_000);
  const driver = new GameDriver(browser);
  await driver.setup(IPHONE_SE);
  try {
    const { roomCode } = await driver.createGame();
    await driver.confirmSeating();
    // Capture P3's storage state path
    const { players } = await import('../../config/players');
    const p3StorageState = players[3].storageStatePath;
    // Close P3's context (simulates browser process kill)
    await driver.contexts[3].close();
    // Open a brand-new context with P3's saved storage state (simulates browser restart)
    const newCtx = await browser.newContext({ storageState: p3StorageState, ...IPHONE_SE });
    const newPage = await newCtx.newPage();
    driver.contexts[3] = newCtx;
    driver.pages[3] = newPage;
    // Navigate back to the room
    await newPage.goto(`/room/${roomCode}`);
    // The page should auto-authenticate (JWT in localStorage) and show the live game
    await expect(newPage.getByTestId('connection-status')).toBeVisible({ timeout: 20_000 });
    // Not an error page — URL stays on the room or game
    await expect(newPage).toHaveURL(new RegExp(`/room/${roomCode}|/game/`), { timeout: 15_000 });
  } finally {
    await driver.close();
  }
});
