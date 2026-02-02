"""Game-related API endpoints."""
import logging
from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.dependencies.auth import CurrentUser, DBSession
from app.models.base import GameStatus, RoundPhase
from app.models.game import Game, GamePlayer
from app.models.round import Round, RoundPlayer
from app.schemas.errors import ErrorResponse
from app.schemas.score import (
    EndGameResponse,
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
    logger.info(
        "Score table requested for game %s by user %s",
        game_id,
        current_user.id
    )

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

    # Verify user is a player in this game
    if not any(gp.user_id == current_user.id for gp in game_players):
        raise HTTPException(
            status_code=403,
            detail="You are not a player in this game"
        )

    # Get all completed rounds with players
    result = await db.execute(
        select(Round)
        .where(Round.game_id == game_id)
        .where(Round.phase == RoundPhase.COMPLETE)
        .options(selectinload(Round.players))
        .order_by(Round.round_number)
    )
    rounds = list(result.scalars().all())

    # Build rounds data
    rounds_data = []
    cumulative_scores: dict[str, int] = {str(gp.user_id): 0 for gp in game_players}
    player_names = {gp.user_id: gp.display_name for gp in game_players}

    for round_obj in rounds:
        # Get round players from eager-loaded relationship
        round_players = sorted(round_obj.players, key=lambda rp: rp.seat_position)

        # Build player scores
        player_scores = []
        for rp in round_players:
            player_scores.append(PlayerRoundScore(
                user_id=str(rp.user_id),
                display_name=player_names.get(rp.user_id, "Unknown"),
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
    db: DBSession,
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
        raise HTTPException(status_code=404, detail="Game not found")

    # Check authorization (only admin can end game)
    if game.admin_id != current_user.id:
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
