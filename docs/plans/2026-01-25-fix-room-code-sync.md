# Fix Room Code Synchronization Bug

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix the bug where users are redirected from room page back to join page after creating/joining a room.

**Architecture:** Synchronize the two separate room code fields (`roomCode` in room-slice and `currentRoomCode` in connection-slice) by updating both when `room:joined` WebSocket event is received. This ensures the RoomLobbyPage's redirect guard sees the user as being in a room.

**Tech Stack:** React, Next.js, Zustand, Socket.IO

**Root Cause:**
- Room state is split across two Zustand slices with duplicate fields
- `roomCode` (room-slice) - Updated by `setRoomData()` when `room:joined` event received
- `currentRoomCode` (connection-slice) - Updated by `useRoomJoin()` when explicitly joining
- RoomLobbyPage checks `currentRoomCode` (connection-slice) and redirects if null after 3s
- When creating a room, the `room:joined` event only updates `roomCode`, leaving `currentRoomCode` null
- Result: User gets redirected to `/room/join` after 3 seconds

---

## Task 1: Update setRoomData to sync currentRoomCode

**Files:**
- Modify: `frontend/stores/slices/room-slice.ts:103-112`

**Step 1: Add currentRoomCode update to setRoomData**

Modify the `setRoomData` function to also update `currentRoomCode` in the connection slice:

```typescript
setRoomData: (data: { roomCode: string; roomId?: string; isAdmin: boolean; players: any[] }) => {
  set({
    roomCode: data.roomCode,
    roomId: data.roomId || null,
    isAdmin: data.isAdmin,
    players: data.players,
    isJoining: false,
    isCreating: false,
  });

  // Sync currentRoomCode in connection slice to prevent redirect
  get().setCurrentRoomCode(data.roomCode);
},
```

**Step 2: Test manually in development**

Run the development servers:
```bash
# Terminal 1 - Backend
cd backend
source .venv/bin/activate
uvicorn app.main:app --reload

# Terminal 2 - Frontend
cd frontend
npm run dev
```

**Step 3: Verify the fix**

1. Navigate to http://localhost:3000
2. Login with test@example.com
3. Click "Create Room"
4. After room creation, verify you're NOT redirected back to join page
5. Check browser console - should see `[RoomLayout] Already in room: <ROOM_CODE>` on second render
6. Verify player list shows you as a player
7. Wait more than 3 seconds - should stay on room page

Expected: User stays on room page, sees themselves in player list, no redirect

**Step 4: Test room joining flow**

1. Open incognito window and login as different user
2. Join the created room using room code
3. Verify both users see each other in player list
4. Verify no redirects occur

Expected: Both users remain on room page

**Step 5: Check backend logs**

Backend logs should show:
- WebSocket connection established
- `room:join` event received
- `room:joined` event emitted
- NO `service task canceled` errors

**Step 6: Check frontend logs**

Frontend logs should show:
- `[useSocket] Connected successfully`
- `[RoomLayout] Joining room: <CODE>`
- `[useRoom] Received room:joined` with player data
- `[RoomLayout] Successfully joined room`
- NO redirect messages

**Step 7: Commit**

