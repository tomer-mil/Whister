# Coverage Tests Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Write two currently-red e2e tests that will turn green once their corresponding features (A3 winner display, F1+F6 state resync) are implemented, completing the mobile readiness test coverage.

**Architecture:** Two small additions to the existing mobile Playwright suite. Task 1 adds `BackendClient.endGame()` + `GameDriver.backendEndGame()` and the W1 test in a new `endgame.spec.ts`. Task 2 appends the S3 test to the existing `lifecycle.spec.ts`. Task 3 updates `MOBILE-READINESS.md` to reference the new test IDs.

**Tech Stack:** Playwright, TypeScript, existing `GameDriver` / `BackendClient` / page-object model, `mobile/` harness helpers (`goOffline`, `goOnline`, `IPHONE_SE`).

## Global Constraints

- `workers: 1`, `retries: 0`, serial execution — never add `test.parallel()` or `test.describe.parallel()`
- No `waitForTimeout()` / `page.waitForTimeout()` / `sleep()` anywhere — all waits must use `expect.poll(…, {timeout})`, `toBeVisible({timeout})`, or `toHaveURL({timeout})`
- All mobile tests use `IPHONE_SE` device profile (`devices['iPhone SE (3rd gen)']`)
- Import device profiles and helpers from `../../mobile` (the barrel), never from sub-paths like `../../mobile/profiles`
- Import `GameDriver` from `../../driver`
- Tests that are RED by design must carry a comment explaining what feature will make them green, matching the pattern used elsewhere in the suite (e.g. `// Currently FAILS until F3 (auto-pass) is implemented`)
- NEVER touch anything under `/home/tomer/workspace/cookoo`

---

## File Structure

| File | Change | Purpose |
|------|--------|---------|
| `e2e/driver/backend-client.ts` | Modify | Add `endGame(gameId, token)` method |
| `e2e/driver/game-driver.ts` | Modify | Add `backendEndGame(gameId, token?)` convenience wrapper |
| `e2e/tests/mobile/endgame.spec.ts` | Create | W1 — end-game winner display test |
| `e2e/tests/mobile/lifecycle.spec.ts` | Modify | Append S3 — state freshness after reconnect test |
| `e2e/MOBILE-READINESS.md` | Modify | Add W1 and S3 to the test coverage map |

---

## Task 1: End-game driver support + W1 test

**Files:**
- Modify: `e2e/driver/backend-client.ts`
- Modify: `e2e/driver/game-driver.ts`
- Create: `e2e/tests/mobile/endgame.spec.ts`

**Interfaces:**
- Consumes: `BackendClient` (already exists at `e2e/driver/backend-client.ts`), `GameDriver` (at `e2e/driver/game-driver.ts`), `IPHONE_SE` from `../../mobile`, `players` and `loadToken` from `../config/players`
- Produces:
  - `BackendClient.endGame(gameId: string, token: string): Promise<void>` — calls `POST /api/v1/games/{gameId}/end`
  - `GameDriver.backendEndGame(gameId: string, token?: string): Promise<void>` — convenience wrapper using P0's token by default

**Context:** The backend `POST /api/v1/games/{id}/end` API already exists (RECON §3). It accepts `Authorization: Bearer {token}` and requires the caller to be the game admin (P0 in all test games). The existing `BackendClient.scoreTable()` follows the same auth pattern — follow it exactly.

The W1 test will be **RED until A3 is implemented** because the `scores-winner` element on the scores page is currently a `sr-only` div (1×1 px — invisible to users). Once A3 makes the winner display prominent (width and height > 44 px), W1 turns green.

- [ ] **Step 1: Add `BackendClient.endGame()`**

Open `e2e/driver/backend-client.ts`. Add this method after `scoreTable()`:

```typescript
async endGame(gameId: string, token: string): Promise<void> {
  const res = await fetch(`${API_URL}/v1/games/${gameId}/end`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`end-game ${res.status}: ${await res.text()}`);
}
```

The full file after the edit:

