# Game State Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the `sync:request` / `sync:state` round-trip so clients that resume from background or reconnect receive authoritative game state without waiting for the next server-pushed event.

**Architecture:** The client emits `sync:request` whenever the page returns to visible; the backend handler reads the current Redis round state and emits `sync:state` back to that single socket. The frontend handles `sync:state` by updating the Zustand bidding and game slices. No new persistent tables or API routes are needed.

**Tech Stack:** Python / socket.io (AsyncServer), Redis, Next.js 16 / React, Zustand, Playwright e2e (workers:1, retries:0)

## Global Constraints

- Never touch `/home/tomer/workspace/cookoo` or any Cookoo port (5432, 8000). Whister uses postgres 5433, backend 8001, frontend 3001.
- Never weaken, skip, or re-label a failing test green. Tests S3, P1, Th2 must pass with the same assertions they have now.
- No arbitrary sleeps in e2e; all waits use `expect.poll` on DOM/socket/Redis state.
- `workers: 1, retries: 0` in `e2e/playwright.config.ts` — do not change.
- Backend is Python 3.12 / FastAPI + python-socketio AsyncServer.
- Frontend is Next.js 16 App Router with TypeScript strict mode.
- All schemas and event name strings live in `backend/app/websocket/schemas.py`; never hard-code event name strings elsewhere.
- `SyncStatePayload` and `SyncRequestPayload` already exist in schemas.py (lines 79 and 142). `ClientEvents.SYNC_REQUEST = "sync:request"` and `ServerEvents.SYNC_STATE = "sync:state"` already exist (lines 487, 531). Do not duplicate them.
- The frontend `TypedSocket` interface already declares `sync:request` (send) and `sync:state` (receive) in `frontend/types/socket-events.ts` lines 341, 380. Do not duplicate.

---

### Task 1: Backend `sync:request` handler

Adds the server-side handler that reads current Redis state and emits `sync:state` to the requesting socket.

**Files:**
- Modify: `backend/app/websocket/game_events.py` — add `register_sync_handlers()` function
- Modify: `backend/app/websocket/server.py` — call `register_sync_handlers()`
- Test: `e2e/tests/mobile/lifecycle.spec.ts` — S3 (existing test, must pass)
- Test: `e2e/tests/bootstrap.spec.ts` — sanity bootstrap (must still pass)

**Interfaces:**
- Consumes:
  - `room_manager.get_room_round_state(room_code)` → `dict[str, str]`
  - `room_manager._get_room_players(room_code)` → `list[PlayerInfo-like]` (use existing `PlayerInfo` from schemas)
  - `room_manager.redis.hgetall(f"room:{room_code}:tricks")` → `dict[str, str]`
  - `ClientEvents.SYNC_REQUEST`, `ServerEvents.SYNC_STATE`, `SyncRequestPayload`, `SyncStatePayload` from `schemas.py`
  - `connection_contexts: dict[str, ConnectionContext]` — same dict used by `register_bidding_handlers`
- Produces: `register_sync_handlers(sio, room_manager, connection_contexts)` — called from `server.py` after `register_bidding_handlers`

- [ ] **Step 1: Write the failing e2e test assertion (S3 already exists — verify it fails now)**

```bash
cd e2e
npx playwright test tests/mobile/lifecycle.spec.ts --grep "S3" --reporter=list
```

Expected: `FAIL — foreground did not emit sync:request; state may remain stale after suspension`

- [ ] **Step 2: Add `register_sync_handlers` to `game_events.py`**

Add this function at the bottom of `backend/app/websocket/game_events.py` (after `register_bidding_handlers`):

