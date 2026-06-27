# Whister — Mobile Readiness Checklist

> Goal: ship a fully working, mobile-native experience.
> Everything in this document must be done. Work top to bottom — earlier phases unblock later ones.
>
> Tests that verify each fix are listed inline. Run `cd e2e && npx playwright test tests/mobile --reporter=list` after each phase.

---

## Definition of Done

The app is mobile-ready when:
- [ ] All tests in `e2e/tests/mobile/` pass (including currently-red ones)
- [ ] No game-blocking states exist (a disconnected player cannot deadlock the table)
- [ ] The game is fully playable end-to-end on iPhone SE at 375 px wide
- [ ] State is always fresh on foreground and after reconnect
- [ ] The winner is shown at the end of a game

---

## Phase 1 — One-liners (do these first, they're free)

### ✅ F5 · Zoom lock missing from viewport meta

**Problem:** The viewport meta tag doesn't prevent accidental pinch or double-tap zoom during gameplay. A zoom mid-game moves controls off-screen.

**File:** `frontend/app/layout.tsx`

**Fix:**
```tsx
// Change:
<meta name="viewport" content="width=device-width, initial-scale=1" />
// To:
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
```
Or if using Next.js metadata API:
```tsx
export const metadata: Metadata = {
  // ...
  viewport: 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no',
};
```

**Verifies:** `X1: viewport meta prevents pinch/double-tap zoom during gameplay`

---

### ✅ A5 · Dead `FrischIndicator` component

**Problem:** `frontend/components/bidding/frisch-indicator.tsx` exists but is never imported or rendered anywhere. `TrumpBiddingPanel` renders its own inline frisch block. The component will confuse anyone who finds it and tries to use it.

**File:** `frontend/components/bidding/frisch-indicator.tsx`

**Fix:** Delete the file. The inline block in `TrumpBiddingPanel` is the real one.

```bash
rm frontend/components/bidding/frisch-indicator.tsx
```

Confirm no imports remain:
```bash
grep -r "frisch-indicator\|FrischIndicator" frontend/
```

**Verifies:** No test — this is a cleanup. Confirm `tsc --noEmit` still passes.

---

## Phase 2 — Bug fixes (small, frontend-only)

### ✅ A1 · Claim Trick button never disables

**Problem:** `isLoading` in the game page is initialised to `false` and its setter is never called. The Claim Trick button has no loading guard — a player can tap it multiple times before the server responds. On mobile, rapid taps are common (see T4).

**File:** `frontend/app/game/[gameId]/page.tsx`

**Fix:** Use the setter in `handleClaimTrick`:
```tsx
const [isLoading, setIsLoading] = useState(false);

const handleClaimTrick = async () => {
  if (isLoading) return;
  setIsLoading(true);
  try {
    socket.emit('round:claim_trick', { gameId });
  } finally {
    // Reset after server acknowledges — listen for the socket response event
    // or use a short timeout as a fallback
    setTimeout(() => setIsLoading(false), 1000);
  }
};
```
Better: reset `isLoading` when the socket receives the `round:trick_claimed` acknowledgement (or equivalent event) instead of using a timeout.

**Verifies:** `T4: two rapid taps on claim-trick count as one trick claim`

---

### ✅ A6 · Error display is a bare `<p>` tag

**Problem:** Game errors are shown via an inline `<p className="text-terracotta ...">` in the game page. It can be scrolled out of view, doesn't auto-dismiss, can't stack multiple errors, and may not be visible when a fetch fails off-screen.

**This directly affects N3** (score-table fetch failure not surfaced to user — currently a confirmed silent failure).

**Files:**
- Create: `frontend/components/shared/toast.tsx` (or use an existing library like `sonner`)
- Modify: `frontend/app/game/[gameId]/page.tsx`

**Fix option A — library (recommended):**
```bash
npm install sonner
```
```tsx
// frontend/app/layout.tsx
import { Toaster } from 'sonner';
// Add <Toaster /> to the root layout

// frontend/app/game/[gameId]/page.tsx
import { toast } from 'sonner';
// Replace: setError('Failed to load scores')
// With:    toast.error('Failed to load scores')
```

