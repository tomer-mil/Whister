# Score Table Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement comprehensive score table showing all completed rounds with cumulative scores, replacing the immediate "continue to next round" flow.

**Architecture:** Add database persistence for round scores, create new Score Table page with landscape layout, add backend endpoints for fetching score history and ending games. Flow: Round Complete Modal → Score Table Page → New Round/End Game.

**Tech Stack:** FastAPI, SQLAlchemy, PostgreSQL, Next.js 15, TypeScript, Zustand, TailwindCSS

---

## Context

Currently when a round completes:
- Scores are calculated but NOT persisted to database
- "Continue" button immediately starts next round
- No way to view historical round scores or cumulative totals

The HLD (section 4.1.5) requires a landscape Score Table showing all rounds with cumulative totals.

**Design Document:** `docs/plans/2026-02-02-score-table-design.md`

---

## Task 1: Persist Round Scores to Database

**Files:**
- Modify: `backend/app/websocket/game_events.py:950-1050`
- Modify: `backend/app/services/room_service.py` (for database session access)

**Step 1: Add database dependency to complete_round**

In `game_events.py`, locate the `register_round_handlers` function and add database dependency:

```python
from app.core.database import db_manager
from app.models.round import RoundPlayer
from sqlalchemy import select
```

**Step 2: Persist scores after calculation**

In `complete_round()` function, after calculating scores (around line 1017), add database persistence:

```python
# After this line:
# player_results.append({...})

# Add database persistence
async with db_manager.session() as db:
    for player_result in player_results:
        # Get RoundPlayer record
        result = await db.execute(
            select(RoundPlayer)
            .where(RoundPlayer.round_id == round_id)
            .where(RoundPlayer.user_id == player_result["player_id"])
        )
        round_player = result.scalar_one()

        # Update with calculated scores
        round_player.score = player_result["score"]
        round_player.made_contract = player_result["made_contract"]
        round_player.tricks_won = player_result["tricks_won"]

    await db.commit()
```

**Step 3: Update Round phase to COMPLETE**

After persisting scores, update the round phase:

```python
# Update round phase in Redis
await room_manager.redis.hset(
    f"room:{room_code}:round",
    "phase",
    RoundPhase.COMPLETE.value,
)
```

**Step 4: Test manually**

Run: Complete a round in the UI, then check database:
```bash
psql -d whist_db -c "SELECT score, made_contract, tricks_won FROM round_players WHERE round_id = '<round_id>';"
```
Expected: See scores populated (not NULL)

**Step 5: Commit**

```bash
git add backend/app/websocket/game_events.py
git commit -m "feat: persist round scores to database when round completes

- Update RoundPlayer.score, made_contract, tricks_won fields
- Set Round.phase to COMPLETE
- Enables historical score tracking across rounds

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 2: Create Games API Router

**Files:**
- Create: `backend/app/api/games.py`
- Modify: `backend/app/api/router.py`

**Step 1: Create games.py with basic structure**

```python
"""Game-related API endpoints."""
import logging
from uuid import UUID

from fastapi import APIRouter, status
from sqlalchemy import select

from app.api.deps import CurrentUser, DatabaseDep
from app.models.game import Game, GamePlayer
from app.models.round import Round, RoundPlayer
from app.schemas.error import ErrorResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/games", tags=["games"])
```

**Step 2: Register router in router.py**

In `backend/app/api/router.py`, add games router:

```python
from app.api import auth, groups, rooms, users, games

# Add to router includes
api_router.include_router(games.router)
```

**Step 3: Test router registration**

Run: `cd backend && python -m pytest tests/ -v -k router`
Expected: No errors, games router registered

**Step 4: Commit**

```bash
git add backend/app/api/games.py backend/app/api/router.py
git commit -m "feat: create games API router

- Add games.py with router structure
- Register in main API router
- Prepare for score-table and end-game endpoints

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 3: Create Score Table Response Schema

**Files:**
- Create: `backend/app/schemas/score.py`

**Step 1: Define score table schemas**