```bash
git add frontend/stores/slices/room-slice.ts
git commit -m "$(cat <<'EOF'
fix: sync currentRoomCode when room:joined event received

Root cause: Room state split across two slices caused redirect bug.
- roomCode (room-slice) updated by room:joined event
- currentRoomCode (connection-slice) stayed null
- RoomLobbyPage checks currentRoomCode, redirects if null after 3s

Fix: setRoomData now updates both roomCode and currentRoomCode.

This ensures pages that check currentRoomCode (like RoomLobbyPage's
redirect guard) see the user as being in the room.

Fixes room creation flow where users were redirected back to join
page after successfully creating and joining a room.

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Add defensive logging to track state synchronization

**Files:**
- Modify: `frontend/hooks/use-room.ts:98-140`

**Step 1: Add logging to room:joined event handler**

Add console logs to track when currentRoomCode is being set:

```typescript
// Handle room joined event - sets initial room state
useSocketEvent(
  'room:joined',
  useCallback(
    (payload: RoomJoinedPayload) => {
      console.log('[useRoom] Received room:joined', payload);
      setRoomData({
        roomCode: payload.room_code,
        roomId: payload.game_id,
        isAdmin: payload.is_admin,
        players: payload.players.map((p) => ({
          userId: p.user_id,
          displayName: p.display_name,
          seatPosition: p.seat_position,
          isConnected: p.is_connected,
          isAdmin: p.is_admin,
        })),
      });

      // Verify currentRoomCode was set
      const currentRoomCode = useStore.getState().currentRoomCode;
      console.log('[useRoom] After setRoomData, currentRoomCode:', currentRoomCode);

      // If game is in progress (trump_bidding, contract_bidding, playing), populate game players
      if (payload.phase && ['trump_bidding', 'contract_bidding', 'playing', 'frisch'].includes(payload.phase)) {
        const store = useStore.getState();
        store.setGameState({
          gameId: payload.game_id,
          currentRound: payload.current_round ?? 1,
          gamePlayers: payload.players.map((p) => ({
            userId: p.user_id,
            displayName: p.display_name,
            seatPosition: p.seat_position,
            contractBid: null,
            tricksWon: 0,
            score: null,
            isConnected: p.is_connected,
          })),
        });

        // Set the bidding phase
        if (payload.phase === 'trump_bidding' || payload.phase === 'frisch') {
          store.setPhase(payload.phase as any);
        }
      }
    },
    [setRoomData]
  )
);
```

**Step 2: Test with logging enabled**

1. Clear browser console
2. Create a new room
3. Watch console logs - should see:
   - `[useRoom] Received room:joined` with payload
   - `[useRoom] After setRoomData, currentRoomCode: <ROOM_CODE>`
4. Verify currentRoomCode matches the room code in the URL

**Step 3: Commit**

```bash
git add frontend/hooks/use-room.ts
git commit -m "$(cat <<'EOF'
chore: add defensive logging for room state sync

Add logging to verify currentRoomCode is set correctly after
room:joined event. Helps debug any future state sync issues.

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Clean up redundant wait timer in RoomLobbyPage

**Files:**
- Modify: `frontend/app/room/[roomCode]/page.tsx:39-57`

**Step 1: Remove or reduce wait timer**

The 3-second wait was a workaround for the state sync issue. Now that we're syncing properly, we can reduce this to a minimal delay (for hydration) or remove it entirely.

Replace the wait logic:

```typescript
// Track if we've waited for hydration
const [hasHydrated, setHasHydrated] = useState(false);

// Wait briefly for Zustand hydration before checking room state
useEffect(() => {
  const timer = setTimeout(() => {
    setHasHydrated(true);
  }, 500); // Reduced from 3000ms - just enough for hydration

  return () => clearTimeout(timer);
}, []);

// Redirect if not in a room (only after hydration)
useEffect(() => {
  if (hasHydrated && !currentRoomCode) {
    console.log('[RoomLobbyPage] No room code after hydration, redirecting to join');
    router.push('/room/join');
  }
}, [hasHydrated, currentRoomCode, router]);
```

**Step 2: Test the reduced timer**

1. Create a new room
2. Verify redirect doesn't happen
3. Verify the page loads quickly (< 1 second)
4. Test with network throttling (Chrome DevTools → Network → Slow 3G)
5. Verify it still works correctly

Expected: Fast page load, no premature redirects

**Step 3: Update variable names for clarity**

```typescript
const [hasHydrated, setHasHydrated] = useState(false);
```

Changed from `hasWaited` to `hasHydrated` to better reflect the purpose.

**Step 4: Commit**

