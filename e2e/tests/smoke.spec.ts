import { test, expect } from '@playwright/test';
import { GameDriver } from '../driver';

test('playability: one full UI-driven round produces correct scores', async ({ browser }) => {
  const driver = new GameDriver(browser);
  await driver.setup();
  try {
    const { gameId } = await driver.createGame();
    await driver.confirmSeating();

    // Over game: contracts sum to 14 (>13). Winner bids 5 and makes it.
    await driver.playRound({
      trump: 'clubs',
      trumpWinner: 0,
      contracts: [5, 3, 3, 3],
      tricks: [5, 3, 3, 2],
    });

    // DOM assertion: player 0 made 5 → 5² + 10 = 35.
    const ui = await driver.scores(0).roundScore(1, 0);
    expect(ui).toBe(35);

    // Backend (authoritative) assertion agrees with the DOM.
    const bt = await driver.backendScores(gameId);
    expect(bt.rounds[0].scores[0]).toBe(35);
    expect(ui).toBe(bt.rounds[0].scores[0]);
  } finally {
    await driver.close();
  }
});
