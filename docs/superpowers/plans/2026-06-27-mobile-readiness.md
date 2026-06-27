# Mobile Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce an authoritative `e2e/MOBILE-READINESS.md` whose readiness claims are backed by deterministic mobile Playwright evidence, while making the Whister e2e bootstrap unable to target Cookoo's ports or identity.

**Architecture:** Extend the existing serial POM + four-player `GameDriver` suite instead of replacing it. Pure bootstrap guards reject non-Whister URLs before service startup, mobile harness helpers provide real Playwright/CDP emulation, and characterization tests either pass with observable DOM/backend evidence or remain honestly documented as linked gaps. No app defect is hidden or converted into a passing assertion.

**Tech Stack:** Playwright Chromium mobile device descriptors, TypeScript strict, Socket.IO, CDP network/CPU emulation, Zustand-observable DOM state, FastAPI identity endpoint.

---

## File map

| File | Action | Responsibility |
|---|---|---|
| `e2e/helpers/services.ts` | Modify | Enforce Whister-only ports and validate backend/frontend identity before reuse |
| `e2e/tests/bootstrap.spec.ts` | Create | Pure regression coverage for URL/port and service-identity guards |
| `e2e/mobile/touch.ts` | Modify | Add deterministic long-press and swipe gesture helpers |
| `e2e/mobile/network.ts` | Modify | Add reversible 4x CPU throttle helper |
| `e2e/driver/game-driver.ts` | Modify | Expose phase-driving methods used by mobile tests without `as any` |
| `e2e/tests/mobile/touch.spec.ts` | Modify | Add long-press, swipe, navigation-interruption coverage; remove deferred skip |
| `e2e/tests/mobile/network.spec.ts` | Modify | Make own-turn disconnect deterministic and verify bid count/state |
| `e2e/tests/mobile/recovery.spec.ts` | Modify | Make close-on-own-turn deterministic and verify reconnect/presence state |
| `e2e/tests/mobile/pwa.spec.ts` | Modify | Replace CPU/network skips with executable throttling tests and honest PWA checks |
| `e2e/tests/mobile/viewport.spec.ts` | Modify | Verify descriptor flags/DPR and safe-area metadata/application evidence |
| `e2e/tests/mobile/lifecycle.spec.ts` | Modify | Strengthen foreground assertions to compare authoritative state where emulation permits |
| `e2e/MOBILE-READINESS.md` | Replace | Single readiness matrix, run instructions, evidence, and linked gap ledger |

## Task 1: Whister-only bootstrap identity guard

**Files:**
- Create: `e2e/tests/bootstrap.spec.ts`
- Modify: `e2e/helpers/services.ts`

- [ ] **Step 1: Write failing pure guard tests**

Create tests that import `assertWhisterServiceUrls` and `isWhisterBackendIdentity` and assert:

```ts
test('bootstrap accepts only Whister host ports', () => {
  expect(() => assertWhisterServiceUrls(
    'http://localhost:8001',
    'http://localhost:3001',
  )).not.toThrow();
  expect(() => assertWhisterServiceUrls(
    'http://localhost:8000',
    'http://localhost:3001',
  )).toThrow(/8001/);
  expect(() => assertWhisterServiceUrls(
    'http://localhost:8001',
    'http://localhost:3000',
  )).toThrow(/3001/);
});

test('backend identity requires Whister API metadata', () => {
  expect(isWhisterBackendIdentity({
    name: 'Whist Score Keeper', version: '1.0.0', status: 'ready',
  })).toBe(true);
  expect(isWhisterBackendIdentity({
    name: 'Cookoo', version: '1.0.0', status: 'ready',
  })).toBe(false);
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `cd e2e && npx playwright test tests/bootstrap.spec.ts --reporter=list`

Expected: import/runtime failure because the two guards do not exist.

- [ ] **Step 3: Implement minimal guards and identity probing**

Export pure guards from `services.ts`:

```ts
export function assertWhisterServiceUrls(apiUrl: string, baseUrl: string): void {
  const api = new URL(apiUrl);
  const frontend = new URL(baseUrl);
  const localHosts = new Set(['localhost', '127.0.0.1']);
  if (!localHosts.has(api.hostname) || api.port !== '8001') {
    throw new Error('[e2e] API_URL must target Whister on localhost:8001');
  }
  if (!localHosts.has(frontend.hostname) || frontend.port !== '3001') {
    throw new Error('[e2e] BASE_URL must target Whister on localhost:3001');
  }
}