```typescript
import { io, Socket } from 'socket.io-client';

const API_URL = process.env.API_URL || 'http://localhost:8001/api';
const WS_URL = process.env.WS_URL || 'http://localhost:8001';

export interface ScoreTable {
  rounds: { round: number; suit: string; scores: number[] }[];
  totals: number[];
  winnerSeat: number | null;
}

export class BackendClient {
  async scoreTable(gameId: string, token: string): Promise<ScoreTable> {
    const res = await fetch(`${API_URL}/v1/games/${gameId}/score-table`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`score-table ${res.status}: ${await res.text()}`);
    return this.parse(await res.json());
  }

  async endGame(gameId: string, token: string): Promise<void> {
    const res = await fetch(`${API_URL}/v1/games/${gameId}/end`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`end-game ${res.status}: ${await res.text()}`);
  }

  private parse(raw: any): ScoreTable {
    const seatCount = raw.players?.length ?? 0;
    return {
      rounds: (raw.rounds ?? []).map((r: any) => {
        const roundScores = new Array(seatCount).fill(0);
        for (const p of (r.players ?? [])) {
          const seat = raw.players.findIndex((gp: any) => gp.user_id === p.user_id);
          if (seat >= 0) roundScores[seat] = p.score ?? 0;
        }
        return { round: r.round_number, suit: r.trump_suit, scores: roundScores };
      }),
      totals: raw.players?.map((p: any) => raw.cumulative_scores?.[p.user_id] ?? 0) ?? [],
      winnerSeat: null,
    };
  }

  openSocket(token: string): Promise<Socket> {
    return new Promise((resolve, reject) => {
      const s = io(WS_URL, {
        path: '/ws/socket.io',
        auth: { token },
        transports: ['websocket', 'polling'],
        timeout: 10_000,
      });
      s.on('connect', () => resolve(s));
      s.on('connect_error', reject);
    });
  }

  waitForEvent<T>(socket: Socket, event: string, timeoutMs = 15_000): Promise<T> {
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error(`timeout waiting for ${event}`)), timeoutMs);
      socket.once(event, (d: T) => {
        clearTimeout(t);
        resolve(d);
      });
    });
  }
}
```

- [ ] **Step 2: Add `GameDriver.backendEndGame()`**

Open `e2e/driver/game-driver.ts`. Add this method after `backendScores()` (currently the last method before `close()`):

```typescript
async backendEndGame(gameId: string, token?: string): Promise<void> {
  const t = token ?? loadToken(players[0]);
  return this.backend.endGame(gameId, t);
}
```

- [ ] **Step 3: Verify TypeScript compiles clean**