```python
"""Score table response schemas."""
from pydantic import BaseModel, Field


class PlayerRoundScore(BaseModel):
    """Player's score for a single round."""

    user_id: str = Field(description="Player user ID")
    display_name: str = Field(description="Player display name")
    seat_position: int = Field(ge=0, le=3, description="Seat position (0-3)")
    contract_bid: int = Field(ge=0, le=13, description="Contract bid amount")
    tricks_won: int = Field(ge=0, le=13, description="Tricks won")
    score: int = Field(description="Score for this round")
    made_contract: bool = Field(description="Whether contract was made")


class RoundScore(BaseModel):
    """Complete round with all player scores."""

    round_number: int = Field(ge=1, description="Round number")
    trump_suit: str = Field(description="Trump suit (clubs/diamonds/hearts/spades/no_trump)")
    game_type: str = Field(description="Game type (over/under)")
    players: list[PlayerRoundScore] = Field(description="Player scores for this round")


class PlayerInfo(BaseModel):
    """Basic player information."""

    user_id: str
    display_name: str
    seat_position: int


class ScoreTableResponse(BaseModel):
    """Complete score table for a game."""

    game_id: str = Field(description="Game UUID")
    room_code: str = Field(description="6-character room code")
    current_round: int = Field(description="Current round number")
    rounds: list[RoundScore] = Field(description="All completed rounds")
    cumulative_scores: dict[str, int] = Field(description="Total scores by user_id")
    players: list[PlayerInfo] = Field(description="Player info ordered by seat")


class EndGameResponse(BaseModel):
    """Response after ending a game."""

    game_id: str
    ended_at: str  # ISO datetime string
    winner_id: str | None
    final_scores: dict[str, int]
```

**Step 2: Test schema imports**

Run: `cd backend && python -c "from app.schemas.score import ScoreTableResponse; print('OK')"`
Expected: "OK"

**Step 3: Commit**

```bash
git add backend/app/schemas/score.py
git commit -m "feat: add score table response schemas

- PlayerRoundScore for individual round scores
- RoundScore for complete round data
- ScoreTableResponse for full score table
- EndGameResponse for game completion

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 4: Implement Get Score Table Endpoint

**Files:**
- Modify: `backend/app/api/games.py`

**Step 1: Add score table endpoint**

```python
from app.schemas.score import (
    ScoreTableResponse,
    RoundScore,
    PlayerRoundScore,
    PlayerInfo,
)

@router.get(
    "/{game_id}/score-table",
    response_model=ScoreTableResponse,
    responses={
        200: {"description": "Score table retrieved"},
        401: {"description": "Unauthorized", "model": ErrorResponse},
        404: {"description": "Game not found", "model": ErrorResponse},
    },
)
async def get_score_table(
    game_id: UUID,
    current_user: CurrentUser,
    db: DatabaseDep,
) -> ScoreTableResponse:
    """Get score table for a game showing all completed rounds.

    Returns all completed rounds with player scores and cumulative totals.
    """
    # Get game
    result = await db.execute(
        select(Game)
        .where(Game.id == game_id)
    )
    game = result.scalar_one_or_none()

    if not game:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Game not found")

    # Get all players ordered by seat
    result = await db.execute(
        select(GamePlayer)
        .where(GamePlayer.game_id == game_id)
        .order_by(GamePlayer.seat_position)
    )
    game_players = list(result.scalars().all())

    # Get all completed rounds with players
    result = await db.execute(
        select(Round)
        .where(Round.game_id == game_id)
        .where(Round.phase == RoundPhase.COMPLETE)
        .order_by(Round.round_number)
    )
    rounds = list(result.scalars().all())

    # Build rounds data
    rounds_data = []
    cumulative_scores: dict[str, int] = {str(gp.user_id): 0 for gp in game_players}

    for round_obj in rounds:
        # Get round players
        result = await db.execute(
            select(RoundPlayer)
            .where(RoundPlayer.round_id == round_obj.id)
            .order_by(RoundPlayer.seat_position)
        )
        round_players = list(result.scalars().all())

        # Build player scores
        player_scores = []
        for rp in round_players:
            player_scores.append(PlayerRoundScore(
                user_id=str(rp.user_id),
                display_name=next(gp.display_name for gp in game_players if gp.user_id == rp.user_id),
                seat_position=rp.seat_position,
                contract_bid=rp.contract_bid or 0,
                tricks_won=rp.tricks_won,
                score=rp.score or 0,
                made_contract=rp.made_contract or False,
            ))

            # Add to cumulative
            cumulative_scores[str(rp.user_id)] += rp.score or 0

        rounds_data.append(RoundScore(
            round_number=round_obj.round_number,
            trump_suit=round_obj.trump_suit.value if round_obj.trump_suit else "unknown",
            game_type=round_obj.game_type.value if round_obj.game_type else "unknown",
            players=player_scores,
        ))

    # Build player info
    players_info = [
        PlayerInfo(
            user_id=str(gp.user_id),
            display_name=gp.display_name,
            seat_position=gp.seat_position,
        )
        for gp in game_players
    ]

    return ScoreTableResponse(
        game_id=str(game.id),
        room_code=game.room_code,
        current_round=game.current_round_number,
        rounds=rounds_data,
        cumulative_scores=cumulative_scores,
        players=players_info,
    )
