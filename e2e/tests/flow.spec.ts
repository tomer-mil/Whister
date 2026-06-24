import { test, expect } from '@playwright/test';
import { GameDriver } from '../driver';

test('multi-round: scores accumulate across two rounds', async ({ browser }) => {
  test.setTimeout(150_000);
  const driver = new GameDriver(browser);
  await driver.setup();
  try {
    const { gameId } = await driver.createGame();
    await driver.confirmSeating();

    await driver.playRound({ trump: 'clubs', trumpWinner: 0, contracts: [5, 3, 3, 3], tricks: [5, 3, 3, 2] });
    const afterR1 = await driver.backendScores(gameId);

    await driver.nextRound();
    await driver.playRound({ trump: 'diamonds', trumpWinner: 0, contracts: [5, 3, 3, 3], tricks: [5, 3, 3, 2] });
    const afterR2 = await driver.backendScores(gameId);

    expect(afterR2.rounds.length).toBe(2);
    // Totals are cumulative: round1 + round2 per seat.
    for (let s = 0; s < 4; s++) {
      expect(afterR2.totals[s]).toBe(afterR1.rounds[0].scores[s] + afterR2.rounds[1].scores[s]);
      // DOM total matches backend total.
      expect(await driver.scores(0).total(s)).toBe(afterR2.totals[s]);
    }
  } finally { await driver.close(); }
});
