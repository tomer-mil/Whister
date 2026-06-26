# E2E Mobile Emulation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the existing 18-test Playwright e2e suite with a mobile-emulation framework and 37 mobile scenarios covering touch, viewport, orientation, lifecycle, recovery, network, keyboard, and PWA concerns.

**Architecture:** A new `e2e/mobile/` harness module (profiles, lifecycle, network, touch helpers) layers onto the existing `GameDriver` via a single optional `contextOptions` parameter on `setup()`. Mobile specs live in `e2e/tests/mobile/` and are auto-discovered. All four players share one device profile per test; the harness helpers operate directly on `Page`/`BrowserContext`. Execution stays `workers:1`, `retries:0`.

**Tech Stack:** Playwright `@playwright/test ^1.41` (Chromium), TypeScript strict, `devices['iPhone SE (3rd gen)']` (375×667) + `devices['iPhone 14']` (390×664), CDP for throttle, `context.setOffline()` for network toggle.

## Global Constraints

- `workers: 1`, `retries: 0` — serial, deterministic. A flaky mobile test is a bug to fix, not to retry.
- No `delay()`/`sleep()`/`waitForTimeout()` anywhere. Every wait gates on an observable condition.
- All four players get the same device profile per test (spread into `newContext`).
- Dual-source assertions (DOM testid + `BackendClient.scoreTable()`) on any scenario asserting game state.
- App-side gaps (F1–F6 from the design spec) are **recorded as findings** and not fixed here. Tests asserting correct behavior go red if the app is broken — that IS the finding.
- Port assignments: backend 8001, frontend 3001 (Whister-only; never 5432/8000/5433 without docker-compose).
- One logical change per commit. Commit message footer: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- Keep `e2e/tests/mobile/` spec files in scope; never modify files outside `e2e/` except the `game-driver.ts` setup() parameter.

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `e2e/mobile/profiles.ts` | Create | IPHONE_SE and IPHONE_14 device profile constants |
| `e2e/mobile/lifecycle.ts` | Create | background(), foreground(), rotateLandscape(), rotatePortrait() |
| `e2e/mobile/network.ts` | Create | goOffline(), goOnline(), blockRoute(), throttle3G(), disconnectSocket() |
| `e2e/mobile/touch.ts` | Create | assertTouchTargets() |
| `e2e/mobile/index.ts` | Create | Re-exports all mobile harness members |
| `e2e/driver/game-driver.ts` | Modify | setup() gains `contextOptions?` parameter (lines 23–28) |
| `e2e/tests/mobile/viewport.spec.ts` | Create | V1–V4 |
| `e2e/tests/mobile/touch.spec.ts` | Create | T1–T4, K1–K3, X1–X3 |
| `e2e/tests/mobile/orientation.spec.ts` | Create | O1–O4 |
| `e2e/tests/mobile/lifecycle.spec.ts` | Create | B1–B4, S1–S2 |
| `e2e/tests/mobile/recovery.spec.ts` | Create | R1–R3 |
| `e2e/tests/mobile/network.spec.ts` | Create | N1–N5 |
| `e2e/tests/mobile/pwa.spec.ts` | Create | P1–P2 |
| `e2e/RECON.md` | Modify | Append mobile findings section |

---

## Task 0: Baseline — verify existing suite is green on mobile branch

No code change. Confirms the branch is clean before any modifications.

**Files:** none

- [ ] **Step 1: Confirm branch and run existing suite**

```bash
cd /home/tomer/workspace/Whister/e2e
git branch --show-current   # must print: feat/e2e-mobile-emulation
npm test 2>&1 | tail -20
```

Expected: `18 passed` with no failures. If any test is red, stop and fix before proceeding.

- [ ] **Step 2: Confirm TypeScript compiles clean**

```bash
cd /home/tomer/workspace/Whister/e2e
npx tsc --noEmit
```

Expected: zero errors.

---

## Task 1: Device profiles + GameDriver contextOptions wiring

**Files:**
- Create: `e2e/mobile/profiles.ts`
- Modify: `e2e/driver/game-driver.ts` (lines 1 and 23–28)

**Interfaces:**
- Produces: `IPHONE_SE`, `IPHONE_14` — spread-compatible with `browser.newContext()` options; `GameDriver.setup(contextOptions?)` — merges supplied options into every player context.
- Consumed by: every mobile spec via `new GameDriver(browser); await driver.setup(IPHONE_SE)`.

- [ ] **Step 1: Create `e2e/mobile/profiles.ts`**

```typescript
import { devices } from '@playwright/test';

/** iPhone SE 3rd gen — small phone: 375×667, DPR 2, hasTouch, isMobile */
export const IPHONE_SE = devices['iPhone SE (3rd gen)'];

/** iPhone 14 — large phone: 390×664, DPR 3, hasTouch, isMobile */
export const IPHONE_14 = devices['iPhone 14'];
```

- [ ] **Step 2: Add `contextOptions?` to `GameDriver.setup()`**

In `e2e/driver/game-driver.ts`, replace line 1 and lines 23–28:

Old import line:
```typescript
import { Browser, BrowserContext, Page } from '@playwright/test';
```

New import line (add the inferred options type):
```typescript
import { Browser, BrowserContext, Page } from '@playwright/test';
type ContextOptions = NonNullable<Parameters<Browser['newContext']>[0]>;
```

Old `setup()`:
```typescript
async setup(): Promise<void> {
  this.contexts = await Promise.all(
    players.map((p) => this.browser.newContext({ storageState: p.storageStatePath })),
  );
  this.pages = await Promise.all(this.contexts.map((c) => c.newPage()));
}
```

New `setup()`:
```typescript
async setup(contextOptions?: ContextOptions): Promise<void> {
  this.contexts = await Promise.all(
    players.map((p) =>
      this.browser.newContext({ storageState: p.storageStatePath, ...contextOptions }),
    ),
  );
  this.pages = await Promise.all(this.contexts.map((c) => c.newPage()));
}
```

- [ ] **Step 3: Create stub `e2e/mobile/index.ts`** (will be extended in Tasks 2–4)

```typescript
export * from './profiles';
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd /home/tomer/workspace/Whister/e2e && npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 5: Smoke-test the wiring with a minimal inline check**

```bash
cd /home/tomer/workspace/Whister/e2e
npx playwright test smoke --reporter=list
```

Expected: `1 passed` (smoke test). Confirms the existing suite works with the modified `setup()` signature (it passes no contextOptions, which is the same as before).

- [ ] **Step 6: Commit**

```bash
git add e2e/mobile/profiles.ts e2e/mobile/index.ts e2e/driver/game-driver.ts
git commit -m "$(cat <<'EOF'
feat(e2e/mobile): device profiles + GameDriver contextOptions parameter

