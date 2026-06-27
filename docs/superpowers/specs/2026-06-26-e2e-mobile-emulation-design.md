# Whister E2E Mobile Emulation — Design

**Date:** 2026-06-26
**Status:** Approved.
**Branch:** feat/e2e-mobile-emulation
**Topic:** Extend the existing Playwright e2e suite with a mobile-emulation framework so the
suite exercises Whister the way a real phone does: touch input, small viewports, orientation
rotation, backgrounding/foregrounding, abrupt close and recovery, network transitions, virtual
keyboard, and PWA session persistence.

---

## Context & Goal

Whister is played ~99% of the time on a mobile phone in a real browser over real mobile networks
with real interruptions. The existing playability suite (18/18 passing as of 2026-06-25) proves
the game logic is correct through a desktop Chromium context. It does **not** verify:

- That the UI is reachable and usable at phone viewport sizes (375×667, 390×844)
- That touch input (taps, not mouse clicks) works correctly
- That the game survives orientation rotation mid-round
- That the socket reconnects and the UI resyncs after backgrounding, network loss, or tab close
- That the virtual keyboard does not obscure critical controls
- That PWA session tokens persist across relaunches

This spec defines the mobile-emulation framework and the full scenario catalog to close those
gaps. The goal is to make "the tests pass" mean "the game is genuinely playable on a phone."

### Relationship to the playability suite

This is an **extension**, not a replacement. The existing suite (`e2e/tests/*.spec.ts`) runs
unchanged. All new mobile specs live in `e2e/tests/mobile/` and the new harness module lives in
`e2e/mobile/`. One minimal change is made to `GameDriver.setup()` to accept optional context
options — this is the only existing file modified.

---

## Decisions Log

| # | Decision | Choice |
|---|---|---|
| App-side gaps | When a test surfaces a mobile defect in the app itself | Record as a finding; do not fix in this task |
| Device profiles | Number of phone profiles to exercise | Two: small (iPhone SE: 375×667) + large (iPhone 14: 390×844) |
| Framework approach | How mobile profiles plug into GameDriver | Approach 1: thin contextOptions parameter on `setup()`; separate `e2e/mobile/` harness module |
| Driver change | How much of GameDriver to modify | One-line: `setup(contextOptions?: BrowserContextOptions)` merges options into each context |
| Spec organization | Where mobile specs live | `e2e/tests/mobile/` — auto-discovered by existing `testDir: './tests'` |
| Execution model | Workers / retries | Unchanged: `workers: 1`, `retries: 0` (serial, deterministic) |
| Assertion model | DOM vs backend | Unchanged: dual-source (DOM testid + `GET /games/{id}/score-table`) wherever applicable |
| Deferred scenarios | G1 (back navigation), Th1/Th2 (CPU throttle) | `test.skip()` with rationale; implement after suite is stable |

---

## Framework Design

### Approach: thin context-options parameterization (Approach 1)

The `GameDriver.setup()` method gains one optional parameter:

```typescript
async setup(contextOptions?: BrowserContextOptions): Promise<void> {
  this.contexts = await Promise.all(
    players.map((p) =>
      this.browser.newContext({ storageState: p.storageStatePath, ...contextOptions }),
    ),
  );
  this.pages = await Promise.all(this.contexts.map((c) => c.newPage()));
}
```

All four player contexts receive the same profile — correct for mobile tests where the
interesting variation is lifecycle events and network conditions, not per-player device
differences.

### Device profiles — `e2e/mobile/profiles.ts`

```typescript
import { devices } from '@playwright/test';

export const IPHONE_SE = devices['iPhone SE'];   // 375×667, DPR 2, hasTouch, isMobile, UA: Safari
export const IPHONE_14 = devices['iPhone 14'];   // 390×844, DPR 3, hasTouch, isMobile, UA: Safari
```

Playwright's built-in device descriptors set `hasTouch: true`, `isMobile: true`, viewport
dimensions, device pixel ratio, and a mobile Safari user-agent string. This is real emulation,
not a flag.

### Lifecycle harness — `e2e/mobile/lifecycle.ts`

Provides deterministic helpers to trigger mobile OS lifecycle events observable in-browser:

```typescript
// Simulate OS suspending the tab (app backgrounded)
export async function background(page: Page): Promise<void>

// Simulate OS resuming the tab (app foregrounded)
export async function foreground(page: Page): Promise<void>

// Rotate to landscape (swap width ↔ height)
export async function rotateLandscape(page: Page): Promise<void>

// Rotate back to portrait (swap back)
export async function rotatePortrait(page: Page): Promise<void>
```

`background()` sets `visibilityState = 'hidden'` and dispatches a `visibilitychange` event via
`page.evaluate`. `foreground()` restores it and dispatches the corresponding event. Both are
deterministic — no sleep required.

