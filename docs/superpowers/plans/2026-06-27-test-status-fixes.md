# Whister Test-Status Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Green every confirmed 2026-06-27 backend and browser test failure without weakening security, Israeli Whist business rules, mobile assertions, or the Whister service-identity guard.

**Architecture:** Keep Redis as the authoritative live-game state, add explicit reconnect/resync and server-owned bidding timeouts around the existing Socket.IO protocol, and make the mobile UI expose durable state and errors through the existing Zustand and Radix primitives. Update only demonstrably stale backend assertions, retain the distinct desktop e2e coverage, and gate all cascade-affected mobile work on clean isolated reruns.

**Tech Stack:** Python 3.11, FastAPI, python-socketio, Redis, pytest/fakeredis, Next.js 16 app router, React 18, TypeScript strict, Zustand, Radix UI, Tailwind CSS 3, Playwright Chromium.

---

## Global Constraints

The following run constraints are copied verbatim from the authoritative status specification:

> Services run via Docker Compose. Ports: backend 8001, frontend 3001, postgres 5433, redis 6379.
> Cookoo (a separate app) occupies 8000/5432 — never touch it.

Backend tests require exactly these environment variables:

```bash
DATABASE_URL="postgresql+asyncpg://whist:whistpass123@localhost:5433/whist_db" \
REDIS_URL="redis://localhost:6379/0" \
JWT_SECRET_KEY="test-secret"
```

At the start of every backend task shell, export the same values so focused `pytest`, `mypy`, and
application imports all use Whister's test services:

```bash
export DATABASE_URL="postgresql+asyncpg://whist:whistpass123@localhost:5433/whist_db"
export REDIS_URL="redis://localhost:6379/0"
export JWT_SECRET_KEY="test-secret"
```

Never modify anything under `/home/tomer/workspace/cookoo`; it is a live app on ports 5432/8000. Read-only inspection is allowed. Start, stop, inspect, and test only Whister's compose project and Whister ports.

Additional execution constraints:

- Do not change scoring, bidding validation, game-type determination, analytics, auth flows, room creation/join/seating, or the bootstrap identity guard except where an explicitly named task adds regression coverage.
- Do not weaken, skip, delete, or loosen a test that exposes a real defect. Stale assertions may change only after the intended application behavior is confirmed from source.
- Preserve passing mobile tests B1-B4, S1, and V5. Shared socket changes must also run N1/N5 and the reconnect/lifecycle regression set.
- One logical fix per commit. Every commit includes `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- Run commit blocks from `/home/tomer/workspace/Whister` unless the block explicitly changes directory.
- Run frontend checks with `cd frontend && npm run type-check && npm run build`; run e2e TypeScript with `cd e2e && npx tsc --noEmit`.

## Decisions

1. **Protected user profiles stay protected.** `backend/app/api/users.py:28-31` injects `CurrentUser` for profile and stats reads. The 403 is therefore an intentional authentication boundary, not a lookup bug. Update the six tests to send the registering user's bearer token; do not remove `CurrentUser`. The two not-found cases then exercise the lookup and correctly assert `AUTH_1005`.
2. **Repair, do not retire, the non-mobile suite.** The mobile suite covers full rounds and reconnects, but it does not duplicate the desktop suite's explicit Frisch, last-bidder sum-13, invalid trump bid, or eight-case scoring matrix. Add a deterministic lobby socket-readiness barrier to `GameDriver` and retain all 23 tests.
3. **Optimise N4; do not raise its timeout.** N4 already has a 180-second test timeout and a 90-second action timeout. Increasing either would redefine the performance requirement and preserve the resource cascade. Measure production chunks, split phase-only UI, prefetch the score route, and require N4 to pass twice in fresh processes before running the full mobile suite.
4. **Use existing protocol names.** The repository already defines `sync:request` and `sync:state`; F1+F6 extends those names rather than introducing the stale example name `game:sync`.
5. **N2 gets an explicit compatibility task.** The Fix Inventory has no separate product fix ID for confirmed test N2. This plan labels the unit `N2` and adds request-id idempotency to the existing `bid:pass` protocol after F2/F1+F6 establish reliable reconnect/rejoin behavior.

## File Map

| File | Action | Responsibility |
|---|---|---|
| `frontend/app/layout.tsx` | Modify | Canonical Next.js viewport export; mount toast and service-worker clients |
| `frontend/app/room/[roomCode]/layout.tsx` | Modify | Redirect authoritative active-room joins to their game route |
| `frontend/app/game/[gameId]/page.tsx` | Modify | A1 loading guard, A6 toast calls, foreground/orientation resync, score-route prefetch |
| `frontend/app/game/[gameId]/layout.tsx` | Modify | Persistent room sync after reconnect/rotation |
| `frontend/app/game/[gameId]/scores/page.tsx` | Modify | A3 winner state, A6 score-fetch error toast, landscape scroll container |
| `frontend/components/shared/toast-host.tsx` | Create | Render the existing Zustand toast queue through Radix primitives |
| `frontend/components/shared/service-worker-register.tsx` | Create | Register `/sw.js` and expose readiness without touching game state |
| `frontend/components/ui/toast.tsx` | Modify | Export Radix provider used by the shared host |
| `frontend/components/room/join-room-form.tsx` | Modify | K3 mobile input attributes |
| `frontend/lib/socket/manager.ts` | Modify | F2 online reconnect, room rejoin, F1+F6 sync requests, connection store updates |
| `frontend/lib/api/index.ts` | Modify | Membership-checked game bootstrap used after a full reload |
| `frontend/hooks/use-game.ts` | Modify | Apply authoritative `sync:state` snapshots atomically |
| `frontend/hooks/use-bidding.ts` | Modify | Add N2 pass request IDs |
| `frontend/types/socket-events.ts` | Modify | Keep client/server event payloads aligned with backend schemas |
| `frontend/types/score.ts` | Modify | Carry game status and winner from score-table response |
| `frontend/public/manifest.json` | Modify | Keep install metadata aligned with generated icons |
| `frontend/public/icon-192.png` | Create | Install icon at declared dimensions |
| `frontend/public/icon-512.png` | Create | Install/maskable icon at declared dimensions |
| `frontend/public/sw.js` | Create | Same-origin static-shell cache and network-first navigation fallback |
| `frontend/scripts/generate-pwa-icons.mjs` | Create | Reproducibly generate the two PNG assets without a new dependency |
| `backend/app/schemas/score.py` | Modify | Expose finished status and winner in score table |
| `backend/app/api/games.py` | Modify | Populate score-table status/winner fields |
| `backend/app/websocket/schemas.py` | Modify | Sync snapshot fields and N2 pass request ID |
| `backend/app/websocket/server.py` | Modify | Sync handler and F3 disconnect timer ownership |
| `backend/app/websocket/game_events.py` | Modify | Reusable trump-pass transition used by manual pass and F3 |
| `backend/app/services/bidding_service.py` | Modify | N2 request-id deduplication |
| `backend/app/main.py` | Modify | Inject one bidding service into room and bidding handlers |
| `backend/tests/test_auth.py` | Modify | Numeric auth error-code assertions |
| `backend/tests/test_rooms.py` | Modify | Numeric room/authorization error-code assertions |
| `backend/tests/test_users.py` | Modify | Authenticated profile/stat requests and numeric error assertions |
| `backend/tests/test_websocket.py` | Modify | Current `RedisManager.client` API and new sync/F3 coverage |
| `backend/tests/test_bidding.py` | Modify | N2 idempotent pass service coverage |
| `frontend/tsconfig.json` | Modify | Keep the production type-check scoped to configured application sources |
| `frontend/README.md` | Modify | Record that the dormant Jest scaffold is not an active test suite |
| `e2e/helpers/services.ts` | Modify | Import the synchronous process helper used by service cleanup |
| `e2e/driver/game-driver.ts` | Modify | Desktop lobby connection/readiness barrier |
| `e2e/tests/mobile/network.spec.ts` | Modify | Observe the N3 toast even though the deliberately blocked score request cannot load scores |
| `e2e/tests/mobile/recovery.spec.ts` | Modify | F3's specified 30-second deadline with non-racy assertion window |
| `e2e/tests/mobile/pwa.spec.ts` | Modify | Assert relaunch bootstrap and await service-worker activation/control deterministically |
| `e2e/README.md` | Modify | State that both desktop and mobile suites are active and distinct |

## Priority 0 — restore trustworthy static baselines

### Task 0A: E2E TypeScript — import the process helper that service cleanup already uses

**Greens:** the repository-wide e2e TypeScript baseline. **Regression:** Playwright bootstrap identity and Whister-only service cleanup.

**Files:**
- Modify: `e2e/helpers/services.ts:1`

- [ ] **Step 1: Reproduce the compiler failure**

Run: `cd e2e && npx tsc --noEmit`

Expected before the fix: FAIL with `helpers/services.ts(232,17): error TS2304: Cannot find name 'execSync'.`

- [ ] **Step 2: Make the smallest import-only correction**

Change the existing import to:

```ts
import { execFileSync, execSync, spawn } from 'child_process';
```

Do not change the cleanup command, its Whister compose-project filter, or any port handling.

- [ ] **Step 3: Verify static and service-identity regressions**

```bash
cd e2e
npx tsc --noEmit
npx playwright test tests/bootstrap.spec.ts --reporter=list
```

Expected: TypeScript exits 0; the bootstrap spec passes and confirms Whister on ports 8001/3001. No command addresses Cookoo ports 8000/5432.

- [ ] **Step 4: Commit the import fix**

```bash
git add e2e/helpers/services.ts
git commit -m "fix(e2e): import service cleanup process helper" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