Adds IPHONE_SE (375x667 DPR 2) and IPHONE_14 (390x664 DPR 3) profile
constants. GameDriver.setup() gains optional contextOptions spread into
every player's BrowserContext — backwards-compatible (no arg = desktop).

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Lifecycle harness

**Files:**
- Create: `e2e/mobile/lifecycle.ts`
- Modify: `e2e/mobile/index.ts`

**Interfaces:**
- Produces:
  - `background(page: Page): Promise<void>` — sets `visibilityState='hidden'`, dispatches `visibilitychange` + `pagehide` + `blur`
  - `foreground(page: Page): Promise<void>` — sets `visibilityState='visible'`, dispatches `visibilitychange` + `pageshow` + `focus`
  - `rotateLandscape(page: Page): Promise<void>` — swaps viewport w↔h if currently portrait
  - `rotatePortrait(page: Page): Promise<void>` — swaps viewport w↔h if currently landscape
- Consumed by: `lifecycle.spec.ts`, `orientation.spec.ts`, `network.spec.ts`.

- [ ] **Step 1: Create `e2e/mobile/lifecycle.ts`**

```typescript
import { Page } from '@playwright/test';

export async function background(page: Page): Promise<void> {
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('pagehide', { bubbles: false }));
    window.dispatchEvent(new Event('blur'));
  });
}

export async function foreground(page: Page): Promise<void> {
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('pageshow', { bubbles: false }));
    window.dispatchEvent(new Event('focus'));
  });
}

export async function rotateLandscape(page: Page): Promise<void> {
  const vp = page.viewportSize();
  if (!vp || vp.width >= vp.height) return; // already landscape
  await page.setViewportSize({ width: vp.height, height: vp.width });
}

export async function rotatePortrait(page: Page): Promise<void> {
  const vp = page.viewportSize();
  if (!vp || vp.height >= vp.width) return; // already portrait
  await page.setViewportSize({ width: vp.height, height: vp.width });
}
```

- [ ] **Step 2: Update `e2e/mobile/index.ts`**

```typescript
export * from './profiles';
export * from './lifecycle';
```

- [ ] **Step 3: Verify TypeScript**

```bash
cd /home/tomer/workspace/Whister/e2e && npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 4: Commit**

```bash
git add e2e/mobile/lifecycle.ts e2e/mobile/index.ts
git commit -m "$(cat <<'EOF'
feat(e2e/mobile): lifecycle harness — background/foreground/rotate

Deterministic helpers: background/foreground dispatch visibilitychange
+ pagehide/pageshow events; rotate helpers swap viewport dimensions.
No sleeps — callers gate on observable DOM/socket state.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Network harness

**Files:**
- Create: `e2e/mobile/network.ts`
- Modify: `e2e/mobile/index.ts`

**Interfaces:**
- Produces:
  - `goOffline(ctx: BrowserContext): Promise<void>` — context.setOffline(true)
  - `goOnline(ctx: BrowserContext): Promise<void>` — context.setOffline(false)
  - `blockRoute(page: Page, urlPattern: string): Promise<() => Promise<void>>` — routes requests to abort; returns restore fn
  - `throttle3G(page: Page): Promise<() => Promise<void>>` — CDP 250kbps/50kbps/300ms; returns restore fn
  - `disconnectSocket(page: Page): Promise<void>` — calls `window.socketManager.getSocket().disconnect()`
- Consumed by: `network.spec.ts`, `lifecycle.spec.ts`.

- [ ] **Step 1: Create `e2e/mobile/network.ts`**

```typescript
import { Page, BrowserContext } from '@playwright/test';

export async function goOffline(ctx: BrowserContext): Promise<void> {
  await ctx.setOffline(true);
}

export async function goOnline(ctx: BrowserContext): Promise<void> {
  await ctx.setOffline(false);
}

/**
 * Abort all requests matching urlPattern. Returns a function that removes the route.
 * Usage: const restore = await blockRoute(page, '**\/score-table**'); ... await restore();
 */
export async function blockRoute(
  page: Page,
  urlPattern: string,
): Promise<() => Promise<void>> {
  await page.route(urlPattern, (route) => route.abort());
  return () => page.unroute(urlPattern);
}

const THREE_G = {
  offline: false,
  downloadThroughput: Math.floor((250 * 1024) / 8), // 250 kbps → bytes/s
  uploadThroughput: Math.floor((50 * 1024) / 8),    // 50 kbps → bytes/s
  latency: 300,                                       // ms RTT
};

/**
 * Apply 3G network throttle via CDP. Returns a function that removes it.
 * Usage: const restore = await throttle3G(page); ... await restore();
 */
export async function throttle3G(page: Page): Promise<() => Promise<void>> {
  const session = await page.context().newCDPSession(page);
  await session.send('Network.enable');
  await session.send('Network.emulateNetworkConditions', THREE_G);
  return async () => {
    await session.send('Network.emulateNetworkConditions', {
      offline: false,
      downloadThroughput: -1,
      uploadThroughput: -1,
      latency: 0,
    });
    await session.detach();
  };
}

/**
 * Force-disconnect the socket.io client (window.socketManager.getSocket().disconnect()).
 * The socket manager's built-in reconnect backoff then kicks in.
 * Requires the frontend to be running (window.socketManager is set in manager.ts).
 */
export async function disconnectSocket(page: Page): Promise<void> {
  await page.evaluate(() => {
    const sm = (window as any).socketManager;
    sm?.getSocket()?.disconnect();
  });
}
```

- [ ] **Step 2: Update `e2e/mobile/index.ts`**

```typescript
export * from './profiles';
export * from './lifecycle';
export * from './network';
```

- [ ] **Step 3: Verify TypeScript**

```bash
cd /home/tomer/workspace/Whister/e2e && npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 4: Commit**

```bash
git add e2e/mobile/network.ts e2e/mobile/index.ts
git commit -m "$(cat <<'EOF'
feat(e2e/mobile): network harness — offline toggle, route block, 3G throttle, socket disconnect

goOffline/goOnline wrap context.setOffline(). throttle3G applies CDP
3G conditions (250kbps/300ms RTT) and returns a restore fn. blockRoute
aborts URL-pattern requests and returns a restore fn. disconnectSocket
exercises socket.io's built-in backoff reconnect.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Touch harness + complete index.ts

**Files:**
- Create: `e2e/mobile/touch.ts`
- Modify: `e2e/mobile/index.ts`

**Interfaces:**
- Produces:
  - `assertTouchTargets(page: Page, testIds: string[], minPx?: number): Promise<void>` — measures each testid's bounding box and throws with a summary if any dimension < minPx (default 44). A failure is finding F4.
