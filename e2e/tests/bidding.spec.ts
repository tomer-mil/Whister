// e2e/tests/bidding.spec.ts
import { test, expect } from '@playwright/test';
import {
  setupFourPlayers,
  createAndJoinRoom,
  startGameToSeating,
  confirmSeating,
  simpleContractBidding,
  playTricks,
  waitForScores,
  findActivePage,
  delay,
} from '../helpers/game-setup';

test.describe('Trump Bidding – Complex Scenarios', () => {

  test('outbid: second player outbids first with higher amount', async ({ browser }) => {
    const { contexts, pages } = await setupFourPlayers(browser);
    await createAndJoinRoom(pages);
    await startGameToSeating(pages);
    await confirmSeating(pages);

    // First bidder bids 5 ♣
    let activeIdx = await findActivePage(pages, ':text("📢 Your Turn to Bid")');
    expect(activeIdx).toBeGreaterThanOrEqual(0);
    const firstBidderIdx = activeIdx;

    await pages[activeIdx].click('button:has-text("♣")');
    await pages[activeIdx].click('button:has-text("📢 Call")');
    await delay(700);

    // Second bidder outbids with 6 ♣
    activeIdx = await findActivePage(pages, ':text("📢 Your Turn to Bid")');
    expect(activeIdx).toBeGreaterThanOrEqual(0);
    expect(activeIdx).not.toBe(firstBidderIdx); // Different player
    const outbidderIdx = activeIdx;

    // Click + to increase bid to 6
    const plusBtn = pages[activeIdx].locator('button:has-text("+")').first();
    await plusBtn.click();
    await delay(100);

    await pages[activeIdx].click('button:has-text("♣")');
    await pages[activeIdx].click('button:has-text("📢 Call")');
    await delay(700);

    // Remaining players pass (could be 2 or 3 passes depending on
    // whether first bidder also passes)
    let passCount = 0;
    for (let attempt = 0; attempt < 6; attempt++) {
      activeIdx = await findActivePage(pages, ':text("📢 Your Turn to Bid")');
      if (activeIdx === -1) break;
      await pages[activeIdx].click('button:has-text("🚫 Pass")');
      passCount++;
      await delay(700);
    }

    // Trump should be set to ♣ with the outbidder as winner
    await Promise.all(
      pages.map((p) =>
        expect(p.locator(':text("♣")').first()).toBeVisible({ timeout: 10_000 })
      )
    );

    // Contract bidding should start with outbidder
    const contractBidderIdx = await findActivePage(
      pages,
      'button:has-text("Confirm Bid")',
      10_000,
    );
    expect(contractBidderIdx).toBe(outbidderIdx);

    await Promise.all(contexts.map((c) => c.close()));
  });

  test('outbid by suit: same amount but higher suit wins', async ({ browser }) => {
    const { contexts, pages } = await setupFourPlayers(browser);
    await createAndJoinRoom(pages);
    await startGameToSeating(pages);
    await confirmSeating(pages);

    // First bidder bids 5 ♣ (clubs = lowest suit)
    let activeIdx = await findActivePage(pages, ':text("📢 Your Turn to Bid")');
    await pages[activeIdx].click('button:has-text("♣")');
    await pages[activeIdx].click('button:has-text("📢 Call")');
    await delay(700);

    // Second bidder outbids with 5 ♥ (hearts > clubs at same amount)
    activeIdx = await findActivePage(pages, ':text("📢 Your Turn to Bid")');
    const suitOutbidderIdx = activeIdx;
    await pages[activeIdx].click('button:has-text("♥")');
    await pages[activeIdx].click('button:has-text("📢 Call")');
    await delay(700);

    // Everyone else passes
    for (let attempt = 0; attempt < 6; attempt++) {
      activeIdx = await findActivePage(pages, ':text("📢 Your Turn to Bid")');
      if (activeIdx === -1) break;
      await pages[activeIdx].click('button:has-text("🚫 Pass")');
      await delay(700);
    }

    // Trump should be ♥ (hearts), not ♣
    await Promise.all(
      pages.map((p) =>
        expect(p.locator(':text("♥")').first()).toBeVisible({ timeout: 10_000 })
      )
    );

    // Contract bidding should start with the suit outbidder
    const contractBidderIdx = await findActivePage(
      pages,
      'button:has-text("Confirm Bid")',
      10_000,
    );
    expect(contractBidderIdx).toBe(suitOutbidderIdx);

    await Promise.all(contexts.map((c) => c.close()));
  });

  test('frisch: all 4 pass without bidding triggers frisch', async ({ browser }) => {
    const { contexts, pages } = await setupFourPlayers(browser);
    await createAndJoinRoom(pages);
    await startGameToSeating(pages);
    await confirmSeating(pages);

    // All 4 players pass without anyone bidding
    for (let i = 0; i < 4; i++) {
      const activeIdx = await findActivePage(pages, ':text("📢 Your Turn to Bid")');
      expect(activeIdx).toBeGreaterThanOrEqual(0);
      await pages[activeIdx].click('button:has-text("🚫 Pass")');
      await delay(700);
    }

    // Frisch should be triggered - bidding starts over with higher minimum
    // The frisch event should broadcast and reset the bidding UI
    // A new "Your Turn to Bid" should appear (first bidder gets turn again)
    const activeIdx = await findActivePage(pages, ':text("📢 Your Turn to Bid")', 15_000);
    expect(activeIdx).toBeGreaterThanOrEqual(0);

    // Now bid successfully (minimum is now 6 after frisch)
    await pages[activeIdx].click('button:has-text("♦")');
    // The minimum bid should have increased - click + once to get to 6
    const plusBtn = pages[activeIdx].locator('button:has-text("+")').first();
    await plusBtn.click();
    await delay(100);
    await pages[activeIdx].click('button:has-text("📢 Call")');
    await delay(700);

    // Others pass
    for (let attempt = 0; attempt < 6; attempt++) {
      const idx = await findActivePage(pages, ':text("📢 Your Turn to Bid")');
      if (idx === -1) break;
      await pages[idx].click('button:has-text("🚫 Pass")');
      await delay(700);
    }

    // Trump should be ♦ (diamonds)
    await Promise.all(
      pages.map((p) =>
        expect(p.locator(':text("♦")').first()).toBeVisible({ timeout: 10_000 })
      )
    );

    await Promise.all(contexts.map((c) => c.close()));
  });

  test('bidding war: multiple outbids before settling', async ({ browser }) => {
    const { contexts, pages } = await setupFourPlayers(browser);
    await createAndJoinRoom(pages);
    await startGameToSeating(pages);
    await confirmSeating(pages);

    const bidders: number[] = [];

    // P1 bids 5 ♣
    let activeIdx = await findActivePage(pages, ':text("📢 Your Turn to Bid")');
    bidders.push(activeIdx);
    await pages[activeIdx].click('button:has-text("♣")');
    await pages[activeIdx].click('button:has-text("📢 Call")');
    await delay(700);

    // P2 outbids 6 ♣
    activeIdx = await findActivePage(pages, ':text("📢 Your Turn to Bid")');
    bidders.push(activeIdx);
    const plusBtn1 = pages[activeIdx].locator('button:has-text("+")').first();
    await plusBtn1.click();
    await delay(100);
    await pages[activeIdx].click('button:has-text("♣")');
    await pages[activeIdx].click('button:has-text("📢 Call")');
    await delay(700);

    // P3 outbids 7 ♠
    activeIdx = await findActivePage(pages, ':text("📢 Your Turn to Bid")');
    bidders.push(activeIdx);
    const plusBtn2 = pages[activeIdx].locator('button:has-text("+")').first();
    await plusBtn2.click();
    await delay(100);
    await plusBtn2.click();
    await delay(100);
    await pages[activeIdx].click('button:has-text("♠")');
    await pages[activeIdx].click('button:has-text("📢 Call")');
    await delay(700);

    // Everyone else passes
    let finalWinnerIdx = bidders[2]; // P3 should win
    for (let attempt = 0; attempt < 6; attempt++) {
      activeIdx = await findActivePage(pages, ':text("📢 Your Turn to Bid")');
      if (activeIdx === -1) break;
      await pages[activeIdx].click('button:has-text("🚫 Pass")');
      await delay(700);
    }

    // Trump should be ♠ (spades)
    await Promise.all(
      pages.map((p) =>
        expect(p.locator(':text("♠")').first()).toBeVisible({ timeout: 10_000 })
      )
    );

    // Contract bidding should start with the final winner (P3)
    const contractBidderIdx = await findActivePage(
      pages,
      'button:has-text("Confirm Bid")',
      10_000,
    );
    expect(contractBidderIdx).toBe(finalWinnerIdx);

    await Promise.all(contexts.map((c) => c.close()));
  });
});