```bash
git add frontend/app/room/[roomCode]/page.tsx
git commit -m "$(cat <<'EOF'
refactor: reduce room lobby hydration wait time

Reduced wait time from 3s to 500ms since we now properly sync
currentRoomCode when room:joined event is received. The short
delay is just for Zustand hydration, not for WebSocket connection.

Renamed hasWaited to hasHydrated for clarity.

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Verify fix with end-to-end testing

**Files:**
- None (manual testing)

**Step 1: Test room creation flow**

1. Clear all browser data (localStorage, cookies)
2. Navigate to http://localhost:3000
3. Login with test@example.com / password123
4. Click "Create Room"
5. Verify:
   - Room code appears
   - Redirected to room lobby
   - Player list shows you as admin
   - NO redirect back to join page
   - Can see room code in header
   - ConnectionStatus shows connected

**Step 2: Test room joining flow**

1. Copy the room code from step 1
2. Open incognito window
3. Login with different user (or create new test user)
4. Click "Join Room"
5. Enter room code
6. Verify:
   - Redirected to room lobby
   - Player list shows both players
   - NO redirect back to join page
   - Both users remain connected

**Step 3: Test with React Strict Mode**

1. Verify `next.config.js` has `reactStrictMode: true`
2. Repeat room creation and joining tests
3. Check console for double-mount logs
4. Verify no duplicate join attempts
5. Verify `[RoomLayout] Already in room` appears on remount

Expected: Everything works correctly despite Strict Mode double-mounting

**Step 4: Test page refresh**

1. While in a room, refresh the page (Cmd+R)
2. Verify:
   - Reconnects to WebSocket
   - Room state restores correctly
   - Player list shows all players
   - NO redirect to join page

**Step 5: Test network interruption**

1. While in a room, open DevTools → Network
2. Set throttling to "Offline"
3. Wait 2 seconds
4. Set throttling back to "No throttling"
5. Verify:
   - Reconnects automatically
   - Room state remains
   - NO redirect to join page

**Step 6: Check for console errors**

Review all console logs from tests:
- No errors or warnings (except expected Strict Mode double-mount logs)
- WebSocket events flowing correctly
- State updates logging properly

**Step 7: Document test results**

Create a test results file:

```bash
cat > docs/test-results-room-code-sync.md <<'EOF'
# Room Code Sync Fix - Test Results

Date: 2026-01-25
Tester: [Your name]

## Test Results

### ✅ Room Creation Flow
- Room created successfully
- User stays on room page
- Player list shows creator as admin
- No redirect after 3+ seconds

### ✅ Room Joining Flow
- Second user joined successfully
- Both users visible in player list
- Both users remain on room page
- Real-time updates working

### ✅ React Strict Mode
- No duplicate join attempts
- Proper "Already in room" detection
- No state corruption

### ✅ Page Refresh
- Reconnects successfully
- Room state restored
- No redirect

### ✅ Network Interruption
- Auto-reconnect works
- Room state preserved
- No redirect

## Issues Found
[None / List any issues]

## Browser Console Logs
[Paste relevant logs if any issues]
EOF
```

---

## Summary

**What was broken:**
- Room state split across two Zustand slices (`roomCode` and `currentRoomCode`)
- `room:joined` WebSocket event only updated `roomCode`
- RoomLobbyPage checked `currentRoomCode`, found it null, redirected to join page

**What we fixed:**
- Made `setRoomData()` sync both `roomCode` and `currentRoomCode`
- Added defensive logging to track state updates
- Reduced unnecessary 3-second wait timer to 500ms hydration delay
- Verified fix with comprehensive manual testing

**Files modified:**
1. `frontend/stores/slices/room-slice.ts` - Sync currentRoomCode
2. `frontend/hooks/use-room.ts` - Add defensive logging
3. `frontend/app/room/[roomCode]/page.tsx` - Reduce wait timer

**Testing approach:**
Manual end-to-end testing covers:
- Room creation flow
- Room joining flow
- React Strict Mode behavior
- Page refresh resilience
- Network interruption recovery
