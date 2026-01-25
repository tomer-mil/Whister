# Bidding Phase Implementation

## Overview
Complete implementation of the trump bidding phase, from game start through auction completion.

## Flow

### 1. Game Start
1. Admin presses "Start Game" button
2. Backend:
   - Creates Round with `phase='trump_bidding'`
   - Sets `current_bidder_id` to seat 0
   - Emits `room:game_starting` to all players
   - Emits `bid:your_turn` to first bidder
3. Frontend:
   - All players redirected to `/game/{gameId}`
   - WebSocket connects and subscribes to bidding events
   - First bidder sees **ActiveBiddingControls**
   - Other players see **WaitingForBidder** view

### 2. Trump Bidding Auction
**Rules:**
- Players bid in rotation (seat 0 → 1 → 2 → 3 → 0...)
- Each turn: **BID** (higher than current) or **PASS** (out of auction permanently)
- Auction ends when 3 players have passed (only 1 remains)
- That player's bid becomes trump

**Backend State:**
- `room:{code}:bid_history` - Chronological list of ALL bids and passes
- `room:{code}:passed_players` - Set of player IDs who passed
- `room:{code}:round:highest_bid` - Current winning bid
- `room:{code}:round:current_bidder_id` - Whose turn it is

**WebSocket Events:**
- `bid:placed` → Broadcast to all when player bids
- `bid:passed` → Broadcast to all when player passes
- `bid:your_turn` → Sent to ONE player when it's their turn
- `bid:trump_set` → Broadcast when auction ends
- `bid:frisch_started` → Broadcast when all 4 pass (no bids)

### 3. Frisch (All Pass Scenario)
If all 4 players pass with no bids:
- Backend triggers `handle_frisch()`
- Increments `frisch_count` (max 3)
- Increases `minimum_bid` (5 → 6 → 7 → 8)
- Clears bid history and passed players
- Emits `bid:frisch_started` to all
- Resets auction with seat 0 as first bidder

### 4. Auction Complete
When 3 players have passed:
- Backend calls `set_trump()` with winner's bid
- Transitions `phase` to `contract_bidding`
- Emits `bid:trump_set` to all players
- Emits `bid:your_turn` to trump winner for contract bidding

## Components

### BidHistoryTimeline
**Purpose:** Beautiful horizontal scrollable timeline showing all bids and passes

**Features:**
- Card-based layout
- Current highest bid highlighted with gold border + star
- Passed bids grayed out
- Outbid bids dimmed
- Suit symbols colored (♥♦ red, ♠♣ black)

### ActiveBiddingControls
**Purpose:** Interactive bidding interface for active bidder

**Features:**
- Bid amount counter (+/- buttons)
- Suit selector (♣ ♦ ♥ ♠ NT)
- Call button (primary, validates bid)
- Pass button (secondary)
- Real-time validation
- Shows current highest bid

### WaitingForBidder
**Purpose:** Clean waiting view for non-active players

**Features:**
- "⏳ Waiting for [Player] to bid..." message
- Current highest bid displayed prominently
- Includes bid history timeline
- Pulsing animations

### TrumpBiddingPanel
**Purpose:** Main orchestrator component

**Features:**
- Conditionally renders ActiveBiddingControls OR WaitingForBidder
- Always shows BidHistoryTimeline
- Shows frisch indicator when applicable
- Gets all state from Zustand store
- Uses `useBidding` hook for WebSocket operations

## State Management

### Zustand Store (bidding-slice.ts)
```typescript
interface BiddingState {
  phase: RoundPhase;
  currentTurnPlayerId: string | null;

  // Trump bidding
  trumpBids: TrumpBid[]; // ALL bids + passes chronologically
  highestTrumpBid: TrumpBid | null; // Current winning bid
  passedPlayers: Set<string>; // Player IDs who passed
  minimumBid: number;
  frischCount: number;

  // Trump result
  trumpWinnerId: string | null;
  trumpWinnerName: string | null;
  trumpWinningBid: number | null;
  trumpSuit: TrumpSuit | null;

  // UI state
  isMyTurn: boolean;
  isSubmitting: boolean;
}
```

### Key Actions
- `addTrumpBid(bid)` - Add a bid to history
- `addPass(playerId, playerName)` - Add pass to history, update passedPlayers
- `setTrumpResult(winnerId, winnerName, bid, suit)` - Set auction winner
- `setFrisch(count, minimumBid)` - Trigger frisch round
- `setCurrentTurn(playerId)` - Update whose turn it is

## Backend Changes

### Files Modified
1. **bidding_service.py**
   - Added bid history tracking to `place_trump_bid()`
   - Added bid history tracking to `pass_trump_bid()`
   - Added bid history clearing to `handle_frisch()`

2. **room_service.py**
   - Added bid history initialization to `start_game()`

3. **rooms.py** (API)
   - Added `bid:your_turn` emission after game starts

4. **game_events.py**
   - Updated `handle_bid_pass()` to include player name

### Redis Keys
- `room:{code}:bid_history` - List of JSON-encoded bid entries
- `room:{code}:passed_players` - Set of user IDs
- `room:{code}:round` - Hash with round state
- `room:{code}:contracts` - Hash of contract bids (later phase)

## Testing Scenarios

### 1. Normal Auction
- Player 1 bids 5♥
- Player 2 bids 6♦
- Player 3 passes
- Player 4 passes
- Player 1 bids 7♠
- Player 2 passes
- **Result:** Player 1 wins with 7♠

### 2. Re-bidding After Being Outbid
- Player 1 bids 5♥
- Player 2 bids 6♦
- Player 3 passes
- Player 4 passes
- Player 1 raises to 7♠
- **Result:** Player 1 can bid again after being outbid

### 3. Frisch Scenario
- All 4 players pass (no bids)
- **Result:** Frisch triggered, minimum bid = 6, auction restarts

### 4. Multiple Frisch
- Frisch 1: minimum = 6
- Frisch 2: minimum = 7
- Frisch 3: minimum = 8
- **Result:** Maximum 3 frisch rounds allowed

## Future Enhancements
- Contract bidding phase (next step)
- State persistence/recovery on reconnection
- Animated transitions between phases
- Sound effects for bids/passes
- Bid history export/review