### Network harness — `e2e/mobile/network.ts`

```typescript
// Take a browser context offline (socket disconnects, HTTP fails)
export async function goOffline(ctx: BrowserContext): Promise<void>

// Restore connectivity
export async function goOnline(ctx: BrowserContext): Promise<void>

// Block then restore a specific URL pattern (simulate request timeout)
export async function blockRoute(page: Page, urlPattern: string): Promise<() => Promise<void>>

// Apply 3G throttle via CDP (250 kbps down, 50 kbps up, 300ms RTT)
export async function throttle3G(page: Page): Promise<void>

// Remove throttle
export async function restoreNetwork(page: Page): Promise<void>

// Force-disconnect the socket.io client (triggers reconnect backoff)
export async function disconnectSocket(page: Page): Promise<void>
```

`goOffline`/`goOnline` use `context.setOffline(true/false)` — a Playwright primitive, not a CDP
hack. `throttle3G` and `restoreNetwork` use CDP `Network.emulateNetworkConditions` via
`page.context().browser().newBrowserCDPSession()` → `cdpSession.send(...)`.

### Touch harness — `e2e/mobile/touch.ts`

```typescript
// Assert all listed testids have bounding boxes ≥ 44×44px (iOS tap-target guideline)
export async function assertTouchTargets(
  page: Page,
  testIds: string[],
  minPx = 44,
): Promise<void>
```

Measures each element with `boundingBox()` and asserts `width ≥ minPx && height ≥ minPx`. A
failure records the element and its actual dimensions as the finding.

### Re-exports — `e2e/mobile/index.ts`

```typescript
export * from './profiles';
export * from './lifecycle';
export * from './network';
export * from './touch';
```

---

## File Layout

```
e2e/
├── mobile/                         ← NEW: harness (no test code)
│   ├── profiles.ts
│   ├── lifecycle.ts
│   ├── network.ts
│   ├── touch.ts
│   └── index.ts
├── tests/
│   ├── smoke.spec.ts               (existing — unchanged)
│   ├── scoring.spec.ts             (existing — unchanged)
│   ├── bidding.spec.ts             (existing — unchanged)
│   ├── flow.spec.ts                (existing — unchanged)
│   ├── resilience.spec.ts          (existing — unchanged)
│   └── mobile/                     ← NEW: mobile specs
│       ├── viewport.spec.ts        V1–V4
│       ├── orientation.spec.ts     O1–O4
│       ├── lifecycle.spec.ts       B1–B4, S1–S2
│       ├── recovery.spec.ts        R1–R3
│       ├── network.spec.ts         N1–N5
│       ├── touch.spec.ts           T1–T4, K1–K3, X1–X3
│       └── pwa.spec.ts             P1–P2
├── driver/
│   └── game-driver.ts              ← MODIFIED: setup() gains contextOptions?
├── RECON.md                        ← UPDATED: mobile-findings section appended
```

---

## Complete Scenario Catalog

### Category 1: Touch Input

| ID | Scenario | Emulation mechanism | Assertion | Expected finding |
|----|----------|---------------------|-----------|-----------------|
| T1 | Tap all game controls with touch (not mouse) | `hasTouch:true`, `isMobile:true` context; `page.tap()` everywhere | Full smoke round completes via taps | Likely pass |
| T2 | Touch target ≥ 44×44px for all interactive controls | `assertTouchTargets()` on suit buttons, counter ±, claim-trick, pass, bid, confirm at both profiles | All ≥ 44px | **Possible gap**: bid counter ± or suit buttons may be undersized |
| T3 | No critical action is hover-gated | Mobile context; complete flow without any `page.hover()` call | Full flow succeeds | Likely pass |
| T4 | Rapid double-tap on claim-trick does not double-claim | Two rapid `tap()` calls; assert backend trick count +1, not +2 | Idempotent claim | **Likely gap**: SG-6 C3 (non-idempotent trick claims) |

### Category 2: Viewports & Devices

| ID | Scenario | Emulation | Assertion | Expected finding |
|----|----------|-----------|-----------|-----------------|
| V1 | Full smoke round on iPhone SE (375×667) | `IPHONE_SE` context | Round completes; all testids reachable; no overflow | Possible overflow on scores table |
| V2 | Full smoke round on iPhone 14 (390×844) | `IPHONE_14` context | Round completes; all testids reachable | Likely pass |
| V3 | Score table scrollable when it overflows small viewport | `IPHONE_SE` + 3-round game; `scores-row-r3` reachable via scroll | Scroll works; controls not hidden | Possible gap on small screen |
| V4 | Claim-trick button above safe-area inset | Both profiles; `boundingBox().y + height < viewport.height - 20` | Button not clipped by home indicator zone | Check: `viewportFit:cover` is set, but `env(safe-area-inset-bottom)` may be unapplied |

