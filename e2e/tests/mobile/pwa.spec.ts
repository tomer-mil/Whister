import { test, expect } from '@playwright/test';
import { GameDriver } from '../../driver';
import { IPHONE_SE, throttleCPU } from '../../mobile';
import { firstPageWith } from '../../helpers/wait';

// P1: auth token survives context close + reopen (localStorage-based persistence)
test('P1: JWT auth token persists across context close + reopen', async ({ browser }) => {
  test.setTimeout(60_000);
  const driver = new GameDriver(browser);
  await driver.setup(IPHONE_SE);
  try {
    const { roomCode } = await driver.createGame();
    await driver.confirmSeating();
    // Capture P3's storage state (JWT in localStorage)
    const { players } = await import('../../config/players');
    const storagePath = players[3].storageStatePath;
    // Close P3's context
    await driver.contexts[3].close();
    // New context using same storage state (simulates PWA relaunch from home screen)
    const newCtx = await browser.newContext({ storageState: storagePath, ...IPHONE_SE });
    const newPage = await newCtx.newPage();
    driver.contexts[3] = newCtx;
    driver.pages[3] = newPage;
    // Navigate to the room — should auto-authenticate, not redirect to login
    await newPage.goto(`/room/${roomCode}`);
    // Must NOT land on login or register page
    await expect(newPage).not.toHaveURL(/\/login|\/register/, { timeout: 10_000 });
    // Must show connection indicator (game is loaded)
    await expect(newPage.getByTestId('connection-status')).toBeVisible({ timeout: 20_000 });
  } finally {
    await driver.close();
  }
});

// P2: manifest.json is served and contains required PWA fields
test('P2: /manifest.json is served with required PWA fields', async ({ browser }) => {
  const driver = new GameDriver(browser);
  await driver.setup(IPHONE_SE);
  try {
    const resp = await driver.pages[0].goto(
      `${process.env.BASE_URL || 'http://localhost:3001'}/manifest.json`,
    );
    expect(resp?.status(), 'manifest.json must return 200').toBe(200);
    const manifest = await resp!.json();
    expect(manifest.name ?? manifest.short_name, 'manifest must have name or short_name').toBeTruthy();
    expect(manifest.start_url, 'manifest must have start_url').toBeTruthy();
    expect(manifest.display, 'manifest must have display field').toBeTruthy();
    expect(
      manifest.icons?.length,
      'manifest must have at least one icon',
    ).toBeGreaterThanOrEqual(1);
    // Finding: if this test fails, the app is not installable as a PWA.
  } finally {
    await driver.close();
  }
});

test('Th1: bid counter remains exact under 4x CPU throttle', async ({ browser }) => {
  const driver = new GameDriver(browser);
  await driver.setup(IPHONE_SE);
  try {
    await driver.createGame();
    await driver.confirmSeating();
    const activeIdx = await firstPageWith(driver.pages, 'bidding-pass');
    const page = driver.pages[activeIdx];
    const restoreCPU = await throttleCPU(page, 4);
    try {
      const initial = Number(await page.getByTestId('bidding-counter-value').innerText());
      for (let tap = 0; tap < 5; tap += 1) {
        await page.tap('[data-testid="bidding-counter-plus"]');
      }
      await expect(page.getByTestId('bidding-counter-value')).toHaveText(String(initial + 5));
    } finally {
      await restoreCPU();
    }
  } finally {
    await driver.close();
  }
});
// Th2 deferred — covered adequately by N4
test.skip('Th2: socket connects under 3G throttle (deferred — covered by N4)', () => {});
