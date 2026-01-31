# Fix Bidding Logic Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix three critical bidding logic issues: disable UI for passed players, show current highest bid to all players in real-time, and properly detect trump auction completion.

**Architecture:** The issues span both backend (bid completion detection) and frontend (UI state management, bid history display). Backend needs to emit bid:placed with bid history. Frontend needs to track passed players and disable UI accordingly.

**Tech Stack:** Backend: Python, FastAPI, Socket.IO, Redis. Frontend: React, TypeScript, Zustand, Socket.IO client.

---

## Problem Analysis

### Issue 1: Passed players can still bid
- **Current:** Frontend doesn't track which players have passed
- **Expected:** Once a player passes, their bidding UI should be disabled
- **Root Cause:** `passedPlayers` set exists in store but isn't checked in UI

### Issue 2: Bids don't appear on other players' screens
- **Current:** `bid:placed` event doesn't include bid in payload, frontend doesn't update highest bid
- **Expected:** When player A bids, all other players should see the bid immediately
- **Root Cause:** Backend doesn't send bid info in `bid:placed`, frontend doesn't update `highestTrumpBid`

### Issue 3: Trump auction doesn't complete properly
- **Current:** After scenario (A bids → B outbids → C passes → D passes → A passes), nothing happens
- **Expected:** B should win, transition to contract bidding
- **Root Cause:** Backend doesn't check for auction completion (3 passes with 1 active bidder remaining)

---

## Task 1: Track Passed Players in Frontend

**Goal:** Frontend tracks who has passed and disables their bidding UI

**Files:**
- Modify: `frontend/stores/slices/bidding-slice.ts`
- Modify: `frontend/hooks/use-bidding.ts`
- Modify: `frontend/components/bidding/trump-bidding-panel.tsx`
- Modify: `frontend/components/bidding/active-bidding-controls.tsx`

### Step 1.1: Check current passedPlayers usage in store

**Action:** Verify `passedPlayers` is properly managed

```typescript
// In bidding-slice.ts - verify these exist:
// - passedPlayers: Set<string> in state
// - addPass() adds to passedPlayers set
// - setFrisch() clears passedPlayers set
```

**Command:** `grep -n "passedPlayers" frontend/stores/slices/bidding-slice.ts`

**Expected:** Should show it exists and is updated in addPass()

### Step 1.2: Add hasPassed check to store

**File:** `frontend/stores/slices/bidding-slice.ts`

**Action:** Add computed value to check if current user has passed

```typescript
// After line 36 (isSubmitting: false), add:

  // Computed - check if user has passed
  get userHasPassed(): boolean {
    const userId = this.user?.id;
    return userId ? this.passedPlayers.has(userId) : false;
  },
```

**Alternative (simpler):** Export the passedPlayers set and check in component

### Step 1.3: Update TrumpBiddingPanel to check if user passed

**File:** `frontend/components/bidding/trump-bidding-panel.tsx`

**Action:** Add check for whether current user has passed

```typescript
// After line 28 (const phase = useStore...)
const passedPlayers = useStore((state) => state.passedPlayers);
const myUserId = useStore((state) => state.user?.id);
const hasUserPassed = myUserId ? passedPlayers.has(myUserId) : false;
```

### Step 1.4: Disable bidding controls for passed players

**File:** `frontend/components/bidding/trump-bidding-panel.tsx`

**Action:** Show disabled state instead of active controls if user has passed

```typescript
// Replace lines 84-92 with:
{isMyTurn && !hasUserPassed ? (
  <ActiveBiddingControls
    minimumBid={minimumBid}
    currentHighestBid={highestTrumpBid?.amount || null}
    currentHighestSuit={highestTrumpBid?.suit || null}
    onBid={handleBid}
    onPass={handlePass}
    isLoading={isSubmitting}
  />
) : hasUserPassed ? (
  <Card variant="outlined" className="p-4 bg-gray-50">
    <p className="text-center text-muted-foreground">
      You have passed. Waiting for others...
    </p>
  </Card>
) : (
  <WaitingForBidder
    currentBidderName={currentBidderName}
    currentHighestBid={highestTrumpBid?.amount || null}
    currentHighestSuit={highestTrumpBid?.suit || null}
    currentHighestBidderName={highestTrumpBid?.playerName || null}
  />
)}
```

### Step 1.5: Test passed player UI

**Manual Test:**
1. Start game with 4 players
2. Player A bids 5♥
3. Player B passes
4. **Verify:** Player B sees "You have passed. Waiting for others..."
5. **Verify:** Player B cannot bid anymore
6. **Verify:** Player C (whose turn it is) can still bid

