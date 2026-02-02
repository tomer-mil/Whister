# Score Table Implementation Design

**Date:** 2026-02-02
**Status:** Approved
**Context:** After each round completes, players need to see a comprehensive score table showing all completed rounds with cumulative scores, matching the HLD specification (Section 4.1.5).

---

## Problem Statement

Currently, when a round completes:
1. ❌ Scores are calculated but NOT persisted to database
2. ❌ No Score Table Component exists
3. ❌ "Continue" button immediately starts next round
4. ❌ No way to view historical round scores
5. ❌ No cumulative score tracking across rounds

The HLD requires a landscape-oriented Score Table showing all rounds with cumulative totals.

---

## Design Overview

### User Flow

```
Round Completes
    ↓
Round Summary Modal (current round only)
    ↓ [View Score Table]
Score Table Page (all rounds, landscape)
    ↓
[NEW ROUND] → Start next round
    OR
[END GAME] → Finalize game
```

---

## Data Architecture

### 1. Database Persistence

**When Round Completes:**
- Persist to `RoundPlayer` table:
  - `score` (calculated)
  - `made_contract` (boolean)
  - `contract_bid` (already set during bidding)
  - `tricks_won` (already tracked during play)
- Update `Round.phase` to `COMPLETE`

**When Game Ends:**
- Update `Game.status` to `FINISHED`
- Update `Game.ended_at` timestamp
- Calculate and set `GamePlayer.final_score` (sum of all round scores)
- Set `Game.winner_id` (player with highest total)

### 2. Backend API

#### New Endpoint: Get Score Table
```
GET /api/v1/games/{game_id}/score-table

Response:
{
  game_id: string;
  room_code: string;
  current_round: number;
  rounds: [
    {
      round_number: 1,
      trump_suit: "hearts",
      game_type: "over",
      players: [
        {
          user_id: string,
          display_name: string,
          seat_position: 0,
          contract_bid: 3,
          tricks_won: 3,
          score: 19,
          made_contract: true
        },
        // ... 3 more players
      ]
    },
    // ... more rounds
  ],
  cumulative_scores: {
    [user_id]: total_score
  },
  players: [
    {
      user_id: string,
      display_name: string,
      seat_position: number
    }
  ]
}
```

#### New Endpoint: End Game
```
POST /api/v1/games/{game_id}/end

Response:
{
  game_id: string,
  ended_at: DateTime,
  winner_id: string,
  final_scores: {
    [user_id]: score
  }
}
```

---

## Frontend Architecture

### 1. Route Structure

```
/game/[gameId]           - Main game page (bidding/playing)
/game/[gameId]/scores    - NEW: Score Table (landscape)
```

### 2. Score Table Component

**File:** `frontend/app/game/[gameId]/scores/page.tsx`

**Layout:**
```tsx
┌────────────────────────────────────────────────────────────┐
│                     GAME SCORE TABLE                       │
│                      Room: ABC123                          │
├────────────────────────────────────────────────────────────┤
│                                                            │
│  ┌──────────────────────────────────────────────────────┐ │
│  │ Round │ Trump │  Player 1  │  Player 2  │  Player 3  │ Player 4  │ │
│  ├───────┼───────┼────────────┼────────────┼────────────┼────────────┤ │
│  │   1   │  ♥    │  19 (3/3)  │  14 (2/2)  │ -20 (2/4) │  26 (4/4)  │ │
│  │   2   │  NT   │ -10 (1/2)  │  50 (0/0)  │  35 (5/5)  │ -20 (3/5) │ │
│  │   3   │  ♠    │  26 (4/4)  │ -20 (0/2)  │  19 (3/3)  │  11 (1/1)  │ │
│  ├───────┴───────┼────────────┼────────────┼────────────┼────────────┤ │
│  │    TOTAL      │     35     │     44     │     34     │     17     │ │
│  └───────────────┴────────────┴────────────┴────────────┴────────────┘ │
│                                                            │
│         ┌─────────────────┐      ┌─────────────────┐       │
│         │   NEW ROUND     │      │    END GAME     │       │
│         └─────────────────┘      └─────────────────┘       │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

**Features:**
- Landscape-optimized table layout
- Color-coded scores (green positive, red negative)
- Highlight current player's column
- Responsive with horizontal scroll on mobile
- Loading states
- Error handling

### 3. Updated Round Summary Modal

**Changes:**
- Button text: "Continue to Next Round" → "View Score Table"
- Navigate to `/game/{gameId}/scores` instead of calling next-round

---

## Implementation Tasks

### Backend

**Task 1: Persist scores when round completes**
- File: `backend/app/websocket/game_events.py`
- Location: `complete_round()` function
- After calculating scores, update RoundPlayer records:
```python
# Update database with scores
for player_result in player_results:
    round_player = await db.execute(
        select(RoundPlayer)
        .where(RoundPlayer.round_id == round_id)
        .where(RoundPlayer.user_id == player_result["player_id"])
    )
    rp = round_player.scalar_one()
    rp.score = player_result["score"]
    rp.made_contract = player_result["made_contract"]
    rp.tricks_won = player_result["tricks_won"]
await db.flush()
```

**Task 2: Create Score Table endpoint**
- File: `backend/app/api/games.py` (new file)
- Endpoint: `GET /api/v1/games/{game_id}/score-table`
- Query all rounds with round_players
- Calculate cumulative scores
- Return structured response

**Task 3: Create End Game endpoint**
- File: `backend/app/api/games.py`
- Endpoint: `POST /api/v1/games/{game_id}/end`
- Update Game status to FINISHED
- Calculate final scores for all GamePlayers
- Determine winner
- Emit WebSocket event to all players

**Task 4: Register routes**
- File: `backend/app/api/router.py`
- Add games router

### Frontend

**Task 5: Create Score Table page**
- File: `frontend/app/game/[gameId]/scores/page.tsx`
- Fetch score data from API
- Render landscape table
- Handle NEW ROUND button
- Handle END GAME button

**Task 6: Update Round Summary Modal**
- File: `frontend/components/game/round-summary-modal.tsx`
- Change button text to "View Score Table"
- Update onContinue to navigate instead of API call

**Task 7: Update game page to pass navigation handler**
- File: `frontend/app/game/[gameId]/page.tsx`
- Change handleContinueRound to navigate to scores page

**Task 8: Add TypeScript types**
- File: `frontend/types/game.ts`
- Add ScoreTableResponse interface
- Add RoundScore interface

---

## Testing Checklist

- [ ] Complete a round, verify scores persisted to database
- [ ] Navigate to Score Table, verify all rounds displayed
- [ ] Verify cumulative totals calculated correctly
- [ ] Click "NEW ROUND", verify next round starts
- [ ] Click "END GAME", verify game finalized
- [ ] Test with multiple rounds (3-5 rounds)
- [ ] Test score color coding (positive/negative)
- [ ] Test responsive layout on mobile
- [ ] Test error handling (network failure)
- [ ] Test with different game types (over/under)

---

## Success Criteria

1. ✅ Scores persisted to database when round completes
2. ✅ Score Table shows all completed rounds
3. ✅ Each cell shows `score (tricks/contract)` format
4. ✅ Cumulative totals displayed at bottom
5. ✅ NEW ROUND button starts next round
6. ✅ END GAME button finalizes game
7. ✅ Layout optimized for landscape viewing
8. ✅ Historical data queryable from database

---

## Future Enhancements

- Export score table as image/PDF
- Animated score reveals
- Player statistics/trends
- Round-by-round commentary
- Game replay functionality