```

**Step 2: Add missing imports**

```python
from app.models.base import RoundPhase
```

**Step 3: Test endpoint manually**

Run: Start backend, then:
```bash
curl -X GET "http://localhost:8000/api/v1/games/<game_id>/score-table" \
  -H "Authorization: Bearer <token>"
```
Expected: JSON response with rounds and cumulative_scores

**Step 4: Commit**

```bash
git add backend/app/api/games.py
git commit -m "feat: add GET /games/{id}/score-table endpoint

- Fetches all completed rounds with player scores
- Calculates cumulative totals across rounds
- Returns structured score table data
- Ordered by seat position

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 5: Implement End Game Endpoint

**Files:**
- Modify: `backend/app/api/games.py`

**Step 1: Add end game endpoint**

```python
from datetime import datetime
from app.schemas.score import EndGameResponse
from app.models.base import GameStatus

@router.post(
    "/{game_id}/end",
    response_model=EndGameResponse,
    responses={
        200: {"description": "Game ended"},
        401: {"description": "Unauthorized", "model": ErrorResponse},
        403: {"description": "Not admin", "model": ErrorResponse},
        404: {"description": "Game not found", "model": ErrorResponse},
    },
)
async def end_game(
    game_id: UUID,
    current_user: CurrentUser,
    db: DatabaseDep,
) -> EndGameResponse:
    """End the game and calculate final scores.

    Sets game status to FINISHED, calculates final player scores,
    and determines the winner.
    """
    # Get game
    result = await db.execute(
        select(Game)
        .where(Game.id == game_id)
    )
    game = result.scalar_one_or_none()

    if not game:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Game not found")

    # Check authorization (only admin can end game)
    if game.admin_id != current_user.id:
        from fastapi import HTTPException
        raise HTTPException(status_code=403, detail="Only admin can end game")

    # Get all completed rounds
    result = await db.execute(
        select(Round)
        .where(Round.game_id == game_id)
        .where(Round.phase == RoundPhase.COMPLETE)
    )
    rounds = list(result.scalars().all())

    # Calculate final scores for each player
    final_scores: dict[str, int] = {}

    for round_obj in rounds:
        result = await db.execute(
            select(RoundPlayer)
            .where(RoundPlayer.round_id == round_obj.id)
        )
        round_players = list(result.scalars().all())

        for rp in round_players:
            user_id_str = str(rp.user_id)
            if user_id_str not in final_scores:
                final_scores[user_id_str] = 0
            final_scores[user_id_str] += rp.score or 0

    # Update GamePlayer records with final scores
    result = await db.execute(
        select(GamePlayer)
        .where(GamePlayer.game_id == game_id)
    )
    game_players = list(result.scalars().all())

    for gp in game_players:
        gp.final_score = final_scores.get(str(gp.user_id), 0)

    # Determine winner (highest score)
    winner_id = None
    if final_scores:
        winner_id_str = max(final_scores, key=final_scores.get)
        winner_id = UUID(winner_id_str)

    # Update game status
    game.status = GameStatus.FINISHED
    game.ended_at = datetime.utcnow()
    game.winner_id = winner_id

    await db.commit()

    return EndGameResponse(
        game_id=str(game.id),
        ended_at=game.ended_at.isoformat(),
        winner_id=str(winner_id) if winner_id else None,
        final_scores=final_scores,
    )
```

**Step 2: Test endpoint manually**

Run:
```bash
curl -X POST "http://localhost:8000/api/v1/games/<game_id>/end" \
  -H "Authorization: Bearer <admin_token>"
```
Expected: JSON with ended_at, winner_id, final_scores

**Step 3: Commit**

```bash
git add backend/app/api/games.py
git commit -m "feat: add POST /games/{id}/end endpoint

- Finalizes game by setting status to FINISHED
- Calculates and persists final scores to GamePlayer
- Determines winner (highest cumulative score)
- Admin-only authorization

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 6: Create Frontend Score Table Types

**Files:**
- Create: `frontend/types/score.ts`

**Step 1: Define TypeScript interfaces**

```typescript
/**
 * Score table types for displaying game history
 */

