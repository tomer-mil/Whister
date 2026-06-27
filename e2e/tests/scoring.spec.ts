import { test, expect } from '@playwright/test';
import { GameDriver } from '../driver';
import type { RoundSpec } from '../driver';

interface Case {
  name: string;
  round: RoundSpec;
  seat: number;       // player under assertion
  expected: number;   // expected score for that seat
}

// Σcontracts > 13 → over game; < 13 → under game.
const cases: Case[] = [
  { name: 'made contract (bid 3, win 3)', seat: 1, expected: 19,
    round: { trump: 'clubs', trumpWinner: 0, contracts: [5, 3, 3, 3], tricks: [4, 3, 3, 3] } },
  { name: 'failed contract (bid 5, win 3)', seat: 0, expected: -20,
    round: { trump: 'clubs', trumpWinner: 0, contracts: [5, 3, 3, 3], tricks: [3, 4, 3, 3] } },
  // Under-game zero bid (special scoring).
  { name: 'zero made, under (+50)', seat: 3, expected: 50,
    round: { trump: 'clubs', trumpWinner: 0, contracts: [5, 3, 2, 0], tricks: [6, 4, 3, 0] } },
  { name: 'failed zero, under, 1 trick (-50)', seat: 3, expected: -50,
    round: { trump: 'clubs', trumpWinner: 0, contracts: [5, 4, 3, 0], tricks: [4, 4, 4, 1] } },
  { name: 'failed zero, under, 3 tricks (-30)', seat: 3, expected: -30,
    round: { trump: 'clubs', trumpWinner: 0, contracts: [5, 3, 2, 0], tricks: [4, 3, 3, 3] } },
  // Over-game zero bid: scored like any other contract (made → 0²+10 = +10; failed → -10×tricks).
  { name: 'zero made, over (+10)', seat: 3, expected: 10,
    round: { trump: 'clubs', trumpWinner: 0, contracts: [6, 5, 3, 0], tricks: [5, 5, 3, 0] } },
  { name: 'failed zero, over, 1 trick (-10)', seat: 3, expected: -10,
    round: { trump: 'clubs', trumpWinner: 0, contracts: [6, 5, 3, 0], tricks: [5, 4, 3, 1] } },
  { name: 'failed zero, over, 2 tricks (-20)', seat: 3, expected: -20,
    round: { trump: 'clubs', trumpWinner: 0, contracts: [6, 5, 3, 0], tricks: [5, 3, 3, 2] } },
];

for (const c of cases) {
  test(`scoring: ${c.name}`, async ({ browser }) => {
    const driver = new GameDriver(browser);
    await driver.setup();
    try {
      const { gameId } = await driver.createGame();
      await driver.confirmSeating();
      await driver.playRound(c.round);

      const ui = await driver.scores(0).roundScore(1, c.seat);
      const bt = await driver.backendScores(gameId);
      expect(bt.rounds[0].scores[c.seat]).toBe(c.expected); // authoritative
      expect(ui).toBe(c.expected);                          // displayed
    } finally {
      await driver.close();
    }
  });
}