```bash
cd /home/tomer/workspace/Whister/e2e && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Write the W1 test**

Create `e2e/tests/mobile/endgame.spec.ts` with the following content:

```typescript
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
    await driver.playRound({
      trump: 'clubs',
      trumpWinner: 0,
      contracts: [5, 3, 3, 3],
      tricks: [5, 3, 3, 2],
    });
    // End the game via the backend API (admin = P0, uses P0's stored token).
    await driver.backendEndGame(gameId);
    // After game ends, scores-winner must be prominent (not sr-only 1×1 px).
    // Poll until the element grows beyond sr-only dimensions.
    const winnerEl = driver.pages[0].getByTestId('scores-winner');
    await expect.poll(
      async () => {
        const box = await winnerEl.boundingBox();
        return box?.width ?? 0;
      },
      {
        timeout: 15_000,
        message: 'scores-winner still sr-only (1 px wide) after game end — A3 not yet implemented',
      },
    ).toBeGreaterThan(44);
    await expect.poll(
      async () => {
        const box = await winnerEl.boundingBox();
        return box?.height ?? 0;
      },
      {
        timeout: 5_000,
        message: 'scores-winner still sr-only (1 px tall) after game end — A3 not yet implemented',
      },
    ).toBeGreaterThan(44);
    // Verify the correct player is identified as winner (P0 has highest score).
    const winnerSeat = await driver.scores(0).winnerSeat();
    expect(winnerSeat, 'winner seat should be 0 (P0 scored highest)').toBe(0);
  } finally {
    await driver.close();
  }
});
```

- [ ] **Step 5: Run W1 to confirm it fails for the right reason**

```bash
cd /home/tomer/workspace/Whister/e2e && npx playwright test tests/mobile/endgame.spec.ts --reporter=list 2>&1
```

Expected: W1 FAILS with the message `scores-winner still sr-only (1 px wide) after game end — A3 not yet implemented` (or times out at 15 s). If it fails for a different reason (e.g. `backendEndGame` 4xx, game not found), debug that before proceeding.

- [ ] **Step 6: Commit**

```bash
git add e2e/driver/backend-client.ts e2e/driver/game-driver.ts e2e/tests/mobile/endgame.spec.ts
git commit -m "test(e2e/mobile): W1 winner display — red until A3 implemented"
```

---

## Task 2: S3 — state freshness after reconnect

**Files:**
- Modify: `e2e/tests/mobile/lifecycle.spec.ts` (append S3 after S2)

**Interfaces:**
- Consumes: `GameDriver`, `IPHONE_SE`, `goOffline`, `goOnline` from `../../mobile`, `firstPageWith` from `../../helpers/wait`
- Produces: `S3` test — verifies that after P3 goes offline, trick claims happen, and P3 reconnects, P3's view reflects the missed state changes

**Context:** S3 is **RED until F1+F6 (game:sync) is implemented**. Without a `game:sync` socket event on reconnect, P3 misses the `round:trick_claimed` events that fired during the offline window. After reconnecting, P3's DOM keeps showing the pre-disconnect counts (0) rather than the actual counts (2). Once the backend emits current game state on reconnect (`game:sync` + handler), P3's view updates and S3 turns green.

The pattern for going offline and waiting for disconnect is already established in `network.spec.ts` (N1, N5) — follow it exactly: `goOffline(driver.contexts[3])` then `expect.poll(socketManager?.isConnected())` with a 40 s timeout.

The existing S2 test ends at line 161 with `};` closing the `describe`. Append S3 after S2's closing `});`.

- [ ] **Step 1: Read the end of `lifecycle.spec.ts` to find the exact insertion point**

Run:
```bash
tail -10 /home/tomer/workspace/Whister/e2e/tests/mobile/lifecycle.spec.ts
```

Expected output:
```
    // Each of P1, P2, P3 should show trick count ≥ 1 on P0's view
    for (const seat of [1, 2, 3]) {
      const count = await driver.pages[0].getByTestId(`playing-trick-count-${seat}`).innerText();
      expect(parseInt(count, 10), `P${seat} trick count on P0's view`).toBeGreaterThanOrEqual(1);
    }
  } finally {
    await driver.close();
  }
});
```

- [ ] **Step 2: Append S3 to `lifecycle.spec.ts`**

Add the following block at the end of the file (after the closing `});` of S2):

```typescript

