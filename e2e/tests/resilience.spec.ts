import { test, expect } from '@playwright/test';
import { GameDriver } from '../driver';
import { firstPageWith } from '../helpers/wait';

test('invalid trump bid below minimum is rejected', async ({ browser }) => {
  const driver = new GameDriver(browser);
  await driver.setup();
  try {
    await driver.createGame();
    await driver.confirmSeating();
    const a = await firstPageWith(driver.pages, 'bidding-pass');
    // Minimum trump bid is 5; attempt 4.
    await driver.bidding(a).placeTrumpBid(4, 'clubs');
    await expect(driver.pages[a].getByTestId('error-toast')).toBeVisible({ timeout: 10_000 });
    // Still this player's turn (bid not accepted).
    expect(await driver.pages[a].getByTestId('bidding-pass').isVisible()).toBe(true);
  } finally { await driver.close(); }
});

test('player disconnect mid-round then reconnect restores state', async ({ browser }) => {
  const driver = new GameDriver(browser);
  await driver.setup();
  try {
    const { roomCode } = await driver.createGame();
    await driver.confirmSeating();
    // Player 3 disconnects (close page) during trump bidding.
    await driver.pages[3].close();
    // Reconnect: open a fresh page in the same context and navigate back to the room.
    driver.pages[3] = await driver.contexts[3].newPage();
    await driver.pages[3].goto(`/room/${roomCode}`);
    // State restored: player sees the live game (bidding UI or game view), not an error.
    await expect(driver.pages[3].getByTestId('connection-status')).toBeVisible({ timeout: 15_000 });
  } finally { await driver.close(); }
});
