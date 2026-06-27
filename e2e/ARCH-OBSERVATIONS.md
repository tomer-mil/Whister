# Whister — Architectural Observations

> Discovered during e2e reconnaissance and the playability + mobile emulation test suites (2026-06-24 – 2026-06-26).
> Full raw findings: `e2e/RECON.md`. Mobile-specific gaps: `e2e/MOBILE-GAPS.md`.

These are observations about how the app is built — bugs, missing features, and design decisions that aren't obvious from the product spec. They are not test failures; they are things a developer touching this codebase should know.

---

## Summary

| # | Area | Type | Finding |
|---|------|------|---------|
| A1 | Playing phase | **Bug** | `isLoading` is always `false` — Claim Trick button never disables |
| A2 | Playing phase | Design gap | No turn order or "whose lead" indicator during playing phase |
| A3 | Scores page | **Missing feature** | Winner is never displayed — scores page doesn't call `POST /end` |
| A4 | Game flow | Design decision | Game end is admin-triggered, not automatic |
| A5 | Bidding UI | Dead code | `FrischIndicator` component exists but is never rendered |
| A6 | Error handling | Design debt | `error-toast` is a bare `<p>` tag, not a proper notification system |

---

## A1 — `isLoading` always `false` in Claim Trick button

**Type:** Bug  
**File:** `frontend/app/game/[gameId]/page.tsx`

```tsx
const [isLoading] = useState(false);  // setter never called
// ...
<TrickClaimButton disabled={isLoading} isLoading={isLoading} />
```

The loading state is initialised to `false` and never set to `true`. The Claim Trick button has no loading guard — a player can tap it repeatedly before the server acknowledges the first claim. The server appears to handle idempotency (duplicate claims are rejected), but the UI gives no feedback that a claim is in flight.

**Impact:** T4 in the mobile suite confirmed this: two rapid taps on Claim Trick count as one server-side claim, but the UI doesn't prevent the second tap. On a slow connection (see mobile finding N4), this could result in confusing double-tap behaviour.

**Fix:** Set `isLoading` to `true` in the `handleClaimTrick` handler, and reset it in the socket response handler (or on error).

---

## A2 — No turn indicator during playing phase

**Type:** Design gap  
**File:** `frontend/app/game/[gameId]/page.tsx`, `frontend/components/game/`

During the playing phase, all four `Claim Trick` buttons are enabled simultaneously for all players. There is no "whose lead it is" indicator, no per-turn restriction, and no visual cue for which player should be leading the trick. Trick attribution is solely by who clicks first.

**Attribution model:** Tricks are credited to whoever's socket emits `round:claim_trick` first. The server does not enforce a lead order.

**Impact:** For new players, there is no UI guidance on whose turn it is to lead. This is a product decision about game rules (free-claim vs. ordered-claim), but if ordered claiming is the intended design, the UI and backend both need work.

---

## A3 — Winner never displayed on scores page

**Type:** Missing feature  
**File:** `frontend/app/game/[gameId]/scores/page.tsx`

The scores page only calls `GET /api/v1/games/{id}/score-table`. The `score-table` response does **not** include `winner_id` — that field only appears in the `POST /api/v1/games/{id}/end` response.

As a result, the scores page never shows who won the game. The `scores-winner` UI element does not exist.

**API shapes:**
```
GET  /score-table  →  { rounds, cumulative_scores, players }       ← no winner
POST /end          →  { winner_id, final_scores, ended_at }        ← winner here
```

**Fix:** After "End Game" is triggered, fetch `POST /end` (or `GET /games/{id}` if game status is exposed) and render the winner. Alternatively, include `winner_id` in the score-table response once the game is finished.

---

## A4 — Game end is admin-triggered, not automatic

**Type:** Design decision  
**File:** `backend/app/api/games.py`, `frontend/app/game/[gameId]/scores/page.tsx`

The game does not end automatically when a winning score is reached. An admin player must explicitly click "End Game" on the scores page, which calls `POST /api/v1/games/{id}/end`. Only the game admin's request is accepted; other players see the button but their clicks are rejected.

**Impact:** If the admin leaves or forgets to end the game, the session stays open indefinitely. There is no timeout or auto-end trigger.

**Related to A3:** Winner display (A3) depends on this call being made.

---

## A5 — `FrischIndicator` component exists but is never used

**Type:** Dead code  
**File:** `frontend/components/bidding/frisch-indicator.tsx`

A standalone `FrischIndicator` React component exists, but `TrumpBiddingPanel` (the only place frisch state is displayed) renders its own inline frisch block rather than using the component:

```tsx
// TrumpBiddingPanel renders this inline:
{frischCount > 0 && (
  <div className="bg-ochre/10 border-l-4 border-ochre ...">
    ...
  </div>
)}
// FrischIndicator is never imported or used anywhere
```

**Impact:** Low — no runtime effect. But the standalone component will confuse anyone who tries to use it expecting it to appear in the game.

**Fix:** Either delete `frisch-indicator.tsx` and keep the inline block, or refactor `TrumpBiddingPanel` to use the component. Either is fine; the inconsistency is the problem.

---

## A6 — Error display is a bare `<p>` tag, not a notification system

**Type:** Design debt  
**File:** `frontend/app/game/[gameId]/page.tsx`

Errors in the game page are shown via an inline `<p>` element:

```tsx
{error && (
  <p className="text-sm text-terracotta ...">
    {error}
  </p>
)}
```

There is no toast, snackbar, or notification system. This means:
- Errors can be obscured by other page content
- There is no auto-dismiss
- Multiple simultaneous errors cannot be stacked or queued
- The `error-toast` test ID (used in the e2e suite for N3) is attached to this `<p>`, which may not be visible if the element is scrolled out of view

**Impact:** The N3 network test (score-table fetch blocked) expects an error to surface via this element. If the inline `<p>` is off-screen or the error is swallowed silently upstream, the user gets no feedback at all.

**Fix:** Introduce a proper notification/toast system (e.g. `react-hot-toast`, `sonner`, or a custom context). Worth doing before adding more error-handling paths.
