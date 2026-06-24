# Whister E2E Playability Suite — Reconnaissance Findings

> Generated: 2026-06-24  Branch: feat/e2e-playability-suite

---

## 1. Health Route

**Confirmed routes (from `backend/app/main.py`):**

| Route | Status | Notes |
|---|---|---|
| `GET /health` | **200** | `{"status":"ok","version":"..."}` — simple up-check |
| `GET /health/ready` | **200** | `{"status":"ready"\|"not_ready","database":"ok"\|"error","redis":"ok"\|"error","version":"..."}` — checks DB + Redis |
| `GET /api/v1/health` | **404** | Does not exist |

**Decision for Task 4 (`services.ts`):** Use `/health/ready` — returns 200 even when deps are initializing (the outer HTTP response is 200; only the JSON `status` field is `not_ready` until DB+Redis are up). The current code in `helpers/services.ts` already uses `/health/ready`, which is correct.

**Infrastructure Divergence (BLOCKING):** Port 8000 is occupied by the `cookoo` project (`uvicorn cookoo.main:app --port 8000`). This prevents the Docker backend container (`whist_backend`) from binding its host port. The container starts inside Docker but is unreachable from the host.  
- `docker compose up -d` partially fails with: `Bind for 0.0.0.0:8000/tcp: address already in use`  
- The `globalSetup.ts` hits this: `execSync('docker compose up -d')` throws when the `postgres` container fails (port 5432 also conflict with another postgres container `cookoo-db-1`).  
- **Task 1/4 must address this**: either add `--no-recreate` to the compose command, or document that the Cookoo service must be stopped before running Whister tests.

---

## 2. Claim-Trick UI (Highest Risk)

**Finding: `TrickClaimButton` EXISTS and is rendered for ALL players simultaneously.**

File: `/home/tomer/workspace/Whister/frontend/components/game/trick-claim-button.tsx`

The button renders with text "Claim Trick" (uppercase via CSS) when `disabled=false` and shows "Round Complete" when disabled. It is a full-width large button (`py-8 text-xl`).

**Critical design point:** The button is NOT per-turn — it is rendered for **every** player's page simultaneously during the `playing` phase. From `frontend/app/game/[gameId]/page.tsx`:

```tsx
{/* Phase: Playing */}
{phase === 'playing' && (
  <>
    <GameHeader ... />
    <section className="flex-1 px-4 py-4 space-y-4">
      {/* Large claim trick button */}
      <TrickClaimButton
        onClaim={handleClaimTrick}
        disabled={isLoading}    // ← isLoading is always false (useState never set to true)
        isLoading={isLoading}
      />
      ...
    </section>
  </>
)}
```

**Bug: `isLoading` is always `false`.** The `[isLoading]` state is initialized to `false` and never set to `true` anywhere in the page component (`const [isLoading] = useState(false)`). This means the button is **always enabled** for every player during the playing phase.

**Attribution model:** Tricks are credited to **whoever's socket emits `round:claim_trick`**. There is no "whose turn it is" concept for claiming — any player can claim at any time. The existing `e2e/helpers/socket.ts` pattern (direct WebSocket emission per player) is the correct approach.

**Implication for `smoke.spec` / GameDriver:**
- The UI does not enforce turn order for trick claiming.
- `claimAllTricks` in the GameDriver can use the per-player socket approach (as in the current `helpers/socket.ts`), or click the "Claim Trick" button in any player's browser page.
- The `playing-claim-trick` testid will be visible and enabled on all 4 pages simultaneously.
- No "current leader" or per-turn restriction exists in the UI.

**No "turn indicator" for playing phase:** There is no visible "whose lead/turn" indicator during the playing phase beyond the per-player trick counts (`AllPlayersProgress` / `PlayerProgressRing`).

**Admin controls:** Admin sees an additional undo panel (`AdminControls`) with a dropdown to select player + "Undo" button, and an "End Round" button (enabled when `totalTricksPlayed >= 13`).

---

## 3. Score-Table API Shape and Game-End Mechanism

### `GET /api/v1/games/{game_id}/score-table`

Source: `/home/tomer/workspace/Whister/backend/app/schemas/score.py` and `/home/tomer/workspace/Whister/backend/app/api/games.py`