---

## Task 2: Show Current Highest Bid to All Players

**Goal:** When any player bids, all players immediately see the new highest bid

**Files:**
- Modify: `frontend/hooks/use-bidding.ts`
- Modify: `frontend/stores/slices/bidding-slice.ts`

### Step 2.1: Update highestTrumpBid when bid:placed event received

**File:** `frontend/hooks/use-bidding.ts`

**Action:** Update store's highest bid when bid:placed is received

**Current code (lines 84-101):**
```typescript
socket.on('bid:placed', (payload: BidPlacedPayload) => {
  // Add the bid to store
  if (payload.bid && !payload.bid.is_pass) {
    addTrumpBid({
      playerId: payload.bid.player_id,
      playerName: payload.bid.player_name,
      amount: payload.bid.amount,
      suit: payload.bid.suit as TrumpSuit,
      isPass: false,
      timestamp: new Date().toISOString(),
    });
  }

  // Update current turn
  if (payload.next_bidder_id) {
    setCurrentTurn(payload.next_bidder_id);
  }
});
```

**Problem:** `addTrumpBid()` adds to bid history but doesn't update `highestTrumpBid`

### Step 2.2: Check addTrumpBid implementation

**File:** `frontend/stores/slices/bidding-slice.ts`

**Command:** `grep -A 10 "addTrumpBid:" frontend/stores/slices/bidding-slice.ts`

**Expected:** Should see it updates `highestTrumpBid` when bid is not a pass

**Current (lines 97-106):**
```typescript
addTrumpBid: (bid: TrumpBid) => {
  set((state: BiddingState) => {
    const newBids = [...state.trumpBids, bid];
    return {
      trumpBids: newBids,
      highestTrumpBid: bid.isPass ? state.highestTrumpBid : bid,
      consecutivePasses: 0,
    };
  });
},
```

**Analysis:** This SHOULD work! The issue is that `addTrumpBid()` updates `highestTrumpBid` correctly.

### Step 2.3: Verify BidHistoryTimeline shows highest bid

**File:** `frontend/components/bidding/bid-history-timeline.tsx`

**Action:** Read component to verify it displays highest bid properly

**Command:** `cat frontend/components/bidding/bid-history-timeline.tsx`

**Test:** Manually verify that when player A bids, player B's screen shows the bid in the timeline

---

## Task 3: Fix Trump Auction Completion Detection

**Goal:** Detect when 3 players have passed after a bid and declare the remaining player as winner

**Files:**
- Modify: `backend/app/websocket/game_events.py` (handle_bid_pass)
- Read: `backend/app/services/bidding_service.py` (understand completion logic)

### Step 3.1: Analyze current pass handling logic

**File:** `backend/app/websocket/game_events.py`

**Current logic (lines 348-459):**
1. Check if all 4 passed with no bid → frisch
2. Check if 3 passed after a bid → trump determined
3. Otherwise → advance to next bidder

**Line 400-404:**
```python
# Check if trump is determined (3 passes after a valid bid)
# Count non-passed players
active_bidders = [p for p in players if p.user_id not in passed_players]

if highest_bid_json and len(active_bidders) == 1:
```

**Analysis:** This logic is CORRECT! If there's a highest bid and only 1 active bidder left, trump is set.

### Step 3.2: Debug why completion isn't working

**Root Cause Hypothesis:** The `passed_players` set might not include all players who passed

**Check:** Is `passed_players` properly populated?

**File:** `backend/app/websocket/game_events.py` line 336

```python
# Add to passed players set
await room_manager.redis.sadd(f"room:{room_code}:passed_players", ctx.user_id)
```

**This looks correct!**

### Step 3.3: Add diagnostic logging

**File:** `backend/app/websocket/game_events.py`

**Action:** Add logging to debug auction completion

**After line 402 (`active_bidders = ...`), add:**

```python
logger.info(
    "Trump auction check - room: %s, passed_players: %s, active_bidders: %d, highest_bid: %s",
    room_code,
    passed_players,
    len(active_bidders),
    highest_bid_json,
)
```

### Step 3.4: Test auction completion scenario

**Manual Test:**
1. Start game
2. Player A (seat 0) bids 5♥
3. Player B (seat 1) bids 6♦
4. Player C (seat 2) passes
5. Player D (seat 3) passes
6. Player A (seat 0) passes
7. **Check logs:** Should see "active_bidders: 1"
8. **Expected:** Player B wins, `bid:trump_set` emitted
9. **Verify:** All players transition to contract bidding phase

