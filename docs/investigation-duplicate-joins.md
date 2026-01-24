# Investigation: Duplicate Room Join Issue

**Date:** 2026-01-24
**Status:** Critical - Blocking game start flow
**Severity:** High - Causes Redis connection exhaustion

---

## Executive Summary

Players are sending **3x duplicate `room:join` requests each** when the game starts, causing:
- 12+ simultaneous Redis operations (4 players × 3 joins)
- Redis connection pool exhaustion ("Too many connections")
- Rapid leave/rejoin cycles
- "Room is full" errors during transition
- Eventually successful joins, but chaotic and unreliable

**Root Cause:** Multiple React component lifecycles during page navigation from `/room/[roomCode]` → `/game/[gameId]`, combined with independent hook state management for a shared WebSocket singleton.

---

## Problem Analysis

### Current Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Socket.IO Client Singleton (lib/socket/client.ts)         │
│  - Single WebSocket connection for entire app               │
│  - Shared across all components                             │
└─────────────────────────────────────────────────────────────┘
                           ▲
                           │
              ┌────────────┴────────────┐
              │                         │
    ┌─────────▼─────────┐    ┌─────────▼─────────┐
    │  Room Layout      │    │  Game Layout      │
    │  /room/[code]     │    │  /game/[id]       │
    │                   │    │                   │
    │  useRoom()        │    │  useRoom()        │
    │    └─useSocket()  │    │    └─useSocket()  │
    └───────────────────┘    └───────────────────┘
```

**The Problem:** Two independent hook instances managing a single shared socket connection.

### The Duplicate Join Flow

**Timeline of events during game start:**

```
T=0ms:   User on /room/CUUENS
         - Room layout mounted
         - useRoom/useSocket initialized
         - Socket joins room successfully

T=100ms: Admin clicks "Start Game"
         - POST /api/v1/rooms/{code}/start
         - Server emits room:game_starting event

T=150ms: Room layout receives room:game_starting
         - Calls router.push('/game/{gameId}')
         - Next.js begins navigation

T=200ms: ⚠️ CRITICAL OVERLAP PERIOD ⚠️
         - Game layout MOUNTING (new useRoom/useSocket initializing)
         - Room layout STILL MOUNTED (old useRoom/useSocket still active)
         - BOTH layouts exist simultaneously

T=250ms: Game layout's useSocket hook triggers
         - roomCode available from store
         - socket connected
         - Sends room:join request #1

T=260ms: React re-render (displayName updated or state change)
         - useSocket dependencies trigger again
         - Sends room:join request #2

T=270ms: Another re-render (phase update from backend)
         - useSocket triggers again
         - Sends room:join request #3

T=300ms: Room layout unmounting
         - useSocket cleanup runs
         - Sends room:leave request

T=350ms: Backend processing chaos
         - 12 join requests from 4 players
         - Multiple leave requests
         - Redis pool exhausted
         - Some joins fail with "Room is full"
         - Eventually stabilizes but messy
```

### Why 3x Duplicates Per Player?

**Three triggers identified:**

1. **Initial mount of game layout** - First join when socket + roomCode ready
2. **Store update from room:joined event** - State change causes re-render, dependencies haven't changed but effect runs again
3. **Phase update from backend** - When backend emits bid:your_turn or game state updates

**React Strict Mode:** In development, React intentionally double-mounts components to help find bugs. This can contribute to duplicates but is NOT the primary cause (production has same issue).

### Why Ref-Based Fix Didn't Work

**Current code in `use-socket.ts`:**

```typescript
const currentRoomRef = useRef<string | undefined>(undefined);