### Task 0B: Frontend TypeScript — separate the dormant Jest scaffold from production checking

**Greens:** `frontend` production TypeScript baseline. **Regression:** current auth e2e flows remain active and passing.

The sole file in `frontend/__tests__/` is not an executable test suite: `frontend/package.json` has no Jest/Vitest or Testing Library dependencies and no `test` script, its `@/lib/api/client` and `@/lib/socket/client` imports do not exist, and `frontend/README.md` explicitly says Vitest remains “to be configured.” This task does not declare that scaffold green, delete it, or use its exclusion to dismiss an application defect. It makes `npm run type-check` accurately check the configured Next.js application and records that browser auth coverage is provided by the active Playwright suite. Configuring and porting frontend unit tests is separate feature work.

**Files:**
- Modify: `frontend/tsconfig.json:28-31`
- Modify: `frontend/README.md:136-144`
- Read: `frontend/__tests__/integration/auth-flow.test.ts`

- [ ] **Step 1: Reproduce and classify every diagnostic**

Run: `cd frontend && npm run type-check`

Expected before the fix: FAIL; every diagnostic names `__tests__/integration/auth-flow.test.ts` and falls into the confirmed dormant-scaffold causes above. If any diagnostic names application code outside `frontend/__tests__/`, stop and add a separate reproduced fix task rather than excluding it.

- [ ] **Step 2: Scope the production compiler and document the inactive scaffold**

Set the end of `frontend/tsconfig.json` to:

```json
  "exclude": ["node_modules", "__tests__"]
}
```

In `frontend/README.md`'s testing section, replace the aspirational Vitest bullet with these exact statements:

```markdown
5. **Testing** - Playwright browser coverage lives in `../e2e/`. The historical Jest scaffold in
   `__tests__/` is not configured or executed; porting it to Vitest is separate work. Production
   TypeScript checks intentionally exclude that dormant directory.
```

- [ ] **Step 3: Verify production types, build, and active auth coverage**

```bash
cd frontend
npm run type-check
npm run build
cd ../e2e
npx playwright test tests/auth.spec.ts --reporter=list
```

Expected: type-check and build exit 0; the active auth Playwright tests pass. No result is claimed for the dormant Jest scaffold.

- [ ] **Step 4: Commit the compiler boundary**

