// e2e/tests/multi-round.spec.ts
import { test, expect } from '@playwright/test';
import {
  setupFourPlayers,
  createAndJoinRoom,
  startGameToSeating,
  confirmSeating,
  simpleTrumpBidding,
  simpleContractBidding,
  playTricks,
  waitForScores,
  findActivePage,
  delay,
} from '../helpers/game-setup';
import { waitForPathname } from '../helpers/wait';

test.describe('Multi-Round Games', () => {

  test('complete 2 rounds with different trump suits', async ({ browser }) => {
    test.setTimeout(120_000); // 2 minutes for multi-round

    const { contexts, pages } = await setupFourPlayers(browser);
    const [p1] = pages;
    const roomCode = await createAndJoinRoom(pages);
    const gameId = await startGameToSeating(pages);

    // ── Round 1: Clubs ────────────────────────────────────────────
    await confirmSeating(pages);

    let trumpWinnerIdx = await simpleTrumpBidding(pages);
    await simpleContractBidding(pages, trumpWinnerIdx, 5, 2);
    await playTricks(roomCode, [4, 3, 3, 3]);
    await waitForScores(pages, gameId);

    // Verify Round 1 appears in score table
    await expect(p1.locator(':text("♣")')).toBeVisible({ timeout: 5_000 });
    await expect(p1.locator('button:has-text("New Round")')).toBeVisible({
      timeout: 5_000,
    });

    // ── Transition to Round 2 ─────────────────────────────────────
    await p1.click('button:has-text("New Round")');

    // All pages navigate to game page for Round 2
    await Promise.all(
      pages.map((p) => waitForPathname(p, `^/game/${gameId}`, 15_000))
    );

    // ── Round 2: Diamonds ─────────────────────────────────────────
    let activeIdx = await findActivePage(pages, 'button:has-text("Pass")', 15_000);
    expect(activeIdx).toBeGreaterThanOrEqual(0);
    const r2WinnerIdx = activeIdx;

    await pages[activeIdx].click('button:has-text("♦")');
    await pages[activeIdx].click('button:has-text("Bid")');
    await delay(700);

    // Others pass
    for (let attempt = 0; attempt < 6; attempt++) {
      activeIdx = await findActivePage(pages, 'button:has-text("Pass")');
      if (activeIdx === -1) break;
      await pages[activeIdx].click('button:has-text("Pass")');
      await delay(700);
    }

    // Verify diamonds trump
    await Promise.all(
      pages.map((p) =>
        expect(p.locator(':text("♦")').first()).toBeVisible({ timeout: 10_000 })
      )
    );

    // Contract bidding for Round 2
    await simpleContractBidding(pages, r2WinnerIdx, 5, 2);

    // Play Round 2 tricks
    await playTricks(roomCode, [3, 4, 3, 3]);
    await waitForScores(pages, gameId);

    // Verify score table shows BOTH rounds
    await expect(p1.locator(':text("♣")')).toBeVisible({ timeout: 5_000 });
    await expect(p1.locator(':text("♦")')).toBeVisible({ timeout: 5_000 });

    await Promise.all(contexts.map((c) => c.close()));
  });

  test('3-round game with varied trick distributions', async ({ browser }) => {
    test.setTimeout(180_000); // 3 minutes for 3 rounds

    const { contexts, pages } = await setupFourPlayers(browser);
    const [p1] = pages;
    const roomCode = await createAndJoinRoom(pages);
    const gameId = await startGameToSeating(pages);

    const suits = ['♣', '♥', '♠'];
    const trickDists: [number, number, number, number][] = [
      [4, 3, 3, 3],
      [2, 5, 3, 3],
      [3, 3, 4, 3],
    ];

    for (let roundNum = 0; roundNum < 3; roundNum++) {
      if (roundNum === 0) {
        // First round needs seating confirmation
        await confirmSeating(pages);
      } else {
        // Subsequent rounds start from scores page
        await p1.click('button:has-text("New Round")');
        await Promise.all(
          pages.map((p) => waitForPathname(p, `^/game/${gameId}`, 15_000))
        );
      }

      // Trump bidding with the designated suit
      let activeIdx = await findActivePage(
        pages,
        'button:has-text("Pass")',
        15_000,
      );
      expect(activeIdx).toBeGreaterThanOrEqual(0);
      const trumpWinnerIdx = activeIdx;

      await pages[activeIdx].click(`button:has-text("${suits[roundNum]}")`);
      await pages[activeIdx].click('button:has-text("Bid")');
      await delay(700);

      for (let attempt = 0; attempt < 6; attempt++) {
        activeIdx = await findActivePage(pages, 'button:has-text("Pass")');
        if (activeIdx === -1) break;
        await pages[activeIdx].click('button:has-text("Pass")');
        await delay(700);
      }

      // Contract bidding
      await simpleContractBidding(pages, trumpWinnerIdx, 5, 2);

      // Play tricks
      await playTricks(roomCode, trickDists[roundNum]);

      // Wait for scores
      await waitForScores(pages, gameId);
    }

    // Verify all 3 rounds appear in score table
    for (const suit of suits) {
      await expect(p1.locator(`:text("${suit}")`).first()).toBeVisible({
        timeout: 5_000,
      });
    }

    await Promise.all(contexts.map((c) => c.close()));
  });
});