### Step 3.5: Verify next_bidder calculation after pass

**Potential Issue:** When a player passes, maybe the next bidder calculation is wrong?

**File:** `backend/app/websocket/game_events.py` line 211-213 (in handle_bid_trump) and 462-464 (in handle_bid_pass)

```python
# Get next bidder
next_id, next_name, next_seat = await get_next_bidder(
    room_manager, room_code, player_info.seat_position, passed_players
)
```

**Check get_next_bidder function:**

**File:** `backend/app/websocket/game_events.py`

**Command:** `grep -B 5 -A 30 "async def get_next_bidder" backend/app/websocket/game_events.py`

### Step 3.6: Fix if get_next_bidder has issues

**Expected behavior:** Should skip passed players and wrap around

**If broken:** Update get_next_bidder logic to properly skip passed players

---

## Task 4: Verification and Integration Testing

**Goal:** End-to-end test of all three fixes

### Step 4.1: Complete bidding scenario test

**Test Case:** Full auction with passes

**Setup:**
- 4 players: A (seat 0), B (seat 1), C (seat 2), D (seat 3)

**Steps:**
1. A bids 5♥ → **Verify:** All players see "Current highest: 5♥ by A"
2. B bids 6♦ → **Verify:** All players see "Current highest: 6♦ by B"
3. C passes → **Verify:** C sees "You have passed. Waiting for others..."
4. D passes → **Verify:** D sees "You have passed. Waiting for others..."
5. A passes → **Verify:** All players receive `bid:trump_set` event
6. **Verify:** All players transition to contract bidding phase
7. **Verify:** B sees contract bidding controls (as trump winner)

### Step 4.2: Frisch scenario test

**Test Case:** All 4 players pass with no bid

**Steps:**
1. A passes
2. B passes
3. C passes
4. D passes
5. **Verify:** All players receive `bid:frisch_started` event
6. **Verify:** Frisch indicator shows "Frisch Round 1 - Minimum bid raised to 6"
7. **Verify:** Passed players are cleared (all can bid again)
8. **Verify:** A's turn again

### Step 4.3: Re-bidding after being outbid

**Test Case:** Player can bid again after being outbid

**Steps:**
1. A bids 5♥
2. B bids 6♦
3. C passes
4. D passes
5. A bids 7♠ → **Verify:** Should succeed (A can re-bid even though they bid before)
6. B passes
7. **Verify:** A wins with 7♠

---

## Implementation Notes

### Key Files

**Backend:**
- `backend/app/websocket/game_events.py` - WebSocket event handlers for bidding
- `backend/app/services/bidding_service.py` - Bidding business logic
- `backend/app/websocket/schemas.py` - Event payload schemas

**Frontend:**
- `frontend/stores/slices/bidding-slice.ts` - Bidding state management
- `frontend/hooks/use-bidding.ts` - Bidding WebSocket event handlers
- `frontend/components/bidding/trump-bidding-panel.tsx` - Main bidding UI
- `frontend/components/bidding/active-bidding-controls.tsx` - Bid/pass controls
- `frontend/components/bidding/waiting-for-bidder.tsx` - Waiting state UI
- `frontend/components/bidding/bid-history-timeline.tsx` - Bid history display

### Debugging Tools

**Backend logs:**
```bash
# Watch for bidding events
tail -f backend.log | grep -i "bid\|pass\|trump"
```

**Frontend console:**
```javascript
// In browser console, check state:
window.store = require('@/stores').useStore.getState()
console.log('Passed players:', Array.from(store.passedPlayers))
console.log('Highest bid:', store.highestTrumpBid)
console.log('All bids:', store.trumpBids)
```

### Success Criteria

✅ Passed players cannot bid (UI disabled)
✅ All players see current highest bid in real-time
✅ Auction completes when 3 players have passed after a bid
✅ Frisch works correctly when all 4 pass with no bid
✅ Players can re-bid after being outbid
✅ Smooth transition to contract bidding phase

---

## Execution Strategy

**Recommended:** Subagent-Driven Development (this session)
- Implement Task 1 → Review → Implement Task 2 → Review → etc.
- Fast iteration with code review between tasks
- Can pivot if issues discovered

**Alternative:** Parallel Session
- Open new session with `superpowers:executing-plans`
- Batch execute all tasks with checkpoints
- Good for well-defined problems (this plan is exploratory)

Given the debugging nature of these issues, **Subagent-Driven** is recommended.