test.describe('Contract Bidding – Edge Cases', () => {

  test('over game: total contracts > 13', async ({ browser }) => {
    const { contexts, pages } = await setupFourPlayers(browser);
    const roomCode = await createAndJoinRoom(pages);
    const gameId = await startGameToSeating(pages);
    await confirmSeating(pages);

    // Simple trump: first bids 5 ♣, others pass
    let trumpWinnerIdx = -1;
    for (let attempt = 0; attempt < 8; attempt++) {
      const activeIdx = await findActivePage(pages, ':text("📢 Your Turn to Bid")');
      if (activeIdx === -1) break;
      if (trumpWinnerIdx === -1) {
        await pages[activeIdx].click('button:has-text("♣")');
        await pages[activeIdx].click('button:has-text("📢 Call")');
        trumpWinnerIdx = activeIdx;
      } else {
        await pages[activeIdx].click('button:has-text("🚫 Pass")');
      }
      await delay(700);
    }

    // Contract bidding: trump winner bids 5, others bid 4 each
    // Total = 5 + 4 + 4 + 4 = 17 → OVER game
    for (let round = 0; round < 4; round++) {
      const activeIdx = await findActivePage(pages, 'button:has-text("Confirm Bid")');
      if (activeIdx === -1) break;

      const targetBid = activeIdx === trumpWinnerIdx ? 5 : 4;
      const plusBtn = pages[activeIdx].locator('button:has-text("+")').first();
      for (let i = 0; i < targetBid; i++) {
        await plusBtn.click();
        await delay(60);
      }
      await pages[activeIdx].click('button:has-text("Confirm Bid")');
      await delay(700);
    }

    // Should reach playing phase
    await Promise.all(
      pages.map((p) =>
        expect(p.locator(':text("CLAIM TRICK")')).toBeVisible({ timeout: 10_000 })
      )
    );

    // Play tricks and verify scores render
    await playTricks(roomCode, [5, 4, 2, 2]);
    await waitForScores(pages, gameId);

    await Promise.all(contexts.map((c) => c.close()));
  });

  test('under game: total contracts < 13', async ({ browser }) => {
    const { contexts, pages } = await setupFourPlayers(browser);
    const roomCode = await createAndJoinRoom(pages);
    const gameId = await startGameToSeating(pages);
    await confirmSeating(pages);

    // Simple trump
    let trumpWinnerIdx = -1;
    for (let attempt = 0; attempt < 8; attempt++) {
      const activeIdx = await findActivePage(pages, ':text("📢 Your Turn to Bid")');
      if (activeIdx === -1) break;
      if (trumpWinnerIdx === -1) {
        await pages[activeIdx].click('button:has-text("♣")');
        await pages[activeIdx].click('button:has-text("📢 Call")');
        trumpWinnerIdx = activeIdx;
      } else {
        await pages[activeIdx].click('button:has-text("🚫 Pass")');
      }
      await delay(700);
    }

    // Contract bidding: trump winner bids 5, others bid 1 each
    // Total = 5 + 1 + 1 + 1 = 8 → UNDER game
    for (let round = 0; round < 4; round++) {
      const activeIdx = await findActivePage(pages, 'button:has-text("Confirm Bid")');
      if (activeIdx === -1) break;

      const targetBid = activeIdx === trumpWinnerIdx ? 5 : 1;
      const plusBtn = pages[activeIdx].locator('button:has-text("+")').first();
      for (let i = 0; i < targetBid; i++) {
        await plusBtn.click();
        await delay(60);
      }
      await pages[activeIdx].click('button:has-text("Confirm Bid")');
      await delay(700);
    }

    // Should reach playing phase
    await Promise.all(
      pages.map((p) =>
        expect(p.locator(':text("CLAIM TRICK")')).toBeVisible({ timeout: 10_000 })
      )
    );

    // Play tricks and verify scores render
    await playTricks(roomCode, [5, 4, 3, 1]);
    await waitForScores(pages, gameId);

    await Promise.all(contexts.map((c) => c.close()));
  });

  test('zero contract bids are allowed for non-trump-winners', async ({ browser }) => {
    const { contexts, pages } = await setupFourPlayers(browser);
    const roomCode = await createAndJoinRoom(pages);
    const gameId = await startGameToSeating(pages);
    await confirmSeating(pages);

    // Simple trump
    let trumpWinnerIdx = -1;
    for (let attempt = 0; attempt < 8; attempt++) {
      const activeIdx = await findActivePage(pages, ':text("📢 Your Turn to Bid")');
      if (activeIdx === -1) break;
      if (trumpWinnerIdx === -1) {
        await pages[activeIdx].click('button:has-text("♣")');
        await pages[activeIdx].click('button:has-text("📢 Call")');
        trumpWinnerIdx = activeIdx;
      } else {
        await pages[activeIdx].click('button:has-text("🚫 Pass")');
      }
      await delay(700);
    }

    // Contract bidding: trump winner bids 5, others bid 0
    // Total = 5 + 0 + 0 + 0 = 5 → UNDER game
    // Note: bidding 0 means just clicking "Confirm Bid" without clicking "+"
    for (let round = 0; round < 4; round++) {
      const activeIdx = await findActivePage(pages, 'button:has-text("Confirm Bid")');
      if (activeIdx === -1) break;

      if (activeIdx === trumpWinnerIdx) {
        const plusBtn = pages[activeIdx].locator('button:has-text("+")').first();
        for (let i = 0; i < 5; i++) {
          await plusBtn.click();
          await delay(60);
        }
      }
      // Non-trump-winners: bid 0 (just confirm without incrementing)
      await pages[activeIdx].click('button:has-text("Confirm Bid")');
      await delay(700);
    }

    // Should reach playing phase
    await Promise.all(
      pages.map((p) =>
        expect(p.locator(':text("CLAIM TRICK")')).toBeVisible({ timeout: 10_000 })
      )
    );

    await playTricks(roomCode, [5, 4, 3, 1]);
    await waitForScores(pages, gameId);

    await Promise.all(contexts.map((c) => c.close()));
  });
});
