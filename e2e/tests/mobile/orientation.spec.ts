import { test, expect } from '@playwright/test';
import { GameDriver } from '../../driver';
import { IPHONE_SE, rotateLandscape, rotatePortrait } from '../../mobile';
import { firstPageWith } from '../../helpers/wait';

// O1: rotate portrait→landscape mid-bidding, then continue bidding
test('O1: portrait→landscape rotation mid-bidding; state preserved, bidding continues', async ({ browser }) => {
  const driver = new GameDriver(browser);
  await driver.setup(IPHONE_SE);
  try {
    await driver.createGame();
    await driver.confirmSeating();
    const activeIdx = await firstPageWith(driver.pages, 'bidding-pass');
    // Rotate all 4 player pages to landscape mid-bidding
    for (const page of driver.pages) await rotateLandscape(page);
    // Verify no error screen appeared — connection-status should still be visible
    await expect(driver.pages[activeIdx].getByTestId('connection-status'))
      .toBeVisible({ timeout: 10_000 });
    // Bidding still works — active player can pass after rotation
    await driver.bidding(activeIdx).pass();
    // Another player should now have bidding controls
    const nextIdx = await firstPageWith(driver.pages, 'bidding-pass', 15_000);
    expect(nextIdx).not.toBe(activeIdx);
    // Finding: if connection-status check fails, the layout broke on rotation
  } finally {
    await driver.close();
  }
});

// O2: scores page in landscape — both round rows reachable
test('O2: score table accessible in landscape orientation after a round', async ({ browser }) => {
  test.setTimeout(120_000);
  const driver = new GameDriver(browser);
  await driver.setup(IPHONE_SE);
  try {
    await driver.createGame();
    await driver.confirmSeating();
    await driver.playRound({ trump: 'clubs', trumpWinner: 0, contracts: [5, 3, 3, 3], tricks: [5, 3, 3, 2] });
    // Rotate to landscape on the scores page
    await rotateLandscape(driver.pages[0]);
    await driver.scores(0).waitLoaded();
    const row1 = driver.pages[0].getByTestId('scores-row-r1');
    await row1.scrollIntoViewIfNeeded();
    await expect(row1).toBeVisible();
    // Score cell for P0 readable in landscape
    const cell = driver.pages[0].getByTestId('scores-cell-r1-p0');
    await cell.scrollIntoViewIfNeeded();
    await expect(cell).toBeVisible();
  } finally {
    await driver.close();
  }
});

// O3: landscape→portrait during playing phase — claim-trick control still visible
test('O3: landscape→portrait rotation during playing phase; claim-trick button visible', async ({ browser }) => {
  const driver = new GameDriver(browser);
  await driver.setup(IPHONE_SE);
  try {
    await driver.createGame();
    await driver.confirmSeating();
    // Advance to playing phase
    await driver.runTrumpAuction('clubs', 0);
    await driver.runContractBidding([5, 3, 3, 3]);
    // Rotate to landscape, then back to portrait
    for (const page of driver.pages) await rotateLandscape(page);
    for (const page of driver.pages) await rotatePortrait(page);
    // Claim-trick button must still be visible on all pages
    for (const page of driver.pages) {
      await expect(page.getByTestId('playing-claim-trick')).toBeVisible({ timeout: 10_000 });
    }
  } finally {
    await driver.close();
  }
});

// O4: game started in landscape orientation — full round completes
test('O4: smoke round completes when game starts in landscape (844×375)', async ({ browser }) => {
  test.setTimeout(120_000);
  // Create a landscape context by spreading IPHONE_SE then overriding viewport
  const driver = new GameDriver(browser);
  const landscapeSE = { ...IPHONE_SE, viewport: { width: 844, height: 375 } };
  await driver.setup(landscapeSE);
  try {
    const { gameId } = await driver.createGame();
    await driver.confirmSeating();
    await driver.playRound({ trump: 'hearts', trumpWinner: 0, contracts: [5, 3, 3, 3], tricks: [5, 3, 3, 2] });
    const ui = await driver.scores(0).roundScore(1, 0);
    expect(ui).toBe(35);
    const bt = await driver.backendScores(gameId);
    expect(bt.rounds[0].scores[0]).toBe(35);
  } finally {
    await driver.close();
  }
});
