import { test, expect } from '@playwright/test';
import { GameDriver } from '../../driver';
import { IPHONE_SE, IPHONE_14, assertTouchTargets } from '../../mobile';
import { firstPageWith } from '../../helpers/wait';

// T1: touch (tap) input drives a trump bid
test('T1: trump bid placed via tap (not mouse click)', async ({ browser }) => {
  const driver = new GameDriver(browser);
  await driver.setup(IPHONE_SE);
  try {
    await driver.createGame();
    await driver.confirmSeating();
    const activeIdx = await firstPageWith(driver.pages, 'bidding-pass');
    const page = driver.pages[activeIdx];
    // Tap counter-plus to reach 6, tap suit, tap bid — all via page.tap()
    await page.tap('[data-testid="bidding-counter-plus"]');
    await expect(page.getByTestId('bidding-counter-value')).toHaveText('6', { timeout: 5_000 });
    await page.tap('[data-testid="bidding-suit-hearts"]');
    await page.tap('[data-testid="bidding-bid"]');
    // Bid placed — a different player now has the bidding controls
    const nextIdx = await firstPageWith(driver.pages, 'bidding-pass', 15_000);
    expect(nextIdx).not.toBe(activeIdx);
  } finally {
    await driver.close();
  }
});

// T2a: touch target sizes on iPhone SE (small phone — tightest constraint)
test('T2a: bidding controls meet 44×44px touch-target guideline on iPhone SE', async ({ browser }) => {
  const driver = new GameDriver(browser);
  await driver.setup(IPHONE_SE);
  try {
    await driver.createGame();
    await driver.confirmSeating();
    const activeIdx = await firstPageWith(driver.pages, 'bidding-pass');
    // Finding F4: if any button is below 44px, the test throws with a report
    await assertTouchTargets(driver.pages[activeIdx], [
      'bidding-suit-clubs', 'bidding-suit-diamonds', 'bidding-suit-hearts',
      'bidding-suit-spades', 'bidding-suit-notrump',
      'bidding-counter-plus', 'bidding-counter-minus',
      'bidding-bid', 'bidding-pass',
    ]);
  } finally {
    await driver.close();
  }
});

// T2b: same check on iPhone 14 (larger phone should be easier to pass)
test('T2b: bidding controls meet 44×44px touch-target guideline on iPhone 14', async ({ browser }) => {
  const driver = new GameDriver(browser);
  await driver.setup(IPHONE_14);
  try {
    await driver.createGame();
    await driver.confirmSeating();
    const activeIdx = await firstPageWith(driver.pages, 'bidding-pass');
    await assertTouchTargets(driver.pages[activeIdx], [
      'bidding-suit-clubs', 'bidding-suit-diamonds', 'bidding-suit-hearts',
      'bidding-suit-spades', 'bidding-suit-notrump',
      'bidding-counter-plus', 'bidding-counter-minus',
      'bidding-bid', 'bidding-pass',
    ]);
  } finally {
    await driver.close();
  }
});

// T3: no critical action is hover-gated — game completes without any hover() call
test('T3: full round completes on touch context with zero hover interactions', async ({ browser }) => {
  test.setTimeout(120_000);
  // The entire GameDriver and page-object layer uses .click() / .tap() — never .hover().
  // Running a complete round on a hasTouch context proves no hover-only gate exists.
  const driver = new GameDriver(browser);
  await driver.setup(IPHONE_SE);
  try {
    const { gameId } = await driver.createGame();
    await driver.confirmSeating();
    await driver.playRound({ trump: 'spades', trumpWinner: 0, contracts: [5, 3, 3, 3], tricks: [5, 3, 3, 2] });
    const bt = await driver.backendScores(gameId);
    expect(bt.rounds[0].scores[0]).toBe(35);
  } finally {
    await driver.close();
  }
});