```bash
git add frontend/tsconfig.json frontend/README.md
git commit -m "chore(frontend): scope production type checking" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

## Task 1: Establish a clean signal for the 26 cascade-affected mobile tests

**Tests:** N5, O3, O4, P1, Th1, Th2, R1-R3, T1-T6, K1-K3, X2, X3, G1, V1-V4, V6. R2/T4/K3 are still implemented below because their missing code seams are independently confirmed; this task determines whether any additional targets exist.

**Files:**
- Read: `e2e/tests/mobile/*.spec.ts`
- Read: `e2e/test-results/`, `e2e/playwright-report/`, and `e2e/results.json` after each isolated run
- Modify: `docs/superpowers/specs/2026-06-27-test-status-and-fix-targets.md` only if an isolated result changes an `⚠️ Unknown` status
- Modify: `docs/superpowers/plans/2026-06-27-test-status-fixes.md` only to add a reproduced task required by the checkpoint
- Do not modify application or test files in this task

- [ ] **Step 1: Verify Whister identity without touching Cookoo**

```bash
curl -fsS http://localhost:8001/health/ready
curl -fsS http://localhost:3001/manifest.json
```

Expected: backend JSON contains `"service":"whister"`; manifest contains `"name":"Whister"`. If either check fails, use Whister's `e2e/globalSetup.ts` through the Playwright commands below; do not probe, stop, or restart ports 8000/5432.

- [ ] **Step 2: Run each cascade group in a fresh Playwright process**

```bash
cd e2e
npx playwright test tests/mobile/network.spec.ts --grep 'N5:' --reporter=list
npx playwright test tests/mobile/orientation.spec.ts --grep 'O3:|O4:' --reporter=list
npx playwright test tests/mobile/pwa.spec.ts --grep 'P1:|Th1:|Th2:' --reporter=list
npx playwright test tests/mobile/recovery.spec.ts --grep 'R1:|R2:|R3:' --reporter=list
npx playwright test tests/mobile/touch.spec.ts --grep 'T1:|T2a:|T2b:|T3:|T4:|T5:|T6:|K1:|K2:|K3:|X2:|X3:|G1:' --reporter=list
npx playwright test tests/mobile/viewport.spec.ts --grep 'V1:|V2:|V3:|V4:|V6:' --reporter=list
```

Expected: every command starts a fresh worker. Results replace the `⚠️ Unknown` labels; no failure is attributed to the earlier N4 worker.

- [ ] **Step 3: Apply the planning checkpoint**

For each failure not already mapped to F3, F2, F1+F6, A1, K3, O1/O2, P2+P3, or N4, record the failing locator/API response, the first application stack frame, and a single reproduced root cause in `docs/superpowers/specs/2026-06-27-test-status-and-fix-targets.md`. Stop execution and add a separately named TDD task to this plan before changing application code. Tests that pass in isolation receive no fix task. This is an evidence gate, not permission to guess from the “suspected” column.

Expected: all 26 tests are either green in isolation or represented by a reproduced, reviewable task. There is no code commit; Task 18 commits an intentional isolated-results documentation update after the corresponding work is closed.

**Checkpoint outcome (fresh processes, 2026-06-27):** The filters expand to 27 Playwright cases because T2 is implemented as T2a and T2b. Twenty passed: N5, O3, O4, Th1, R1, R3, T1, T2a, T2b, T3, T5, T6, K1, K2, X2, X3, V1, V2, V3, and V4. Seven failed with clean evidence: P1 and Th2 map to the newly reproduced RB1 task below; R2 maps to F3; T4 maps to A1; K3 maps to K3; G1 maps to F2's manager-to-Zustand connection-state wiring; V6 maps to F5's supported `Viewport` export. No other tasks may be inferred from the original cascade.

## Priority 1 — unblock beta

### Task 2: F5 — emit a canonical zoom-locked viewport

**Greens:** X1. **Regression:** V5, V6.

**Files:**
- Modify: `frontend/app/layout.tsx:1-23`

- [ ] **Step 1: Run X1 first**

Run: `cd e2e && npx playwright test tests/mobile/touch.spec.ts --grep 'X1:' --reporter=list`

Expected before the fix: FAIL showing viewport content without `maximum-scale=1` or `user-scalable=no` in the served build. The source currently nests viewport data under `metadata`; Next 16 requires the dedicated `Viewport` export for reliable emission.

- [ ] **Step 2: Move viewport fields to the supported Next.js export**

Use this exact shape and remove the `viewport` member from `metadata`:

```tsx
import type { Metadata, Viewport } from 'next';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: '#F5F0EB',
};
```

- [ ] **Step 3: Verify focused behavior and metadata regressions**

```bash
cd frontend && npm run type-check && npm run build
cd ../e2e && npx playwright test tests/mobile/touch.spec.ts tests/mobile/viewport.spec.ts --grep 'X1:|V5:|V6:' --reporter=list
```

Expected: `3 passed`; TypeScript/build exit 0.

- [ ] **Step 4: Commit F5**

```bash
git add frontend/app/layout.tsx
git commit -m "fix(mobile): emit zoom-locked viewport metadata" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

### Task 3: A3 — expose the actual finished-game winner

**Greens:** W1. **Regression:** score-table calculations and V3/T6.

**Files:**
- Modify: `backend/app/schemas/score.py:36-44`
- Modify: `backend/app/api/games.py:52-136`
- Modify: `frontend/types/score.ts:28-35`
- Modify: `frontend/app/game/[gameId]/scores/page.tsx:19-94,136-258`

- [ ] **Step 1: Run the intentionally red W1 test**

Run: `cd e2e && npx playwright test tests/mobile/endgame.spec.ts --grep 'W1:' --reporter=list`

Expected: FAIL because `scores-winner` is an `sr-only` 1×1 element and the already-open score page does not observe the external `POST /end`.

- [ ] **Step 2: Extend the score-table contract without changing score math**

Add these fields to both Python and TypeScript response types:

```python
status: str = Field(description="Current game status")
winner_id: str | None = Field(default=None, description="Winner after the game finishes")
```

```ts
status:
  | 'waiting'
  | 'seating'
  | 'bidding_trump'
  | 'frisch'
  | 'bidding_contract'
  | 'playing'
  | 'round_complete'
  | 'finished';
winner_id: string | null;
```

Populate them in `get_score_table()`:

```python
status=game.status.value,
winner_id=str(game.winner_id) if game.winner_id else None,
```

- [ ] **Step 3: Make the score page observe completion and render a real banner**

Extract `fetchScoreTable` with `useCallback`, call it initially, and poll once per second only while `scoreData?.status !== 'finished'`. Clear the interval on unmount. After `handleEndGame`, set the returned `winner_id` locally and refresh instead of navigating away.

Render only the authoritative winner:

```tsx
const winner = scoreData.winner_id
  ? scoreData.players.find((player) => player.user_id === scoreData.winner_id)
  : null;

{scoreData.status === 'finished' && winner && (
  <section
    data-testid="scores-winner"
    data-seat={winner.seat_position}
    className="mx-4 my-6 min-h-24 border-4 border-foreground bg-ochre/20 p-6 text-center"
  >
    <p className="text-xs font-bold uppercase tracking-[0.15em]">Winner</p>
    <p className="mt-2 text-2xl font-bold">{winner.display_name}</p>
  </section>
)}
```

Remove the `sr-only` leader marker. A current leader is not a winner before `status === 'finished'`.

- [ ] **Step 4: Verify winner and score regressions**

```bash
cd backend
DATABASE_URL="postgresql+asyncpg://whist:whistpass123@localhost:5433/whist_db" REDIS_URL="redis://localhost:6379/0" JWT_SECRET_KEY="test-secret" python -m pytest tests/test_gameplay.py tests/test_scoring.py -v
cd ../frontend && npm run type-check && npm run build
cd ../e2e && npx playwright test tests/mobile/endgame.spec.ts tests/mobile/viewport.spec.ts tests/mobile/touch.spec.ts --grep 'W1:|V3:|T6:' --reporter=list
```

Expected: backend logic modules remain green; W1/V3/T6 pass; frontend checks exit 0.

- [ ] **Step 5: Commit A3**

```bash
git add backend/app/schemas/score.py backend/app/api/games.py frontend/types/score.ts frontend/app/game/'[gameId]'/scores/page.tsx
git commit -m "feat(scores): display the finished-game winner" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

### Task 4: F3 — auto-pass a disconnected active trump bidder after 30 seconds

**Greens:** R2. **Regression:** B4, trump auction, Frisch, last-bidder rule.

**Files:**
- Modify: `backend/app/websocket/game_events.py:281-526`
- Modify: `backend/app/websocket/server.py:101-182`
- Modify: `backend/app/main.py:42-64`
- Modify: `backend/tests/test_websocket.py`
- Modify: `e2e/tests/mobile/recovery.spec.ts:31-74`

- [ ] **Step 1: Add failing backend timer tests**

Add tests using fakeredis and an `AsyncMock` pass transition:

```python
@pytest.mark.asyncio
async def test_auto_passes_disconnected_current_bidder(redis) -> None:
    await redis.hset("room:ABC123:round", mapping={"phase": "trump_bidding", "current_bidder_id": "p1"})
    transition = AsyncMock(return_value=True)
    await auto_pass_after_disconnect(redis, "ABC123", "p1", transition, delay_seconds=0)
    transition.assert_awaited_once_with("ABC123", "p1")

@pytest.mark.asyncio
async def test_auto_pass_cancels_after_reconnect_or_turn_change(redis) -> None:
    await redis.hset("room:ABC123:round", mapping={"phase": "trump_bidding", "current_bidder_id": "p2"})
    transition = AsyncMock(return_value=True)
    await auto_pass_after_disconnect(redis, "ABC123", "p1", transition, delay_seconds=0)
    transition.assert_not_awaited()
```

Run: `cd backend && python -m pytest tests/test_websocket.py -k auto_pass -v`

Expected: FAIL because `auto_pass_after_disconnect` does not exist.

- [ ] **Step 2: Extract one authoritative trump-pass transition**

Move the state transition currently inside `handle_bid_pass` into a module-level coroutine in `game_events.py`:

```python
async def process_trump_pass(
    sio: socketio.AsyncServer,
    room_manager: RoomManager,
    bidding_service: BiddingService,
    room_code: str,
    user_id: str,
    player_name: str,
) -> bool:
    """Record one pass, resolve Frisch/trump completion, advance, and emit events."""
```

The body is exactly the existing lines 311-523, parameterised by `user_id`/`player_name`; it must retain all four branches: invalid player/turn, Frisch, three-pass trump selection, and normal next-bidder advance. `handle_bid_pass` validates the socket payload/context and then returns `{"success": await process_trump_pass(...)}`. This extraction prevents the timeout path from implementing a second auction algorithm.

- [ ] **Step 3: Add the server-owned timeout**

Create a task registry keyed by `(room_code, user_id)` and the exact recheck:

```python
AUTO_PASS_SECONDS = 30.0

async def auto_pass_after_disconnect(redis, room_code, user_id, transition, delay_seconds=AUTO_PASS_SECONDS):
    await asyncio.sleep(delay_seconds)
    round_data = await redis.hgetall(f"room:{room_code}:round")
    players = await redis.hgetall(f"room:{room_code}:players")
    connected = any(
        PlayerInfo.model_validate_json(raw).user_id == user_id
        and PlayerInfo.model_validate_json(raw).is_connected
        for raw in players.values()
    )
    if connected:
        return
    if round_data.get("phase") != "trump_bidding" or round_data.get("current_bidder_id") != user_id:
        return
    await transition(room_code, user_id)
```

In `disconnect`, schedule it only after `RoomManager.handle_disconnect()` marks the player disconnected. In `connect`/`room:join`, cancel and remove a pending task for that player. Create `BiddingService` before `register_socketio_handlers()` in `main.py` and inject it so the timeout calls `process_trump_pass` with the disconnected player's stored display name.

- [ ] **Step 4: Align R2's assertion window with the specified deadline**

Keep the required 30-second product delay and change only R2's poll timeout from `30_000` to `40_000`; the assertion still requires another player to receive bidding controls and cannot pass while the game remains blocked.

- [ ] **Step 5: Verify F3 and bidding regressions**

```bash
cd backend && python -m pytest tests/test_websocket.py tests/test_bidding.py -v && mypy app/ && ruff check app/
cd ../e2e && npx playwright test tests/mobile/recovery.spec.ts tests/mobile/lifecycle.spec.ts tests/bidding.spec.ts --grep 'R2:|B4:|trump auction|frisch|last-bidder' --reporter=list
```

Expected: focused backend tests pass; R2 advances after approximately 30 seconds; B4 still proves a brief background does not auto-pass; all auction regressions pass.

- [ ] **Step 6: Commit F3**

```bash
git add backend/app/websocket/game_events.py backend/app/websocket/server.py backend/app/main.py backend/tests/test_websocket.py e2e/tests/mobile/recovery.spec.ts
git commit -m "feat(bidding): auto-pass disconnected active bidders" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

## Priority 2 — real-play reliability

### Task 5: F2 — reconnect immediately on the browser `online` event

**Greens:** N1, S2, G1. **Regression:** B3, N5. Th2 is not an online-event failure; RB1 restores its lost room identity first.

**Files:**
- Modify: `frontend/lib/socket/manager.ts:45-164,314-324`

- [ ] **Step 1: Re-run the focused failures**

Run: `cd e2e && npx playwright test tests/mobile/network.spec.ts tests/mobile/lifecycle.spec.ts tests/mobile/touch.spec.ts --grep 'N1:|S2:|G1:' --reporter=list`

Expected: at least N1/S2 fail to reconnect inside their current condition windows per the status run.

- [ ] **Step 2: Add one lifecycle-safe online listener**

Add bound handlers to the singleton, install them once when a socket is created, and remove them in explicit `disconnect()`:

```ts
private readonly handleOnline = (): void => {
  if (this.socket && !this.socket.connected) this.socket.connect();
};

private installBrowserListeners(): void {
  window.removeEventListener('online', this.handleOnline);
  window.addEventListener('online', this.handleOnline);
}
```

On `connect`, call `useStore.getState().setSocketConnected(true)`; on `disconnect`, call `setSocketConnected(false)`. In `connect()`'s already-connected fast path, also call `setSocketConnected(true)` before returning the singleton so a route remount cannot leave the visible indicator stale. Do not clear `currentRoom` on a transient transport disconnect; explicit `leaveRoom()` and `disconnect()` remain the only paths that clear desired room membership.

- [ ] **Step 3: Verify reconnect behavior twice**

```bash
cd frontend && npm run type-check
cd ../e2e
npx playwright test tests/mobile/network.spec.ts tests/mobile/lifecycle.spec.ts tests/mobile/touch.spec.ts --grep 'N1:|N5:|S2:|B3:|G1:' --reporter=list
npx playwright test tests/mobile/network.spec.ts tests/mobile/lifecycle.spec.ts tests/mobile/touch.spec.ts --grep 'N1:|N5:|S2:|B3:|G1:' --reporter=list
```

Expected on each run: `5 passed`; G1's visible status is `Connected`, with no duplicate listeners or duplicate sockets.

- [ ] **Step 4: Commit F2**

```bash
git add frontend/lib/socket/manager.ts
git commit -m "fix(socket): reconnect immediately when network returns" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

### Task 5A: RB1 — relaunch-safe active-game bootstrap

**Greens:** P1, Th2. **Regression:** R1, R3, auth flows, and the Whister bootstrap identity guard.

The clean cascade rerun proved two distinct entry paths lose the active game: `/room/{roomCode}` rejoins successfully but never leaves the lobby, while a full `/game/{gameId}` reload restores auth but loses runtime-only `roomCode` before it can rejoin. Reuse authenticated `GET /api/v1/games/{gameId}/score-table`; it already verifies game membership and returns `room_code`. Do not persist live room/game state and do not add a backend endpoint.

**Files:**
- Modify: `e2e/tests/mobile/pwa.spec.ts:7-37,119-140`
- Modify: `frontend/lib/api/index.ts:1-45`
- Modify: `frontend/types/socket-events.ts:10,80-91`
- Modify: `frontend/hooks/use-room.ts:25-33,97-168`
- Modify: `frontend/app/room/[roomCode]/layout.tsx:23-94`
- Modify: `frontend/app/game/[gameId]/layout.tsx:28-128`
- Do not modify: `frontend/stores/middleware/persist.ts`, backend code, or `e2e/helpers/services.ts`

- [ ] **Step 1: Strengthen the two failing acceptance tests**

In P1, retain both identifiers:

```ts
const { roomCode, gameId } = await driver.createGame();
```

After the existing socket-connect assertion, require the authoritative active-room join to redirect:

```ts
await expect(newPage).toHaveURL(
  new RegExp(`/game/${gameId}$`),
  { timeout: 20_000 },
);
```

In Th2, retain `gameId` and observe the membership-checked bootstrap immediately before reload:

```ts
const bootstrapResponsePromise = page.waitForResponse(
  (response) =>
    response.request().method() === 'GET' &&
    response.url().endsWith(`/api/v1/games/${gameId}/score-table`),
);

await page.reload({ waitUntil: 'domcontentloaded' });

const bootstrapResponse = await bootstrapResponsePromise;
expect(bootstrapResponse.status()).toBe(200);
```

These are stronger recovery assertions, not relaxed expectations.

- [ ] **Step 2: Confirm the new assertions are red for the reproduced causes**

```bash
cd e2e
BASE_URL=http://localhost:3001 API_URL=http://localhost:8001/api \
npx playwright test tests/mobile/pwa.spec.ts --grep 'P1:' --reporter=list
BASE_URL=http://localhost:3001 API_URL=http://localhost:8001/api \
npx playwright test tests/mobile/pwa.spec.ts --grep 'Th2:' --reporter=list
```

Expected: P1 fails because the URL remains `/room/{roomCode}`; Th2 times out waiting for a score-table bootstrap request.

- [ ] **Step 3: Add the typed membership-checked bootstrap client**

Add to `frontend/lib/api/index.ts`:

```ts
export interface GameBootstrapPlayer {
  user_id: string;
  display_name: string;
  seat_position: number;
}

export interface GameBootstrapResponse {
  game_id: string;
  room_code: string;
  current_round: number;
  players: GameBootstrapPlayer[];
}

export const gamesApi = {
  getBootstrap(
    gameId: string,
    signal?: AbortSignal,
  ): Promise<GameBootstrapResponse> {
    return request(`/games/${gameId}/score-table`, {
      method: 'GET',
      signal,
    });
  },
};
```

The existing proxy converts the restored access-token cookie to a bearer header; the backend score-table handler returns 403 unless the authenticated user belongs to the game.

- [ ] **Step 4: Expose authoritative room-join completion**

Import `GameStatus` in `frontend/types/socket-events.ts` and change `RoomJoinedPayload.phase` from `string` to `GameStatus`.

Extend the room hook option:

```ts
export interface UseRoomOptions {
  roomCode?: string;
  onRoomJoined?: (payload: RoomJoinedPayload) => void;
}
```

Destructure `onRoomJoined` in `useRoom()`, invoke `onRoomJoined?.(payload)` after the existing `room:joined` handler completes all store updates, and add it to that callback's dependency list.

- [ ] **Step 5: Redirect authoritative active-room joins**

In `frontend/app/room/[roomCode]/layout.tsx`, route from the returned phase:

```ts
function joinedGamePath(payload: RoomJoinedPayload): string | null {
  switch (payload.phase) {
    case 'waiting':
      return null;
    case 'seating':
      return `/game/${payload.game_id}/seating`;
    case 'round_complete':
    case 'finished':
      return `/game/${payload.game_id}/scores`;
    default:
      return `/game/${payload.game_id}`;
  }
}
```

Create a stable `handleRoomJoined` callback and pass it to `RoomLayoutClient`:

```ts
const handleRoomJoined = React.useCallback(
  (payload: RoomJoinedPayload) => {
    const destination = joinedGamePath(payload);
    if (destination) router.replace(destination);
  },
  [router],
);
```

Call `useRoom({ roomCode: roomCode ?? undefined, onRoomJoined })`. Use `replace` so Back cannot return to a stale active lobby; keep the existing `room:game_starting` handler for new starts.

- [ ] **Step 6: Bootstrap direct game-route reloads before joining**

In `frontend/app/game/[gameId]/layout.tsx`, import `gamesApi`, select `isHydrated`, and add `bootstrapError` state. Before the current join effects, add:

```ts
React.useEffect(() => {
  if (!gameId || roomCode || !isHydrated) return;

  const controller = new AbortController();
  setBootstrapError(null);

  gamesApi
    .getBootstrap(gameId, controller.signal)
    .then((bootstrap) => {
      if (controller.signal.aborted) return;
      const store = useStore.getState();
      if (store.roomCode) return;

      store.setRoomData({
        roomCode: bootstrap.room_code,
        roomId: bootstrap.game_id,
        isAdmin: false,
        players: bootstrap.players.map((player) => ({
          userId: player.user_id,
          displayName: player.display_name,
          seatPosition: player.seat_position,
          isConnected: true,
          isAdmin: false,
        })),
      });
    })
    .catch((error: unknown) => {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setBootstrapError(
        error instanceof Error ? error.message : 'Unable to restore this game',
      );
    });

  return () => controller.abort();
}, [gameId, roomCode, isHydrated]);
```

Gate children until room identity is recovered, rendering a centered `data-testid="game-bootstrap-error"` message only when the authenticated bootstrap fails. Once `setRoomData` supplies `roomCode`, the existing join effect runs; `room:joined` replaces provisional REST players with authoritative live state.

- [ ] **Step 7: Verify both recovery paths twice**

```bash
cd frontend && npm run type-check
cd ../e2e
for run in 1 2; do
  BASE_URL=http://localhost:3001 API_URL=http://localhost:8001/api npx playwright test tests/mobile/pwa.spec.ts --grep 'P1:' --reporter=list
  BASE_URL=http://localhost:3001 API_URL=http://localhost:8001/api npx playwright test tests/mobile/pwa.spec.ts --grep 'Th2:' --reporter=list
done
```

Expected for each run: P1 `1 passed`; Th2 `1 passed`; the 3G reload bootstrap response is 200.

- [ ] **Step 8: Verify identity, auth, and relaunch regressions**

```bash
cd e2e
BASE_URL=http://localhost:3001 API_URL=http://localhost:8001/api npx playwright test \
  tests/bootstrap.spec.ts tests/auth.spec.ts tests/mobile/recovery.spec.ts tests/mobile/pwa.spec.ts \
  --grep 'bootstrap|authenticated|unauthenticated|R1:|R3:|P1:|Th2:' --reporter=list
```

Expected: `12 passed`; there are no requests to ports 8000/5432 and no Cookoo service reuse.

- [ ] **Step 9: Commit RB1 independently**

```bash
git add e2e/tests/mobile/pwa.spec.ts frontend/lib/api/index.ts frontend/types/socket-events.ts \
  frontend/hooks/use-room.ts 'frontend/app/room/[roomCode]/layout.tsx' \
  'frontend/app/game/[gameId]/layout.tsx'
git commit -m "fix(frontend): restore active games after relaunch" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

### Task 6: F1+F6 — rejoin and apply authoritative state on reconnect/foreground

**Greens:** S3; supports N1 and N5. **Regression:** B1-B4, S1, room membership security.

**Files:**
- Modify: `backend/app/websocket/schemas.py:78-82,142-151,480-534`
- Modify: `backend/app/websocket/server.py:184-403`
- Modify: `backend/tests/test_websocket.py`
- Modify: `frontend/lib/socket/manager.ts`
- Modify: `frontend/hooks/use-game.ts:54-130`
- Modify: `frontend/app/game/[gameId]/page.tsx:71-80`
- Modify: `frontend/types/socket-events.ts:269-279,295-384`

- [ ] **Step 1: Add a failing backend snapshot test**

Seed room, round, contracts, and tricks hashes, invoke the registered `sync:request` handler as a room member, and assert the socket-only `sync:state` payload:

```python
assert payload["room_code"] == "ABC123"
assert payload["phase"] == "playing"
assert payload["current_bidder"] is None
assert payload["additional_data"]["total_tricks_played"] == 2
assert payload["additional_data"]["tricks"] == {"p0": 2}
assert payload["additional_data"]["contracts"] == {"p0": 5, "p1": 3}
```

Run: `cd backend && python -m pytest tests/test_websocket.py -k sync_state -v`

Expected: FAIL because no `ClientEvents.SYNC_REQUEST` handler is registered.

- [ ] **Step 2: Implement the existing sync protocol server-side**

Change `SyncStatePayload.phase` from the mismatched room-level `GamePhase` enum to
`Literal["trump_bidding", "frisch", "contract_bidding", "playing", "complete"]`, matching the
round hash and the frontend `RoundPhase` union. Register `@sio.on(ClientEvents.SYNC_REQUEST)` in
`server.py`. Parse `SyncRequestPayload`, require an authenticated context whose `current_room`
matches the requested room, then read:

```python
round_data = await room_manager.get_room_round_state(room_code)
players = await room_manager._get_room_players(room_code)
contracts = await room_manager.redis.hgetall(f"room:{room_code}:contracts")
tricks = await room_manager.redis.hgetall(f"room:{room_code}:tricks")
```

Emit `ServerEvents.SYNC_STATE` only to `sid` with `additional_data` containing normalised integer `contracts`, `tricks`, `total_tricks_played`, `trump_suit`, `trump_winner_id`, `trump_winning_bid`, `game_type`, and `minimum_bid`. Reuse `SyncStatePayload`; do not broadcast private recovery traffic.

- [ ] **Step 3: Rejoin before requesting sync**

Store `currentDisplayName` alongside `currentRoom`. On Socket.IO `connect`, if both values exist, emit `room:join`; after the matching `room:joined` response, emit:

```ts
this.socket.emit('sync:request', { room_code: this.currentRoom });
```

Expose `requestSync(): void` on the manager. It emits only when the socket is connected and `currentRoom` is non-null. The game page calls it on `visibilitychange` when `document.visibilityState === 'visible'`.

- [ ] **Step 4: Apply snapshots atomically in `useGame`**

Subscribe to `sync:state` and update one Zustand snapshot:

```ts
const tricks = payload.additional_data.tricks as Record<string, number>;
setGameState({
  currentRound: payload.current_round ?? 1,
  totalTricksPlayed: Number(payload.additional_data.total_tricks_played ?? 0),
  playerTricks: tricks,
});
setPhase(payload.phase);
if (payload.current_bidder) setCurrentTurn(payload.current_bidder);
```

Also map authoritative players and contracts through existing `setRoomData`/`setContracts`. Add typed fields for `additional_data` rather than using `any`.

- [ ] **Step 5: Verify state recovery and security regressions**

```bash
cd backend && python -m pytest tests/test_websocket.py -k 'sync_state or room_manager' -v && mypy app/ && ruff check app/
cd ../frontend && npm run type-check
cd ../e2e && npx playwright test tests/mobile/lifecycle.spec.ts tests/mobile/network.spec.ts --grep 'S3:|B1:|B2:|B3:|B4:|S1:|N1:|N5:' --reporter=list
```

Expected: backend focused tests pass; all eight mobile tests pass; S3 observes P0's missed trick count as 2 after P3 reconnects.

- [ ] **Step 6: Commit F1+F6**

```bash
git add backend/app/websocket/schemas.py backend/app/websocket/server.py backend/tests/test_websocket.py frontend/lib/socket/manager.ts frontend/hooks/use-game.ts frontend/app/game/'[gameId]'/page.tsx frontend/types/socket-events.ts
git commit -m "fix(socket): resync game state after reconnect and foreground" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

### Task 7: N2 — make a buffered pass idempotent

**Greens:** N2. **Regression:** trump auction and Frisch.

**Files:**
- Modify: `backend/app/websocket/schemas.py:266-270`
- Modify: `backend/app/services/bidding_service.py:222-279`
- Modify: `backend/app/websocket/game_events.py:281-330`
- Modify: `backend/app/websocket/server.py` (F3 auto-pass caller)
- Modify: `backend/tests/test_bidding.py`
- Modify: `frontend/types/socket-events.ts:321-324`
- Modify: `frontend/hooks/use-bidding.ts:53-58`

- [ ] **Step 1: Add a failing service idempotency test**

```python
@pytest.mark.asyncio
async def test_pass_trump_bid_is_idempotent_by_request_id(redis) -> None:
    await redis.hset("room:ABC123:round", mapping={"current_bidder_id": "p0", "consecutive_passes": "0"})
    service = BiddingService(redis)
    assert await service.pass_trump_bid("ABC123", "p0", "P0", request_id="pass-1") == (True, None, False)
    assert await service.pass_trump_bid("ABC123", "p0", "P0", request_id="pass-1") == (True, None, True)
    assert await redis.llen("room:ABC123:bid_history") == 1
    assert await redis.hget("room:ABC123:round", "consecutive_passes") == "1"
```

Run: `cd backend && python -m pytest tests/test_bidding.py -k idempotent -v`

Expected: FAIL because `request_id` is not accepted and duplicate requests are not recognised.

- [ ] **Step 2: Add the request ID and Redis dedupe key**

Add `request_id: str = Field(min_length=1, max_length=64)` to `BidPassPayload` and the TypeScript event. Generate one ID per tap with `crypto.randomUUID()` and reuse that ID for the buffered emission.

Change the service return to `tuple[bool, str | None, bool]`, where the third value is
`is_duplicate`. Check the dedupe key first so an acknowledged retry remains successful even after
the turn advanced; for a new request ID, retain the current-bidder validation. Claim with:

```python
dedupe_key = f"room:{room_code}:action:bid_pass:{request_id}"
if not await self.redis.set(dedupe_key, "processing", ex=300, nx=True):
    return True, None, True
```

Delete the key if the transition raises or returns a domain failure; set it to `"complete"` after
history/pass-count writes. Return `(True, None, False)` for the first accepted pass.
`process_trump_pass` returns success immediately when `is_duplicate` is true, before mutating the
passed-player set, choosing another bidder, or emitting events. Pass `payload.request_id` through
that helper. Extend the F3 timer's call with `request_id=f"auto-{uuid4()}"` so server-generated
passes use the same service interface. A retry with the same ID succeeds without a second history
row or second advance; a new ID from a stale player still fails the existing turn check.

- [ ] **Step 3: Verify N2 and auction regressions**

```bash
cd backend && python -m pytest tests/test_bidding.py -v && mypy app/services/bidding_service.py app/websocket/ && ruff check app/services/bidding_service.py app/websocket/
cd ../frontend && npm run type-check
cd ../e2e && npx playwright test tests/mobile/network.spec.ts tests/bidding.spec.ts --grep 'N2:|trump auction|frisch' --reporter=list
```

Expected: N2 advances exactly once; bidding unit and e2e tests pass.

- [ ] **Step 4: Commit N2**

```bash
git add backend/app/websocket/schemas.py backend/app/services/bidding_service.py backend/app/websocket/game_events.py backend/app/websocket/server.py backend/tests/test_bidding.py frontend/types/socket-events.ts frontend/hooks/use-bidding.ts
git commit -m "fix(bidding): deduplicate buffered pass actions" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

### Task 8: A6 — render fetch and game errors as fixed-position toasts

**Greens:** N3.

**Files:**
- Create: `frontend/components/shared/toast-host.tsx`
- Modify: `frontend/components/ui/toast.tsx:208-217`
- Modify: `frontend/app/layout.tsx:41-45`
- Modify: `frontend/app/game/[gameId]/page.tsx:25,128-153,197-200`
- Modify: `frontend/app/game/[gameId]/scores/page.tsx:25-94,123-132,230-235`
- Modify: `e2e/tests/mobile/network.spec.ts:73-104`

- [ ] **Step 1: Run N3 to prove the current inline paragraph is insufficient**

Run: `cd e2e && npx playwright test tests/mobile/network.spec.ts --grep 'N3:' --reporter=list`

Expected: FAIL because no visible fixed error toast appears when score-table fetch is aborted.

- [ ] **Step 2: Mount the existing toast primitives and queue**

Export `ToastProvider = ToastPrimitive.Provider` from `components/ui/toast.tsx`. Create `ToastHost` that selects `toasts`/`dismissToast`, maps each message to `Toast`, renders title/description/close, and applies `data-testid="error-toast"` only to error items:

```tsx
<ToastProvider swipeDirection="right">
  {toasts.map((message) => (
    <Toast
      key={message.id}
      type={message.type}
      open
      onOpenChange={(open) => { if (!open) dismissToast(message.id); }}
      data-testid={message.type === 'error' ? 'error-toast' : undefined}
    >
      <ToastTitle>{message.title}</ToastTitle>
      {message.description && <ToastDescription>{message.description}</ToastDescription>}
      <ToastClose aria-label="Dismiss notification" />
    </Toast>
  ))}
  <ToastViewport />
</ToastProvider>
```

Mount `<ToastHost />` once in the root layout.

- [ ] **Step 3: Replace inline-only error writes**

In both game pages, call:

```ts
showToast({ type: 'error', title: message, duration: 5_000 });
```

The score page must invoke this in initial score-table fetch, next-round, and end-game catches. Keep the full-page initial-fetch recovery button, but remove duplicate inline action-area paragraphs. The game page may retain `error` only where a child component requires it; the fixed toast is the user-visible notification.

Because N3 deliberately aborts the score-table request, `GameDriver.playRound()` cannot satisfy its
normal `scores-new-round` wait. In N3 only, start `playRound()` and wait directly for
`error-toast`; reject the play promise only if the toast never appears. Keep the final
`expect(anyError).toBe(true)` assertion. This aligns the test driver with the fault being injected;
it does not permit a silent failure.

- [ ] **Step 4: Verify N3 and frontend checks**

```bash
cd frontend && npm run type-check && npm run build
cd ../e2e && npx playwright test tests/mobile/network.spec.ts --grep 'N3:' --reporter=list
```

Expected: N3 passes with a visible `error-toast`; build/type-check exit 0.

- [ ] **Step 5: Commit A6**

```bash
git add frontend/components/shared/toast-host.tsx frontend/components/ui/toast.tsx frontend/app/layout.tsx frontend/app/game/'[gameId]'/page.tsx frontend/app/game/'[gameId]'/scores/page.tsx e2e/tests/mobile/network.spec.ts
git commit -m "feat(ui): surface game failures in accessible toasts" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

### Task 9: A1 — guard Claim Trick until its acknowledgement returns

**Greens:** T4. **Regression:** S1 and scoring/full-round flows.

**Files:**
- Modify: `frontend/app/game/[gameId]/page.tsx:25-26,137-144,246-250`

- [ ] **Step 1: Run the confirmed double-tap test**

Run: `cd e2e && npx playwright test tests/mobile/touch.spec.ts --grep 'T4:' --reporter=list`

Expected: FAIL with trick count 2.

- [ ] **Step 2: Use the existing Socket.IO acknowledgement as the guard boundary**

```tsx
const [isLoading, setIsLoading] = useState(false);

const handleClaimTrick = useCallback(async () => {
  if (isLoading) return;
  setError(null);
  setIsLoading(true);
  try {
    await claimTrick();
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to claim trick';
    setError(message);
    showToast({ type: 'error', title: message });
  } finally {
    setIsLoading(false);
  }
}, [claimTrick, isLoading, showToast]);
```

Do not use a timer: `useGame.claimTrick()` already resolves from the backend acknowledgement.

- [ ] **Step 3: Verify rapid tap and game-loop regressions**

```bash
cd frontend && npm run type-check
cd ../e2e && npx playwright test tests/mobile/touch.spec.ts tests/mobile/lifecycle.spec.ts tests/smoke.spec.ts --grep 'T4:|S1:|playability' --reporter=list
```

Expected: T4 reads exactly 1; S1 and the full UI round pass.

- [ ] **Step 4: Commit A1**

```bash
git add frontend/app/game/'[gameId]'/page.tsx
git commit -m "fix(game): guard trick claims until acknowledged" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

## Priority 3 — polish and test hygiene

### Task 10: K3 — disable correction on room codes

**Greens:** K3. **Regression:** K1, K2, X3.

**Files:**
- Modify: `frontend/components/room/join-room-form.tsx:71-78`

- [ ] **Step 1: Run K3**

Run: `cd e2e && npx playwright test tests/mobile/touch.spec.ts --grep 'K3:' --reporter=list`

Expected: FAIL because `autocorrect` is null.

- [ ] **Step 2: Add exact mobile code-field attributes**

```tsx
autoCorrect="off"
autoCapitalize="characters"
autoComplete="off"
spellCheck={false}
inputMode="text"
```

- [ ] **Step 3: Verify form regressions and commit**

```bash
cd frontend && npm run type-check
cd ../e2e && npx playwright test tests/mobile/touch.spec.ts --grep 'K1:|K2:|K3:|X3:' --reporter=list
git add ../frontend/components/room/join-room-form.tsx
git commit -m "fix(join): prevent mobile correction of room codes" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

Expected: `4 passed`; commit contains only the join form.

### Task 11: P2+P3 — provide valid PWA icons and an active service worker

**Greens:** P2, P3. **Regression:** bootstrap frontend identity and P1.

**Files:**
- Create: `frontend/scripts/generate-pwa-icons.mjs`
- Create: `frontend/public/icon-192.png`
- Create: `frontend/public/icon-512.png`
- Create: `frontend/public/sw.js`
- Create: `frontend/components/shared/service-worker-register.tsx`
- Modify: `frontend/public/manifest.json`
- Modify: `frontend/app/layout.tsx`
- Modify: `e2e/tests/mobile/pwa.spec.ts:73-95`

- [ ] **Step 1: Confirm the two independent failures**

Run: `cd e2e && npx playwright test tests/mobile/pwa.spec.ts --grep 'P2:|P3:' --reporter=list`

Expected: P2 fails because `/icon-192.png` and `/icon-512.png` return 404; P3 reports zero active registrations/controllers.

- [ ] **Step 2: Generate correctly dimensioned PNGs reproducibly**

Create this dependency-free Node script using `node:zlib`; it generates RGBA canvases with Whister background `#F5F0EB`, a centered black `W`, and exact IHDR sizes:

```js
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const name = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  const checksum = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  checksum.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, checksum]);
}

function distanceToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function createIcon(size) {
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  const segments = [
    [0.2, 0.25, 0.34, 0.75],
    [0.34, 0.75, 0.5, 0.48],
    [0.5, 0.48, 0.66, 0.75],
    [0.66, 0.75, 0.8, 0.25],
  ];
  for (let y = 0; y < size; y += 1) {
    const row = y * (stride + 1);
    raw[row] = 0;
    for (let x = 0; x < size; x += 1) {
      const nx = (x + 0.5) / size;
      const ny = (y + 0.5) / size;
      const black = segments.some(([ax, ay, bx, by]) =>
        distanceToSegment(nx, ny, ax, ay, bx, by) < 0.045,
      );
      const offset = row + 1 + x * 4;
      raw[offset] = black ? 10 : 245;
      raw[offset + 1] = black ? 10 : 240;
      raw[offset + 2] = black ? 10 : 235;
      raw[offset + 3] = 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr.set([8, 6, 0, 0, 0], 8);
  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

for (const size of [192, 512]) {
  writeFileSync(new URL(`../public/icon-${size}.png`, import.meta.url), createIcon(size));
}
```

Run:

```bash
cd frontend
node scripts/generate-pwa-icons.mjs
file public/icon-192.png public/icon-512.png
```

Expected: `file` reports `PNG image data, 192 x 192` and `PNG image data, 512 x 512`. Keep the script committed so the assets are reproducible.

- [ ] **Step 3: Add a conservative service worker**

Use this conservative `public/sw.js`; it does not cache API or Socket.IO traffic:

```js
const CACHE_NAME = 'whister-shell-v1';
const SHELL = ['/', '/manifest.json', '/icon-192.png', '/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(
        names
          .filter((name) => name.startsWith('whister-') && name !== CACHE_NAME)
          .map((name) => caches.delete(name)),
      ))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/ws/')) return;

  if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icon-')) {
    event.respondWith(
      caches.match(event.request).then((cached) => cached ?? fetch(event.request).then((response) => {
        const copy = response.clone();
        void caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      })),
    );
    return;
  }

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(async () => (await caches.match('/')) ?? Response.error()),
    );
  }
});
```

Create a client component:

```tsx
'use client';

import { useEffect } from 'react';

export function ServiceWorkerRegister() {
  useEffect(() => {
    if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
      void navigator.serviceWorker.register('/sw.js', { scope: '/' });
    }
  }, []);
  return null;
}
```

Mount it once in `RootLayout`. Keep manifest `name`, `short_name`, `start_url: "/"`, `display: "standalone"`, and both PNG declarations with `purpose: "any maskable"`.

- [ ] **Step 4: Make P3 await asynchronous activation rather than sampling immediately**

Replace the one-shot `page.evaluate` with `expect.poll` that awaits `navigator.serviceWorker.ready` and then checks `navigator.serviceWorker.controller !== null`; reload once if the first install has not yet claimed the page. This does not relax the requirement: the final assertion still requires active control.

- [ ] **Step 5: Verify PWA and identity regressions**

```bash
cd frontend && npm run type-check && npm run build
cd ../e2e && npx playwright test tests/bootstrap.spec.ts tests/mobile/pwa.spec.ts --grep 'frontend manifest|^P1:|^P2:|^P3:' --reporter=list
```

Expected: bootstrap identity plus P1/P2/P3 pass; frontend checks exit 0.

- [ ] **Step 6: Commit P2+P3**

```bash
git add frontend/scripts/generate-pwa-icons.mjs frontend/public/icon-192.png frontend/public/icon-512.png frontend/public/sw.js frontend/public/manifest.json frontend/components/shared/service-worker-register.tsx frontend/app/layout.tsx e2e/tests/mobile/pwa.spec.ts
git commit -m "feat(pwa): add install icons and service worker" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

### Task 12: O1/O2 — resync on rotation and keep scores scrollable in landscape

**Greens:** O1, O2. O3/O4 are included only as regression checks unless Task 1 independently confirms them red.

**Files:**
- Modify: `frontend/app/game/[gameId]/layout.tsx:50-86`
- Modify: `frontend/app/game/[gameId]/page.tsx:177-294`
- Modify: `frontend/app/game/[gameId]/scores/page.tsx:115-258`
- Modify: `frontend/app/globals.css:52-65`

- [ ] **Step 1: Reproduce each confirmed orientation failure in isolation after F1+F6**

```bash
cd e2e
npx playwright test tests/mobile/orientation.spec.ts --grep 'O1:' --reporter=list --trace=on
npx playwright test tests/mobile/orientation.spec.ts --grep 'O2:' --reporter=list --trace=on
```

Expected before this task: O1 loses bidding controls after viewport rotation; O2 cannot reach the score row/cell in landscape. If F1+F6 already makes O1 green, retain it as a regression and do not add duplicate socket logic.

- [ ] **Step 2: Request state once after an actual orientation change**

In `GameLayout`, register one `orientationchange` listener plus a `resize` fallback debounced by `requestAnimationFrame`; call `socketManager.requestSync()` without disconnecting or rejoining. Cleanup both listeners and the pending animation frame on unmount. This keeps the layout mounted and repairs only stale state.

```tsx
React.useEffect(() => {
  let frame: number | null = null;
  const queueSync = () => {
    if (frame !== null) cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      frame = null;
      socketManager.requestSync();
    });
  };
  window.addEventListener('orientationchange', queueSync);
  window.addEventListener('resize', queueSync);
  return () => {
    window.removeEventListener('orientationchange', queueSync);
    window.removeEventListener('resize', queueSync);
    if (frame !== null) cancelAnimationFrame(frame);
  };
}, []);
```

- [ ] **Step 3: Use dynamic viewport height and explicit landscape scroll ownership**

Change game and score roots from `min-h-screen` to `min-h-dvh`. Give the score root `h-dvh overflow-y-auto overscroll-contain pb-safe-bottom`, keep the table wrapper `max-w-full overflow-x-auto`, and keep action buttons in normal document flow. Add:

```css
html,
body,
#root {
  min-height: 100%;
  min-height: 100dvh;
}
```

Do not hide or reposition bidding/score controls through orientation-specific conditional rendering.

- [ ] **Step 4: Verify all four orientation scenarios and mobile clipping**

```bash
cd frontend && npm run type-check && npm run build
cd ../e2e && npx playwright test tests/mobile/orientation.spec.ts tests/mobile/viewport.spec.ts --grep 'O1:|O2:|O3:|O4:|V3:|V4:|V6:' --reporter=list
```

Expected: `7 passed`; score rows/cells remain reachable; controls stay inside both phone viewports.

- [ ] **Step 5: Commit O1/O2**

```bash
git add frontend/app/game/'[gameId]'/layout.tsx frontend/app/game/'[gameId]'/page.tsx frontend/app/game/'[gameId]'/scores/page.tsx frontend/app/globals.css
git commit -m "fix(mobile): preserve game state and scrolling on rotation" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

### Task 13: N4 — reduce phase-route payload and stop the worker cascade

**Greens:** N4. **Enables clean full-suite results.** No timeout increase is allowed.

**Files:**
- Modify: `frontend/app/game/[gameId]/page.tsx:3-16,68-80`
- Modify: `frontend/components/game/trick-claim-button.tsx`
- Modify: `frontend/components/shared/connection-status.tsx`
- Modify: `frontend/components/shared/loading-spinner.tsx`

- [ ] **Step 1: Capture a production baseline**

```bash
cd frontend
rm -rf .next
npm run build
find .next/static/chunks -type f -name '*.js' -printf '%s %p\n' | sort -nr | head -20
cd ../e2e
npx playwright test tests/mobile/network.spec.ts --grep 'N4:' --reporter=list --trace=on
```

Expected: N4 exceeds its existing 180-second limit or fails an inner 90-second action; trace identifies late JavaScript chunks on the game→scores path. Record exact baseline bytes in the commit message.

- [ ] **Step 2: Remove animation-library cost from critical status/action atoms**

Replace `motion.button`, `motion.div`, and animated loading wrappers in `TrickClaimButton`, `ConnectionStatus`, and `LoadingSpinner` with semantic HTML and Tailwind/CSS `active:scale-*`, `animate-spin`, and `animate-pulse`. Preserve all test IDs, disabled behavior, vibration, and accessible labels.

- [ ] **Step 3: Split phase-only panels and prefetch the next route**

Use `next/dynamic` for `ContractBiddingPanel`, `AdminControls`, and `RoundSummaryModal`, each with a small existing `LoadingSpinner` fallback. Keep `TrumpBiddingPanel` eager because it is the first interactive phase. On game-page mount, call:

```tsx
import dynamic from 'next/dynamic';
import { LoadingSpinner } from '@/components/shared/loading-spinner';

const ContractBiddingPanel = dynamic(
  () => import('@/components/bidding/contract-bidding-panel')
    .then((module) => module.ContractBiddingPanel),
  { loading: () => <LoadingSpinner size="sm" /> },
);
const AdminControls = dynamic(
  () => import('@/components/game/admin-controls').then((module) => module.AdminControls),
  { loading: () => <LoadingSpinner size="sm" /> },
);
const RoundSummaryModal = dynamic(
  () => import('@/components/game/round-summary-modal').then((module) => module.RoundSummaryModal),
  { loading: () => <LoadingSpinner size="sm" /> },
);
```

On game-page mount, call:

```tsx
React.useEffect(() => {
  router.prefetch(`/game/${gameId}/scores`);
}, [gameId, router]);
```

Do not move socket hooks into dynamically loaded components; subscriptions remain mounted in the page.

- [ ] **Step 4: Prove improvement and stability without relaxing N4**

```bash
cd frontend
rm -rf .next
npm run type-check && npm run build
find .next/static/chunks -type f -name '*.js' -printf '%s %p\n' | sort -nr | head -20
cd ../e2e
npx playwright test tests/mobile/network.spec.ts --grep 'N4:' --reporter=list
npx playwright test tests/mobile/network.spec.ts --grep 'N4:' --reporter=list
```

Expected: production game-route critical chunks are smaller than the recorded baseline and N4 passes twice with its existing `180_000`/`90_000` limits.

- [ ] **Step 5: Run a fresh post-N4 mobile process**

Run: `cd e2e && npx playwright test tests/mobile --reporter=list`

Expected: no Chromium launch timeout and no repeated 15-second `confirmSeating` cascade. Any newly isolated real failure follows Task 1's planning checkpoint; it is not patched speculatively inside N4.

- [ ] **Step 6: Commit N4**

```bash
git add frontend/app/game/'[gameId]'/page.tsx frontend/components/game/trick-claim-button.tsx frontend/components/shared/connection-status.tsx frontend/components/shared/loading-spinner.tsx
git commit -m "perf(game): reduce mobile phase-route JavaScript" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

### Task 14: Backend test update — numeric error-code assertions

**Greens:** 11 stale-code tests in `test_auth.py`, `test_rooms.py`, and `test_users.py`.

**Files:**
- Modify: `backend/tests/test_auth.py:54,83,143,170,275`
- Modify: `backend/tests/test_rooms.py:226,388,439,496`
- Modify: `backend/tests/test_users.py:148,287`

- [ ] **Step 1: Confirm application mappings before touching tests**

Run: `cd backend && sed -n '7,58p' app/schemas/errors.py`

Expected: enum values are `AUTH_1001`, `AUTH_1007`, `AUTH_1008`, `AUTHZ_2001`, `ROOM_4002`, and `ROOM_4004`. Exception classes use those enum members. This confirms application behavior is intended and only assertions are stale.

- [ ] **Step 2: Run the 11 tests RED**

```bash
cd backend
DATABASE_URL="postgresql+asyncpg://whist:whistpass123@localhost:5433/whist_db" REDIS_URL="redis://localhost:6379/0" JWT_SECRET_KEY="test-secret" python -m pytest tests/test_auth.py tests/test_rooms.py tests/test_users.py -v
```

Expected: the named stale assertions fail with numeric values shown in the status specification.

- [ ] **Step 3: Correct the assertions exactly**

Use this mapping and change no status code or test setup:

```text
USER_ALREADY_EXISTS -> AUTH_1007
EMAIL_ALREADY_EXISTS -> AUTH_1008
INVALID_CREDENTIALS -> AUTH_1001
ROOM_FULL -> ROOM_4002
ROOM_NOT_ENOUGH_PLAYERS -> ROOM_4004
FORBIDDEN -> AUTHZ_2001
```

- [ ] **Step 4: Verify and commit**

```bash
cd backend
DATABASE_URL="postgresql+asyncpg://whist:whistpass123@localhost:5433/whist_db" REDIS_URL="redis://localhost:6379/0" JWT_SECRET_KEY="test-secret" python -m pytest tests/test_auth.py tests/test_rooms.py tests/test_users.py -v
git add tests/test_auth.py tests/test_rooms.py tests/test_users.py
git commit -m "test(api): assert canonical numeric error codes" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

Expected: the 11 stale-code failures are green; no assertions are removed.

### Task 15: Backend test update — authenticate protected profile/stat requests

**Greens:** `test_get_user_success`, `test_get_user_not_found`, `test_get_user_stats_success`, `test_get_user_stats_not_found`, `test_get_user_stats_public`, `test_get_user_public`.

**Files:**
- Modify: `backend/tests/test_users.py:7-42,151-187,329-370`

- [ ] **Step 1: Confirm the security intent**

Inspect `backend/app/api/users.py:28-31,107-111` and `backend/app/dependencies/auth.py`. Expected: both routes inject `CurrentUser`, so unauthenticated reads are intentionally rejected before lookup. Do not remove that dependency even though older AGENTS text calls the fields public.

- [ ] **Step 2: Correct each request setup**

For success tests, capture the token from the existing registration and send:

```python
access_token = reg_response.json()["tokens"]["access_token"]
headers = {"Authorization": f"Bearer {access_token}"}
response = await client.get(f"/api/v1/users/{user_id}", headers=headers)
```

For not-found tests, first register an authenticated caller, then query the all-zero UUID with the same header and assert:

```python
assert response.status_code == 404
assert response.json()["error"] == "AUTH_1005"
```

Rename `test_get_user_stats_public` to `test_get_user_stats_authenticated` and `test_get_user_public` to `test_get_user_authenticated`; their assertions remain otherwise unchanged.

- [ ] **Step 3: Verify the six tests and unauthorized guard**

```bash
cd backend
DATABASE_URL="postgresql+asyncpg://whist:whistpass123@localhost:5433/whist_db" REDIS_URL="redis://localhost:6379/0" JWT_SECRET_KEY="test-secret" python -m pytest tests/test_users.py -v
```

Expected: all user tests pass, including existing unauthorized/forbidden cases; protected routes still return 403 without credentials.

- [ ] **Step 4: Commit protected-profile test updates**

```bash
git add backend/tests/test_users.py
git commit -m "test(users): authenticate protected profile reads" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

### Task 16: Backend test update — use the current RedisManager API

**Greens:** `test_room_manager_initialization`, `test_websocket_server_creation`.

**Files:**
- Modify: `backend/tests/test_websocket.py:173-203`

- [ ] **Step 1: Confirm the production API**

Inspect `backend/app/core/redis.py:24-29`. Expected: `RedisManager.client` is the guarded public property; there is no `redis` attribute. This is an API rename, not an application defect.

- [ ] **Step 2: Correct both stale accesses**

```python
manager = RoomManager(redis_manager.client, None)  # type: ignore[arg-type]
```

```python
sio = create_socketio_server(redis_manager.client)
```

- [ ] **Step 3: Verify and commit**

```bash
cd backend
DATABASE_URL="postgresql+asyncpg://whist:whistpass123@localhost:5433/whist_db" REDIS_URL="redis://localhost:6379/0" JWT_SECRET_KEY="test-secret" python -m pytest tests/test_websocket.py -v
git add tests/test_websocket.py
git commit -m "test(websocket): use RedisManager client property" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

Expected: both stale API tests pass along with new F3/F1+F6 websocket tests.

### Task 17: Non-mobile e2e — keep distinct coverage and fix lobby readiness

**Greens:** all 15 desktop game-flow failures. **Preserves:** 8 passing auth/bootstrap checks.

**Files:**
- Modify: `e2e/driver/game-driver.ts:24-55`
- Modify: `e2e/README.md:24-41`

- [ ] **Step 1: Reproduce one desktop failure and one mobile control**

```bash
cd e2e
npx playwright test tests/bidding.spec.ts --grep 'trump auction' --reporter=list --trace=on
npx playwright test tests/mobile/viewport.spec.ts --grep 'V1:' --reporter=list
```

Expected: desktop trace shows Admin `Disconnected` before start controls become enabled; V1 passes with the device profile.

- [ ] **Step 2: Add a condition-based socket barrier to `GameDriver`**

Add:

```ts
private async waitForConnected(page: Page): Promise<void> {
  await page.getByTestId('connection-status').filter({ hasText: 'Connected' })
    .waitFor({ state: 'visible', timeout: 20_000 });
}
```

In `createGame()`, call it after P0 creates the room and after every player joins. Replace `waitForPlayers(4)`'s visibility-only contract by waiting for `lobby-start-game` to be enabled:

```ts
await this.pages[0].getByTestId('lobby-start-game').waitFor({ state: 'visible' });
await expect(this.pages[0].getByTestId('lobby-start-game')).toBeEnabled({ timeout: 20_000 });
```

Import `expect` from Playwright. Do not add sleeps, retries, or a mobile descriptor to `setup()`; the desktop suite must remain a desktop context.

- [ ] **Step 3: Document why the suite remains active**

Update the README matrix to state that desktop specs retain Frisch, last-bidder, invalid-bid, multi-round, and the eight-case scoring matrix, while mobile specs cover touch/lifecycle/network/orientation/PWA. Remove historical “intentionally red” claims that contradict the 2026-06-27 status.

- [ ] **Step 4: Run the complete desktop suite**

```bash
cd e2e
npx tsc --noEmit
npx playwright test tests/auth.spec.ts tests/bootstrap.spec.ts tests/bidding.spec.ts tests/flow.spec.ts tests/resilience.spec.ts tests/scoring.spec.ts tests/smoke.spec.ts --reporter=list
```

Expected: `23 passed`; no Admin disconnect snapshot; all desktop-only bidding/scoring scenarios remain active.

- [ ] **Step 5: Commit desktop readiness fix**

```bash
git add e2e/driver/game-driver.ts e2e/README.md
git commit -m "fix(e2e): wait for desktop lobby socket readiness" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

## Task 18: Full verification and coverage audit

**Files:** no code changes unless a failure returns execution to its owning task.

- [ ] **Step 1: Run the authoritative backend suite**

```bash
cd backend
DATABASE_URL="postgresql+asyncpg://whist:whistpass123@localhost:5433/whist_db" \
REDIS_URL="redis://localhost:6379/0" \
JWT_SECRET_KEY="test-secret" \
python -m pytest tests/ --ignore=tests/integration -v
mypy app/
ruff check app/
```

Expected: `145 passed`; mypy and ruff exit 0. Scoring 35/35, bidding 11/11, gameplay 12/12, analytics 16/16, and groups 10/10 remain green.

- [ ] **Step 2: Run frontend and e2e static checks**

```bash
cd frontend && npm run type-check && npm run build
cd ../e2e && npx tsc --noEmit
```

Expected: all commands exit 0.

- [ ] **Step 3: Run desktop and mobile suites in separate fresh processes**

```bash
cd e2e
npx playwright test tests/auth.spec.ts tests/bootstrap.spec.ts tests/bidding.spec.ts tests/flow.spec.ts tests/resilience.spec.ts tests/scoring.spec.ts tests/smoke.spec.ts --reporter=list
npx playwright test tests/mobile --reporter=list
```

Expected: desktop `23 passed`; mobile `45 passed` after every result from Task 1's checkpoint is resolved. No retry, skip, Chromium launch timeout, or post-N4 `confirmSeating` cascade is accepted.

- [ ] **Step 4: Audit the “What Is NOT Broken” guardrails**

Confirm from the outputs: business-logic modules stayed fully green; auth/rooms pass; B1-B4/S1/V5 pass; bootstrap still rejects Cookoo ports and non-Whister identities. Run `git diff --name-only` and verify no path begins `/home/tomer/workspace/cookoo`.

- [ ] **Step 5: Commit only if verification generated an intentional status-document update**

No blanket “verification fix” commit is allowed. If Task 1 appended reproduced results and concrete tasks, commit only those two documentation files:

```bash
git add docs/superpowers/specs/2026-06-27-test-status-and-fix-targets.md docs/superpowers/plans/2026-06-27-test-status-fixes.md
git commit -m "docs(test): record isolated mobile rerun results" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

## Coverage Matrix

| Confirmed failure set | Owning task |
|---|---|
| X1 | F5, Task 2 |
| W1 | A3, Task 3 |
| R2 | F3, Task 4 |
| N1, S2, Th2 | F2, Task 5 |
| S3, reconnect freshness | F1+F6, Task 6 |
| N2 | N2 compatibility unit, Task 7 |
| N3 | A6, Task 8 |
| T4 | A1, Task 9 |
| K3 | K3, Task 10 |
| P2, P3 | P2+P3, Task 11 |
| O1, O2 | O1/O2, Task 12 |
| N4 and resource cascade | N4, Task 13; isolated checkpoint, Task 1 |
| 11 stale numeric-code assertions | Task 14 |
| 6 protected-profile/stat tests | Task 15 |
| 2 RedisManager API tests | Task 16 |
| 15 desktop game-flow failures | Task 17 |
| Remaining 26 cascade-affected mobile results | Task 1 only until isolated evidence confirms a defect |