**Response shape (`ScoreTableResponse`):**
```json
{
  "game_id": "uuid-string",
  "room_code": "ABCDEF",
  "current_round": 1,
  "rounds": [
    {
      "round_number": 1,
      "trump_suit": "clubs|diamonds|hearts|spades|no_trump",
      "game_type": "string",
      "players": [
        {
          "user_id": "uuid-string",
          "display_name": "Player Name",
          "seat_position": 0,
          "contract_bid": 5,
          "tricks_won": 5,
          "score": 35,
          "made_contract": true
        }
      ]
    }
  ],
  "cumulative_scores": {
    "uuid-player-1": 35,
    "uuid-player-2": 19,
    "uuid-player-3": -10,
    "uuid-player-4": 19
  },
  "players": [
    {
      "user_id": "uuid-string",
      "display_name": "Player Name",
      "seat_position": 0
    }
  ]
}
```

**Key mapping note for `BackendClient.parse()` in Task 7:** The real payload uses `round.players[n].score` (NOT `round.scores`), and totals are in `cumulative_scores` keyed by `user_id` (NOT by seat index). The `ScoreTable` shape in the plan's `backend-client.ts` will need adjustment:

```typescript
// RECON-corrected parse():
private parse(raw: ScoreTableResponse): ScoreTable {
  const playersByUserId = new Map(raw.players.map((p, i) => [p.user_id, i]));
  return {
    rounds: raw.rounds.map(r => ({
      round: r.round_number,
      suit: r.trump_suit,
      scores: r.players.map(p => p.score),  // ← r.players[n].score, not r.scores
    })),
    totals: raw.players.map(p => raw.cumulative_scores[p.user_id] ?? 0),
    winnerSeat: null,  // ← not in score-table; only in end-game response
  };
}
```

### `POST /api/v1/games/{game_id}/end`

**`EndGameResponse` shape:**
```json
{
  "game_id": "uuid-string",
  "ended_at": "2026-06-24T09:00:00",
  "winner_id": "uuid-string-or-null",
  "final_scores": {
    "uuid-player-1": 35,
    "uuid-player-2": 19
  }
}
```

**How a game ends / how `winner_id` is set:**
- Game end is **admin-triggered** via `POST /api/v1/games/{game_id}/end` (only the game admin can call it).
- The frontend "End Game" button appears on the scores page for all players but only the admin's request is accepted.
- `winner_id` = the `user_id` of the player with the highest `final_score`. If there is a tie, `winner_id` is `null`.
- `winner_id` is **NOT** in the `score-table` response — it only appears in the `end-game` response.
- The score table does not indicate game-over or winner. `scores-winner` testid needs to be driven by a separate `/end` call check or the game status.

**Implication for Task 5 (`scores-winner` testid):** The winner is only known after `POST /end`. The scores page should check `game.status === 'FINISHED'` and `game.winner_id`. This data is not currently fetched by the scores page — it only calls `GET /score-table`. Task 5/6 may need to add an end-game fetch or check.

---

## 4. Contract-Bid UI: 0–13 Range and data-testid Mapping

### BidCounter supports 0–13 for contract bidding

`BidCounter` component (`/home/tomer/workspace/Whister/frontend/components/bidding/bid-counter.tsx`) has `min=5` as default, but `ContractBiddingPanel` calls it with `min={0}`:

```tsx
<BidCounter
  value={selectedBid}
  min={0}    // ← explicit 0, overrides the default of 5
  max={13}
  onChange={setSelectedBid}
  disabled={isLoading}
/>
```

**Contract BidCounter starts at 0, supports 0–13.** This confirms the full range is available.

**Trump BidCounter** (`ActiveBiddingControls`) uses `min={minimumBid}` (server-driven, starts at 5).

### data-testid Mapping Table

No `data-testid` attributes currently exist in the codebase. The table below identifies the **element to add each testid to** in Task 5:

| testid | Component File | Element | Notes |
|---|---|---|---|
| `lobby-start-game` | `frontend/app/room/[roomCode]/page.tsx` | `<Button onClick={handleStartGame}>Start Game</Button>` (line 85) | Only visible when `canStartGame && isAdmin` |
| `lobby-player-card-{seat}` | `frontend/components/room/player-list.tsx` | Each player card element | Need to inspect `player-list.tsx` for card element |
| `room-code` | `frontend/components/room/room-code-display.tsx` | Root element displaying the room code | |
| `seating-confirm` | `frontend/app/game/[gameId]/seating/page.tsx` | Confirm button | Need to inspect seating page |
| `seating-seat-{n}` | `frontend/app/game/[gameId]/seating/page.tsx` | Each seat slot | Need to inspect seating page |
| `bidding-current-turn` | `frontend/components/bidding/waiting-for-bidder.tsx` | Current bidder name display | Only visible when not your turn |
| `bidding-suit-clubs` | `frontend/components/bidding/suit-selector.tsx` | `<button key="clubs">` | In `SUITS.map(...)` |
| `bidding-suit-diamonds` | `frontend/components/bidding/suit-selector.tsx` | `<button key="diamonds">` | |
| `bidding-suit-hearts` | `frontend/components/bidding/suit-selector.tsx` | `<button key="hearts">` | |
| `bidding-suit-spades` | `frontend/components/bidding/suit-selector.tsx` | `<button key="spades">` | |
| `bidding-suit-notrump` | `frontend/components/bidding/suit-selector.tsx` | `<button key="no_trump">` | Note: suit value is `no_trump` not `notrump` |
| `bidding-counter-plus` | `frontend/components/bidding/bid-counter.tsx` | `<button>+</button>` (increment button) | |
| `bidding-counter-minus` | `frontend/components/bidding/bid-counter.tsx` | `<button>−</button>` (decrement button) | |
| `bidding-counter-value` | `frontend/components/bidding/bid-counter.tsx` | `<span className="text-5xl...">` displaying the value | |
| `bidding-bid` | `frontend/components/bidding/active-bidding-controls.tsx` | `<Button variant="primary">Bid</Button>` | Only visible when it's your trump bid turn |
| `bidding-pass` | `frontend/components/bidding/active-bidding-controls.tsx` | `<Button variant="secondary">Pass</Button>` | Only visible when it's your trump bid turn |
| `bidding-confirm` | `frontend/components/bidding/contract-bidding-panel.tsx` | `<Button>Confirm</Button>` | Only visible when `isYourTurn` in contract phase |
| `bidding-running-sum` | `frontend/components/bidding/contract-bidding-panel.tsx` | `<span className="text-3xl font-bold">{currentContractSum}</span>` | The running sum display (top left) |
| `frisch-indicator` | `frontend/components/bidding/trump-bidding-panel.tsx` | `<div className="bg-ochre/10 border-l-4 border-ochre...">` (frisch block) | Rendered when `frischCount > 0`; note: a separate `FrischIndicator` component exists but is NOT used by `TrumpBiddingPanel` — the panel renders its own inline frisch block |
| `playing-claim-trick` | `frontend/components/game/trick-claim-button.tsx` | `<motion.button onClick={handleClick}>` | Always visible + enabled during `playing` phase for all players |
| `playing-undo-trick` | `frontend/components/game/admin-controls.tsx` | `<Button variant="outline">Undo</Button>` | Admin only; requires player selection |
| `playing-trick-count-{seat}` | `frontend/components/game/player-progress-ring.tsx` | `<motion.span>` showing `{tricksWon}` | Index by seat (`seatIndex`) |
| `game-trump-suit` | `frontend/components/game/game-header.tsx` | `<span className="text-2xl">` showing trump symbol | In the right side of GameHeader |
| `scores-row-r{round}` | `frontend/app/game/[gameId]/scores/page.tsx` | `<tr key={round.round_number}>` in the score grid | The score grid is inline in page.tsx, not a component |
| `scores-cell-r{round}-p{seat}` | `frontend/app/game/[gameId]/scores/page.tsx` | `<td key={player.user_id}>` per round per player | Need to map by seat, not user_id |
| `scores-total-p{seat}` | `frontend/app/game/[gameId]/scores/page.tsx` | `<td key={player.user_id}>` in totals row | |
| `scores-winner` | `frontend/app/game/[gameId]/scores/page.tsx` | Does not exist yet | Winner is not shown on the scores page — requires `POST /end` + re-render |
| `scores-new-round` | `frontend/app/game/[gameId]/scores/page.tsx` | `<Button onClick={handleNewRound}>New Round</Button>` | |
| `scores-continue` | `frontend/components/game/round-summary-modal.tsx` | `<Button onClick={onContinue}>Continue</Button>` | In the round summary modal |
| `connection-status` | `frontend/components/shared/connection-status.tsx` | Root `<div className="flex items-center gap-2">` | No testid yet |
| `error-toast` | `frontend/app/game/[gameId]/page.tsx` | `<p className="text-sm text-terracotta...">{error}</p>` | Inline error display, not a dedicated toast; need to normalize |

