"""Game-related API endpoints."""
import logging
from uuid import UUID

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from app.dependencies.auth import CurrentUser, DBSession
from app.models.base import RoundPhase
from app.models.game import Game, GamePlayer
from app.models.round import Round, RoundPlayer
from app.schemas.errors import ErrorResponse
from app.schemas.score import (
    PlayerInfo,
    PlayerRoundScore,
    RoundScore,
    ScoreTableResponse,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/games", tags=["games"])


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
    db: DBSession,
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
            trump_suit=round_obj.trump_suit,
            game_type=round_obj.game_type,
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