### Category 3: Orientation

| ID | Scenario | Emulation | Assertion | Expected finding |
|----|----------|-----------|-----------|-----------------|
| O1 | Portrait→landscape mid-bidding; continue bidding | `page.setViewportSize({width:844,height:390})` during bidding | State unchanged; turn indicator correct; no error screen | **Likely gap**: no phone-landscape CSS |
| O2 | Portrait→landscape on scores page | After round, rotate; assert `scores-cell-r1-p0` readable | Score table reflows or scrolls | Possible overflow at 390px height |
| O3 | Landscape→portrait during playing phase | Rotate to landscape then back; assert `playing-claim-trick` visible | No state loss; no socket disconnect | Likely pass |
| O4 | Game starts in landscape orientation | Context with 844×390 from the start; full smoke round | Round completes | May reveal layout gaps |

### Category 4: Backgrounding / Foregrounding

| ID | Scenario | Emulation | Assertion | Expected finding |
|----|----------|-----------|-----------|-----------------|
| B1 | P3 backgrounds during another player's trump bid; foregrounds | `background(page)` → another player bids → `foreground(page)` | P3 DOM shows new bid in history; `connection-status` connected | **APP GAP**: no `visibilitychange` listener; DOM may be stale if socket received event while hidden |
| B2 | P3 backgrounds for 60s (socket keepalive interval); foregrounds | `background()` → 2 turns advance → `foreground()` | DOM reflects advances; state correct | Same gap |
| B3 | Long background + offline; foreground with reconnect | `background()` + `goOffline()` 30s + `goOnline()` + `foreground()` | Socket reconnects; `connection-status` recovers; DOM matches backend | **APP GAP**: no proactive sync on reconnect/foreground |
| B4 | P3 backgrounds on their own turn to bid | `background()` while `bidding-pass` visible; foreground | Turn still P3's (no timeout implemented) or game auto-advanced cleanly | **APP GAP**: SG-6 D4 (auto-pass on disconnect) not implemented |

### Category 5: App/Tab Switching

| ID | Scenario | Emulation | Assertion | Expected finding |
|----|----------|-----------|-----------|-----------------|
| S1 | P0 switches away during trick claiming by P1–P3; returns | `background(P0page)` while P1/P2/P3 claim 3 tricks; `foreground(P0page)` | P0 DOM shows updated trick counts | Same gap as B1 |
| S2 | All 4 players switch away briefly, all return | All 4 pages `background()`; 2s pause; all `foreground()` | State consistent across all pages vs backend | Stress test of sync behaviour |

### Category 6: Abrupt Termination & Recovery

| ID | Scenario | Emulation | Assertion | Expected finding |
|----|----------|-----------|-----------|-----------------|
| R1 | P3 closes tab mid-bidding; reopens in same context | `driver.pages[3].close()` → `driver.contexts[3].newPage()` → navigate to room URL | P3 sees live game state; `room:player_reconnected` WS event; others see reconnect | Surface finding re SG-6 D4 |
| R2 | P3 closes tab on their bid turn; P3 reconnects | Close when `bidding-pass` visible on P3; reconnect | Turn advances (auto-pass) or blocks until reconnect | **Finding if blocked**: SG-6 D4 |
| R3 | Browser kill simulation: context close + new context + navigate | `context.close()` → `browser.newContext({storageState})` → navigate | New context re-authenticates; game joined; state restored | Likely pass (storageState + backend game persistence) |

### Category 7: Network Transitions

| ID | Scenario | Emulation | Assertion | Expected finding |
|----|----------|-----------|-----------|-----------------|
| N1 | P3 goes offline during another's turn; comes back online | `goOffline(ctx)` → 2 turns advance → `goOnline(ctx)` | Socket reconnects; `connection-status` recovers; DOM matches backend | **APP GAP**: no `online` event handler; reconnect via socket.io backoff |
| N2 | P3 goes offline at their trump bid turn; reconnects and bids | `goOffline()` on P3 turn → `goOnline()` → P3 places bid | Bid accepted; no duplicate; state advances | Tests socket.io queue + server idempotency |
| N3 | REST score-table fetch blocked mid-request | `blockRoute(page, '**/score-table**')` then restore | Error shown (or graceful degradation); retry succeeds | App may silently fail |
| N4 | 3G throttle for entire round | `throttle3G()` before game start; smoke round | Round completes within extended timeout (120s); no duplicated actions | Should pass with generous timeout |
| N5 | socket.io client force-disconnect → auto-reconnect | `disconnectSocket(page)` → wait for reconnect | Socket reconnects; `connection-status` shows reconnecting→connected | Tests socket.io built-in reconnect mechanism |

### Category 8: Virtual Keyboard