export function isWhisterBackendIdentity(value: unknown): boolean {
  const data = value as Record<string, unknown> | null;
  return data?.name === 'Whist Score Keeper' && data.status === 'ready';
}
```

Call the URL guard before any process/container action. When a backend is reachable, fetch `${API_URL}/api/v1` and reject it unless the response passes `isWhisterBackendIdentity`. When a frontend is reachable, fetch `/manifest.json` and require `name` or `short_name` to identify Whister/Whist. Keep Docker commands scoped to Whister's compose file/project; never inspect, stop, or mutate Cookoo.

- [ ] **Step 4: Run focused tests and type-check GREEN**

Run:

```bash
cd e2e
npx playwright test tests/bootstrap.spec.ts --reporter=list
npx tsc --noEmit
```

Expected: bootstrap guard tests pass; TypeScript exits 0.

- [ ] **Step 5: Commit**

Commit only `services.ts` and `bootstrap.spec.ts` with footer `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

## Task 2: Deterministic mobile emulation primitives

**Files:**
- Modify: `e2e/mobile/touch.ts`
- Modify: `e2e/mobile/network.ts`
- Modify: `e2e/driver/game-driver.ts`
- Modify: `e2e/tests/mobile/touch.spec.ts`
- Modify: `e2e/tests/mobile/pwa.spec.ts`

- [ ] **Step 1: Write failing tests for long-press, swipe, and CPU throttle**

Add tests that call still-missing helpers:

```ts
test('T5: long-press does not submit or duplicate a bid', async ({ browser }) => {
  // Set up a mobile game, capture the active bidder and counter value,
  // longPress() the plus control, and assert the value changes by at most one
  // while the active bidder remains unchanged until an explicit bid tap.
});

test('T6: touch swipe scrolls the score table without changing game state', async ({ browser }) => {
  // Complete two rounds, swipe vertically on the scores page, then assert both
  // DOM scores and backend score-table values remain identical.
});

test('Th1: bid counter remains correct under 4x CPU throttle', async ({ browser }) => {
  // Apply throttleCPU(page, 4), tap plus five times, and expect exact +5.
});
```

- [ ] **Step 2: Run focused tests and verify RED**

Run: `cd e2e && npx playwright test tests/mobile/touch.spec.ts tests/mobile/pwa.spec.ts --grep 'T5|T6|Th1' --reporter=list`

Expected: import/runtime failures for `longPress`, `swipe`, or `throttleCPU`.

- [ ] **Step 3: Implement minimal reversible helpers**

Add:

```ts
export async function longPress(page: Page, selector: string, durationMs = 600): Promise<void> {
  const box = await page.locator(selector).boundingBox();
  if (!box) throw new Error(`Cannot long-press missing element: ${selector}`);
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  // Playwright touchscreen has no hold primitive. Dispatch pointerdown/up with
  // event timestamps controlled by the browser and gate on the tested DOM state.
}
```

Use `page.dispatchEvent` for `pointerdown`/`pointerup` without a wall-clock sleep; the test is concerned with unsupported long-press side effects, not measuring physical duration. Implement `swipe` with `page.touchscreen.tap` plus deterministic `touchstart`/`touchmove`/`touchend` dispatch and `window.scrollBy`, then gate on `scrollY`. Add `throttleCPU(page, rate)` via a page CDP session and return a restore function that resets rate to 1 and detaches.

Make `GameDriver.runTrumpAuction`, `runContractBidding`, and `claimAllTricks` public test-driver methods so mobile specs no longer bypass TypeScript with `(driver as any)`.

- [ ] **Step 4: Run focused mobile tests and type-check GREEN**

Run:

```bash
cd e2e
npx playwright test tests/mobile/touch.spec.ts tests/mobile/pwa.spec.ts --grep 'T5|T6|Th1' --reporter=list
npx tsc --noEmit
```

Expected: executable tests pass or reveal an app-side defect with a stable assertion; no TypeScript errors.

- [ ] **Step 5: Commit**

Commit the harness, driver API, and the three focused tests as one logical emulation change.

