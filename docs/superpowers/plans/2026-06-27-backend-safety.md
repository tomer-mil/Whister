# Backend Safety Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix two backend safety gaps: (1) prevent claim-trick double-counting from rapid taps using a per-player Redis idempotency key, and (2) auto-pass the active trump bidder on disconnect so three connected players are never blocked indefinitely.

**Architecture:** Both fixes are pure backend. T4 adds a Redis `SET NX` key (2-second TTL) in the claim-trick handler so a second event from the same player within the window is dropped. R2 extends the disconnect handler to check whether the departing player is the current trump bidder and, if so, immediately calls the existing `pass_trump_bid` service method.

**Tech Stack:** Python 3.12 / FastAPI, python-socketio AsyncServer, Redis (existing `room_manager.redis`)

## Global Constraints

- Never touch `/home/tomer/workspace/cookoo` or its ports (5432, 8000). Whister uses postgres 5433, backend 8001.
- Never weaken, skip, or relax the T4 or R2 test assertions. They must pass with the same `expect(count).toBe(1)` and "does not deadlock" logic they have now.
- All Redis key names follow the existing convention `room:{room_code}:*`.
- `workers: 1, retries: 0` — do not change the e2e config.
- Do not import `bidding_service` into `server.py` at module level — use a lazy import inside the disconnect handler to avoid circular dependency risk.

---

### Task 1: Claim-trick idempotency key (T4)

Adds a 2-second Redis `SET NX` window so a second `round:claim_trick` event from the same player within the TTL is silently dropped.

**Files:**
- Modify: `backend/app/websocket/game_events.py:768-877` — `handle_claim_trick`
- Test: `e2e/tests/mobile/touch.spec.ts::T4: two rapid taps on claim-trick count as one trick claim`

**Interfaces:**
- Consumes: `room_manager.redis` (existing), `ctx.user_id`, `room_code`
- Produces: nothing new — only a behaviour change (duplicate event dropped)

- [ ] **Step 1: Verify T4 fails now**

```bash
cd e2e
npx playwright test tests/mobile/touch.spec.ts --grep "T4" --reporter=list
```

Expected: `FAIL — Expected: 1 Received: 2`

- [ ] **Step 2: Add idempotency key check to `handle_claim_trick`**

In `backend/app/websocket/game_events.py`, inside `handle_claim_trick` (starts at line 768), add the idempotency block immediately after the phase check (after line ~820, before `tricks_key = ...`):

```python
# --- Idempotency: drop duplicate taps within 2s ---
inflight_key = f"room:{room_code}:claim_inflight:{ctx.user_id}"
# SET NX with 2000ms TTL; returns True only if the key was newly created
acquired = await room_manager.redis.set(inflight_key, "1", nx=True, px=2000)
if not acquired:
    # Second tap within the window — drop silently; client already saw the first
    logger.debug(
        "Duplicate claim_trick from %s in room %s — dropped (inflight key exists)",
        ctx.user_id,
        room_code,
    )
    return {"success": True}  # ack without double-counting
```

The full modified region (replace lines ~820-830 in the existing handler):

```python
# Check phase
phase = round_data.get("phase", "")
if phase != RoundPhase.PLAYING.value:
    await emit_error(
        sio,
        sid,
        WSErrorCode.INVALID_GAME_PHASE,
        "Not in playing phase",
    )
    return

# --- Idempotency: drop duplicate taps within 2s ---
inflight_key = f"room:{room_code}:claim_inflight:{ctx.user_id}"
acquired = await room_manager.redis.set(inflight_key, "1", nx=True, px=2000)
if not acquired:
    logger.debug(
        "Duplicate claim_trick from %s in room %s — dropped",
        ctx.user_id,
        room_code,
    )
    return {"success": True}

# Get player's current tricks
tricks_key = f"room:{room_code}:tricks"
current_tricks = await room_manager.redis.hget(tricks_key, ctx.user_id)
```

- [ ] **Step 3: Run backend unit tests**

```bash
cd backend
python -m pytest tests/ -x -q 2>&1 | tail -10
```

Expected: all pass.

- [ ] **Step 4: Rebuild frontend and run T4**

