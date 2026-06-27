# Whister — Mobile Readiness Gaps

> Discovered during the mobile emulation e2e suite (branch `feat/e2e-mobile-emulation`, 2026-06-26).
> Full methodology and harness details: `e2e/RECON.md §7`.

---

## Summary

| ID | Severity | Area | Status | One-liner |
|----|----------|------|--------|-----------|
| F1 | Medium | State sync | Open | No `visibilitychange` listener — stale UI on foreground |
| F2 | Low | Reconnect | Open | No `online` event — reconnect is backoff-only (no instant recovery) |
| F3 | **High** | Game flow | **Confirmed bug** | No auto-pass on disconnect — game deadlocks if a player drops on their bid turn |
| F4 | — | Touch | Closed (passing) | Bidding controls meet 44×44 px on iPhone SE and iPhone 14 |
| F5 | Medium | UX | **Confirmed bug** | Viewport meta missing zoom lock — accidental pinch/double-tap zoom during gameplay |
| F6 | Low | State sync | Open | No `sync:state` on reconnect — DOM waits for server to push next event |

---

## F1 — No `visibilitychange` listener (stale UI on foreground)

**Severity:** Medium  
**Tests:** B1, B2, B3, B4, S1, S2  
**Test result:** Partially masked in Playwright (browser JS is never throttled); real-device concern.

**What happens:** When a player backgrounds the app and returns, the frontend does not proactively request a state refresh. On a real mobile browser, JavaScript is CPU-throttled while backgrounded — socket events received during that window may be dropped or queued. On foreground, the UI can show stale bid counts, trick counts, or turn indicators until the *next* server-pushed event arrives.

**Root cause:** No `document.addEventListener('visibilitychange', ...)` handler that triggers a state resync.

**Fix:** In the socket manager (or a layout effect), listen for `visibilitychange` and emit a `game:sync` request (or re-subscribe) when `document.visibilityState === 'visible'`.

---

## F2 — No `online` event listener (no instant reconnect on network return)

**Severity:** Low  
**Tests:** N1  
**Test result:** PASS — but reconnect happens via socket.io's exponential backoff, not instantly.

**What happens:** When the device goes offline and returns, the app does not listen for the browser's `online` event to immediately kick a reconnect attempt. Instead it relies on socket.io's built-in backoff (up to 10 retries, 1–5 s each). In practice reconnect takes 1–30 s depending on where in the backoff cycle the network returns.

**Fix:** Add `window.addEventListener('online', () => socket.connect())` in the socket manager. This triggers an immediate reconnect attempt on network return rather than waiting for the next backoff interval.

---

## F3 — No auto-pass on disconnect — game deadlocks *(confirmed bug)*

**Severity:** High  
**Tests:** B4, R2  
**Test result:** FAIL on R2 (confirmed). B4 passes (turn correctly held — confirms the gap).

**What happens:** If a player disconnects while it is their trump bid turn, the game waits for them indefinitely. No timeout, no auto-pass, no turn skip. The other three players are blocked until the disconnected player reconnects and acts.

**Example:** Player 2 loses signal during bidding. Players 0, 1, 3 sit at "Waiting for player 2…" with no recourse. If player 2 doesn't return, the game is permanently stuck.

**Fix (server-side):** Implement SG-6 D4 — a server-side inactivity timer per bid turn. After N seconds of socket disconnection, auto-pass the disconnected player's turn and advance to the next player.

---

## F4 — Touch targets *(not a gap — passing)*

**Severity:** —  
**Tests:** T2a (iPhone SE), T2b (iPhone 14)  
**Test result:** PASS on both devices.

All bidding controls (suit buttons, counter +/−, Bid, Pass) meet the 44×44 px Apple HIG touch-target guideline on both iPhone SE (375 px wide) and iPhone 14 (390 px wide). No action needed.

---

## F5 — Zoom lock missing from viewport meta *(confirmed bug)*

**Severity:** Medium  
**Tests:** X1  
**Test result:** FAIL (confirmed).

**What happens:** The `<meta name="viewport">` tag does not include `user-scalable=no` or `maximum-scale=1`. During gameplay, a double-tap or pinch gesture zooms the page, disrupting the layout and making controls hard to hit.

**Current tag (approximate):**
```html
<meta name="viewport" content="width=device-width, initial-scale=1" />
```

**Fix (one line):** Add `maximum-scale=1` (or `user-scalable=no`):
```html
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
```

**File:** `frontend/app/layout.tsx` (Next.js root layout metadata).

---

## F6 — No proactive `sync:state` on reconnect (state waits for server push)

**Severity:** Low  
**Tests:** B3, N1  
**Test result:** Observed (not independently failing).

**What happens:** After a socket reconnects (following a network drop or long background), the frontend does not emit a `game:sync` or equivalent request. The UI shows whatever state it last received and waits for the server to push the next event (e.g. another player acts, or a heartbeat fires). If the game advanced significantly while the client was offline, the UI can be stale for an indeterminate period.

**Relationship to F1:** F1 is the foreground/background trigger; F6 is the reconnect trigger. Both point to the same missing resync call — a single fix covers both:

```typescript
socket.on('connect', () => {
  socket.emit('game:sync', { gameId });
});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && socket.connected) {
    socket.emit('game:sync', { gameId });
  }
});
```

The server side needs a corresponding `game:sync` handler that re-emits the current game state to the requesting socket.

---

## Action items

| Priority | Gap | Owner | Fix size |
|----------|-----|-------|----------|
| 1 | **F3** auto-pass on disconnect | Backend | Medium (server-side timer + auto-pass logic) |
| 2 | **F5** zoom lock | Frontend | Trivial (one attribute) |
| 3 | **F1 + F6** proactive state resync | Frontend + Backend | Small (event listener + server handler) |
| 4 | **F2** instant reconnect on `online` | Frontend | Small (one event listener) |