export interface PlayerRoundScore {
  user_id: string;
  display_name: string;
  seat_position: number;
  contract_bid: number;
  tricks_won: number;
  score: number;
  made_contract: boolean;
}

export interface RoundScore {
  round_number: number;
  trump_suit: 'clubs' | 'diamonds' | 'hearts' | 'spades' | 'no_trump';
  game_type: 'over' | 'under';
  players: PlayerRoundScore[];
}

export interface PlayerInfo {
  user_id: string;
  display_name: string;
  seat_position: number;
}

export interface ScoreTableResponse {
  game_id: string;
  room_code: string;
  current_round: number;
  rounds: RoundScore[];
  cumulative_scores: Record<string, number>;
  players: PlayerInfo[];
}

export interface EndGameResponse {
  game_id: string;
  ended_at: string;
  winner_id: string | null;
  final_scores: Record<string, number>;
}
```

**Step 2: Test TypeScript compilation**

Run: `cd frontend && npm run type-check`
Expected: No errors

**Step 3: Commit**

```bash
git add frontend/types/score.ts
git commit -m "feat: add score table TypeScript types

- PlayerRoundScore for individual round data
- RoundScore for complete round
- ScoreTableResponse for full table
- EndGameResponse for game completion

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 7: Create Score Table Page Component

**Files:**
- Create: `frontend/app/game/[gameId]/scores/page.tsx`

**Step 1: Create page component with data fetching**

