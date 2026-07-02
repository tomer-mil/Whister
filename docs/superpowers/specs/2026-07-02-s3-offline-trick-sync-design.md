# S3-offline: Trick Count Sync After Network-Level Reconnect — Design

**Date:** 2026-07-02
**Status:** Approved.
**Topic:** Fix stale trick counts on a player's view after they go fully offline mid-round
(network-level drop, not tab backgrounding) and reconnect, closing the `S3` e2e gap
(`e2e/tests/mobile/lifecycle.spec.ts:169`).

---

## Context & Goal

The `game-state-sync` plan (2026-06-27) already built a `sync:request`/`sync:state` protocol so a
client can ask the server for authoritative game state and rehydrate correctly — including trick
counts in the `playing` phase. It's wired to two triggers in `frontend/hooks/use-game.ts`:

1. `document.visibilitychange` firing `visible` (tab foregrounded) — this is what makes the
   already-passing `S1`/`B`-series tests work.
2. An effect keyed on the `socket` object reference from `useSocket()`, intended to catch
   reconnects after a reload or bfcache restore — this is what makes `P1` work.

`S3` (`e2e/tests/mobile/lifecycle.spec.ts:169`) exercises a third case neither trigger covers: a
player goes offline via a pure network-level drop (`context.setOffline(true)`, no tab
backgrounding, no page reload), other players claim tricks while they're gone, then the network is
restored and Socket.IO's own built-in reconnection logic (`reconnection: true`, configured in
`frontend/lib/socket/manager.ts`) silently reconnects. After reconnect, the affected player's DOM
still shows the pre-disconnect trick count.

## Root Cause

`SocketManager.connect()` only creates a new `io()` client instance on an explicit
disconnect→reconnect cycle. Socket.IO's built-in auto-reconnect (used for a transient network
blip) reuses the *same* `Socket` object — it just re-establishes the transport and re-fires
`'connect'` on that same instance. `use-game.ts`'s trigger #2 (see above) is keyed on the `socket`
object's React-state *identity* changing, via `[socket, emit, roomCode]` in a `useEffect` — since
the object reference never changes on this reconnect path, the effect never re-runs, and
`sync:request` is never re-emitted. This is a gap in how trigger #2 detects "reconnected," not a
gap in the sync protocol itself (which already correctly rehydrates trick counts once asked).

## Decisions Log

| # | Decision | Choice |
|---|---|---|
| Fix location | Where the fix lives | `frontend/hooks/use-game.ts` only. No backend changes — `sync:request`/`sync:state` and trick-count rehydration already work correctly once triggered. |
| Mechanism | How to detect a same-instance reconnect | Listen directly to `socket.on('connect', ...)`, which fires on every reconnect regardless of instance identity — rejected alternative: server-initiated `sync:state` push on `room:player_reconnected`, which duplicates a mechanism the client can already handle correctly and adds backend complexity for no benefit. |
| Initial-connect behavior | Must not regress the already-passing P1/S1 cases | Keep the existing unconditional emit-once-per-effect-run (covers the initial connect, which fires *before* `socket` state is set and thus before this effect can observe it) and *add* the `'connect'` listener alongside it, rather than replacing it. |

---

## Implementation

`frontend/hooks/use-game.ts`, the effect at lines 190-202 (currently emits `sync:request` once
whenever `socket` becomes non-null) becomes:

```ts
useEffect(() => {
  if (!socket || !roomCode) return;
  // Covers the initial connect: by the time `socket` is non-null here, the socket's own
  // 'connect' event has already fired (inside socketManager.connect().then(), before
  // setSocket runs), so this effect can't observe it via the listener below.
  emit('sync:request', { room_code: roomCode }).catch(() => {
    // Best-effort; room:joined remains the fallback state source.
  });
  // Covers every subsequent reconnect. Socket.IO reuses the same Socket instance for its
  // built-in auto-reconnect (network blips), so `socket` identity won't change and this
  // effect won't re-run on its own — listening to 'connect' directly is what catches it.
  const handleReconnect = () => {
    emit('sync:request', { room_code: roomCode }).catch(() => {});
  };
  socket.on('connect', handleReconnect);
  return () => socket.off('connect', handleReconnect);
}, [socket, emit, roomCode]);
```

No changes to `sync:state` handling (lines 148-165) — trick-count rehydration from
`payload.additional_data.tricks` already works; it's just never invoked for this path today.

---

## Edge Cases

- **Multiple reconnects in quick succession:** each `'connect'` event emits its own
  `sync:request`; the server handler is already idempotent/read-only (per the existing comment in
  this file), so redundant emits are harmless — same reasoning already accepted for the
  visibilitychange/reconnect overlap.
- **Reconnect while tab is also backgrounded:** both triggers may fire close together (one from
  `visibilitychange`, one from `'connect'`); same idempotency argument applies.
- **Component unmount mid-flight:** the `socket.off('connect', handleReconnect)` cleanup prevents
  a stale closure from emitting after unmount.

---

## Testing

No new e2e tests needed. `e2e/tests/mobile/lifecycle.spec.ts::S3` already covers this exact flow
(P0 claims tricks while P3 is offline, P3 reconnects via built-in backoff, P3's trick count must
match) and should pass once this fix lands. Existing passing tests (`S1`, `P1`, `N1`, `B1-B4`)
exercise the other two trigger paths and are unaffected since this change is additive to the
existing effect, not a replacement of the other triggers.