**Notes for Task 5:**
1. The `frisch-indicator` should go on the inline div in `TrumpBiddingPanel`, not the `FrischIndicator` standalone component (which is NOT used in the playing page).
2. `scores-winner` does not exist as a UI element — the scores page has no winner display. Either add winner logic or skip this testid initially.
3. `error-toast` is actually an inline `<p>` element on the game page, not a toast system. Add testid to that `<p>`.
4. `bidding-suit-notrump` testid name in the plan uses `notrump` but the suit enum value is `no_trump`. Use `data-testid="bidding-suit-notrump"` to match the plan's convention.

---

## 5. Baseline E2E Run

**Status: BLOCKED — globalSetup crashes before any test runs.**

The `globalSetup.ts` throws on `execSync('docker compose up -d')` because:
- Port 5432 is bound by `cookoo-db-1` container
- Port 8000 is bound by the Cookoo uvicorn process

Error output:
```
Error: Command failed: docker compose up -d
...
Bind for 127.0.0.1:5432 failed: port is already allocated
  at ensureServicesRunning (/home/tomer/workspace/Whister/e2e/helpers/services.ts:28:13)
  at globalSetup (/home/tomer/workspace/Whister/e2e/globalSetup.ts:21:3)
```

**Pass/fail counts: 0 passed, 0 failed, 6 tests could not run** (all blocked by globalSetup failure).

**Tests that exist (would run if setup succeeded):**
- `tests/auth.spec.ts` — auth flow
- `tests/bidding.spec.ts` — bidding flow
- `tests/game.spec.ts` — 2 tests: full round + new round
- `tests/lobby.spec.ts` — lobby flow
- `tests/multi-round.spec.ts` — multi-round
- `tests/seating.spec.ts` — seating flow

**Existing test infrastructure observations:**
- `helpers/socket.ts` provides `connectSocket(token)` and `claimTrick(socket, roomCode)` — good.
- `helpers/game-setup.ts` uses `delay()` throughout (plan deprecates this in Task 2).
- `config/players.ts` has real Gmail credentials (plan replaces these in Task 1).
- `helpers/services.ts` checks `/health/ready` (correct) but crashes on port conflict.

---

## 6. Divergences from Plan Assumptions

| Plan Assumption | Reality | Impact |
|---|---|---|
| `docker compose up -d` starts cleanly | Port conflicts (5432, 8000) with Cookoo project | BLOCKING: globalSetup must use `--no-recreate` or Cookoo must be stopped |
| `/health/ready` returns 200 when healthy | Confirmed: 200 even with `not_ready` JSON body | Plan is correct: poll this URL for reachability |
| `/api/v1/health` exists | Does NOT exist (404) | Plan's Task 4 reference to `/api/v1/health` is wrong; keep `/health/ready` |
| `playing-claim-trick` is per-player/per-turn | It renders for ALL players simultaneously, always enabled | POSITIVE: easier to drive; any page can click it |
| Tricks have a "current leader" claim model | No per-turn restriction; any player claims freely via socket | GameDriver's `claimAllTricks` can use WebSocket approach or click any page's button |
| `score-table` response has `rounds[].scores` array | Actual key is `rounds[].players[n].score` (per-player objects, not flat array) | `BackendClient.parse()` in Task 7 must be adjusted |
| `score-table` response has `totals[]` array | Actual key is `cumulative_scores: {userId: int}` keyed by user_id | `parse()` must map by user_id to seat index order |
| `winner_id` is in `score-table` | NOT in `score-table`; only in `POST /end` response | `winnerSeat()` in ScoresPage needs a separate end-game check |
| Game ends automatically | Game end is admin-triggered (`POST /api/v1/games/{id}/end`) | Add "End Game" button interaction in Task 12/flow spec |
| `frisch-indicator` testid targets `FrischIndicator` component | `FrischIndicator` component exists but is NOT used; the panel renders its own inline frisch block | Add testid to inline block in `TrumpBiddingPanel`, not `FrischIndicator` |
| `error-toast` is a toast component | It's an inline `<p>` element in the game page | Plan's testid still works; just attach to the inline `<p>` |
| `register` endpoint requires specific fields | Confirmed: needs `email`, `password`, `username`, `display_name` | Task 1 `seedUser` body is correct as planned |
| Port 3000 is available for frontend | Occupied by `open-webui` container | Frontend `next dev`/`next start` cannot use port 3000; needs different port or open-webui must stop |

**Additional divergence — Frontend port 3000 blocked:**
The `open-webui` container runs on host port 3000. The frontend cannot start on port 3000 without stopping open-webui first. This affects Task 4's `ensureServicesRunning()` frontend bootstrap. The suite needs either a different port (e.g. 3001) or pre-condition that open-webui is stopped.
