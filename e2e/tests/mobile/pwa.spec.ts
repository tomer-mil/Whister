import { test, expect } from '@playwright/test';
import { GameDriver } from '../../driver';
import { IPHONE_SE, throttle3G, throttleCPU } from '../../mobile';
import { firstPageWith } from '../../helpers/wait';

// P1: auth token survives context close + reopen (localStorage-based persistence)
test('P1: JWT auth token persists across context close + reopen', async ({ browser }) => {
  test.setTimeout(60_000);
  const driver = new GameDriver(browser);
  await driver.setup(IPHONE_SE);
  try {
    const { roomCode } = await driver.createGame();
    await driver.confirmSeating();
    // Capture the live context state rather than reusing global setup's seed file.
    const runtimeState = await driver.contexts[3].storageState();
    // Close P3's context
    await driver.contexts[3].close();
    // New context using same storage state (simulates PWA relaunch from home screen)
    const newCtx = await browser.newContext({ storageState: runtimeState, ...IPHONE_SE });
    const newPage = await newCtx.newPage();
    driver.contexts[3] = newCtx;
    driver.pages[3] = newPage;
    // Navigate to the room — should auto-authenticate, not redirect to login
    await newPage.goto(`/room/${roomCode}`);
    // Must NOT land on login or register page
    await expect(newPage).not.toHaveURL(/\/login|\/register/, { timeout: 10_000 });
    // Must show connection indicator (game is loaded)
    await expect(newPage.getByTestId('connection-status')).toBeVisible({ timeout: 20_000 });
    await expect.poll(
      () => newPage.evaluate(
        () => !!(window as Window & {
          socketManager?: { isConnected(): boolean };
        }).socketManager?.isConnected(),
      ),
    ).toBe(true);
    await expect(newPage.getByTestId('bidding-current-turn').or(newPage.getByTestId('bidding-pass')))
      .toBeVisible({ timeout: 20_000 });
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
    expect(['standalone', 'fullscreen']).toContain(manifest.display);
    expect(
      manifest.icons?.length,
      'manifest must have at least one icon',
    ).toBeGreaterThanOrEqual(1);
    for (const icon of manifest.icons as Array<{ src: string }>) {
      const iconResponse = await driver.contexts[0].request.get(
        new URL(icon.src, process.env.BASE_URL || 'http://localhost:3001').toString(),
      );
      expect(iconResponse.ok(), `manifest icon ${icon.src} must resolve`).toBe(true);
    }
    // Finding: if this test fails, the app is not installable as a PWA.
  } finally {
    await driver.close();
  }
});

test('P3: installed scope has an active service worker for offline relaunch', async ({ browser }) => {
  const driver = new GameDriver(browser);
  await driver.setup(IPHONE_SE);
  try {
    await driver.pages[0].goto('/');
    const serviceWorker = await driver.pages[0].evaluate(async () => {
      if (!('serviceWorker' in navigator)) return { supported: false, controlled: false };
      await navigator.serviceWorker.ready;
      if (!navigator.serviceWorker.controller) {
        await new Promise<void>((resolve, reject) => {
          const timeout = window.setTimeout(
            () => reject(new Error('service worker did not claim the page')),
            10_000,
          );
          navigator.serviceWorker.addEventListener('controllerchange', () => {
            window.clearTimeout(timeout);
            resolve();
          }, { once: true });
        });
      }
      const registrations = await navigator.serviceWorker.getRegistrations();
      return {
        supported: true,
        controlled: navigator.serviceWorker.controller !== null,
        registrations: registrations.length,
      };
    });
    expect(serviceWorker.supported).toBe(true);
    expect(
      serviceWorker.controlled,
      `no active service worker controls the app (${serviceWorker.registrations ?? 0} registrations)`,
    ).toBe(true);
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
test('Th2: socket reconnects after a page reload under 3G throttle', async ({ browser }) => {
  test.setTimeout(120_000);
  const driver = new GameDriver(browser);
  await driver.setup(IPHONE_SE);
  try {
    await driver.createGame();
    await driver.confirmSeating();
    const page = driver.pages[3];
    const restoreNetwork = await throttle3G(page);
    page.setDefaultTimeout(60_000);
    try {
      await page.reload({ waitUntil: 'domcontentloaded' });
      await expect.poll(
        () => page.evaluate(
          () => !!(window as Window & {
            socketManager?: { isConnected(): boolean };
          }).socketManager?.isConnected(),
        ),
        { timeout: 60_000 },
      ).toBe(true);
      await expect(page.getByTestId('bidding-current-turn').or(page.getByTestId('bidding-pass')))
        .toBeVisible({ timeout: 60_000 });
    } finally {
      page.setDefaultTimeout(15_000);
      await restoreNetwork();
    }
  } finally {
    await driver.close();
  }
});