```python
def register_sync_handlers(
    sio: "socketio.AsyncServer",  # type: ignore
    room_manager: RoomManager,
    connection_contexts: dict[str, "ConnectionContext"],
) -> None:
    """Register sync:request → sync:state handler."""
    import json as _json  # local import to avoid circular at module level

    from app.websocket.schemas import (  # noqa: F401  (already imported at top; repeated for clarity)
        SyncRequestPayload,
        SyncStatePayload,
        GamePhase,
        PlayerInfo,
    )

    @sio.on(ClientEvents.SYNC_REQUEST)  # type: ignore
    async def handle_sync_request(sid: str, data: dict[str, Any]) -> dict[str, Any]:
        """Handle sync:request — emit current game state to the requesting socket."""
        try:
            ctx = connection_contexts.get(sid)
            if not ctx or not ctx.is_authenticated:
                return {"success": False, "error": "not authenticated"}

            try:
                payload = SyncRequestPayload(**data)
            except Exception as exc:
                return {"success": False, "error": str(exc)}

            room_code = payload.room_code.upper()

            # --- gather room state from Redis ---
            room_key = f"room:{room_code}"
            room_data = await room_manager.redis.hgetall(room_key)
            if not room_data:
                return {"success": False, "error": "room not found"}

            game_id = room_data.get("game_id", "")
            phase_str = room_data.get("status", "waiting")
            current_round_str = room_data.get("current_round")
            current_round = int(current_round_str) if current_round_str else None

            try:
                phase = GamePhase(phase_str)
            except ValueError:
                phase = GamePhase.WAITING

            # --- players ---
            raw_players = await room_manager._get_room_players(room_code)
            players = [
                PlayerInfo(
                    user_id=p.user_id,
                    display_name=p.display_name,
                    seat_position=p.seat_position,
                    is_connected=p.is_connected,
                    is_admin=p.is_admin,
                )
                for p in raw_players
            ]

            # --- round-level state (bidding / playing) ---
            additional_data: dict[str, Any] = {}
            current_bidder: str | None = None

            if phase in (GamePhase.BIDDING_TRUMP, GamePhase.FRISCH, GamePhase.BIDDING_CONTRACT, GamePhase.PLAYING):
                round_data = await room_manager.get_room_round_state(room_code)
                current_bidder = round_data.get("current_bidder_id")

                if phase == GamePhase.BIDDING_TRUMP:
                    additional_data["minimum_bid"] = int(round_data.get("minimum_bid", 5))
                    highest_bid_json = round_data.get("highest_bid")
                    if highest_bid_json:
                        additional_data["highest_bid"] = _json.loads(highest_bid_json)

                elif phase == GamePhase.PLAYING:
                    tricks_key = f"room:{room_code}:tricks"
                    tricks_raw = await room_manager.redis.hgetall(tricks_key)
                    additional_data["tricks"] = {uid: int(v) for uid, v in tricks_raw.items()}
                    additional_data["total_tricks_played"] = int(
                        round_data.get("total_tricks_played", 0)
                    )

            sync_payload = SyncStatePayload(
                room_code=room_code,
                game_id=game_id,
                phase=phase,
                players=players,
                current_round=current_round,
                current_bidder=current_bidder,
                additional_data=additional_data,
            )

            await sio.emit(ServerEvents.SYNC_STATE, sync_payload.to_dict(), to=sid)
            logger.info("Emitted sync:state to %s for room %s", sid, room_code)
            return {"success": True}

        except Exception as exc:
            logger.exception("Error in handle_sync_request: %s", exc)
            return {"success": False, "error": "internal error"}
```

Also add the necessary imports at the top of `game_events.py` (if not already there):

```python
from app.websocket.schemas import (
    # ... existing imports ...
    SyncRequestPayload,
    SyncStatePayload,
    GamePhase,
)
```

- [ ] **Step 3: Register the handler in `server.py`**

In `backend/app/websocket/server.py`, find the call to `register_bidding_handlers` (around line 82–102 in `create_socketio_server`) and add the sync registration immediately after:

```python
# existing:
from app.websocket.game_events import register_bidding_handlers
# add:
from app.websocket.game_events import register_bidding_handlers, register_sync_handlers

# existing call (approximately line 102):
register_bidding_handlers(sio, room_manager, bidding_service, _connection_contexts)
# add right after:
register_sync_handlers(sio, room_manager, _connection_contexts)
```

- [ ] **Step 4: Run backend type check**

```bash
cd backend
python -m mypy app/websocket/game_events.py app/websocket/server.py --ignore-missing-imports 2>&1 | tail -20
```

Expected: no new errors (pre-existing mypy warnings are OK if unchanged).

- [ ] **Step 5: Run backend tests**

```bash
cd backend
python -m pytest tests/ -x -q 2>&1 | tail -20
```

Expected: all pass (no regressions).

- [ ] **Step 6: Commit**

```bash
git add backend/app/websocket/game_events.py backend/app/websocket/server.py
git commit -m "feat(backend): add sync:request → sync:state handler"
```

---

### Task 2: Frontend `visibilitychange` → `sync:request` emitter

When the tab returns to visible, the room-level hook emits `sync:request` so the backend sends fresh state.

**Files:**
- Modify: `frontend/hooks/use-game.ts` — add `visibilitychange` listener that emits `sync:request`
- Test: `e2e/tests/mobile/lifecycle.spec.ts::S3` (must pass after Task 3 also lands)

**Interfaces:**
- Consumes: `emit` from `useSocket()`, `roomCode` from `UseGameOptions`
- Produces: nothing new (side-effect: emits `sync:request` on `visibilitychange`)