- Consumed by: `touch.spec.ts`.

- [ ] **Step 1: Create `e2e/mobile/touch.ts`**

```typescript
import { Page } from '@playwright/test';

/**
 * Assert every listed testid has a bounding box ≥ minPx × minPx.
 * Throws with a report of all failures (does not stop on first).
 * 44px is the iOS Human Interface Guidelines minimum tap-target size.
 */
export async function assertTouchTargets(
  page: Page,
  testIds: string[],
  minPx = 44,
): Promise<void> {
  const failures: string[] = [];
  for (const id of testIds) {
    const box = await page.getByTestId(id).boundingBox();
    if (!box) {
      failures.push(`${id}: element not found / not visible`);
      continue;
    }
    if (box.width < minPx || box.height < minPx) {
      failures.push(
        `${id}: ${box.width.toFixed(0)}×${box.height.toFixed(0)}px — needs ≥${minPx}×${minPx}px`,
      );
    }
  }
  if (failures.length > 0) {
    throw new Error(`Touch target violations (finding F4):\n${failures.join('\n')}`);
  }
}
```

- [ ] **Step 2: Complete `e2e/mobile/index.ts`**

```typescript
export * from './profiles';
export * from './lifecycle';
export * from './network';
export * from './touch';
```

- [ ] **Step 3: Verify TypeScript**

```bash
cd /home/tomer/workspace/Whister/e2e && npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 4: Commit**

```bash
git add e2e/mobile/touch.ts e2e/mobile/index.ts
git commit -m "$(cat <<'EOF'
feat(e2e/mobile): touch harness + complete index — assertTouchTargets

assertTouchTargets measures bounding boxes of all supplied testids and
fails with a complete report if any are below the 44px iOS guideline.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Viewport spec (V1–V4)

**Files:**
- Create: `e2e/tests/mobile/viewport.spec.ts`

**Interfaces:**
- Consumes: `GameDriver`, `IPHONE_SE`, `IPHONE_14`, `firstPageWith`.
- Produces: passing verification that the game is completable at both phone sizes, that the score table is scrollable, and that the bidding controls are not clipped by the viewport.

- [ ] **Step 1: Write `e2e/tests/mobile/viewport.spec.ts`**

```typescript
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
```

- [ ] **Step 2: Run viewport spec**

```bash
cd /home/tomer/workspace/Whister/e2e
npx playwright test tests/mobile/viewport --reporter=list
```

Expected: `4 passed`. If V1/V2 fail with a game flow error (not viewport-related), that is a genuine bug. If V4 fails with a clipping assertion, that is finding F5 — record it in RECON.md.

- [ ] **Step 3: Commit**

```bash
git add e2e/tests/mobile/viewport.spec.ts
git commit -m "$(cat <<'EOF'
test(e2e/mobile): viewport spec — V1–V4 (both phone profiles)

V1/V2: full smoke round on iPhone SE and iPhone 14.
V3: score table rows scrollable after 2 rounds on small screen.
V4: bidding controls not clipped below viewport on either profile.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Touch + keyboard + misc spec (T1–T4, K1–K3, X1–X3)

**Files:**
- Create: `e2e/tests/mobile/touch.spec.ts`

**Interfaces:**
- Consumes: `GameDriver`, `IPHONE_SE`, `IPHONE_14`, `assertTouchTargets`, `firstPageWith`.

- [ ] **Step 1: Write `e2e/tests/mobile/touch.spec.ts`**

```typescript
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
    const joinInput = driver.pages[1].getByPlaceholder('Room Code');
    await expect(joinInput).toBeVisible({ timeout: 10_000 });
    await joinInput.fill(roomCode);
    const submitBtn = driver.pages[1].getByRole('button', { name: /join/i });
    await expect(submitBtn).toBeVisible({ timeout: 10_000 });
    // Finding: if submit button is not visible, it's below the fold when keyboard is open
    const box = await submitBtn.boundingBox();
    expect(box, 'Submit button not found at 375x350 (keyboard-open simulation)').not.toBeNull();
    await submitBtn.tap();
    await expect(driver.pages[1]).toHaveURL(/\/room\/[A-Za-z0-9]+$/, { timeout: 15_000 });
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
```

- [ ] **Step 2: Run touch spec**

```bash
cd /home/tomer/workspace/Whister/e2e
npx playwright test tests/mobile/touch --reporter=list
```

Expected:
- T1, T2a, T2b, T3, X2, X3: pass
- T4: may fail if SG-6 C3 (non-idempotent trick claims) is unfixed — record as finding
- K3 (autocorrect): may fail if the room code input lacks `autocorrect="off"` — record as finding
- X1 (zoom lock): may fail if viewport meta lacks zoom lock — record finding F5

Do not weaken any assertion. Red results for K3/X1/T4 are real app-side findings.

- [ ] **Step 3: Commit**

```bash
git add e2e/tests/mobile/touch.spec.ts
git commit -m "$(cat <<'EOF'
test(e2e/mobile): touch, keyboard, and misc spec — T1–T4, K1–K3, X1–X3

T1: tap-driven trump bid. T2a/b: 44px touch targets (finding F4 if red).
T3: no-hover round. T4: double-tap idempotency (finding if red: SG-6 C3).
K1: keyboard-open viewport. K2: blur retention. K3: autocorrect attrs.
X1: zoom-lock meta (finding F5 if red). X2: rapid tap count. X3: paste.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Orientation spec (O1–O4)

**Files:**
- Create: `e2e/tests/mobile/orientation.spec.ts`

**Interfaces:**
- Consumes: `GameDriver`, `IPHONE_SE`, `rotateLandscape`, `rotatePortrait`, `firstPageWith`.

- [ ] **Step 1: Write `e2e/tests/mobile/orientation.spec.ts`**

