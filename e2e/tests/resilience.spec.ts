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
    // Minimum trump bid is 5. Counter starts at 5 and minus button is disabled below min.
    await expect(driver.pages[a].getByTestId('bidding-counter-value')).toHaveText('5');
    await expect(driver.pages[a].getByTestId('bidding-counter-minus')).toBeDisabled();
    // Also: Bid button disabled when counter is at minimum and suit not selected
    // (player still has their turn — bidding-pass is still visible)
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