**Fix option B — minimal custom toast:**
Add a context-based notification queue that renders a fixed-position overlay (so it's always visible regardless of scroll position).

Either way, keep `data-testid="error-toast"` on the rendered error element so the N3 test can find it.

**Verifies:** `N3: score-table fetch blocked mid-request; UI shows error (not silent failure)`

---

### ✅ K3 · Room-code input has autocorrect enabled

**Problem:** The room-code input field doesn't set `autocorrect="off"`, so iOS autocorrect can silently substitute the room code (e.g. "ABCDE" → "abode"), causing join failures.

**File:** Whichever component renders the room-code input on the join page (`frontend/app/room/join/page.tsx` or similar).

**Fix:**
```tsx
<input
  placeholder="Room Code"
  autoCorrect="off"
  autoCapitalize="characters"
  autoComplete="off"
  spellCheck={false}
  // ...
/>
```

**Verifies:** `K3: room-code input does not have autocorrect enabled`

---

## Phase 3 — Mobile resilience (socket + network)

### ✅ F2 · No instant reconnect on `online` event

**Problem:** When the device goes offline and returns, the app waits for socket.io's exponential backoff to kick in (up to 30 s). The browser fires an `online` event immediately on network return — listening to it would trigger an instant reconnect attempt instead.

**File:** `frontend/lib/socket/manager.ts` (or wherever the socket is initialised)

**Fix:**
```ts
window.addEventListener('online', () => {
  if (!socket.connected) {
    socket.connect();
  }
});
```

**Verifies:** `N1: socket reconnects and connection indicator recovers after offline→online` (currently passing via backoff; after this fix it will pass faster and more reliably)

---

### ✅ F1 + F6 · No state resync on foreground or reconnect

**Problem (F1):** When a player backgrounds the app on a real mobile browser, JS is CPU-throttled. Socket events received during that window may be missed or delayed. On foreground, the UI can show stale state until the next server-pushed event.

**Problem (F6):** After a socket reconnects (network drop or long background), the frontend doesn't request a state refresh. It waits passively for the server to push the next event.

These are the same fix — a `game:sync` request in two places.

**Files:**
- `frontend/lib/socket/manager.ts` — add `connect` listener
- `frontend/app/game/[gameId]/page.tsx` (or a layout effect) — add `visibilitychange` listener
- `backend/app/sockets/game.py` (or equivalent) — add `game:sync` handler

**Frontend fix:**
```ts
// In socket manager or game page effect:
socket.on('connect', () => {
  if (currentGameId) {
    socket.emit('game:sync', { gameId: currentGameId });
  }
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && socket.connected && currentGameId) {
    socket.emit('game:sync', { gameId: currentGameId });
  }
});
```

**Backend fix:**
```python
@sio.on('game:sync')
async def on_game_sync(sid, data):
    game_id = data.get('gameId')
    # Re-emit current game state to this socket only
    game = await get_game(game_id)
    await sio.emit('game:state', game.to_dict(), to=sid)
```

**Verifies:** `S3: P3 trick counts accurate after going offline mid-round and reconnecting` (`e2e/tests/mobile/lifecycle.spec.ts`) — currently red. Also improves `B3`, `N1`, `S1`, `S2` (currently passing via connection indicator only).

---

## Phase 4 — Game-blocking bug (backend)

### ✅ F3 · No auto-pass on disconnect — game can deadlock

**Problem:** If a player disconnects during their trump bid turn, the game waits for them indefinitely. The other three players are stuck. There is no timeout, no auto-pass, and no way to skip the disconnected player.

**Confirmed by:** `R2: tab close on own bid turn` (currently fails with "FINDING F3").

**Files:**
- `backend/app/sockets/game.py` (or bidding handler) — add disconnect handler with timer
- Possibly: `backend/app/services/bidding.py` — add `auto_pass(game_id, player_id)` method

**Fix (server-side):**
```python
@sio.on('disconnect')
async def on_disconnect(sid):
    player = await get_player_by_sid(sid)
    game = await get_active_game_for_player(player)
    if game and game.current_bidder == player:
        # Schedule auto-pass after N seconds of disconnection
        asyncio.create_task(auto_pass_after_timeout(game.id, player.id, timeout=30))

async def auto_pass_after_timeout(game_id, player_id, timeout):
    await asyncio.sleep(timeout)
    # Re-check: is the player still disconnected and still the active bidder?
    game = await get_game(game_id)
    player = await get_player(player_id)
    if not player.is_connected and game.current_bidder_id == player_id:
        await bidding_service.auto_pass(game_id, player_id)
        await sio.emit('game:state', game.to_dict(), room=game.room_code)
```

**Verifies:** `R2: tab close on own bid turn; other players can determine if game unblocks`

---

## Phase 5 — Missing product features

### ✅ A3 · Winner not displayed at end of game

**Problem:** The scores page only calls `GET /score-table`, which does not include `winner_id`. The winner is only returned by `POST /api/v1/games/{id}/end`. As a result, the winner is never shown — the `scores-winner` UI element does not exist.

**Files:**
- `frontend/app/game/[gameId]/scores/page.tsx` — fetch result after end, render winner
- `backend/app/api/games.py` — `POST /end` already returns `winner_id`; optionally also include it in `GET /score-table` once the game is finished

**Fix (frontend):**
```tsx
// After the admin calls End Game, fetch the end result:
const [winner, setWinner] = useState<string | null>(null);

const handleEndGame = async () => {
  const result = await fetch(`/api/v1/games/${gameId}/end`, { method: 'POST' });
  const data = await result.json();
  setWinner(data.winner_id ?? null);
};

// Render:
{winner && (
  <div data-testid="scores-winner">
    Winner: {playerName(winner)}
  </div>
)}
```

**Alternative (cleaner):** Add `winner_id` to `GET /score-table` once `game.status === 'FINISHED'`, so no extra fetch is needed.

**Verifies:** `W1: winner is displayed prominently on scores page after game ends` (`e2e/tests/mobile/endgame.spec.ts`) — currently red.

---

### ✅ A2 · No turn indicator during playing phase

**Problem:** All four Claim Trick buttons are enabled simultaneously for all players. There is no "whose lead" indicator, no visual cue for which player should be leading the trick. First-to-click wins attribution.

This is both a UX gap and potentially a rule enforcement gap, depending on whether Israeli Whist has a defined lead order.

**Decision needed first:** Does the game enforce a lead order (winner of last trick leads), or is free-claiming by design?

- **If ordered claiming is intended:** The backend needs to track `current_leader` and reject out-of-order `round:claim_trick` emissions. The frontend shows "Your lead" / "Waiting for [player] to lead."
- **If free-claiming is by design:** Add a visual indicator of "who claimed last" or "trick count per player" so players know the state of the round. `playing-trick-count-{seat}` already exists — a brief highlight on the last claimer would help.

**Files (if ordered):**
- `backend/app/services/round.py` — track `current_leader`, validate claim order
- `frontend/components/game/` — add "Your lead" / "Waiting..." states

**Files (if free-claim):**
- `frontend/components/game/trick-claim-button.tsx` — add last-claimer highlight or animation

**Verifies:** No current failing test — add one once the design decision is made.

---

## Phase 6 — Design decisions

These require a product decision before implementation. They are not bugs.

### A4 · Game end is admin-triggered

**Current behaviour:** The game does not end automatically. An admin must click "End Game" on the scores page, which calls `POST /end`. If the admin leaves, the game stays open indefinitely.

**Options:**
1. **Keep admin-triggered** — add a note to the UI explaining the admin must end the game; add a timeout server-side
2. **Add auto-end** — the server ends the game automatically when a win condition is reached (e.g. a player exceeds a score threshold, or after N rounds)
3. **Majority vote** — any player can vote to end; game ends when 3/4 agree

No implementation guidance until the product decision is made.

---

## Test coverage map

Once all fixes are implemented, these currently-red tests should turn green:

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

And these currently-passing tests should continue to pass (regression guard):

| Tests | Area |
|-------|------|
| V1, V2, T3, O4 | Full rounds on mobile |
| N1, N5, B3 | Socket reconnect |
| B1, B2, B4, S1, S2 | App lifecycle |
| T1, T2a, T2b, X2, X3 | Touch input |
| O1, O2, O3 | Orientation |
| K1, K2 | Keyboard / forms |
| R1, R3 | Session recovery |
| P1, P2 | PWA / manifest |

---

*Supersedes `e2e/MOBILE-GAPS.md` and `e2e/ARCH-OBSERVATIONS.md`.*
