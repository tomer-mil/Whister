import { test, expect } from '@playwright/test';
import { GameDriver } from '../../driver';
import { IPHONE_SE, IPHONE_14 } from '../../mobile';
import { firstPageWith } from '../../helpers/wait';

test('V1: smoke round completes on iPhone SE (375×667, DPR 2)', async ({ browser }) => {
  test.setTimeout(120_000);
  const driver = new GameDriver(browser);
  await driver.setup(IPHONE_SE);
  try {
    const { gameId } = await driver.createGame();
    await driver.confirmSeating();
    await driver.playRound({ trump: 'clubs', trumpWinner: 0, contracts: [5, 3, 3, 3], tricks: [5, 3, 3, 2] });
    const ui = await driver.scores(0).roundScore(1, 0);
    expect(ui).toBe(35);
    const bt = await driver.backendScores(gameId);
    expect(bt.rounds[0].scores[0]).toBe(35);
    expect(ui).toBe(bt.rounds[0].scores[0]);
  } finally {
    await driver.close();
  }
});

test('V2: smoke round completes on iPhone 14 (390×664, DPR 3)', async ({ browser }) => {
  test.setTimeout(120_000);
  const driver = new GameDriver(browser);
  await driver.setup(IPHONE_14);
  try {
    const { gameId } = await driver.createGame();
    await driver.confirmSeating();
    await driver.playRound({ trump: 'diamonds', trumpWinner: 0, contracts: [5, 3, 3, 3], tricks: [5, 3, 3, 2] });
    const ui = await driver.scores(0).roundScore(1, 0);
    expect(ui).toBe(35);
    const bt = await driver.backendScores(gameId);
    expect(bt.rounds[0].scores[0]).toBe(35);
    expect(ui).toBe(bt.rounds[0].scores[0]);
  } finally {
    await driver.close();
  }
});

test('V3: score table rows reachable after 2 rounds on small viewport', async ({ browser }) => {
  test.setTimeout(180_000);
  const driver = new GameDriver(browser);
  await driver.setup(IPHONE_SE);
  try {
    await driver.createGame();
    await driver.confirmSeating();
    await driver.playRound({ trump: 'clubs', trumpWinner: 0, contracts: [5, 3, 3, 3], tricks: [5, 3, 3, 2] });
    await driver.nextRound();
    await driver.playRound({ trump: 'diamonds', trumpWinner: 0, contracts: [5, 3, 3, 3], tricks: [5, 3, 3, 2] });
    await driver.scores(0).waitLoaded();
    const row1 = driver.pages[0].getByTestId('scores-row-r1');
    const row2 = driver.pages[0].getByTestId('scores-row-r2');
    await row1.scrollIntoViewIfNeeded();
    await expect(row1).toBeVisible();
    await row2.scrollIntoViewIfNeeded();
    await expect(row2).toBeVisible();
  } finally {
    await driver.close();
  }
});

test('V4: bidding controls are not clipped below viewport on both phone profiles', async ({ browser }) => {
  for (const [label, profile] of [['iPhone SE', IPHONE_SE], ['iPhone 14', IPHONE_14]] as const) {
    const driver = new GameDriver(browser);
    await driver.setup(profile);
    try {
      await driver.createGame();
      await driver.confirmSeating();
      // In trump bidding phase: check key controls are within viewport.
      const activeIdx = await firstPageWith(driver.pages, 'bidding-pass');
      const page = driver.pages[activeIdx];
      const vp = page.viewportSize()!;
      for (const tid of ['bidding-pass', 'bidding-bid', 'bidding-counter-plus']) {
        const box = await page.getByTestId(tid).boundingBox();
        expect(box, `${label}: ${tid} not found`).not.toBeNull();
        // Bottom edge must be within the viewport (not clipped off-screen).
        // Finding: if this fails, the control is below the fold on this profile.
        expect(
          box!.y + box!.height,
          `${label}: ${tid} bottom at ${(box!.y + box!.height).toFixed(0)}px, viewport ${vp.height}px`,
        ).toBeLessThanOrEqual(vp.height);
      }
    } finally {
      await driver.close();
    }
  }
});