useEffect(() => {
  if (!socket || !roomCode || !isConnected) return;

  // Skip if already in this room
  if (currentRoomRef.current === roomCode) return;

  // ... join logic ...
  currentRoomRef.current = roomCode;
}, [socket, roomCode, isConnected]);
```

**Why this fails:**

1. **Multiple hook instances** - Game layout has its OWN ref, separate from room layout's ref
2. **Hook state is local** - Each component's hooks have independent state
3. **No global coordination** - Nothing tracks "is ANY component already in this room?"
4. **Shared socket, independent state** - Socket is singleton but hook state is not

---

## Best Practices for Gaming Room Management

### Industry Standards

**1. Single Source of Truth for Connection State**
- WebSocket connection state should live in ONE place (not multiple hooks)
- Use global state manager (Zustand/Redux) or React Context
- All components consume connection state, don't manage it independently

**2. Room Membership as Global State**
- Current room should be managed globally, not per-component
- Joining/leaving should be explicit actions, not side effects of mounting

**3. Idempotent Join Requests**
- Backend should handle duplicate joins gracefully (already joining = no-op)
- Frontend should debounce/deduplicate join requests
- Use request IDs to track in-flight operations

**4. Navigation-Safe Architecture**
- Don't rely on component lifecycle for critical operations
- Use route guards or middleware for room transitions
- Ensure cleanup completes before new route mounts

**5. Connection Pooling**
- Backend should have appropriate pool sizes for expected load
- Use connection pooling libraries properly configured
- Monitor and alert on pool exhaustion

### React/WebSocket Patterns

**Pattern 1: Provider Pattern**
```typescript
// Single SocketProvider at app root
// All components use useSocketContext() to access
// Only one hook instance manages connection lifecycle
```

**Pattern 2: Imperative API**
```typescript
// Expose join/leave as functions, not effects
// Components call socketManager.joinRoom(code) explicitly
// No automatic joining based on props/state changes
```

**Pattern 3: Route-Level Guards**
```typescript
// Middleware checks room membership before rendering
// Ensures user is in correct room before mounting components
// Prevents race conditions during navigation
```

**Pattern 4: Optimistic UI + Backend Deduplication**
```typescript
// Frontend sends join requests without checking
// Backend tracks in-flight operations and deduplicates
// Returns 200 for "already joined" scenarios
```

---

## Where Current Code Falls Short

### Critical Issues

**1. Multiple Hook Instances Managing Shared Resource**
- **Location:** `use-socket.ts`, called from both room and game layouts
- **Problem:** Each layout creates independent hook state for same socket
- **Impact:** No coordination between layouts during navigation
- **Severity:** Critical

**2. Room Join as Side Effect of Mount**
- **Location:** `use-socket.ts` lines 85-117
- **Problem:** Joining room happens in useEffect based on dependencies
- **Impact:** Every re-render can potentially trigger join
- **Severity:** Critical

**3. No Request Deduplication**
- **Location:** Frontend - no tracking of in-flight requests
- **Problem:** No check if join request already pending
- **Impact:** Rapid succession of identical requests
- **Severity:** High

**4. Backend Not Idempotent Enough**
- **Location:** `backend/app/websocket/room_manager.py` join_room()
- **Problem:** While it handles "already in room", rapid concurrent joins can race
- **Impact:** Under heavy load, some requests fail with errors
- **Severity:** Medium

**5. Redis Connection Pool Configuration**
- **Location:** Backend Redis client initialization
- **Problem:** Pool size not configured for burst traffic (12+ simultaneous operations)
- **Impact:** Connection exhaustion during game start
- **Severity:** Medium

**6. No Global Connection State**
- **Location:** Zustand store has roomCode but not connection status
- **Problem:** Each component independently decides when to join
- **Impact:** Lack of coordination during lifecycle events
- **Severity:** High

**7. Cleanup Race Conditions**
- **Location:** `use-socket.ts` cleanup function
- **Problem:** Unmounting room layout sends leave while game layout sends join
- **Impact:** Thrashing between joined/left states
- **Severity:** High

### Secondary Issues

**8. No Loading States During Transition**
- Navigation from room → game has no intermediate state
- Users see nothing while join requests are processing

**9. Error Recovery Not Implemented**
- If join fails during transition, user stuck in limbo
- No retry logic or fallback to room page

**10. displayName Closure Issues**
- Commented out from dependencies but captured in closure
- Can cause stale data if displayName changes during session

---

## Proposed Solution

### High-Level Strategy

**Move from "Component-Managed Connections" to "Global Connection Management"**

1. **Single WebSocket Manager** - Global singleton managing ALL room operations
2. **Explicit Join/Leave API** - Components call functions, not side effects
3. **Centralized State** - Zustand store tracks connection + room membership
4. **Idempotent Backend** - Server handles concurrent joins gracefully
5. **Navigation Guards** - Ensure clean transitions between pages

### Architecture Changes

```
┌──────────────────────────────────────────────────────────────┐
│  WebSocket Manager (NEW)                                     │
│  - Singleton service for connection + room operations        │
│  - Exposes: connect(), joinRoom(), leaveRoom()               │
│  - Handles: deduplication, queueing, error recovery          │
│  - Updates Zustand store directly                            │
└──────────────────────────────────────────────────────────────┘
                           ▲
                           │
              ┌────────────┴────────────┐
              │                         │
    ┌─────────▼─────────┐    ┌─────────▼─────────┐
    │  Room Page        │    │  Game Page        │
    │                   │    │                   │
    │  useEffect(() => {│    │  useEffect(() => {│
    │    mgr.joinRoom() │    │    // Already     │
    │  }, [])           │    │    // joined!     │
    └───────────────────┘    └───────────────────┘
```

**Key Differences:**
- ONE call to joinRoom() per room (not per component)
- Navigation doesn't trigger new join (already joined)
- Explicit leaveRoom() only when actually leaving
- Global state prevents duplicate operations

---

## Implementation Plan

### Phase 1: Backend Hardening (Low Risk)

**Goal:** Make backend handle concurrent joins gracefully

**Tasks:**

1. **Increase Redis Connection Pool**
   - File: `backend/app/core/database.py` (or wherever Redis client initialized)
   - Change: Increase `max_connections` from default (50?) to 200
   - Why: Handle burst traffic during game start

2. **Add Request Deduplication Tracking**
   - File: `backend/app/websocket/room_manager.py`
   - Add: Track in-flight join operations in Redis
   - Key: `room:{code}:joining:{user_id}` with 5-second TTL
   - Logic: If key exists, return existing JoinRoomResult, don't re-process

3. **Make Join Operations More Idempotent**
   - File: `backend/app/websocket/room_manager.py` join_room()
   - Change: If user already joining (not just joined), wait and return same result
   - Why: Prevent race conditions between concurrent join requests

4. **Add Rate Limiting (Optional)**
   - Consider rate limiting join requests per user (max 1/second)
   - Prevents abuse and reduces load

**Risk:** Low - Backend changes don't affect working features
**Timeline:** 1-2 hours
**Testing:** Unit tests + manual testing with 4 players

---

### Phase 2: Frontend Refactor (Medium Risk)

**Goal:** Move from component lifecycle to explicit connection management

**Tasks:**

1. **Create WebSocket Manager Service**
   - File: `frontend/lib/socket/manager.ts` (NEW)
   - Exports: `socketManager` singleton
   - Methods:
     - `connect(accessToken)` - Initialize socket
     - `joinRoom(roomCode, displayName)` - Join a room (idempotent)
     - `leaveRoom(roomCode)` - Leave current room
     - `isInRoom(roomCode)` - Check if already joined
     - `getCurrentRoom()` - Get current room code
   - Features:
     - Request deduplication (only 1 join request in flight at a time)
     - Promise-based API (await join completion)
     - Updates Zustand store with results
     - Emits events to Zustand listeners

2. **Update Zustand Store**
   - File: `frontend/stores/slices/connection-slice.ts` (NEW)
   - State:
     - `connectionStatus: 'disconnected' | 'connecting' | 'connected'`
     - `currentRoom: string | null`
     - `roomJoinStatus: 'idle' | 'joining' | 'joined' | 'leaving'`
     - `lastJoinError: string | null`
   - Actions:
     - `setConnectionStatus(status)`
     - `setRoomJoinStatus(status)`
     - `setCurrentRoom(roomCode)`

3. **Refactor useSocket Hook**
   - File: `frontend/hooks/use-socket.ts`
   - **Remove:** Room joining logic from useEffect
   - **Keep:** Socket initialization, connection state
   - **Change:** Hook becomes "read-only" - just exposes socket + status
   - No more automatic joining based on props

4. **Create useRoomJoin Hook (NEW)**
   - File: `frontend/hooks/use-room-join.ts`
   - Purpose: Explicitly join room when component needs it
   - API:
     ```typescript
     const { joinRoom, leaveRoom, isJoined, isJoining } = useRoomJoin();

     // Components call explicitly:
     useEffect(() => {
       if (roomCode) {
         joinRoom(roomCode, displayName);
       }
       return () => leaveRoom(roomCode);
     }, [roomCode]);
     ```
   - Uses socketManager under the hood
   - Returns status from Zustand store

5. **Update Room Layout**
   - File: `frontend/app/room/[roomCode]/layout.tsx`
   - Change: Call `joinRoom()` explicitly when roomCode available
   - Remove: Automatic join from useRoom hook
   - Add: Loading state while joining

6. **Update Game Layout**
   - File: `frontend/app/game/[gameId]/layout.tsx`
   - Change: **DO NOT** call joinRoom (already joined from room page)
   - Keep: useRoom for event subscriptions
   - Add: Check if in correct room, redirect if not

7. **Update useRoom Hook**
   - File: `frontend/hooks/use-room.ts`
   - Change: Remove useSocket call (no automatic joining)
   - Keep: Event subscriptions (room:joined, player_joined, etc.)
   - Use: socketManager.getSocket() to access socket
   - No side effects, just event handlers

**Risk:** Medium - Core connection logic changing
**Timeline:** 3-4 hours
**Testing:** Full E2E test of create room → join → start game → bidding

---

### Phase 3: Navigation Safety (Low Risk)

**Goal:** Ensure clean transitions between pages

**Tasks:**

1. **Add Loading State During Navigation**
   - Show loading screen while navigating from room → game
   - Prevent user actions during transition

2. **Add Route Guard for Game Page**
   - Check if user is in a room before rendering game
   - Redirect to join page if not in room
   - Prevents accessing game page directly

3. **Improve Error Handling**
   - If join fails during transition, show error + retry button
   - Auto-retry with exponential backoff
   - Fallback: Return to room page

**Risk:** Low - Improving UX, not changing core logic
**Timeline:** 1-2 hours
**Testing:** Error scenarios (network failure, room full, etc.)

---

### Phase 4: Testing & Validation

**Goal:** Ensure all scenarios work reliably

**Test Scenarios:**

1. **Happy Path**
   - 4 players create/join room
   - Admin starts game
   - All players see bidding UI immediately
   - No duplicate joins in backend logs

2. **Edge Cases**
   - Player refreshes page during game
   - Player navigates back/forward
   - Player joins, leaves, re-joins
   - Network disconnection + reconnection

3. **Load Testing**
   - Multiple games starting simultaneously
   - Verify no Redis connection exhaustion
   - Check response times remain acceptable

4. **Error Scenarios**
   - Room full when joining
   - Network failure during join
   - Backend restart during game
   - Token expiration

**Risk:** None - Testing only
**Timeline:** 2-3 hours
**Deliverable:** Test report with pass/fail for each scenario

---

## Summary of Changes

### Files to Create
- `frontend/lib/socket/manager.ts` - WebSocket manager singleton
- `frontend/stores/slices/connection-slice.ts` - Connection state
- `frontend/hooks/use-room-join.ts` - Explicit room join hook

### Files to Modify
- `backend/app/core/database.py` - Redis pool configuration
- `backend/app/websocket/room_manager.py` - Idempotent joins
- `frontend/hooks/use-socket.ts` - Remove auto-join logic
- `frontend/hooks/use-room.ts` - Remove useSocket, use manager
- `frontend/app/room/[roomCode]/layout.tsx` - Explicit join
- `frontend/app/game/[gameId]/layout.tsx` - Don't re-join

### Total Effort Estimate
- **Phase 1 (Backend):** 1-2 hours
- **Phase 2 (Frontend):** 3-4 hours
- **Phase 3 (Navigation):** 1-2 hours
- **Phase 4 (Testing):** 2-3 hours
- **Total:** 7-11 hours

---

## Success Criteria

✅ **No duplicate join requests** - Each player sends exactly 1 join request
✅ **No Redis connection errors** - Pool handles load gracefully
✅ **Clean navigation** - Smooth transition from room → game
✅ **Immediate bidding UI** - Players see controls right away
✅ **No "Unknown" players** - All player names display correctly
✅ **Reconnection works** - Page refresh doesn't break game state
✅ **Error recovery** - Failed joins can be retried
✅ **Backend logs clean** - No tracebacks or warnings during game start

---

## Rollback Plan

If Phase 2 (frontend refactor) causes issues:

1. **Immediate:** Revert frontend changes, keep Phase 1 backend improvements
2. **Temporary Fix:** Add simple debounce to join requests (500ms)
3. **Monitor:** Check if backend improvements alone reduce issues
4. **Iterate:** Try smaller incremental changes to frontend

**Files to backup before Phase 2:**
- `frontend/hooks/use-socket.ts`
- `frontend/hooks/use-room.ts`
- `frontend/app/room/[roomCode]/layout.tsx`
- `frontend/app/game/[gameId]/layout.tsx`

---

## Next Steps

1. **Review this investigation** with stakeholders
2. **Get approval** for implementation approach
3. **Start with Phase 1** (low risk, immediate improvement)
4. **Create feature branch** for Phase 2 refactor
5. **Incremental testing** after each phase
6. **Document changes** in code comments

---

*Investigation completed: 2026-01-24*
*Ready for implementation approval*