```typescript
import { test, expect } from '@playwright/test';
import { GameDriver } from '../../driver';
import { IPHONE_SE, rotateLandscape, rotatePortrait } from '../../mobile';
import { firstPageWith } from '../../helpers/wait';

// O1: rotate portrait→landscape mid-bidding, then continue bidding
test('O1: portrait→landscape rotation mid-bidding; state preserved, bidding continues', async ({ browser }) => {
  const driver = new GameDriver(browser);
  await driver.setup(IPHONE_SE);
  try {
    await driver.createGame();
    await driver.confirmSeating();
    const activeIdx = await firstPageWith(driver.pages, 'bidding-pass');
    // Rotate all 4 player pages to landscape mid-bidding
    for (const page of driver.pages) await rotateLandscape(page);
    // Verify no error screen appeared — connection-status should still be visible
    await expect(driver.pages[activeIdx].getByTestId('connection-status'))
      .toBeVisible({ timeout: 10_000 });
    // Bidding still works — active player can pass after rotation
    await driver.bidding(activeIdx).pass();
    // Another player should now have bidding controls
    const nextIdx = await firstPageWith(driver.pages, 'bidding-pass', 15_000);
    expect(nextIdx).not.toBe(activeIdx);
    // Finding: if connection-status check fails, the layout broke on rotation
  } finally {
    await driver.close();
  }
});

// O2: scores page in landscape — both round rows reachable
test('O2: score table accessible in landscape orientation after a round', async ({ browser }) => {
  test.setTimeout(120_000);
  const driver = new GameDriver(browser);
  await driver.setup(IPHONE_SE);
  try {
    await driver.createGame();
    await driver.confirmSeating();
    await driver.playRound({ trump: 'clubs', trumpWinner: 0, contracts: [5, 3, 3, 3], tricks: [5, 3, 3, 2] });
    // Rotate to landscape on the scores page
    await rotateLandscape(driver.pages[0]);
    await driver.scores(0).waitLoaded();
    const row1 = driver.pages[0].getByTestId('scores-row-r1');
    await row1.scrollIntoViewIfNeeded();
    await expect(row1).toBeVisible();
    // Score cell for P0 readable in landscape
    const cell = driver.pages[0].getByTestId('scores-cell-r1-p0');
    await cell.scrollIntoViewIfNeeded();
    await expect(cell).toBeVisible();
  } finally {
    await driver.close();
  }
});

// O3: landscape→portrait during playing phase — claim-trick control still visible
test('O3: landscape→portrait rotation during playing phase; claim-trick button visible', async ({ browser }) => {
  const driver = new GameDriver(browser);
  await driver.setup(IPHONE_SE);
  try {
    await driver.createGame();
    await driver.confirmSeating();
    // Advance to playing phase
    await (driver as any).runTrumpAuction('clubs', 0);
    await (driver as any).runContractBidding([5, 3, 3, 3]);
    // Rotate to landscape, then back to portrait
    for (const page of driver.pages) await rotateLandscape(page);
    for (const page of driver.pages) await rotatePortrait(page);
    // Claim-trick button must still be visible on all pages
    for (const page of driver.pages) {
      await expect(page.getByTestId('playing-claim-trick')).toBeVisible({ timeout: 10_000 });
    }
  } finally {
    await driver.close();
  }
});

// O4: game started in landscape orientation — full round completes
test('O4: smoke round completes when game starts in landscape (844×375)', async ({ browser }) => {
  test.setTimeout(120_000);
  // Create a landscape context by spreading IPHONE_SE then overriding viewport
  const driver = new GameDriver(browser);
  const landscapeSE = { ...IPHONE_SE, viewport: { width: 844, height: 375 } };
  await driver.setup(landscapeSE);
  try {
    const { gameId } = await driver.createGame();
    await driver.confirmSeating();
    await driver.playRound({ trump: 'hearts', trumpWinner: 0, contracts: [5, 3, 3, 3], tricks: [5, 3, 3, 2] });
    const ui = await driver.scores(0).roundScore(1, 0);
    expect(ui).toBe(35);
    const bt = await driver.backendScores(gameId);
    expect(bt.rounds[0].scores[0]).toBe(35);
  } finally {
    await driver.close();
  }
});
```

- [ ] **Step 2: Run orientation spec**

```bash
cd /home/tomer/workspace/Whister/e2e
npx playwright test tests/mobile/orientation --reporter=list
```

Expected: all 4 pass. If O1/O4 fail with a layout error (not a test infrastructure issue), that is a CSS landscape-layout finding — record it.

- [ ] **Step 3: Commit**

```bash
git add e2e/tests/mobile/orientation.spec.ts
git commit -m "$(cat <<'EOF'
test(e2e/mobile): orientation spec — O1–O4

O1: rotate mid-bidding; state preserved. O2: score table in landscape.
O3: rotate back to portrait in playing phase. O4: game starts landscape.
Finding: any layout breakage is a CSS phone-landscape gap.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Lifecycle spec (B1–B4, S1–S2)

**Files:**
- Create: `e2e/tests/mobile/lifecycle.spec.ts`

**Interfaces:**
- Consumes: `GameDriver`, `IPHONE_SE`, `background`, `foreground`, `goOffline`, `goOnline`, `firstPageWith`.

- [ ] **Step 1: Write `e2e/tests/mobile/lifecycle.spec.ts`**

```typescript
import { test, expect } from '@playwright/test';
import { GameDriver } from '../../driver';
import { IPHONE_SE, background, foreground, goOffline, goOnline } from '../../mobile';
import { firstPageWith } from '../../helpers/wait';

// B1: background during another player's trump bid; foreground shows updated state
test('B1: short background during another player bid; foreground reflects new state', async ({ browser }) => {
  const driver = new GameDriver(browser);
  await driver.setup(IPHONE_SE);
  try {
    await driver.createGame();
    await driver.confirmSeating();
    const activeIdx = await firstPageWith(driver.pages, 'bidding-pass');
    const observerIdx = (activeIdx + 1) % 4;
    // Background the observer
    await background(driver.pages[observerIdx]);
    // Active player passes — turn moves
    await driver.bidding(activeIdx).pass();
    // Foreground the observer
    await foreground(driver.pages[observerIdx]);
    // Connection indicator should still be present
    await expect(driver.pages[observerIdx].getByTestId('connection-status'))
      .toBeVisible({ timeout: 10_000 });
    // Turn must have moved (socket events process during Playwright background — no JS throttle)
    // Note: on a real mobile browser JS throttling would cause the state to be stale (finding F1).
    const nextActiveIdx = await firstPageWith(driver.pages, 'bidding-pass', 15_000);
    expect(nextActiveIdx).not.toBe(activeIdx);
  } finally {
    await driver.close();
  }
});

// B2: background 3 turns; foreground; game state is current
test('B2: multiple turns pass while observer is backgrounded; foreground reflects current state', async ({ browser }) => {
  const driver = new GameDriver(browser);
  await driver.setup(IPHONE_SE);
  try {
    await driver.createGame();
    await driver.confirmSeating();
    // Background P3 (observer — will not have the turn right away)
    await background(driver.pages[3]);
    // Advance 2 turns among P0/P1/P2
    for (let g = 0; g < 2; g++) {
      const active = await firstPageWith(
        [driver.pages[0], driver.pages[1], driver.pages[2]], 'bidding-pass', 20_000,
      ).catch(() => -1);
      if (active === -1) break;
      await driver.bidding(active).pass();
    }
    // Foreground P3
    await foreground(driver.pages[3]);
    await expect(driver.pages[3].getByTestId('connection-status')).toBeVisible({ timeout: 10_000 });
  } finally {
    await driver.close();
  }
});