| ID | Scenario | Emulation | Assertion | Expected finding |
|----|----------|-----------|-----------|-----------------|
| K1 | Room-code input on small viewport with keyboard open | Viewport set to 375×350 (keyboard-open simulation) before `fill()` | Input visible; submit button reachable | **Possible gap**: submit button below fold |
| K2 | Display name value retained after keyboard dismiss | `fill()` name → `blur()` → assert value | Value unchanged | Likely pass |
| K3 | Room-code input type appropriate | Check `inputMode` / `type` attribute on room-code input | Sensible input type (no autocorrect on a code field) | Check |

### Category 9: PWA / Session Persistence

| ID | Scenario | Emulation | Assertion | Expected finding |
|----|----------|-----------|-----------|-----------------|
| P1 | Auth token survives context close + reopen | Context closed; new context with same `storageState`; navigate to room | Auto-authenticated; game joined | Likely pass |
| P2 | `manifest.json` is served and contains required PWA fields | REST `GET /manifest.json` | Valid JSON with `name`, `icons`, `start_url`, `display` | Check: manifest must exist in `public/` |

### Additional Discovered Scenarios

| ID | Scenario | Emulation | Assertion | Expected finding |
|----|----------|-----------|-----------|-----------------|
| X1 | Pinch-to-zoom disabled in viewport meta | `page.$eval('meta[name=viewport]', el => el.content)` | Contains `user-scalable=no` or `maximum-scale=1` | **Possible gap**: `layout.tsx` has `viewportFit:cover` but no explicit zoom lock |
| X2 | Rapid 5× tap on bid counter does not over-increment | 5 rapid `tap()` calls on `bidding-counter-plus` | Counter value = initial + 5 | Should pass |
| X3 | Room code paste (clipboard share-sheet simulation) | `page.fill(input, roomCode)` | Room join succeeds | Likely pass |

### Deferred

| ID | Scenario | Reason |
|----|----------|--------|
| G1 | Browser back button from game page | Exploratory; depends on app navigation guard (not yet implemented) |
| Th1 | CPU 4× throttle: bid counter animation timing | CDP `Emulation.setCPUThrottlingRate` adds significant runtime; defer until suite stable |
| Th2 | 3G throttle + socket connection within timeout | Covered adequately by N4; deduplicate |

---

## App-Side Mobile Readiness Findings

These are surfaced by the mobile tests and recorded here as findings for a separate task. They
are **not fixed** in this scope.

| Finding | Scenario(s) | Impact | Root cause |
|---------|-------------|--------|-----------|
| **F1** No `visibilitychange` listener | B1–B4, S1–S2 | DOM may show stale state after foregrounding; socket stays connected (short background) or reconnects via backoff (long), but no proactive `sync:state` request | `frontend/lib/socket/manager.ts` has no page lifecycle hooks |
| **F2** No `online` event listener | N1 | Reconnect happens via socket.io built-in backoff, not immediately on network restore | No `window.addEventListener('online', ...)` anywhere in frontend |
| **F3** Auto-pass on disconnect not implemented | B4, R2 | Game can block indefinitely when a player disconnects on their bid turn | SG-6 finding D4 — `backend/app/websocket/game_events.py` |
| **F4** Touch targets may be undersized | T2 | Bid counter ± and suit-selector buttons may be below 44×44px iOS guideline | Component sizing in `components/bidding/bid-counter.tsx` and `components/bidding/suit-selector.tsx` |
| **F5** Zoom lock may be missing | X1 | Double-tap zoom could interrupt gameplay | `frontend/app/layout.tsx` viewport metadata |
| **F6** No proactive `sync:state` on reconnect | B3, N1 | After long background + reconnect, frontend relies on server-pushed events rather than requesting a state resync | `frontend/lib/socket/manager.ts` disconnect handler clears room state but does not emit `sync:request` on reconnect |

---

## Execution Model

- **Serial:** `workers: 1`, `retries: 0` — unchanged from existing suite.
- **Test order:** Existing specs run first (smoke → scoring → bidding → flow → resilience); mobile specs run after in file-alphabetical order within `tests/mobile/`.
- **Timeouts:** Mobile specs use `test.setTimeout(120_000)` for network-transition scenarios (N4); others use the default 90s.
- **Determinism:** All mobile waits gate on observable state (testid visibility, connection-status text, `expect.poll` on backend). No `setTimeout`/`delay()` calls.

---

## Non-Goals

- Fixing the app-side gaps listed above (separate task).
- iOS Safari-specific bugs (the suite uses Playwright Chromium with mobile UA; Safari-only behaviours like ITP are not reproducible here).
- Running on a real physical device (this is emulation only).
- Adding parallel execution or CI integration.
- Testing the Groups/analytics endpoints (out of scope for playability).