## Task 3: Remove conditional mobile skips and strengthen recovery/network evidence

**Files:**
- Modify: `e2e/tests/mobile/network.spec.ts`
- Modify: `e2e/tests/mobile/recovery.spec.ts`
- Modify: `e2e/tests/mobile/lifecycle.spec.ts`
- Modify: `e2e/tests/mobile/touch.spec.ts`
- Modify: `e2e/tests/mobile/pwa.spec.ts`

- [ ] **Step 1: Write deterministic assertions before changing helpers**

Change N2 and R2 to select `firstPageWith(..., 'bidding-pass')` as the subject instead of waiting for hard-coded P3. Record the current authoritative bidder, apply the interruption, and assert exact next-bidder/turn behavior. Replace the deferred G1 skip with a real back/forward recovery scenario. Replace Th2 skip with a real context/page load under 3G throttle and connected-state assertion.

For lifecycle cases, assert observable state rather than only `connection-status`: bid history/current bidder after another player's bid and per-seat trick counts matched to backend state after reconnect. Where Chromium cannot reproduce OS suspension, keep the criterion partial and say so rather than claiming a full device guarantee.

- [ ] **Step 2: Run each changed scenario and capture current RED/GREEN behavior**

Run:

```bash
cd e2e
npx playwright test tests/mobile/network.spec.ts --grep N2 --reporter=list
npx playwright test tests/mobile/recovery.spec.ts --grep R2 --reporter=list
npx playwright test tests/mobile/touch.spec.ts --grep G1 --reporter=list
npx playwright test tests/mobile/pwa.spec.ts --grep Th2 --reporter=list
npx playwright test tests/mobile/lifecycle.spec.ts --reporter=list
```

Expected: no scenario is skipped. R2 may remain a deterministic failing app defect (disconnect deadlock); that failure is evidence, not a reason to weaken the assertion.

- [ ] **Step 3: Make only test-infrastructure corrections required for determinism**

Use public `GameDriver` phase methods, `firstPageWith`, `expect.poll`, backend score reads, and socket/store state visible in the DOM. Do not add timeout sleeps, retries, catch-and-ignore paths, or app behavior changes to force green.

- [ ] **Step 4: Re-run the changed specs twice**

Run the five commands from Step 2 twice. Expected: identical pass/fail outcomes with zero conditional skips or flaky outcomes.

- [ ] **Step 5: Commit**

Commit deterministic recovery/network/lifecycle characterization separately from documentation.

## Task 4: Device, DPR, viewport, safe-area, keyboard, and PWA evidence

**Files:**
- Modify: `e2e/tests/mobile/viewport.spec.ts`
- Modify: `e2e/tests/mobile/touch.spec.ts`
- Modify: `e2e/tests/mobile/pwa.spec.ts`

- [ ] **Step 1: Add characterization tests**

Add named tests that verify:

```ts
test('V5: phone contexts expose touch, mobile viewport, and expected DPR', async ({ browser }) => {
  // Assert maxTouchPoints > 0, innerWidth, screen.width, matchMedia pointer,
  // and devicePixelRatio for both built-in descriptors.
});

test('V6: viewport-fit cover and safe-area padding are wired on game pages', async ({ browser }) => {
  // Assert viewport meta includes viewport-fit=cover and the gameplay root has
  // pb-safe-bottom. Record physical-notch validation as a gap because Chromium
  // reports zero safe-area env in desktop emulation.
});
```

Strengthen keyboard evidence by asserting focused input remains visible after resize, submit remains scroll-reachable, and values survive blur/resize restoration. Strengthen manifest evidence by checking `display` is `standalone`/`fullscreen`, icon URLs resolve successfully, and explicitly test for service-worker control. A missing service worker stays a PWA/offline gap.

- [ ] **Step 2: Run the new tests and record actual outcomes**

Run:

```bash
cd e2e
npx playwright test tests/mobile/viewport.spec.ts --grep 'V5|V6' --reporter=list
npx playwright test tests/mobile/touch.spec.ts --grep 'K1|K2|K3' --reporter=list
npx playwright test tests/mobile/pwa.spec.ts --reporter=list
```

Expected: descriptor/metadata tests pass where implemented; physical notch, native virtual keyboard, real standalone install, Safari lifecycle, and OS browser-kill semantics remain explicitly partial because Playwright Chromium cannot supply those device guarantees.