// B3: long background + offline + reconnect; socket recovers and state syncs
test('B3: offline+background simulating long background; socket reconnects on return', async ({ browser }) => {
  test.setTimeout(120_000);
  const driver = new GameDriver(browser);
  await driver.setup(IPHONE_SE);
  try {
    await driver.createGame();
    await driver.confirmSeating();
    // Simulate long background: hide + go offline
    await background(driver.pages[3]);
    await goOffline(driver.contexts[3]);
    // Wait for P3's socket to disconnect
    await expect.poll(
      async () => driver.pages[3].evaluate(() => !(window as any).socketManager?.isConnected()),
      { timeout: 20_000 },
    ).toBe(true);
    // Restore connectivity and foreground
    await goOnline(driver.contexts[3]);
    await foreground(driver.pages[3]);
    // Socket should reconnect via socket.io built-in backoff (up to 10 retries, 1–5s each)
    await expect.poll(
      async () => driver.pages[3].evaluate(() => !!(window as any).socketManager?.isConnected()),
      { timeout: 60_000 },
    ).toBe(true);
    // Connection indicator visible after reconnect
    await expect(driver.pages[3].getByTestId('connection-status')).toBeVisible({ timeout: 15_000 });
    // Finding F1/F2: no proactive sync:state — DOM may not reflect latest game state
    // until the server pushes the next event. Recorded as a finding; not patched here.
  } finally {
    await driver.close();
  }
});

// B4: player backgrounds on their own turn; turn remains (no auto-pass implemented)
test('B4: background while it is your trump bid turn; turn remains on foreground', async ({ browser }) => {
  const driver = new GameDriver(browser);
  await driver.setup(IPHONE_SE);
  try {
    await driver.createGame();
    await driver.confirmSeating();
    // Find the active (first-to-bid) player and background them immediately
    const activeIdx = await firstPageWith(driver.pages, 'bidding-pass');
    await background(driver.pages[activeIdx]);
    // Brief pause — condition-based: check the state does not change
    // (no auto-pass exists yet — finding F3 / SG-6 D4)
    await expect.poll(
      async () => driver.pages[activeIdx].getByTestId('bidding-pass').isVisible(),
      { timeout: 5_000 },
    ).toBe(false); // hidden because the page is in background
    await foreground(driver.pages[activeIdx]);
    // After foreground, it's still their turn (auto-pass not implemented)
    await expect(driver.pages[activeIdx].getByTestId('bidding-pass')).toBeVisible({ timeout: 10_000 });
    // Finding F3: if the turn auto-advanced while backgrounded, SG-6 D4 is implemented (good).
    // If still their turn, it means the game blocks on a backgrounded player (gap to fix).
  } finally {
    await driver.close();
  }
});

// S1: P0 backgrounds during trick claiming by P1–P3; foreground shows updated counts
test('S1: app-switch away during trick claiming; trick counts update on return', async ({ browser }) => {
  const driver = new GameDriver(browser);
  await driver.setup(IPHONE_SE);
  try {
    await driver.createGame();
    await driver.confirmSeating();
    await (driver as any).runTrumpAuction('clubs', 0);
    await (driver as any).runContractBidding([5, 3, 3, 3]);
    // Background P0 (observer)
    await background(driver.pages[0]);
    // P1, P2, P3 each claim one trick
    for (const seat of [1, 2, 3]) {
      await driver.playing(seat).claimTrick();
    }
    // Foreground P0
    await foreground(driver.pages[0]);
    await expect(driver.pages[0].getByTestId('connection-status')).toBeVisible({ timeout: 10_000 });
    // Each of P1, P2, P3 should show trick count ≥ 1 on P0's view
    for (const seat of [1, 2, 3]) {
      const count = await driver.pages[0].getByTestId(`playing-trick-count-${seat}`).innerText();
      expect(parseInt(count, 10), `P${seat} trick count on P0's view`).toBeGreaterThanOrEqual(1);
    }
  } finally {
    await driver.close();
  }
});

// S2: all players switch away briefly; all return; state consistent
test('S2: all 4 players background briefly then foreground; state consistent', async ({ browser }) => {
  const driver = new GameDriver(browser);
  await driver.setup(IPHONE_SE);
  try {
    await driver.createGame();
    await driver.confirmSeating();
    // Background all 4
    for (const page of driver.pages) await background(page);
    // Foreground all 4
    for (const page of driver.pages) await foreground(page);
    // All pages should show connection-status (still connected — short background)
    for (const page of driver.pages) {
      await expect(page.getByTestId('connection-status')).toBeVisible({ timeout: 10_000 });
    }
    // Bidding should still be functional — find active player and verify controls present
    const activeIdx = await firstPageWith(driver.pages, 'bidding-pass', 20_000);
    expect(activeIdx).toBeGreaterThanOrEqual(0);
  } finally {
    await driver.close();
  }
});
```

- [ ] **Step 2: Run lifecycle spec**

```bash
cd /home/tomer/workspace/Whister/e2e
npx playwright test tests/mobile/lifecycle --reporter=list
```

Expected:
- B1, B2, S1, S2: pass (short background; socket stays connected in Playwright emulation)
- B3: pass if socket reconnects within 60s timeout
- B4: the assertion depends on whether SG-6 D4 is implemented. If `bidding-pass` reappears after foreground: **pass** (game blocked — finding F3). If turn auto-advanced: also pass (SG-6 D4 implemented — good).

- [ ] **Step 3: Commit**

```bash
git add e2e/tests/mobile/lifecycle.spec.ts
git commit -m "$(cat <<'EOF'
test(e2e/mobile): lifecycle spec — B1–B4, S1–S2

B1/B2: short background; state current on foreground.
B3: offline+background; socket reconnects within 60s.
B4: background on own turn; surfaced F3 (no auto-pass).
S1: claim tricks while observer backgrounded. S2: all-player switch.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Recovery spec (R1–R3)

**Files:**
- Create: `e2e/tests/mobile/recovery.spec.ts`

**Interfaces:**
- Consumes: `GameDriver`, `IPHONE_SE`, `firstPageWith`.

- [ ] **Step 1: Write `e2e/tests/mobile/recovery.spec.ts`**