// S3: trick counts are accurate on P3's view after offline + reconnect
// Currently FAILS: without game:sync (F1+F6), P3 misses trick_claimed events fired while offline.
// After reconnect, P3's DOM still shows the pre-disconnect counts (0), not the real counts (2).
// Will pass once the backend emits current game state when a socket reconnects.
test('S3: P3 trick counts accurate after going offline mid-round and reconnecting', async ({ browser }) => {
  test.setTimeout(180_000);
  const driver = new GameDriver(browser);
  await driver.setup(IPHONE_SE);
  try {
    await driver.createGame();
    await driver.confirmSeating();
    // Advance to playing phase
    await (driver as any).runTrumpAuction('clubs', 0);
    await (driver as any).runContractBidding([5, 3, 3, 3]);
    // Confirm all 4 pages are in playing phase before taking P3 offline
    await expect(driver.pages[3].getByTestId('playing-claim-trick')).toBeVisible({ timeout: 15_000 });
    // Take P3 offline (involuntary drop — triggers socket.io reconnect backoff on restore)
    await goOffline(driver.contexts[3]);
    await expect.poll(
      async () => driver.pages[3].evaluate(() => !(window as any).socketManager?.isConnected()),
      { timeout: 40_000 },
    ).toBe(true);
    // P0 claims 2 tricks while P3 is offline — P0, P1, P2 see count = 2; P3 is stale at 0
    await driver.playing(0).claimTrick();
    await driver.playing(0).claimTrick();
    // Verify the other 3 pages immediately reflect count = 2
    for (const idx of [0, 1, 2]) {
      await expect.poll(
        async () => {
          const text = await driver.pages[idx].getByTestId('playing-trick-count-0').innerText();
          return parseInt(text, 10);
        },
        { timeout: 10_000, message: `P${idx} should see P0 trick count = 2` },
      ).toBe(2);
    }
    // Restore P3's network — socket.io reconnects via built-in backoff
    await goOnline(driver.contexts[3]);
    await expect.poll(
      async () => driver.pages[3].evaluate(() => !!(window as any).socketManager?.isConnected()),
      { timeout: 60_000 },
    ).toBe(true);
    // After reconnect, P3 must show the same trick count as the rest.
    // Currently FAILS (count stays 0) until game:sync (F1+F6) is implemented.
    await expect.poll(
      async () => {
        const text = await driver.pages[3].getByTestId('playing-trick-count-0').innerText();
        return parseInt(text, 10);
      },
      {
        timeout: 30_000,
        message: 'S3 FINDING F1+F6: P3 trick count stale after reconnect — game:sync not implemented',
      },
    ).toBe(2);
  } finally {
    await driver.close();
  }
});
```

- [ ] **Step 3: Update the import line at the top of `lifecycle.spec.ts`**

The existing import is:
```typescript
import { IPHONE_SE, background, foreground, goOffline, goOnline } from '../../mobile';
```

`goOffline` and `goOnline` are already imported — no change needed. Verify with:
```bash
head -5 /home/tomer/workspace/Whister/e2e/tests/mobile/lifecycle.spec.ts
```

- [ ] **Step 4: Verify TypeScript compiles clean**

```bash
cd /home/tomer/workspace/Whister/e2e && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Run the lifecycle spec to confirm S3 fails for the right reason**

```bash
cd /home/tomer/workspace/Whister/e2e && npx playwright test tests/mobile/lifecycle.spec.ts --reporter=list 2>&1
```

Expected:
- B1, B2, B3, B4, S1, S2: PASS (no regression)
- S3: FAIL with message `S3 FINDING F1+F6: P3 trick count stale after reconnect — game:sync not implemented`

If S3 fails for a different reason (e.g. playing phase not reached, runTrumpAuction timeout), debug that before proceeding.

- [ ] **Step 6: Commit**

```bash
git add e2e/tests/mobile/lifecycle.spec.ts
git commit -m "test(e2e/mobile): S3 state freshness after reconnect — red until F1+F6 implemented"
```

---

## Task 3: Update MOBILE-READINESS.md test coverage map

**Files:**
- Modify: `e2e/MOBILE-READINESS.md`

**Interfaces:**
- Consumes: W1 (Task 1), S3 (Task 2)
- Produces: updated coverage map and updated action items table

- [ ] **Step 1: Update the red-tests table in MOBILE-READINESS.md**

Find the "Test coverage map" section. Replace the existing table row for A3 and F1+F6:

Current:
```markdown
| Test | Fix required |
|------|-------------|
| `T4` rapid double-tap claim-trick | A1 (isLoading guard) |
| `K3` room-code autocorrect | K3 fix |
| `X1` viewport zoom lock | F5 |
| `N3` score-table error surfaced | A6 (toast system) |
| `N4` full round under 3G throttle | Dependent on Next.js bundle optimisation (separate concern) |
| `R2` game unblocks after disconnect | F3 (auto-pass) |
```