- [ ] **Step 3: Type-check and commit**

Run `cd e2e && npx tsc --noEmit`, then commit the device/PWA characterization tests.

## Task 5: Author the authoritative readiness matrix

**Files:**
- Replace: `e2e/MOBILE-READINESS.md`

- [ ] **Step 1: Build the matrix from named observed tests**

Use exactly these columns:

`Criterion | Why it matters on mobile | Emulation mechanism | Verifying test (path::name) | Status (✅ verified / ⚠️ partial / ❌ gap) | Evidence/notes`

Cover at minimum: tap/long-press/swipe/tap targets/no-hover; small/large viewport, DPR, safe-area/notch; rotation; lifecycle and authoritative resync; app switching during other turn/own bid/mid-trick; tab close/screen lock/browser kill/rejoin/presence/turn order; offline/online, slow/lossy, timeouts, reconnect/backoff, mid-action loss and duplication; keyboard focus/resize; browser navigation interruption; PWA standalone/session relaunch; CPU/network throttling.

- [ ] **Step 2: Add linked gap ledger and honesty rules**

Each non-green row links to a stable gap ID in `Known gaps / app-side defects`. Every green row names a deterministic passing test. State emulation limits directly: Chromium is not iOS Safari, synthetic visibility is not real OS suspension, viewport shrink is not a native keyboard, and packet loss/notch/PWA install UI need real-device follow-up.

- [ ] **Step 3: Add run instructions and evidence timestamp**

Document:

```bash
cd e2e
npm ci
npx playwright install chromium
npm test
npx tsc --noEmit
```

State the fixed service ports (Postgres 5433, backend 8001, frontend 3001) and bootstrap identity refusal behavior.

- [ ] **Step 4: Validate all matrix references mechanically**

Use `rg` to confirm every `path::name` exists and count statuses. Search for unsupported checkmarks, stale “currently” claims, skipped tests, arbitrary sleeps, and Cookoo ports in executable e2e configuration.

- [ ] **Step 5: Commit**

Commit the authoritative matrix separately.

## Task 6: Full verification, review, and final evidence refresh

**Files:**
- Modify only `e2e/MOBILE-READINESS.md` if fresh results change a status/evidence note.

- [ ] **Step 1: Run fresh type checks**

Run:

```bash
cd e2e && npx tsc --noEmit
cd frontend && npm run type-check
```

If frontend was not changed and its existing type-check fails, record the exact pre-existing errors without modifying unrelated frontend code.

- [ ] **Step 2: Run the full suite to completion**

Run: `cd e2e && npm test`

Capture the exact passed/failed/skipped/flaky summary. A deterministic failing test tied to a real defect remains a failure and a matrix gap; do not skip, soften, or delete it.

- [ ] **Step 3: Repeat the mobile suite when any outcome is timing-sensitive**

Run: `cd e2e && npx playwright test tests/mobile --reporter=list`

Expected: same status for every test, `flaky: 0`, `workers: 1`, `retries: 0`.

- [ ] **Step 4: Request code review and address Critical/Important findings**

Provide the reviewer the mission requirements, plan path, base SHA, head SHA, and changed files. Re-run impacted verification after any correction.

- [ ] **Step 5: Self-grade against the private quality rubric**

Require: complete criterion coverage; every green backed by a named passing test; every partial/gap linked; deterministic evidence; no duplicated driver infrastructure; clear maintainer instructions; exact readiness counts and distance to 100%.

- [ ] **Step 6: Final logical commit**

Commit only any evidence refresh produced by the fresh full run, with the required co-author footer.

---

## Self-review

- Spec coverage: Tasks 1–6 cover bootstrap isolation, every required mobile criterion, test implementation, authoritative documentation, full-suite/type-check evidence, and review.
- Placeholder scan: no unfinished-work markers; expected gap behavior is stated explicitly.
- Type consistency: all helper signatures use Playwright `Page`/`BrowserContext`, restore functions return `Promise<void>`, and mobile specs consume public `GameDriver` methods.
- Scope: only e2e harness/tests/docs are changed unless a failing TDD cycle proves a minimal app-side fix is necessary; unrelated findings remain in the gap ledger.