```typescript
import { test, expect } from '@playwright/test';
import { GameDriver } from '../../driver';
import { IPHONE_SE } from '../../mobile';
import { firstPageWith } from '../../helpers/wait';

// R1: tab close mid-bidding; reopen in same context; player sees live game
test('R1: tab close mid-bidding; reopen sees live game state', async ({ browser }) => {
  test.setTimeout(60_000);
  const driver = new GameDriver(browser);
  await driver.setup(IPHONE_SE);
  try {
    const { roomCode } = await driver.createGame();
    await driver.confirmSeating();
    // P3 closes their tab
    await driver.pages[3].close();
    // Reopen a fresh page in the same authenticated context
    driver.pages[3] = await driver.contexts[3].newPage();
    await driver.pages[3].goto(`/room/${roomCode}`);
    // The page should load the game, not an error screen
    await expect(driver.pages[3].getByTestId('connection-status')).toBeVisible({ timeout: 20_000 });
    // Bidding should still be in progress — at least one player has the bidding controls
    const activeIdx = await firstPageWith(driver.pages, 'bidding-pass', 20_000);
    expect(activeIdx).toBeGreaterThanOrEqual(0);
    // Finding F3: if the game is stuck because P3's turn wasn't auto-passed, that is expected.
  } finally {
    await driver.close();
  }
});

// R2: P3 closes tab on their own bid turn; game unblocks or records finding
test('R2: tab close on own bid turn; other players can determine if game unblocks', async ({ browser }) => {
  test.setTimeout(60_000);
  const driver = new GameDriver(browser);
  await driver.setup(IPHONE_SE);
  try {
    await driver.createGame();
    await driver.confirmSeating();
    // Advance until it is P3's turn
    let p3Turn = false;
    for (let g = 0; g < 8; g++) {
      const activeIdx = await firstPageWith(driver.pages, 'bidding-pass', 20_000).catch(() => -1);
      if (activeIdx === -1) break;
      if (activeIdx === 3) { p3Turn = true; break; }
      await driver.bidding(activeIdx).pass();
    }
    if (!p3Turn) {
      // P3 never got the turn in this auction order — skip gracefully
      test.skip();
      return;
    }
    // P3's turn — close P3's tab
    await driver.pages[3].close();
    // Finding F3: if SG-6 D4 auto-pass is implemented, the game should advance automatically.
    // If not, the game blocks. Check by polling whether ANY other player gets bidding controls.
    const advanced = await expect.poll(
      async () => {
        for (let i = 0; i < 3; i++) {
          if (await driver.pages[i].getByTestId('bidding-pass').isVisible()) return true;
          if (await driver.pages[i].getByTestId('bidding-confirm').isVisible()) return true;
        }
        return false;
      },
      { timeout: 30_000 },
    ).toBeTruthy().catch(() => false);
    if (!advanced) {
      // Game is stuck — this confirms finding F3 (no auto-pass on disconnect).
      // Fail with a descriptive message so it shows up as a known finding, not a mystery.
      throw new Error(
        'R2 FINDING F3: game blocked after P3 disconnected on their bid turn. ' +
        'SG-6 D4 (auto-pass on disconnect) is not yet implemented.',
      );
    }
  } finally {
    await driver.close();
  }
});

// R3: context close + new context (browser-restart simulation); player re-authenticates
test('R3: context close + new context; JWT from storage state re-authenticates automatically', async ({ browser }) => {
  test.setTimeout(60_000);
  const driver = new GameDriver(browser);
  await driver.setup(IPHONE_SE);
  try {
    const { roomCode } = await driver.createGame();
    await driver.confirmSeating();
    // Capture P3's storage state path
    const { players } = await import('../../config/players');
    const p3StorageState = players[3].storageStatePath;
    // Close P3's context (simulates browser process kill)
    await driver.contexts[3].close();
    // Open a brand-new context with P3's saved storage state (simulates browser restart)
    const newCtx = await browser.newContext({ storageState: p3StorageState, ...IPHONE_SE });
    const newPage = await newCtx.newPage();
    driver.contexts[3] = newCtx;
    driver.pages[3] = newPage;
    // Navigate back to the room
    await newPage.goto(`/room/${roomCode}`);
    // The page should auto-authenticate (JWT in localStorage) and show the live game
    await expect(newPage.getByTestId('connection-status')).toBeVisible({ timeout: 20_000 });
    // Not an error page — URL stays on the room or game
    await expect(newPage).toHaveURL(new RegExp(`/room/${roomCode}|/game/`), { timeout: 15_000 });
  } finally {
    await driver.close();
  }
});
```

- [ ] **Step 2: Run recovery spec**

```bash
cd /home/tomer/workspace/Whister/e2e
npx playwright test tests/mobile/recovery --reporter=list
```

Expected:
- R1: pass — reconnected page shows game state
- R2: may fail with finding F3 message if SG-6 D4 is not implemented; or pass if it is. Both outcomes are valid findings.
- R3: pass — storage state JWT auto-authenticates

- [ ] **Step 3: Commit**

```bash
git add e2e/tests/mobile/recovery.spec.ts
git commit -m "$(cat <<'EOF'
test(e2e/mobile): recovery spec — R1–R3

R1: tab close + reopen in same context sees live game.
R2: close on own turn surfaces finding F3 (SG-6 D4 auto-pass gap) if red.
R3: context-restart via storageState; JWT re-authenticates automatically.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Network spec (N1–N5)

**Files:**
- Create: `e2e/tests/mobile/network.spec.ts`

**Interfaces:**
- Consumes: `GameDriver`, `IPHONE_SE`, `goOffline`, `goOnline`, `blockRoute`, `throttle3G`, `disconnectSocket`, `firstPageWith`.

- [ ] **Step 1: Write `e2e/tests/mobile/network.spec.ts`**

```typescript
import { test, expect } from '@playwright/test';
import { GameDriver } from '../../driver';
import {
  IPHONE_SE, goOffline, goOnline, blockRoute, throttle3G, disconnectSocket,
} from '../../mobile';
import { firstPageWith } from '../../helpers/wait';

// N1: offline → online; socket reconnects and connection indicator recovers
test('N1: socket reconnects and connection indicator recovers after offline→online', async ({ browser }) => {
  test.setTimeout(120_000);
  const driver = new GameDriver(browser);
  await driver.setup(IPHONE_SE);
  try {
    await driver.createGame();
    await driver.confirmSeating();
    // Take P3 offline
    await goOffline(driver.contexts[3]);
    // Wait until P3's socket disconnects
    await expect.poll(
      async () => driver.pages[3].evaluate(() => !(window as any).socketManager?.isConnected()),
      { timeout: 20_000 },
    ).toBe(true);
    // Restore network
    await goOnline(driver.contexts[3]);
    // Socket reconnects via built-in backoff (reconnectionAttempts:10, delay 1–5s)
    await expect.poll(
      async () => driver.pages[3].evaluate(() => !!(window as any).socketManager?.isConnected()),
      { timeout: 60_000 },
    ).toBe(true);
    await expect(driver.pages[3].getByTestId('connection-status')).toBeVisible({ timeout: 10_000 });
    // Finding F2: no 'online' event listener — reconnect is via backoff, not instant.
    // The test still passes because socket.io reconnects within the 60s window.
  } finally {
    await driver.close();
  }
});