Backend restart required for the change to take effect (Docker compose restart or `uvicorn` restart). Then:

```bash
cd e2e
npx playwright test tests/mobile/touch.spec.ts --grep "T4" --reporter=list
```

Expected: `1 passed`

- [ ] **Step 5: Run T3 and T6 to confirm no regression**

```bash
cd e2e
npx playwright test tests/mobile/touch.spec.ts --grep "T3|T6" --reporter=list
```

Expected: both pass (trick claiming in normal flow unchanged).

- [ ] **Step 6: Commit**

```bash
git add backend/app/websocket/game_events.py
git commit -m "fix(backend): idempotency key for claim_trick prevents double-count on rapid tap"
```

---

### Task 2: Auto-pass active bidder on disconnect (R2)

When a player disconnects during the trump auction and they are the current bidder, the server immediately passes on their behalf so the other three players are not blocked.

**Files:**
- Modify: `backend/app/websocket/server.py:152-179` — `disconnect` handler
- Test: `e2e/tests/mobile/recovery.spec.ts::R2: tab close on own bid turn auto-advances without deadlocking the table`

**Interfaces:**
- Consumes:
  - `room_manager.get_room_round_state(room_code)` → `dict[str, str]`
  - `BiddingService.pass_trump_bid(room_code, user_id, player_name)` → `tuple[bool, str | None]`
  - `emit_your_turn(sio, room_manager, next_bidder_id, phase, ...)` from `game_events.py` (already imported in server.py line ~9)
  - `room_code`, `user_id`, `ctx.display_name` already available in the disconnect handler
- Produces: no new public API — side-effect is that the auction advances after the bidder's socket drops

**Important:** `bidding_service` is not currently imported in `server.py`. Use a lazy import inside the handler (import inside the `async def disconnect`) to avoid any circular import risk.

- [ ] **Step 1: Verify R2 fails now**

```bash
cd e2e
npx playwright test tests/mobile/recovery.spec.ts --grep "R2" --reporter=list
```

Expected: `FAIL — R2 FINDING F3: game blocked after the active bidder disconnected`

- [ ] **Step 2: Add auto-pass logic in `server.py` disconnect handler**

The current `disconnect` handler ends at approximately line 179. Replace it with:

```python
@sio.event  # type: ignore
async def disconnect(sid: str) -> None:
    """Handle WebSocket disconnection."""
    try:
        ctx = _connection_contexts.get(sid)
        if ctx:
            room_code, user_id = await room_manager.handle_disconnect(sid)
            if room_code and user_id:
                broadcast_payload = RoomPlayerDisconnectedPayload(
                    player_id=user_id,
                    player_name=ctx.display_name,
                    grace_period_seconds=60,
                )
                await ctx.broadcast_to_room(
                    f"room:{room_code}",
                    ServerEvents.ROOM_PLAYER_DISCONNECTED,
                    broadcast_payload.to_dict(),
                )
                logger.info(
                    "User %s disconnected from room %s", user_id, room_code
                )

                # --- Auto-pass if disconnected player was the active trump bidder ---
                try:
                    round_data = await room_manager.get_room_round_state(room_code)
                    phase = round_data.get("phase", "")
                    current_bidder_id = round_data.get("current_bidder_id")

                    if phase == "trump_bidding" and current_bidder_id == user_id:
                        logger.info(
                            "Active trump bidder %s disconnected — auto-passing", user_id
                        )
                        from app.services.bidding_service import BiddingService  # lazy import
                        bidding_svc = BiddingService(room_manager.redis)
                        passed, next_bidder_id = await bidding_svc.pass_trump_bid(
                            room_code, user_id, ctx.display_name
                        )
                        if passed and next_bidder_id:
                            # Notify the next bidder it's their turn
                            from app.websocket.game_events import emit_your_turn
                            minimum_bid = int(round_data.get("minimum_bid", 5))
                            await emit_your_turn(
                                sio,
                                room_manager,
                                next_bidder_id,
                                phase="trump_bidding",
                                minimum_bid=minimum_bid,
                                is_last_bidder=False,
                            )
                            logger.info(
                                "Auto-pass complete; next bidder is %s", next_bidder_id
                            )
                except Exception as auto_pass_err:
                    logger.exception(
                        "Auto-pass failed for %s in room %s: %s",
                        user_id, room_code, auto_pass_err,
                    )
            else:
                logger.info("User %s disconnected", ctx.user_id)

            del _connection_contexts[sid]
    except Exception as e:
        logger.exception("Error in disconnect handler: %s", e)
```