- [ ] **Step 1: Add `visibilitychange` listener in `use-game.ts`**

In `frontend/hooks/use-game.ts`, find the `useGame` function and add a new `useEffect` at the end, before the `return` statement:

```typescript
// Emit sync:request when the tab returns to visible so the server can push
// current state without waiting for the next server-initiated event.
useEffect(() => {
  const handleVisibilityChange = () => {
    if (document.visibilityState === 'visible') {
      emit('sync:request', { room_code: roomCode }).catch(() => {
        // Best-effort; sync:state handler will update store if it arrives
      });
    }
  };
  document.addEventListener('visibilitychange', handleVisibilityChange);
  return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
}, [emit, roomCode]);
```

- [ ] **Step 2: TypeScript check**

```bash
cd frontend
npx tsc --noEmit --skipLibCheck 2>&1 | grep -v "__tests__" | head -20
echo "Exit: $?"
```

Expected: `Exit: 0`

- [ ] **Step 3: Restart dev server and run S3 in isolation (backend must be running)**

```bash
cd e2e
npx playwright test tests/mobile/lifecycle.spec.ts --grep "S3" --reporter=list
```

Expected: still FAIL at this point — the backend handler is live but S3 also checks that the frontend handles `sync:state` (Task 3). The test should now emit `sync:request` (counter > 0) but trick counts might still be stale. Confirm `__syncRequestCount > 0` (first assertion) passes; if not, debug.

- [ ] **Step 4: Commit**

```bash
git add frontend/hooks/use-game.ts
git commit -m "feat(frontend): emit sync:request on visibilitychange"
```

---

### Task 3: Frontend `sync:state` handler — rehydrate Zustand from server snapshot

Handles the `sync:state` socket event and updates the bidding, game, and connection slices.

**Files:**
- Modify: `frontend/hooks/use-game.ts` — add `socket.on('sync:state', ...)` inside the existing event subscription `useEffect`
- Test: `e2e/tests/mobile/lifecycle.spec.ts::S3`, `e2e/tests/mobile/pwa.spec.ts::P1`, `e2e/tests/mobile/pwa.spec.ts::Th2` (all must pass after this task)

**Interfaces:**
- Consumes:
  - `SyncStatePayload` from `frontend/types/socket-events.ts` (line 269)
  - Store actions: `setPhase(phase)` from `bidding-slice`, `updatePlayerTricks(userId, count)` from `game-slice`, `setCurrentTurn(playerId)` from `bidding-slice`
  - `socket` from `useSocket()`
- Produces: nothing new (side-effects on Zustand store)

**`SyncStatePayload` fields** (from `frontend/types/socket-events.ts`):
```typescript
interface SyncStatePayload {
  room_code: string;
  game_id: string;
  phase: RoundPhase;          // e.g. 'bidding_trump' | 'playing' | ...
  players: PlayerInfo[];
  current_round: number | null;
  current_bidder: string | null;
  additional_data: Record<string, unknown>;
}
```

`additional_data` for bidding_trump phase: `{ minimum_bid: number, highest_bid?: { amount, suit } }`
`additional_data` for playing phase: `{ tricks: Record<userId, number>, total_tricks_played: number }`

**Store actions needed:**
- `setPhase`: `frontend/stores/slices/bidding-slice.ts` line 76
- `setCurrentTurn`: `frontend/stores/slices/bidding-slice.ts` lines 176-184
- `updatePlayerTricks`: `frontend/stores/slices/game-slice.ts` lines 77-83
- All accessed via `useStore((state) => state.setPhase)` etc.

- [ ] **Step 1: Write failing test for S3 trick-count rehydration**

Run S3 to confirm it currently fails at the trick-count step (not the `sync:request` step):

```bash
cd e2e
npx playwright test tests/mobile/lifecycle.spec.ts --grep "S3" --reporter=list 2>&1 | tail -15
```

Expected: FAIL (either at `__syncRequestCount > 0` before Task 2 is landed, or at a subsequent assertion).

- [ ] **Step 2: Add `sync:state` subscription in `use-game.ts`**

In `frontend/hooks/use-game.ts`, inside the existing `useEffect` that subscribes to socket events (the one that has `socket.on('round:trick_won', ...)` etc.), add:

```typescript
// Get store setters for sync:state rehydration
const setPhase = useStore((state) => state.setPhase);
const setCurrentTurn = useStore((state) => state.setCurrentTurn);
const updatePlayerTricks = useStore((state) => state.updatePlayerTricks);
```

These three `useStore` calls must be added at the top of the `useGame` function body (alongside the existing ones at lines 28–35), not inside the effect.

Then inside the socket subscription `useEffect`, add the `sync:state` handler:

```typescript
socket.on('sync:state', (payload) => {
  // Update game phase
  setPhase(payload.phase as any);

  // Update current bidder if in a bidding phase
  if (payload.current_bidder) {
    setCurrentTurn(payload.current_bidder);
  }

  // Rehydrate trick counts if in playing phase
  if (payload.phase === 'playing') {
    const tricks = (payload.additional_data?.tricks ?? {}) as Record<string, number>;
    Object.entries(tricks).forEach(([userId, count]) => {
      updatePlayerTricks(userId, count);
    });
  }
});
```

In the cleanup return of the same `useEffect`, add:

```typescript
socket.off('sync:state');
```

- [ ] **Step 3: TypeScript check**

```bash
cd frontend
npx tsc --noEmit --skipLibCheck 2>&1 | grep -v "__tests__" | head -20
echo "Exit: $?"
```

Expected: `Exit: 0`

- [ ] **Step 4: Run S3, P1, and Th2 tests**

Backend and frontend must be running (production build, port 3001). Rebuild if frontend changed:

```bash
cd frontend && npm run build && npm run start -- --port 3001 &
sleep 10  # wait for server to start
```

Then:

```bash
cd e2e
npx playwright test tests/mobile/lifecycle.spec.ts --grep "S3" tests/mobile/pwa.spec.ts --grep "P1|Th2" --reporter=list 2>&1 | tail -20
```

Expected:
- `S3` — PASS
- `P1` — PASS (auth + socket reconnects + bidding DOM restored via sync:state after rejoin)
- `Th2` — PASS (socket reconnects under 3G + sync:state restores bidding DOM)

If P1 still fails: the `room:joined` handler on the backend already emits `bid:your_turn` (server.py lines 254–277). The `sync:state` handler might not be enough; check whether `setPhase` from `sync:state` is triggering the bidding phase UI to render. If the bid:your_turn isn't re-emitted after reconnect, `sync:state` should be sufficient because it sets `phase = 'bidding_trump'` which the bidding UI reads.

- [ ] **Step 5: Run full mobile suite to confirm no regressions**

```bash
cd e2e
npx playwright test tests/mobile/ --reporter=list 2>&1 | tail -5
```

Expected: at least 36/44 passed (was 33/44 before this plan). S3 + P1 + Th2 now green.

- [ ] **Step 6: Commit**

```bash
git add frontend/hooks/use-game.ts
git commit -m "feat(frontend): handle sync:state to rehydrate game phase and tricks"
```

---

### Task 4: Update MOBILE-READINESS.md

Update the matrix rows for S3, P1, Th2 from ⚠️/❌ to ✅, and remove MR-03 and MR-07.

**Files:**
- Modify: `e2e/MOBILE-READINESS.md`

**Evidence required before editing:** quote the exact `X passed (Ym)` line from the Task 3 test run.

- [ ] **Step 1: Confirm passing tests**

Re-run the three tests and record the summary line:

```bash
cd e2e
npx playwright test tests/mobile/lifecycle.spec.ts --grep "S3" tests/mobile/pwa.spec.ts --grep "P1" tests/mobile/pwa.spec.ts --grep "Th2" --reporter=list 2>&1 | tail -5
```

Expected summary: `3 passed (Xm)`

- [ ] **Step 2: Update matrix rows**

In `e2e/MOBILE-READINESS.md`:

**Row "Background during another turn"** — change status from `⚠️ partial` to `✅ verified` and update evidence:
```
✅ verified | Socket events update state during short background; foreground emits sync:request → server responds with sync:state. S3, B1, B2 all pass.
```

**Row "Screen lock / long background"** — change `⚠️ partial` to `⚠️ partial` (still partial — real OS suspension untestable), but update note:
```
⚠️ partial | Socket recovers and foreground emits sync:request; real OS timer suspension and bfcache behavior differ per device. See [ML-01](#ml-01-browser-emulation-boundaries).
```

**Row "Browser kill / relaunch state"** — change `❌ gap` to `✅ verified` and update evidence:
```
✅ verified | Auth persists, socket reconnects, and sync:state from the backend restores bidding phase after context reopen. P1 and R3 both pass.
```

**Row "Reload/reconnect on slow 3G"** — change `❌ gap` to `✅ verified`:
```
✅ verified | After reload under 3G, socket reconnects and sync:state restores bidding DOM. Th2 passes.
```

Delete the **MR-03** and **MR-07** sections from "Known gaps".

- [ ] **Step 3: Commit**

```bash
git add e2e/MOBILE-READINESS.md
git commit -m "docs(e2e): mark S3/P1/Th2 green — game:sync implemented"
```