// T4: rapid double-tap on claim-trick does not double-count (idempotency)
test('T4: two rapid taps on claim-trick count as one trick claim', async ({ browser }) => {
  const driver = new GameDriver(browser);
  await driver.setup(IPHONE_SE);
  try {
    await driver.createGame();
    await driver.confirmSeating();
    // Drive through bidding to reach playing phase
    await (driver as any).runTrumpAuction('clubs', 0);
    await (driver as any).runContractBidding([5, 3, 3, 3]);
    // Now in playing phase — P0 claims twice rapidly
    const page = driver.pages[0];
    await expect(page.getByTestId('playing-claim-trick')).toBeVisible({ timeout: 15_000 });
    await page.tap('[data-testid="playing-claim-trick"]');
    await page.tap('[data-testid="playing-claim-trick"]');
    // Wait briefly for state to settle (condition-based: check trick count stabilises)
    await expect.poll(
      () => driver.pages[0].getByTestId('playing-trick-count-0').innerText(),
      { timeout: 10_000 },
    ).toMatch(/\d+/);
    const count = parseInt(
      await driver.pages[0].getByTestId('playing-trick-count-0').innerText(),
      10,
    );
    // Finding: if count > 1, the backend accepted a duplicate — SG-6 C3 not yet fixed.
    // Correct behavior: exactly 1 trick claimed despite 2 rapid taps.
    expect(count).toBe(1);
  } finally {
    await driver.close();
  }
});

// K1: room-join form works when keyboard-open shrinks viewport to ~375×350
test('K1: room join form accessible with simulated keyboard-open viewport (375×350)', async ({ browser }) => {
  const driver = new GameDriver(browser);
  // Start with normal SE dimensions but then simulate keyboard by shrinking height
  await driver.setup(IPHONE_SE);
  try {
    // P0 creates the room
    const roomCode = await driver.lobby(0).createRoom();
    // P1 joins — but first simulate keyboard open by shrinking viewport
    await driver.pages[1].setViewportSize({ width: 375, height: 350 });
    await driver.pages[1].goto('/room/join');
    const nameInput = driver.pages[1].getByPlaceholder('Your Name');
    await expect(nameInput).toBeVisible({ timeout: 10_000 });
    await nameInput.fill('P1Mobile');
    const joinInput = driver.pages[1].getByPlaceholder('Room Code');
    await expect(joinInput).toBeVisible({ timeout: 10_000 });
    await joinInput.fill(roomCode);
    const submitBtn = driver.pages[1].getByRole('button', { name: /join/i });
    await expect(submitBtn).toBeVisible({ timeout: 10_000 });
    // Finding: if submit button is not visible, it's below the fold when keyboard is open
    const box = await submitBtn.boundingBox();
    expect(box, 'Submit button not found at 375x350 (keyboard-open simulation)').not.toBeNull();
    await submitBtn.tap();
    await expect(driver.pages[1]).toHaveURL(new RegExp(`/room/${roomCode}`), { timeout: 15_000 });
  } finally {
    await driver.close();
  }
});

// K2: display name value is retained after keyboard dismiss (blur)
test('K2: display name input value retained after blur', async ({ browser }) => {
  const driver = new GameDriver(browser);
  await driver.setup(IPHONE_SE);
  try {
    await driver.pages[0].goto('/room/join');
    const nameInput = driver.pages[0].getByPlaceholder('Your Name');
    await expect(nameInput).toBeVisible({ timeout: 10_000 });
    await nameInput.fill('Alice');
    await nameInput.blur();
    await expect(nameInput).toHaveValue('Alice');
  } finally {
    await driver.close();
  }
});

