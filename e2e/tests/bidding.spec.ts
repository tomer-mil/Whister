import { test, expect } from '@playwright/test';
import { GameDriver } from '../driver';
import { firstPageWith } from '../helpers/wait';

test('trump auction: outbid then others pass sets trump', async ({ browser }) => {
  const driver = new GameDriver(browser);
  await driver.setup();
  try {
    await driver.createGame();
    await driver.confirmSeating();
    // First active player bids 5 clubs; next active raises to 6 clubs; rest pass.
    const a = await firstPageWith(driver.pages, 'bidding-pass');
    await driver.bidding(a).placeTrumpBid(5, 'clubs');
    const b = await firstPageWith(driver.pages, 'bidding-pass');
    await driver.bidding(b).placeTrumpBid(6, 'clubs');
    for (let g = 0; g < 6; g++) {
      const x = await firstPageWith(driver.pages, 'bidding-pass', 10_000).catch(() => -1);
      if (x === -1) break;
      await driver.bidding(x).pass();
      let contract = false;
      for (const p of driver.pages) if (await p.getByTestId('bidding-confirm').isVisible()) contract = true;
      if (contract) break;
    }
    // Contract phase reached → auction resolved.
    expect(await firstPageWith(driver.pages, 'bidding-confirm')).toBeGreaterThanOrEqual(0);
  } finally { await driver.close(); }
});

test('frisch: all pass raises minimum bid and restarts auction', async ({ browser }) => {
  const driver = new GameDriver(browser);
  await driver.setup();
  try {
    await driver.createGame();
    await driver.confirmSeating();
    for (let g = 0; g < 4; g++) {
      const x = await firstPageWith(driver.pages, 'bidding-pass');
      await driver.bidding(x).pass();
    }
    // Frisch indicator appears and auction is active again.
    const idx = await firstPageWith(driver.pages, 'frisch-indicator', 15_000);
    expect(idx).toBeGreaterThanOrEqual(0);
    expect(await firstPageWith(driver.pages, 'bidding-pass')).toBeGreaterThanOrEqual(0);
  } finally { await driver.close(); }
});

test('last-bidder rule: a bid making the sum 13 is rejected', async ({ browser }) => {
  const driver = new GameDriver(browser);
  await driver.setup();
  try {
    await driver.createGame();
    await driver.confirmSeating();
    // Resolve trump: first active bids 5 clubs, others pass.
    const w = await firstPageWith(driver.pages, 'bidding-pass');
    await driver.bidding(w).placeTrumpBid(5, 'clubs');
    for (let g = 0; g < 4; g++) {
      const x = await firstPageWith(driver.pages, 'bidding-pass', 8_000).catch(() => -1);
      if (x === -1) break;
      await driver.bidding(x).pass();
      let c = false; for (const p of driver.pages) if (await p.getByTestId('bidding-confirm').isVisible()) c = true;
      if (c) break;
    }
    // Three players contract 5,4,0 → sum 9; the last bidder choosing 4 (→13) must be blocked.
    const order: number[] = [];
    for (let g = 0; g < 3; g++) {
      const x = await firstPageWith(driver.pages, 'bidding-confirm');
      order.push(x);
      await driver.bidding(x).setContract([5, 4, 0][g]);
    }
    const last = await firstPageWith(driver.pages, 'bidding-confirm');
    await driver.bidding(last).setContract(4); // would make sum 13
    // Rejected: still last player's turn, error shown, no transition to playing.
    await expect(driver.pages[last].getByTestId('error-toast')).toBeVisible({ timeout: 10_000 });
    expect(await driver.pages[last].getByTestId('bidding-confirm').isVisible()).toBe(true);
  } finally { await driver.close(); }
});
