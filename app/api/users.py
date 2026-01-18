"""User API routes."""
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Query

from app.dependencies.auth import CurrentUser
from app.dependencies.services import UserServiceDep
from app.schemas.errors import ErrorResponse
from app.schemas.user import (
    GameHistoryResponse,
    PlayerStats,
    UserResponse,
    UserUpdateRequest,
)

router = APIRouter(prefix="/users", tags=["Users"])


@router.get(  # type: ignore
    "/{user_id}",
    response_model=UserResponse,
    responses={
        200: {"description": "User profile"},
        404: {"description": "User not found", "model": ErrorResponse},
    },
)
async def get_user(
    user_id: UUID,
    current_user: CurrentUser,
    user_service: UserServiceDep,
) -> UserResponse:
    """Get user profile by ID.

    Returns public profile information for the specified user.

    **Path Parameters:**
    - user_id: User UUID

    **Response:**
    - id: User UUID
    - username: Unique username
    - display_name: User display name
    - email: User email address
    - avatar_url: Profile image URL (optional)
    - created_at: Account creation timestamp
    - last_active: Last activity timestamp
    - is_active: Account status

    **Errors:**
    - 404: User not found
    """
    return await user_service.get_user(user_id)


@router.put(  # type: ignore
    "/{user_id}",
    response_model=UserResponse,
    responses={
        200: {"description": "User profile updated"},
        401: {"description": "Unauthorized", "model": ErrorResponse},
        403: {"description": "Cannot update other users", "model": ErrorResponse},
        404: {"description": "User not found", "model": ErrorResponse},
    },
)
async def update_user(
    user_id: UUID,
    request: UserUpdateRequest,
    current_user: CurrentUser,
    user_service: UserServiceDep,
) -> UserResponse:
    """Update user profile.

    Updates the current user's profile information.

    **Path Parameters:**
    - user_id: User UUID (must match current user)

    **Request:**
    - display_name: New display name (optional, max 64 chars)
    - avatar_url: New profile image URL (optional)

    **Response:**
    - Updated user profile

    **Errors:**
    - 401: Missing or invalid access token
    - 403: Cannot update another user's profile
    - 404: User not found
    """
    from app.core.exceptions import AuthorizationError

    if user_id != current_user.id:
        raise AuthorizationError("You can only update your own profile")

    return await user_service.update_user(user_id, request)


@router.get(  # type: ignore
    "/{user_id}/stats",
    response_model=PlayerStats,
    responses={
        200: {"description": "Player statistics"},
        404: {"description": "User not found", "model": ErrorResponse},
    },
)
async def get_user_stats(
    user_id: UUID,
    current_user: CurrentUser,
    user_service: UserServiceDep,
) -> PlayerStats:
    """Get player statistics.

    Returns aggregated statistics for the player including win rate,
    contract performance, and scoring data.

    **Path Parameters:**
    - user_id: User UUID

    **Response:**
    - total_games: Total games played
    - total_rounds: Total rounds played
    - total_wins: Total game wins
    - win_rate: Percentage of games won
    - average_score: Average points per game
    - highest_score: Highest single-game score
    - lowest_score: Lowest single-game score
    - contracts_made: Successful contracts
    - contracts_failed: Failed contracts
    - contract_success_rate: Percentage of contracts made
    - zeros_made: Successful zero bids
    - zeros_failed: Failed zero bids
    - zero_success_rate: Percentage of zero bids made

    **Errors:**
    - 404: User not found
    """
    return await user_service.get_user_stats(user_id)


@router.get(  # type: ignore
    "/{user_id}/history",
    response_model=GameHistoryResponse,
    responses={
        200: {"description": "Game history"},
        401: {"description": "Unauthorized", "model": ErrorResponse},
        403: {"description": "Cannot view other users' history", "model": ErrorResponse},
        404: {"description": "User not found", "model": ErrorResponse},
    },
)
async def get_user_history(
    user_id: UUID,
    current_user: CurrentUser,
    user_service: UserServiceDep,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
) -> GameHistoryResponse:
    """Get user game history with pagination.

    Returns paginated list of games the user has participated in,
    ordered by most recent first.

    **Path Parameters:**
    - user_id: User UUID (must match current user)

    **Query Parameters:**
    - page: Page number (1-indexed, default 1)
    - page_size: Results per page (1-100, default 20)

    **Response:**
    - games: List of game history entries
      - game_id: Game UUID
      - room_code: Game room code
      - played_at: Game start timestamp
      - final_score: User's final score
      - position: User's final position (seating order)
      - rounds_played: Number of rounds completed
      - players: List of player usernames
    - total: Total number of games
    - page: Current page number
    - page_size: Results per page
    - has_more: Whether more pages exist

    **Errors:**
    - 401: Missing or invalid access token
    - 403: Cannot view another user's game history
    - 404: User not found
    """
    from app.core.exceptions import AuthorizationError

    if user_id != current_user.id:
        raise AuthorizationError("You can only view your own game history")

    return await user_service.get_user_history(user_id, page, page_size)
