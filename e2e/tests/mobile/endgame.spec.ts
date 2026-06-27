import { test, expect } from '@playwright/test';
import { GameDriver } from '../../driver';
import { IPHONE_SE } from '../../mobile';

// W1: end-game winner display
// Currently FAILS: scores-winner is a sr-only 1×1 px div — not visible to users (A3 not implemented).
// Will pass once A3 is implemented: the scores page shows the winner prominently after POST /end.
test('W1: winner is displayed prominently on scores page after game ends', async ({ browser }) => {
  test.setTimeout(120_000);
  const driver = new GameDriver(browser);
  await driver.setup(IPHONE_SE);
  try {
    const { gameId } = await driver.createGame();
    await driver.confirmSeating();
    // Play one round — P0 bids and makes 5 clubs (score = +35).
    // P1/P2 bid 3 each, P2 makes only 2 (one trick short); scoring depends on backend rules.
    // The important thing: P0 ends up with the highest score.
    // tricks: each player claims this many; total is 13 (one trick per card round, not per card).
    await driver.playRound({
      trump: 'clubs',
      trumpWinner: 0,
      contracts: [5, 3, 3, 3],
      tricks: [5, 3, 3, 2],
    });
    // End the game via the backend API (admin = P0, uses P0's stored token).
    await driver.backendEndGame(gameId);
    // After game ends, scores-winner must be prominent (not sr-only 1×1 px).
    // Currently FAILS: scores-winner is sr-only (1×1 px) — A3 not implemented.
    // Will pass once A3 makes the winner element prominent (both width and height > 44 px).
    const winnerEl = driver.pages[0].getByTestId('scores-winner');
    await expect.poll(
      async () => {
        const box = await winnerEl.boundingBox();
        return box ? Math.min(box.width, box.height) : 0;
      },
      {
        timeout: 15_000,
        message: 'scores-winner still sr-only (1×1 px) after game end — A3 not yet implemented',
      },
    ).toBeGreaterThan(44);
    // Verify the correct player is identified as winner (P0 has highest score).
    const winnerSeat = await driver.scores(0).winnerSeat();
    expect(winnerSeat, 'scores-winner data-seat attribute missing or element not visible').not.toBeNull();
    expect(winnerSeat, 'winner seat should be 0 (P0 scored highest)').toBe(0);
  } finally {
    await driver.close();
  }
});