// K3: room-code input has appropriate input attributes (no autocorrect on a code field)
test('K3: room-code input does not have autocorrect enabled', async ({ browser }) => {
  const driver = new GameDriver(browser);
  await driver.setup(IPHONE_SE);
  try {
    await driver.pages[0].goto('/room/join');
    const roomInput = driver.pages[0].getByPlaceholder('Room Code');
    await expect(roomInput).toBeVisible({ timeout: 10_000 });
    // Check that autocorrect / autocapitalize won't mangle room codes.
    // Good: autocorrect="off", autocapitalize="characters" or "none"
    // Finding: if autocorrect="on", iOS may substitute the room code.
    const autocorrect = await roomInput.getAttribute('autocorrect');
    const autocapitalize = await roomInput.getAttribute('autocapitalize');
    // At minimum autocorrect should be 'off' — anything else is a usability finding.
    expect(
      autocorrect,
      'Room code input should have autocorrect="off" to prevent iOS substitution',
    ).toBe('off');
    // autocapitalize may be 'characters' (good) or 'none' (also fine)
    expect(
      autocapitalize,
      'Room code should not autocapitalize as "words" or "sentences"',
    ).not.toBe('words');
    expect(autocapitalize).not.toBe('sentences');
  } finally {
    await driver.close();
  }
});

// X1: viewport meta contains zoom-lock to prevent accidental double-tap zoom
test('X1: viewport meta prevents pinch/double-tap zoom during gameplay', async ({ browser }) => {
  const driver = new GameDriver(browser);
  await driver.setup(IPHONE_SE);
  try {
    await driver.pages[0].goto('/');
    const viewportContent = await driver.pages[0].$eval(
      'meta[name="viewport"]',
      (el) => el.getAttribute('content') ?? '',
    );
    // Finding F5: zoom lock missing if neither user-scalable=no nor maximum-scale=1 is present.
    const hasZoomLock =
      viewportContent.includes('user-scalable=no') ||
      viewportContent.includes('maximum-scale=1');
    expect(
      hasZoomLock,
      `Viewport meta "${viewportContent}" does not prevent accidental zoom (finding F5)`,
    ).toBe(true);
  } finally {
    await driver.close();
  }
});

// X2: five rapid taps on bid counter-plus result in exactly +5
test('X2: rapid 5× tap on counter-plus increments by exactly 5', async ({ browser }) => {
  const driver = new GameDriver(browser);
  await driver.setup(IPHONE_SE);
  try {
    await driver.createGame();
    await driver.confirmSeating();
    const activeIdx = await firstPageWith(driver.pages, 'bidding-pass');
    const page = driver.pages[activeIdx];
    const initial = parseInt(await page.getByTestId('bidding-counter-value').innerText(), 10);
    for (let i = 0; i < 5; i++) {
      await page.tap('[data-testid="bidding-counter-plus"]');
    }
    await expect.poll(
      () => page.getByTestId('bidding-counter-value').innerText().then(Number),
      { timeout: 10_000 },
    ).toBe(initial + 5);
  } finally {
    await driver.close();
  }
});

// X3: room code can be filled via simulate-paste (fill, not keyboard input)
test('X3: room code paste (fill) correctly joins the room', async ({ browser }) => {
  const driver = new GameDriver(browser);
  await driver.setup(IPHONE_SE);
  try {
    const roomCode = await driver.lobby(0).createRoom();
    await driver.pages[1].goto('/room/join');
    // page.fill() simulates clipboard paste — no keystroke-by-keystroke input
    await driver.pages[1].getByPlaceholder('Your Name').fill('PastePlayer');
    await driver.pages[1].getByPlaceholder('Room Code').fill(roomCode);
    await driver.pages[1].getByRole('button', { name: /join/i }).tap();
    await expect(driver.pages[1]).toHaveURL(new RegExp(`/room/${roomCode}`), { timeout: 15_000 });
  } finally {
    await driver.close();
  }
});

// G1 deferred — back navigation guard not yet implemented
test.skip('G1: browser back from game page (deferred — no navigation guard)', () => {
  // Deferred: implement when the app adds a back-navigation guard.
  // Expected behavior: player is prompted before leaving an active game.
});