```typescript
/**
 * Score Table Page
 * Shows all completed rounds with cumulative scores
 */

'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import type { ScoreTableResponse } from '@/types/score';

export default function ScoreTablePage({
  params,
}: {
  params: Promise<{ gameId: string }>;
}) {
  const { gameId } = React.use(params);
  const router = useRouter();

  const [scoreData, setScoreData] = useState<ScoreTableResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isStartingRound, setIsStartingRound] = useState(false);
  const [isEndingGame, setIsEndingGame] = useState(false);

  // Fetch score table data
  useEffect(() => {
    async function fetchScoreTable() {
      try {
        const response = await fetch(`/api/v1/games/${gameId}/score-table`, {
          credentials: 'include',
        });

        if (!response.ok) {
          throw new Error('Failed to fetch score table');
        }

        const data = await response.json();
        setScoreData(data);
      } catch (err) {
        console.error('Error fetching score table:', err);
        setError(err instanceof Error ? err.message : 'Failed to load scores');
      } finally {
        setIsLoading(false);
      }
    }

    fetchScoreTable();
  }, [gameId]);

  // Handle starting new round
  const handleNewRound = async () => {
    if (!scoreData) return;

    setIsStartingRound(true);
    try {
      const response = await fetch(`/api/v1/rooms/${scoreData.room_code}/next-round`, {
        method: 'POST',
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to start next round');
      }

      // Navigate back to game page
      router.push(`/game/${gameId}`);
    } catch (err) {
      console.error('Error starting next round:', err);
      setError(err instanceof Error ? err.message : 'Failed to start next round');
    } finally {
      setIsStartingRound(false);
    }
  };

  // Handle ending game
  const handleEndGame = async () => {
    setIsEndingGame(true);
    try {
      const response = await fetch(`/api/v1/games/${gameId}/end`, {
        method: 'POST',
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to end game');
      }

      const result = await response.json();
      console.log('Game ended:', result);

      // TODO: Navigate to game results/summary page
      router.push(`/game/${gameId}`);
    } catch (err) {
      console.error('Error ending game:', err);
      setError(err instanceof Error ? err.message : 'Failed to end game');
    } finally {
      setIsEndingGame(false);
    }
  };

  // Helper to get trump symbol
  const getTrumpSymbol = (suit: string): string => {
    const symbols: Record<string, string> = {
      clubs: '♣',
      diamonds: '♦',
      hearts: '♥',
      spades: '♠',
      no_trump: 'NT',
    };
    return symbols[suit] || '?';
  };

  // Helper to get score color
  const getScoreColor = (score: number): string => {
    if (score > 0) return 'text-green-600';
    if (score < 0) return 'text-red-600';
    return 'text-gray-600';
  };

  if (isLoading) {
    return (
      <main className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4 flex items-center justify-center">
        <p className="text-lg text-gray-600">Loading score table...</p>
      </main>
    );
  }

  if (error || !scoreData) {
    return (
      <main className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4 flex items-center justify-center">
        <Card variant="elevated" className="p-6 max-w-md">
          <p className="text-red-600">{error || 'Failed to load score table'}</p>
          <Button
            onClick={() => router.push(`/game/${gameId}`)}
            className="mt-4"
            fullWidth
          >
            Back to Game
          </Button>
        </Card>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="text-center">
          <h1 className="text-3xl font-bold text-gray-900">Game Score Table</h1>
          <p className="text-gray-600 mt-1">Room: {scoreData.room_code}</p>
        </div>

        {/* Score Table */}
        <Card variant="elevated" className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b-2 border-gray-300">
                <th className="p-3 text-left font-semibold text-gray-700">Round</th>
                <th className="p-3 text-center font-semibold text-gray-700">Trump</th>
                {scoreData.players.map((player) => (
                  <th key={player.user_id} className="p-3 text-center font-semibold text-gray-700">
                    {player.display_name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {scoreData.rounds.map((round) => (
                <tr key={round.round_number} className="border-b border-gray-200 hover:bg-gray-50">
                  <td className="p-3 text-center font-medium">{round.round_number}</td>
                  <td className="p-3 text-center text-2xl">
                    {getTrumpSymbol(round.trump_suit)}
                  </td>
                  {round.players.map((player) => (
                    <td key={player.user_id} className="p-3 text-center">
                      <div className={`text-lg font-bold ${getScoreColor(player.score)}`}>
                        {player.score}
                      </div>
                      <div className="text-xs text-gray-500">
                        ({player.tricks_won}/{player.contract_bid})
                      </div>
                    </td>
                  ))}
                </tr>
              ))}

              {/* Totals Row */}
              <tr className="border-t-2 border-gray-400 bg-gray-100 font-bold">
                <td colSpan={2} className="p-4 text-center text-lg">TOTAL</td>
                {scoreData.players.map((player) => (
                  <td key={player.user_id} className="p-4 text-center">
                    <div className={`text-xl ${getScoreColor(scoreData.cumulative_scores[player.user_id] || 0)}`}>
                      {scoreData.cumulative_scores[player.user_id] || 0}
                    </div>
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </Card>

        {/* Action Buttons */}
        <div className="flex gap-4 justify-center">
          <Button
            onClick={handleNewRound}
            disabled={isStartingRound || isEndingGame}
            variant="primary"
            className="min-w-[180px]"
          >
            {isStartingRound ? '⏳ Starting...' : '▶ NEW ROUND'}
          </Button>
          <Button
            onClick={handleEndGame}
            disabled={isStartingRound || isEndingGame}
            variant="secondary"
            className="min-w-[180px]"
          >
            {isEndingGame ? '⏳ Ending...' : '🏁 END GAME'}
          </Button>
        </div>

        {/* Error display */}
        {error && (
          <Card variant="outlined" className="p-4 border-red-300 bg-red-50">
            <p className="text-red-700 text-center">{error}</p>
          </Card>
        )}
      </div>
    </main>
  );
}
```

**Step 2: Test page renders**

Run: `cd frontend && npm run dev`
Navigate to: `http://localhost:3000/game/<gameId>/scores`
Expected: Score table displays (if data exists)

**Step 3: Commit**

```bash
git add 'frontend/app/game/[gameId]/scores/page.tsx'
git commit -m "feat: create Score Table page component

- Fetches score data from /games/{id}/score-table
- Displays all rounds in landscape table format
- Shows cumulative totals at bottom
- Handles NEW ROUND and END GAME actions
- Color-coded scores (green/red for positive/negative)

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 8: Update Round Summary Modal

**Files:**
- Modify: `frontend/components/game/round-summary-modal.tsx:115-123`
- Modify: `frontend/app/game/[gameId]/page.tsx:212-222`

**Step 1: Update modal button text**

In `round-summary-modal.tsx`, change button text:

```typescript
// Line 122, change from:
{isLoading ? '⏳ Starting new round...' : '▶ Continue to Next Round'}

// To:
{isLoading ? '⏳ Loading...' : '📊 View Score Table'}
```

**Step 2: Update game page handler**

In `frontend/app/game/[gameId]/page.tsx`, replace `handleContinueRound`:

```typescript
import { useRouter } from 'next/navigation';

// Add at top of component
const router = useRouter();