Add two rows — the full table becomes:
```markdown
| Test | Fix required |
|------|-------------|
| `T4` rapid double-tap claim-trick | A1 (isLoading guard) |
| `K3` room-code autocorrect | K3 fix |
| `X1` viewport zoom lock | F5 |
| `N3` score-table error surfaced | A6 (toast system) |
| `N4` full round under 3G throttle | Dependent on Next.js bundle optimisation (separate concern) |
| `R2` game unblocks after disconnect | F3 (auto-pass) |
| `W1` winner displayed prominently after game ends | A3 (winner display feature) |
| `S3` P3 trick counts accurate after reconnect | F1+F6 (game:sync on reconnect/foreground) |
```

Also find the A3 row in the Phase 5 section and add the test reference:

Find:
```markdown
**Verifies:** No current test covers this (winner display is unimplemented). Once built, add a test in `e2e/tests/` that ends a game and asserts `scores-winner` is visible.
```

Replace with:
```markdown
**Verifies:** `W1: winner is displayed prominently on scores page after game ends` (`e2e/tests/mobile/endgame.spec.ts`) — currently red.
```

Find (in Phase 3, F1+F6 section):
```markdown
**Verifies:** `B3: offline+background simulating long background; socket reconnects on return` (currently passing; state freshness will be improved), `N1`, `S1`, `S2`
```

Replace with:
```markdown
**Verifies:** `S3: P3 trick counts accurate after going offline mid-round and reconnecting` (`e2e/tests/mobile/lifecycle.spec.ts`) — currently red. Also improves `B3`, `N1`, `S1`, `S2` (currently passing via connection indicator only).
```

- [ ] **Step 2: Verify the markdown renders correctly (spot-check)**

```bash
grep -n "W1\|S3" /home/tomer/workspace/Whister/e2e/MOBILE-READINESS.md
```

Expected: at least 4 lines — one in the phase description, one in the Verifies line, one in the red-tests table, one in the passing-tests table.

- [ ] **Step 3: Commit**

```bash
git add e2e/MOBILE-READINESS.md
git commit -m "docs(e2e): add W1 and S3 test IDs to MOBILE-READINESS coverage map"
```

---

## Self-Review

**1. Spec coverage:**

| Requirement | Task |
|-------------|------|
| `BackendClient.endGame()` that calls `POST /end` | Task 1 Step 1 |
| `GameDriver.backendEndGame()` convenience wrapper | Task 1 Step 2 |
| W1 test asserting `scores-winner` is prominent (>44 px) after `backendEndGame()` | Task 1 Step 4 |
| W1 test asserting `winnerSeat()` returns `0` (P0 wins with 35 pts) | Task 1 Step 4 |
| W1 confirmed red for the right reason | Task 1 Step 5 |
| S3 test asserting P3 trick count = 2 after reconnect | Task 2 Step 2 |
| S3 confirmed red for the right reason | Task 2 Step 5 |
| `MOBILE-READINESS.md` coverage map updated with W1 and S3 | Task 3 |

No gaps.

**2. Placeholder scan:** No TBD, TODO, or "implement later" present. All assertions use exact values (44 px threshold, count = 2, seat = 0, 40 s disconnect timeout, 60 s reconnect timeout). Finding messages are verbatim.

**3. Type consistency:**
- `BackendClient.endGame(gameId: string, token: string): Promise<void>` — used by `GameDriver.backendEndGame()` in Task 1 Step 2 and by the W1 test indirectly via `driver.backendEndGame(gameId)`.
- `GameDriver.backendEndGame(gameId: string, token?: string): Promise<void>` — matches usage in W1: `await driver.backendEndGame(gameId)`.
- `goOffline` / `goOnline` take `BrowserContext` — used as `driver.contexts[3]` (a `BrowserContext`) in S3. ✓
- `(driver as any).runTrumpAuction` / `runContractBidding` — private methods, accessed via `as any` following the identical pattern in `touch.spec.ts` and `lifecycle.spec.ts` (S1). ✓
- `driver.playing(seat).claimTrick()` — `PlayingPage.claimTrick()` exists. ✓
- `driver.scores(0).winnerSeat()` — `ScoresPage.winnerSeat()` exists, returns `number | null`. ✓
