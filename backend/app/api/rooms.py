"""Room API routes."""
import logging

from fastapi import APIRouter, status

from app.dependencies.auth import CurrentUser
from app.dependencies.services import RoomServiceDep
from app.schemas.errors import ErrorResponse
from app.schemas.room import (
    CreateRoomRequest,
    CreateRoomResponse,
    JoinRoomRequest,
    JoinRoomResponse,
    RoomState,
    StartGameResponse,
    UpdateSeatingRequest,
)
from app.websocket.schemas import (
    GameStartingPlayerInfo,
    RoomGameStartingPayload,
    ServerEvents,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/rooms", tags=["Rooms"])


@router.post(  # type: ignore
    "",
    response_model=CreateRoomResponse,
    status_code=status.HTTP_201_CREATED,
    responses={
        201: {"description": "Room created successfully"},
        422: {"description": "Validation error", "model": ErrorResponse},
    },
)
async def create_room(
    current_user: CurrentUser,
    room_service: RoomServiceDep,
    request: CreateRoomRequest | None = None,
) -> CreateRoomResponse:
    """Create a new game room.

    Creates a new game room with a unique room code. The user creating
    the room becomes the admin and can manage seating and start the game.

    **Request:**
    - group_id: Optional group UUID to associate room with (group must exist)

    **Response:**
    - room_code: Unique 6-character code (e.g., 'ABC123')
    - game_id: UUID of the created game
    - admin_id: UUID of the room admin (current user)
    - status: Initial status is 'waiting'
    - ws_endpoint: WebSocket endpoint for real-time updates

    **Errors:**
    - 401: Missing or invalid access token
    - 422: Invalid group_id or validation error
    """
    return await room_service.create_room(
        current_user, request or CreateRoomRequest()
    )


@router.get(  # type: ignore
    "/{room_code}",
    response_model=RoomState,
    responses={
        200: {"description": "Room state retrieved"},
        404: {"description": "Room not found", "model": ErrorResponse},
    },
)
async def get_room(
    room_code: str,
    current_user: CurrentUser,
    room_service: RoomServiceDep,
) -> RoomState:
    """Get room state by code.

    Returns the current state of a room including all players,
    their positions, and game status.

    **Path Parameters:**
    - room_code: 6-character room code (case-insensitive)

    **Response:**
    - room_code: The room code
    - game_id: UUID of the game
    - admin_id: UUID of room admin
    - status: Current game status
    - players: List of players with seat positions
    - created_at: Room creation timestamp
    - current_round: Current round number (null until game starts)

    **Errors:**
    - 401: Missing or invalid access token
    - 404: Room not found
    """
    return await room_service.get_room(room_code.upper())


@router.post(  # type: ignore
    "/{room_code}/join",
    response_model=JoinRoomResponse,
    responses={
        200: {"description": "Successfully joined room"},
        401: {"description": "Unauthorized", "model": ErrorResponse},
        404: {"description": "Room not found", "model": ErrorResponse},
        409: {"description": "Cannot join room", "model": ErrorResponse},
    },
)
async def join_room(
    room_code: str,
    current_user: CurrentUser,
    room_service: RoomServiceDep,
    request: JoinRoomRequest | None = None,
) -> JoinRoomResponse:
    """Join a game room.

    Adds the current user to a room if space is available.
    Users are assigned the next available seat (0-3).

    **Path Parameters:**
    - room_code: 6-character room code (case-insensitive)

    **Request:**
    - display_name: Optional override for display name (max 64 chars)
      If not provided, uses user's default display name

    **Response:**
    - room: Current room state after joining
    - your_seat: Your assigned seat position (0-3)
    - ws_endpoint: WebSocket endpoint for real-time updates

    **Errors:**
    - 401: Missing or invalid access token
    - 404: Room not found
    - 409: Room is full (4 players max) or you're already in the room
    """
    return await room_service.join_room(
        room_code.upper(), current_user, request or JoinRoomRequest()
    )


@router.post(  # type: ignore
    "/{room_code}/leave",
    status_code=status.HTTP_204_NO_CONTENT,
    responses={
        204: {"description": "Successfully left room"},
        401: {"description": "Unauthorized", "model": ErrorResponse},
        404: {"description": "Room not found", "model": ErrorResponse},
    },
)
async def leave_room(
    room_code: str,
    current_user: CurrentUser,
    room_service: RoomServiceDep,
) -> None:
    """Leave a game room.

    Removes the current user from the room. The room remains open
    for others to join.

    **Path Parameters:**
    - room_code: 6-character room code (case-insensitive)

    **Response:**
    - 204 No Content

    **Errors:**
    - 401: Missing or invalid access token
    - 404: Room not found
    """
    await room_service.leave_room(room_code.upper(), current_user)


@router.put(  # type: ignore
    "/{room_code}/seating",
    response_model=RoomState,
    responses={
        200: {"description": "Seating updated"},
        401: {"description": "Unauthorized", "model": ErrorResponse},
        403: {"description": "Not admin", "model": ErrorResponse},
        404: {"description": "Room not found", "model": ErrorResponse},
        422: {"description": "Invalid seating", "model": ErrorResponse},
    },
)
async def update_seating(
    room_code: str,
    request: UpdateSeatingRequest,
    current_user: CurrentUser,
    room_service: RoomServiceDep,
) -> RoomState:
    """Update seating arrangement (admin only).

    Allows the room admin to reorder players by specifying their
    seat positions (0-3).

    **Path Parameters:**
    - room_code: 6-character room code (case-insensitive)

    **Request:**
    - positions: List of 4 user UUIDs in desired seat order
      positions[0] = user at seat 0, positions[1] = user at seat 1, etc.

    **Response:**
    - Updated room state with new seating arrangement

    **Errors:**
    - 401: Missing or invalid access token
    - 403: Not the room admin
    - 404: Room not found
    - 422: Invalid positions (wrong count or includes users not in room)
    """
    return await room_service.update_seating(room_code.upper(), current_user, request)


@router.post(  # type: ignore
    "/{room_code}/start",
    response_model=StartGameResponse,
    responses={
        200: {"description": "Game started"},
        401: {"description": "Unauthorized", "model": ErrorResponse},
        403: {"description": "Not admin", "model": ErrorResponse},
        404: {"description": "Room not found", "model": ErrorResponse},
        422: {"description": "Cannot start game", "model": ErrorResponse},
    },
)
async def start_game(
    room_code: str,
    current_user: CurrentUser,
    room_service: RoomServiceDep,
) -> StartGameResponse:
    """Start the game (admin only).

    Transitions the room from waiting state to active game state.
    Requires exactly 4 players to be present.

    **Path Parameters:**
    - room_code: 6-character room code (case-insensitive)

    **Response:**
    - game_id: UUID of the game
    - status: New game status ('bidding_trump')
    - current_round: First round number (1)
    - first_bidder_id: UUID of first bidder (seat 0)
    - message: Confirmation message

    **Errors:**
    - 401: Missing or invalid access token
    - 403: Not the room admin
    - 404: Room not found
    - 422: Room doesn't have exactly 4 players
    """
    normalized_room_code = room_code.upper()
    result = await room_service.start_game(normalized_room_code, current_user)

    # Emit WebSocket event to notify all players in the room
    # Import sio lazily to avoid circular imports
    from app.main import sio

    if sio is not None:
        # Get room state to get players with seat positions
        room_state = await room_service.get_room(normalized_room_code)
        players = [
            GameStartingPlayerInfo(
                user_id=str(p.user_id),
                seat_position=p.seat_position,
            )
            for p in room_state.players
        ]

        payload = RoomGameStartingPayload(
            game_id=str(result.game_id),
            players=players,
        )

        logger.info("Emitting room:game_starting to room:%s", normalized_room_code)
        await sio.emit(
            ServerEvents.ROOM_GAME_STARTING,
            payload.to_dict(),
            room=f"room:{normalized_room_code}",
        )

    return result