// Replace handleContinueRound with:
const handleContinueRound = useCallback(() => {
  // Navigate to score table instead of starting next round
  router.push(`/game/${gameId}/scores`);
}, [router, gameId]);
```

**Step 3: Remove gameId extraction**

Add gameId extraction at top of component if not present:

```typescript
const { gameId } = React.use(params);
```

**Step 4: Test flow**

Run: Complete a round, click "View Score Table"
Expected: Navigate to `/game/{gameId}/scores`

**Step 5: Commit**

```bash
git add frontend/components/game/round-summary-modal.tsx 'frontend/app/game/[gameId]/page.tsx'
git commit -m "feat: update round flow to navigate to Score Table

- Change button text: 'Continue' -> 'View Score Table'
- Navigate to /game/{gameId}/scores instead of calling next-round
- Matches HLD flow: Round Complete -> Score Table -> New Round

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 9: Add RoundPhase Import to Complete Round

**Files:**
- Modify: `backend/app/websocket/game_events.py:1-30`

**Step 1: Add missing import**

At the top of `game_events.py`, add:

```python
from app.models.base import RoundPhase
```

**Step 2: Verify import**

Run: `cd backend && python -c "from app.websocket.game_events import *; print('OK')"`
Expected: "OK"

**Step 3: Commit**

```bash
git add backend/app/websocket/game_events.py
git commit -m "fix: add RoundPhase import for complete_round

- Required for setting phase to COMPLETE
- Fixes undefined name error

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 10: Integration Testing

**Files:**
- Test manually

**Step 1: Restart backend**

Run: `cd backend && uvicorn app.main:app --reload`

**Step 2: Restart frontend**

Run: `cd frontend && npm run dev`

**Step 3: Complete full round flow**

1. Start a game with 4 players
2. Complete trump bidding (1 bid + 3 passes)
3. Complete contract bidding (4 bids)
4. Complete all 13 tricks
5. Click "View Score Table"
6. Verify:
   - ✅ Round appears in table
   - ✅ Scores displayed correctly
   - ✅ Format: `score (tricks/contract)`
   - ✅ Cumulative total at bottom
7. Click "NEW ROUND"
8. Complete second round
9. Click "View Score Table" again
10. Verify:
    - ✅ Both rounds appear
    - ✅ Cumulative totals updated
11. Click "END GAME"
12. Verify game status set to FINISHED

**Step 4: Check database**

Run:
```bash
psql -d whist_db -c "SELECT score, made_contract FROM round_players WHERE round_id IN (SELECT id FROM rounds WHERE game_id = '<game_id>');"
```
Expected: All scores populated

**Step 5: Document any issues**

Create: `docs/score-table-test-results.md`
Document: Test results, bugs found, fixes needed

---

## Testing Checklist

- [ ] Scores persist to database when round completes
- [ ] GET /games/{id}/score-table returns correct data
- [ ] POST /games/{id}/end finalizes game correctly
- [ ] Score Table page displays all rounds
- [ ] Cumulative totals calculated correctly
- [ ] Button: "View Score Table" navigates to score page
- [ ] Button: "NEW ROUND" starts next round and navigates back
- [ ] Button: "END GAME" finalizes and navigates appropriately
- [ ] Score colors: green for positive, red for negative
- [ ] Table layout works on mobile (horizontal scroll)
- [ ] Multiple rounds accumulate correctly
- [ ] Game type (over/under) displayed correctly
- [ ] Trump symbols display correctly

---

## Common Issues & Solutions

**Issue: Scores not persisting**
- Check: Database session commit after updating RoundPlayer
- Check: round_id matches between calculate and persist

**Issue: Cumulative scores incorrect**
- Check: All rounds have phase = COMPLETE
- Check: Score calculation logic in backend

**Issue: Navigation not working**
- Check: gameId available in component
- Check: useRouter imported from next/navigation

**Issue: 404 on score-table endpoint**
- Check: Games router registered in router.py
- Check: Backend restarted after adding endpoint

---

## Success Criteria

✅ Round scores persist to database when round completes
✅ Score Table shows all completed rounds with player scores
✅ Each cell displays `score (tricks/contract)` format
✅ Cumulative totals row at bottom
✅ NEW ROUND button starts next round
✅ END GAME button finalizes game
✅ Layout optimized for landscape viewing
✅ Historical scores queryable from database
✅ Flow matches HLD: Round Complete → Score Table → New Round/End Game
