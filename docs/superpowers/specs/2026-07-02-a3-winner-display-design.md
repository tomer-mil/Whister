# A3: Prominent Winner Display — Design

**Date:** 2026-07-02
**Status:** Approved.
**Topic:** Make the game winner visually prominent on the scores page once a game ends, closing
the `W1` e2e gap (`e2e/tests/mobile/endgame.spec.ts`).

---

## Context & Goal

`frontend/app/game/[gameId]/scores/page.tsx` renders a `data-testid="scores-winner"` marker div,
but it is `sr-only` (1×1 px, invisible) and is derived purely from client-side `cumulative_scores`
— it reflects whoever is *currently leading*, not whether the game has actually ended. There is no
signal, anywhere, that tells an already-open scores page "the game just ended." `POST
/games/{id}/end` updates the database and returns an `EndGameResponse` to the caller, but never
notifies other connected clients, and `GET /score-table` doesn't expose game status at all.

`W1` (`e2e/tests/mobile/endgame.spec.ts:8`) ends the game via a direct backend call (bypassing the
UI's "End Game" button) while a scores page is already open, then polls for 15s expecting
`scores-winner` to become a visible element (bounding box > 44×44) with the correct `data-seat`.
This fails today because nothing ever tells that already-open page the game ended.

## Decisions Log

| # | Decision | Choice |
|---|---|---|
| Visual treatment | What the winner display shows | Highlight only — no new visible text/banner. The winning player's existing total-score cell gets a strong highlight instead of today's subtle "leading" tint. |
| Propagation mechanism | How an already-open scores page learns the game ended | WebSocket push: new `game:ended` server event, matching the existing pattern used by `room:game_starting` and `sync:state`. Rejected: polling `score-table` (adds latency, network chatter, breaks from the event-driven pattern used everywhere else). |
| Winning cell testid | Whether `scores-total-p{seat}` and `scores-winner` coexist on the winning cell | Switch: the winning cell's `data-testid` becomes `scores-winner` once the game has ended (replacing `scores-total-p{seat}` on that cell only). Confirmed no other test reads `scores-total-p{seat}` after a game-ending flow. |
| Reload-after-end-game | Whether the highlight must survive a fresh page load after the game already ended (no live socket event to catch) | Out of scope. Known limitation — the live (socket) case is what `W1` tests and what this spec covers. |
| Tie games | Winner highlight when `winner_id` is `None` | No cell gets the winner highlight. Existing "currently leading" tint (`isLeader`) is untouched and unaffected. |

---

## Backend Changes

### New server event: `game:ended`

`backend/app/websocket/schemas.py`:
- Add `ServerEvents.GAME_ENDED: str = "game:ended"`.
- Add `GameEndedPayload(TimestampedPayload)` with fields: `game_id: str`, `winner_id: str | None`,
  `winner_seat: int | None`, `final_scores: dict[str, int]`.

### Emit on end-game

`backend/app/api/games.py`, in `end_game()`, after the existing score/status/winner-flag updates
are committed:
- Lazily import `sio` from `app.main` (same pattern already used in `rooms.py`).
- Resolve `room_code` for the game (the current handler doesn't load it — needs an extra lookup,
  e.g. via the game's associated room, matching however `rooms.py`/other game endpoints already
  resolve this relationship).
- Resolve `winner_seat` from `winner_id` by matching against the already-loaded `game_players`
  list (`gp.seat_position` where `gp.user_id == winner_id`), or `None` if no winner (tie).
- `await sio.emit(ServerEvents.GAME_ENDED, payload.to_dict(), room=f"room:{room_code}")`.

Ties (`winner_id is None`) still emit the event, with `winner_id`/`winner_seat` both `None` —
frontend treats that as "no highlight."

---

## Frontend Changes

### Socket listener

`frontend/app/game/[gameId]/scores/page.tsx` adds local state `winnerSeat: number | null`
(initial `null` — only ever set by the socket event, since a freshly-loaded page has no way to
know a past game already ended, per the reload-scope decision above).

Register via `useSocketEvent('game:ended', ...)`:
```ts
useSocketEvent(
  'game:ended',
  React.useCallback((payload: GameEndedPayload) => {
    if (payload.game_id === gameId) setWinnerSeat(payload.winner_seat);
  }, [gameId]),
);
```
Add the matching `GameEndedPayload` type to `frontend/types/socket-events.ts` (mirroring the
backend schema).

### Rendering

In the totals row, for the player whose `seat_position === winnerSeat`:
- `data-testid` changes from `scores-total-p{seat}` to `scores-winner`.
- `data-seat={seat}` is added (matches what `e2e/pages/scores-page.ts`'s `winnerSeat()` helper
  reads today).
- Styling changes from the existing subtle `bg-ochre/10` (mid-game "leading" tint, unchanged for
  non-winning/mid-game cases) to a strong, unmistakable highlight — e.g. `border-4 border-ochre`
  — so it reads as "the game is over and this is the winner," not "this player happens to be
  ahead right now."

All other totals cells are unaffected and keep their existing `scores-total-p{seat}` testid and
`isLeader` tint logic.

---

## Edge Cases

- **Player elsewhere in the app when the game ends:** no action needed. `GameLayout` already
  holds an open socket connection across all `/game/[gameId]/*` pages, so `game:ended` will have
  already updated store/component state by the time they navigate to the scores page. (If the
  scores page itself isn't mounted yet when the event arrives, the listener registered in that
  page component won't have caught it — mitigated by the fact that navigating to the scores page
  triggers a fresh `score-table` fetch on mount, which will show correct cumulative scores
  regardless; only the *highlight* would be missed, consistent with the reload-scope decision.)
- **Page reload after game already ended:** known limitation, out of scope (see Decisions Log).
- **Tie game:** no highlight shown anywhere; existing behavior for tied leaders (both/all shown
  with the normal `isLeader` tint if tied at the top) is unchanged.

---

## Testing

No new e2e tests needed. `e2e/tests/mobile/endgame.spec.ts::W1` already covers this exact flow
(end game via backend API while scores page is open → poll for prominent `scores-winner` element
with correct `data-seat`) and should pass once this design is implemented. Existing coverage for
`scores-total-p{seat}` (`e2e/tests/flow.spec.ts`) is unaffected since that test never ends the
game.