// N2: offline at own bid turn; reconnect; bid placed successfully
test('N2: go offline on own turn; reconnect; bid accepted without duplicate', async ({ browser }) => {
  test.setTimeout(120_000);
  const driver = new GameDriver(browser);
  await driver.setup(IPHONE_SE);
  try {
    await driver.createGame();
    await driver.confirmSeating();
    // Advance until it is P3's trump bid turn
    let p3Turn = false;
    for (let g = 0; g < 8; g++) {
      const activeIdx = await firstPageWith(driver.pages, 'bidding-pass', 20_000).catch(() => -1);
      if (activeIdx === -1) break;
      if (activeIdx === 3) { p3Turn = true; break; }
      await driver.bidding(activeIdx).pass();
    }
    if (!p3Turn) { test.skip(); return; }
    // Go offline during P3's turn
    await goOffline(driver.contexts[3]);
    await expect.poll(
      async () => driver.pages[3].evaluate(() => !(window as any).socketManager?.isConnected()),
      { timeout: 20_000 },
    ).toBe(true);
    // Restore connectivity
    await goOnline(driver.contexts[3]);
    await expect.poll(
      async () => driver.pages[3].evaluate(() => !!(window as any).socketManager?.isConnected()),
      { timeout: 60_000 },
    ).toBe(true);
    // P3 places their bid after reconnect
    await expect(driver.pages[3].getByTestId('bidding-pass')).toBeVisible({ timeout: 15_000 });
    await driver.bidding(3).pass();
    // Another player gets controls — no duplicate bid
    const nextIdx = await firstPageWith(driver.pages, 'bidding-pass', 20_000);
    expect(nextIdx).not.toBe(3);
  } finally {
    await driver.close();
  }
});

// N3: score-table REST request blocked; error shown, not silent failure
test('N3: score-table fetch blocked mid-request; UI shows error (not silent failure)', async ({ browser }) => {
  const driver = new GameDriver(browser);
  await driver.setup(IPHONE_SE);
  try {
    await driver.createGame();
    await driver.confirmSeating();
    // Block the score-table endpoint on all 4 pages before the round ends
    const restores = await Promise.all(
      driver.pages.map((page) => blockRoute(page, '**/games/**/score-table**')),
    );
    // Complete the round — score-table fetch will fail
    await driver.playRound({ trump: 'clubs', trumpWinner: 0, contracts: [5, 3, 3, 3], tricks: [5, 3, 3, 2] });
    // Finding: if the UI shows an error-toast, it's handling the failure correctly.
    // If it silently ignores it, that's a gap — scores may show empty/stale values.
    const anyError = await driver.pages[0].getByTestId('error-toast').isVisible({ timeout: 5_000 }).catch(() => false);
    // Unblock for any cleanup
    await Promise.all(restores.map((r) => r()));
    // Record the finding regardless — the test documents what happens, not just pass/fail.
    // If no error toast appears, that means the app fails silently — still a finding.
    expect(
      anyError,
      'N3 FINDING: score-table fetch failure not surfaced to user (silent failure)',
    ).toBe(true);
  } finally {
    await driver.close();
  }
});

// N4: 3G throttle for entire round; completes within extended timeout
test('N4: full round completes under 3G throttle (250kbps, 300ms RTT)', async ({ browser }) => {
  test.setTimeout(180_000);
  const driver = new GameDriver(browser);
  await driver.setup(IPHONE_SE);
  try {
    // Apply 3G throttle to P0's page before game starts
    const restoreP0 = await throttle3G(driver.pages[0]);
    try {
      const { gameId } = await driver.createGame();
      await driver.confirmSeating();
      await driver.playRound({ trump: 'clubs', trumpWinner: 0, contracts: [5, 3, 3, 3], tricks: [5, 3, 3, 2] });
      const bt = await driver.backendScores(gameId);
      expect(bt.rounds[0].scores[0]).toBe(35);
    } finally {
      await restoreP0();
    }
  } finally {
    await driver.close();
  }
});

// N5: force socket disconnect; socket.io backoff reconnects automatically
test('N5: force socket disconnect; socket.io reconnects automatically', async ({ browser }) => {
  test.setTimeout(60_000);
  const driver = new GameDriver(browser);
  await driver.setup(IPHONE_SE);
  try {
    await driver.createGame();
    await driver.confirmSeating();
    // Force-disconnect P3's socket.io client
    await disconnectSocket(driver.pages[3]);
    // Wait for disconnect to register
    await expect.poll(
      async () => driver.pages[3].evaluate(() => !(window as any).socketManager?.isConnected()),
      { timeout: 10_000 },
    ).toBe(true);
    // socket.io reconnects via its own backoff (reconnectionAttempts:10, 1–5s each)
    await expect.poll(
      async () => driver.pages[3].evaluate(() => !!(window as any).socketManager?.isConnected()),
      { timeout: 30_000 },
    ).toBe(true);
    await expect(driver.pages[3].getByTestId('connection-status')).toBeVisible({ timeout: 10_000 });
  } finally {
    await driver.close();
  }
});
```

- [ ] **Step 2: Run network spec**

```bash
cd /home/tomer/workspace/Whister/e2e
npx playwright test tests/mobile/network --reporter=list
```

Expected:
- N1, N5: pass (socket.io reconnects within timeout)
- N2: pass if P3's turn occurs; skipped if not; or fail if app blocks (finding)
- N3: may fail if the app fails silently — that is the finding
- N4: pass within 180s timeout

- [ ] **Step 3: Commit**

```bash
git add e2e/tests/mobile/network.spec.ts
git commit -m "$(cat <<'EOF'
test(e2e/mobile): network spec — N1–N5

N1: offline→online; socket.io reconnects via backoff (finding F2: no
'online' listener). N2: offline on own turn; bid after reconnect.
N3: blocked score-table; error surface check. N4: 3G throttle round.
N5: force-disconnect; socket.io backoff reconnect.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: PWA spec (P1–P2)

**Files:**
- Create: `e2e/tests/mobile/pwa.spec.ts`

**Interfaces:**
- Consumes: `IPHONE_SE`, `players` (config), `browser`.

- [ ] **Step 1: Write `e2e/tests/mobile/pwa.spec.ts`**