- [ ] **Step 3: Check the `pass_trump_bid` signature in bidding_service.py**

Open `backend/app/services/bidding_service.py` around line 222 and confirm the method signature is:

```python
async def pass_trump_bid(self, room_code: str, user_id: str, player_name: str | None = None) -> tuple[bool, str | None]:
```

If the return type is different (e.g., it returns a more complex result), adjust the call in the disconnect handler accordingly. The key value needed is: did the pass succeed (`bool`) and who is the next bidder (`str | None`).

Also verify that `pass_trump_bid` does not require the user to be the current bidder — or if it validates this, that the validation won't fail on disconnect (the Redis round state should still show this user as current bidder at the time disconnect fires).

- [ ] **Step 4: Run backend tests**

```bash
cd backend
python -m pytest tests/ -x -q 2>&1 | tail -15
```

Expected: all pass.

- [ ] **Step 5: Run R2 test**

Restart backend, then:

```bash
cd e2e
npx playwright test tests/mobile/recovery.spec.ts --grep "R2" --reporter=list
```

Expected: `1 passed`

If it fails: the most likely cause is timing — `handle_disconnect` clears `current_bidder_id` from Redis before the auto-pass check reads it. If that happens, read `current_bidder_id` from `round_data` before calling `handle_disconnect`, or have `handle_disconnect` return it along with `room_code` and `user_id`.

Fallback fix: before calling `room_manager.handle_disconnect(sid)`, read round state first:

```python
# Read round state BEFORE handle_disconnect clears it
round_state_snapshot: dict[str, str] = {}
ctx = _connection_contexts.get(sid)
if ctx and ctx.current_room:
    try:
        round_state_snapshot = await room_manager.get_room_round_state(ctx.current_room)
    except Exception:
        pass
room_code, user_id = await room_manager.handle_disconnect(sid)
# Use round_state_snapshot instead of re-fetching
```

- [ ] **Step 6: Run recovery suite**

```bash
cd e2e
npx playwright test tests/mobile/recovery.spec.ts --reporter=list
```

Expected: R1, R2, R3 all pass.

- [ ] **Step 7: Commit**

```bash
git add backend/app/websocket/server.py
git commit -m "fix(backend): auto-pass active trump bidder on disconnect (R2)"
```

---

### Task 3: Update MOBILE-READINESS.md

Update T4 and R2 rows from ❌ to ✅, remove MR-01 and MR-06 from Known Gaps.

**Files:**
- Modify: `e2e/MOBILE-READINESS.md`

- [ ] **Step 1: Confirm both tests pass**

```bash
cd e2e
npx playwright test tests/mobile/touch.spec.ts --grep "T4" tests/mobile/recovery.spec.ts --grep "R2" --reporter=list 2>&1 | tail -5
```

Expected: `2 passed (Xm)`

- [ ] **Step 2: Update matrix row for T4**

Change:
```
| Rapid repeated action | ... | ❌ gap | Deterministically counts twice; see [MR-01]... |
```
To:
```
| Rapid repeated action | ... | ✅ verified | 2-second Redis NX key drops the duplicate tap; backend confirms count=1 after two immediate taps. |
```

- [ ] **Step 3: Update matrix row for R2**

Change:
```
| Active-bidder tab close | ... | ❌ gap | Other players remain blocked; see [MR-06]... |
```
To:
```
| Active-bidder tab close | ... | ✅ verified | Server auto-passes the disconnected bidder; other players receive bid:your_turn within the same disconnect event. |
```

- [ ] **Step 4: Delete MR-01 and MR-06 sections from "Known gaps"**

- [ ] **Step 5: Commit**

```bash
git add e2e/MOBILE-READINESS.md
git commit -m "docs(e2e): mark T4/R2 green — idempotency key and auto-pass implemented"
```