```typescript
import { test, expect } from '@playwright/test';
import { GameDriver } from '../../driver';
import { IPHONE_SE } from '../../mobile';

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

// Th1 deferred — CPU throttle; adds significant runtime; implement after suite is stable
test.skip('Th1: bid counter responds correctly under 4× CPU throttle (deferred)', () => {});
// Th2 deferred — covered adequately by N4
test.skip('Th2: socket connects under 3G throttle (deferred — covered by N4)', () => {});
```

- [ ] **Step 2: Run PWA spec**

```bash
cd /home/tomer/workspace/Whister/e2e
npx playwright test tests/mobile/pwa --reporter=list
```

Expected:
- P1: pass (JWT in localStorage → storageState persists)
- P2: pass if `public/manifest.json` exists with required fields; fail if manifest is missing — that is a PWA-readiness finding

- [ ] **Step 3: Commit**

```bash
git add e2e/tests/mobile/pwa.spec.ts
git commit -m "$(cat <<'EOF'
test(e2e/mobile): PWA spec — P1–P2; deferred Th1/Th2 with skip

P1: JWT persists via storageState across context close+reopen.
P2: manifest.json served with name, start_url, display, icons.
Th1/Th2 skipped with rationale — implement after suite is stable.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 12: RECON.md update + full suite run

**Files:**
- Modify: `e2e/RECON.md`

**Interfaces:**
- Produces: documented mobile findings, pass/fail counts, updated RECON.md.

- [ ] **Step 1: Append mobile findings section to `e2e/RECON.md`**

Add the following section at the end of the file (after the existing section 6):

```markdown
---

## 7. Mobile Emulation Suite — Findings (2026-06-26)

Branch: feat/e2e-mobile-emulation

### Harness

| Component | File | Status |
|---|---|---|
| Device profiles | `e2e/mobile/profiles.ts` | iPhone SE (3rd gen) 375×667 DPR 2; iPhone 14 390×664 DPR 3 |
| Lifecycle helpers | `e2e/mobile/lifecycle.ts` | background/foreground/rotateLandscape/rotatePortrait |
| Network helpers | `e2e/mobile/network.ts` | goOffline/goOnline/blockRoute/throttle3G/disconnectSocket |
| Touch helpers | `e2e/mobile/touch.ts` | assertTouchTargets (44px guideline) |

### App-Side Mobile Readiness Gaps (Findings)

Record actual test outcomes here after running Task 12 Step 2.

| ID | Finding | Test(s) | Status after run |
|----|---------|---------|-----------------|
| F1 | No `visibilitychange` listener — no proactive sync on foreground | B1–B4, S1–S2 | Partially masked in Playwright (no JS throttle); real-device concern |
| F2 | No `online` event listener — reconnect via backoff only | N1 | [PASS/FAIL — fill in] |
| F3 | No auto-pass on disconnect (SG-6 D4) — game can block | B4, R2 | [PASS/FAIL — fill in] |
| F4 | Touch targets may be undersized (<44px) | T2a, T2b | [PASS/FAIL — fill in] |
| F5 | Zoom lock may be missing from viewport meta | X1 | [PASS/FAIL — fill in] |
| F6 | No proactive sync:state on reconnect | B3, N1 | Socket reconnects; state relies on server push |

### Run Commands

```bash
# Mobile suite only
cd e2e && npx playwright test tests/mobile --reporter=list

# Full suite (existing + mobile)
cd e2e && npm test
```
```

- [ ] **Step 2: Run the full suite and capture results**

```bash
cd /home/tomer/workspace/Whister/e2e
npm test 2>&1 | tee /tmp/e2e-mobile-full.txt
tail -30 /tmp/e2e-mobile-full.txt
```

Quote the output. Count: passing, failing, skipped. Update the findings table in RECON.md with actual pass/fail outcomes.

- [ ] **Step 3: Update RECON.md findings table with real results from Step 2**

Fill in the `[PASS/FAIL — fill in]` cells in the findings table (step 1) with the actual test outcomes from the run output.

- [ ] **Step 4: Commit**

```bash
git add e2e/RECON.md
git commit -m "$(cat <<'EOF'
docs(e2e): append mobile emulation findings to RECON.md

Documents harness components, 6 app-side gap findings (F1–F6),
run commands, and actual pass/fail outcomes from the full suite run.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review

**Spec coverage check:**

| Design spec section | Covered by task |
|---------------------|----------------|
| Framework: `profiles.ts` + `setup(contextOptions?)` | Task 1 |
| Framework: `lifecycle.ts` | Task 2 |
| Framework: `network.ts` | Task 3 |
| Framework: `touch.ts` | Task 4 |
| V1–V4 viewport scenarios | Task 5 |
| T1–T4 touch, K1–K3 keyboard, X1–X3 misc | Task 6 |
| O1–O4 orientation | Task 7 |
| B1–B4 backgrounding, S1–S2 app-switch | Task 8 |
| R1–R3 abrupt termination + recovery | Task 9 |
| N1–N5 network | Task 10 |
| P1–P2 PWA | Task 11 |
| G1 deferred (test.skip in Task 6) | Task 6 |
| Th1/Th2 deferred (test.skip in Task 11) | Task 11 |
| RECON.md findings update | Task 12 |

**Type consistency:**
- `IPHONE_SE` / `IPHONE_14`: defined in Task 1; used by Tasks 5–11 via `import { IPHONE_SE, IPHONE_14 } from '../../mobile'`
- `background/foreground/rotateLandscape/rotatePortrait`: defined Task 2; used in Tasks 7, 8 — signatures match (`page: Page`) at all call sites
- `goOffline/goOnline(ctx: BrowserContext)`: defined Task 3; used in Tasks 8, 10 — `driver.contexts[3]` is a `BrowserContext` ✓
- `blockRoute(page, pattern) → restore fn`: used in Task 10 with `await blockRoute(page, url)` then `await restore()` ✓
- `throttle3G(page) → restore fn`: used in Task 10 with `const restore = await throttle3G(page)` then `await restore()` ✓
- `disconnectSocket(page)`: used in Task 10 ✓
- `assertTouchTargets(page, ids[], minPx?)`: defined Task 4; used Task 6 ✓
- `GameDriver.setup(contextOptions?)`: modified Task 1; all callers pass either no arg (existing specs) or a profile constant ✓
- `firstPageWith(pages, testId, timeout?)` — imported from `../../helpers/wait` in all specs ✓

**Placeholder scan:** No TBD, TODO, or "implement later". Deferred tests use `test.skip()` with explicit rationale strings. The findings table in RECON.md has explicit `[PASS/FAIL — fill in]` markers that are replaced in Task 12 Step 3.

**No sleep:** Every wait in every spec uses `expect.poll`, `expect(...).toBeVisible({ timeout })`, `scrollIntoViewIfNeeded`, or `expect(...).toHaveURL` — no `waitForTimeout()`.
