"""Room service for game room management."""
import json
from datetime import datetime, timedelta
from uuid import UUID

from redis.asyncio import Redis  # type: ignore
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import (
    AuthorizationError,
    ConflictError,
    NotFoundError,
    ValidationError,
)
from app.models import Game, GamePlayer, Group, User
from app.models.base import GameStatus
from app.schemas.errors import ErrorCode
from app.schemas.room import (
    CreateRoomRequest,
    CreateRoomResponse,
    JoinRoomRequest,
    JoinRoomResponse,
    PlayerInRoom,
    RoomState,
    StartGameResponse,
    UpdateSeatingRequest,
)
from app.services.room_code_generator import get_unique_room_code
from app.websocket.schemas import PlayerInfo


class RoomService:
    """Service for game room creation and management."""

    ROOM_TTL = timedelta(hours=24)
    WS_ENDPOINT = "ws://localhost:8000/ws/rooms"  # Should come from config

    def __init__(self, db: AsyncSession, redis: Redis) -> None:  # type: ignore
        """Initialize room service.

        Args:
            db: Database session
            redis: Redis client for room state
        """
        self.db = db
        self.redis = redis

    async def create_room(
        self, current_user: User, request: CreateRoomRequest
    ) -> CreateRoomResponse:
        """Create a new game room.

        Creates a game in the database and initializes room state in Redis.
        The creator becomes the admin of the room.

        Args:
            current_user: User creating the room
            request: Room creation request (optional group_id)

        Returns:
            CreateRoomResponse with room_code and game_id

        Raises:
            ValidationError: If group_id provided but group doesn't exist
        """
        # Verify group exists if provided
        if request.group_id:
            result = await self.db.execute(
                select(Group).where(Group.id == request.group_id)
            )
            if not result.scalar_one_or_none():
                raise ValidationError(
                    "Group not found", ErrorCode.VALIDATION_ERROR
                )

        # Generate unique room code
        room_code = await get_unique_room_code(self.redis)

        # Create game in database
        game = Game(
            room_code=room_code,
            admin_id=current_user.id,
            group_id=request.group_id,
            status=GameStatus.WAITING,
        )
        self.db.add(game)
        await self.db.flush()

        # Add admin as first player in database (seat 0)
        admin_player = GamePlayer(
            game_id=game.id,
            user_id=current_user.id,
            display_name=current_user.display_name,
            seat_position=0,
            is_admin=True,
        )
        self.db.add(admin_player)
        await self.db.flush()

        # Initialize room in Redis
        now = datetime.utcnow().isoformat()
        pipe = self.redis.pipeline()

        pipe.hset(
            f"room:{room_code}",
            mapping={
                "game_id": str(game.id),
                "admin_id": str(current_user.id),
                "status": "waiting",
                "phase": "",
                "created_at": now,
                "last_activity": now,
            },
        )
        pipe.expire(f"room:{room_code}", int(self.ROOM_TTL.total_seconds()))

        # Initialize players hash with admin
        admin_player_info = PlayerInfo(
            user_id=str(current_user.id),
            display_name=current_user.display_name,
            seat_position=0,
            is_admin=True,
            is_connected=False,  # Will be set to True when WebSocket connects
            avatar_url=current_user.avatar_url,
        )
        pipe.delete(f"room:{room_code}:players")
        pipe.hset(
            f"room:{room_code}:players",
            "0",
            admin_player_info.model_dump_json(),
        )

        await pipe.execute()

        return CreateRoomResponse(
            room_code=room_code,
            game_id=game.id,
            admin_id=current_user.id,
            status="waiting",
            ws_endpoint=self.WS_ENDPOINT,
        )

    async def get_room(self, room_code: str) -> RoomState:
        """Get room state by code.

        Args:
            room_code: 6-character room code (uppercase)

        Returns:
            Current room state

        Raises:
            NotFoundError: If room does not exist
        """
        # Get room data from Redis
        room_data = await self.redis.hgetall(f"room:{room_code}")

        if not room_data:
            raise NotFoundError("Room not found", ErrorCode.ROOM_NOT_FOUND)

        # Get players from Redis
        players_data = await self.redis.hgetall(f"room:{room_code}:players")

        players: list[PlayerInRoom] = []
        for seat in range(4):
            player_json = players_data.get(str(seat))
            if player_json:
                player_dict = json.loads(player_json)
                players.append(PlayerInRoom(**player_dict))

        return RoomState(
            room_code=room_code,
            game_id=UUID(room_data["game_id"]),
            admin_id=UUID(room_data["admin_id"]),
            status=room_data["status"],
            players=players,
            created_at=datetime.fromisoformat(room_data["created_at"]),
            current_round=None,
        )

    async def join_room(
        self,
        room_code: str,
        current_user: User,
        request: JoinRoomRequest,
    ) -> JoinRoomResponse:
        """Join a game room.

        Adds player to room if space available. Updates both database
        and Redis state.

        Args:
            room_code: 6-character room code
            current_user: User joining
            request: Join request (optional display_name override)

        Returns:
            JoinRoomResponse with room state and assigned seat

        Raises:
            NotFoundError: If room doesn't exist
            ConflictError: If room is full or player already in room
        """
        # Verify room exists
        room_data = await self.redis.hgetall(f"room:{room_code}")
        if not room_data:
            raise NotFoundError("Room not found", ErrorCode.ROOM_NOT_FOUND)

        # Check if player already in room
        game_id = UUID(room_data["game_id"])
        result = await self.db.execute(
            select(GamePlayer).where(
                (GamePlayer.game_id == game_id)
                & (GamePlayer.user_id == current_user.id)
            )
        )
        existing_player = result.scalar_one_or_none()

        # Get display name (use override or user's default)
        display_name = request.display_name or current_user.display_name

        if existing_player:
            # Player exists in DB - check if they're still in Redis (active)
            redis_player = await self.redis.hget(
                f"room:{room_code}:players",
                str(existing_player.seat_position),
            )
            if redis_player:
                # Player is in both DB and Redis - they're active, reject
                raise ConflictError(
                    "You are already in this room", ErrorCode.PLAYER_ALREADY_IN_ROOM
                )

            # Player is in DB but not Redis - they left and are rejoining
            # Re-add them to Redis with their existing seat
            available_seat = existing_player.seat_position
            existing_player.display_name = display_name
            existing_player.is_connected = True
            await self.db.flush()
        else:
            # New player - find available seat using database as source of truth
            result = await self.db.execute(
                select(GamePlayer.seat_position).where(GamePlayer.game_id == game_id)
            )
            taken_seats = {row[0] for row in result.fetchall()}

            available_seat: int | None = None
            for seat in range(4):
                if seat not in taken_seats:
                    available_seat = seat
                    break

            if available_seat is None:
                raise ConflictError("Room is full (maximum 4 players)", ErrorCode.ROOM_FULL)

            # Add to database
            game_player = GamePlayer(
                game_id=game_id,
                user_id=current_user.id,
                display_name=display_name,
                seat_position=available_seat,
                is_admin=False,
            )
            self.db.add(game_player)
            await self.db.flush()

        # Add to Redis using PlayerInfo for consistent format with room_manager
        player_info = PlayerInfo(
            user_id=str(current_user.id),
            display_name=display_name,
            seat_position=available_seat,
            is_admin=False,
            is_connected=True,
            avatar_url=current_user.avatar_url,
        )

        await self.redis.hset(
            f"room:{room_code}:players",
            str(available_seat),
            player_info.model_dump_json(),
        )
        await self._refresh_ttl(room_code)

        # Return room state
        room_state = await self.get_room(room_code)
        return JoinRoomResponse(
            room=room_state,
            your_seat=available_seat,
            ws_endpoint=self.WS_ENDPOINT,
        )

    async def leave_room(
        self,
        room_code: str,
        current_user: User,
    ) -> None:
        """Leave a game room.

        Args:
            room_code: 6-character room code
            current_user: User leaving

        Raises:
            NotFoundError: If room doesn't exist
        """
        # Verify room exists
        room_data = await self.redis.hgetall(f"room:{room_code}")
        if not room_data:
            raise NotFoundError("Room not found", ErrorCode.ROOM_NOT_FOUND)

        game_id = UUID(room_data["game_id"])

        # Remove from database
        result = await self.db.execute(
            select(GamePlayer).where(
                (GamePlayer.game_id == game_id)
                & (GamePlayer.user_id == current_user.id)
            )
        )
        game_player = result.scalar_one_or_none()

        if game_player:
            await self.db.delete(game_player)
            await self.db.flush()

            # Remove from Redis
            seat = game_player.seat_position
            await self.redis.hdel(f"room:{room_code}:players", str(seat))
            await self._refresh_ttl(room_code)

    async def update_seating(
        self,
        room_code: str,
        current_user: User,
        request: UpdateSeatingRequest,
    ) -> RoomState:
        """Update seating arrangement (admin only).

        Reorders players by providing a list of 4 user UUIDs in desired order.

        Args:
            room_code: 6-character room code
            current_user: User (must be admin)
            request: UpdateSeatingRequest with 4 user UUIDs in order

        Returns:
            Updated room state

        Raises:
            NotFoundError: If room doesn't exist
            AuthorizationError: If current user is not admin
            ValidationError: If seating list is invalid
        """
        # Get room
        room_data = await self.redis.hgetall(f"room:{room_code}")
        if not room_data:
            raise NotFoundError("Room not found", ErrorCode.ROOM_NOT_FOUND)

        admin_id = UUID(room_data["admin_id"])

        # Check authorization
        if current_user.id != admin_id:
            raise AuthorizationError("Only the room admin can update seating")

        # Get current players
        game_id = UUID(room_data["game_id"])
        result = await self.db.execute(
            select(GamePlayer)
            .where(GamePlayer.game_id == game_id)
            .order_by(GamePlayer.seat_position)
        )
        current_players = result.scalars().all()

        # Validate all requested user IDs are in room
        current_ids = {p.user_id for p in current_players}
        requested_ids = set(request.positions)

        if current_ids != requested_ids:
            raise ValidationError(
                "Seating must include all current players",
                ErrorCode.VALIDATION_ERROR,
            )

        # Update database with new positions
        for new_seat, user_id in enumerate(request.positions):
            for player in current_players:
                if player.user_id == user_id:
                    player.seat_position = new_seat

        await self.db.flush()

        # Update Redis
        players_data = await self.redis.hgetall(f"room:{room_code}:players")
        new_players_data: dict[str, str] = {}

        for player in current_players:
            player_json = players_data.get(str(player.seat_position))
            if player_json:
                player_dict = json.loads(player_json)
                player_dict["seat_position"] = player.seat_position
                new_players_data[str(player.seat_position)] = json.dumps(
                    player_dict
                )

        await self.redis.delete(f"room:{room_code}:players")
        if new_players_data:
            await self.redis.hset(
                f"room:{room_code}:players", mapping=new_players_data
            )
        await self._refresh_ttl(room_code)

        return await self.get_room(room_code)

    async def start_game(
        self,
        room_code: str,
        current_user: User,
    ) -> StartGameResponse:
        """Start the game (admin only).

        Transitions room to playing state and creates first round.
        Requires exactly 4 players.

        Args:
            room_code: 6-character room code
            current_user: User (must be admin)

        Returns:
            StartGameResponse with game info

        Raises:
            NotFoundError: If room doesn't exist
            AuthorizationError: If current user is not admin
            ValidationError: If room doesn't have 4 players
        """
        # Get room
        room_data = await self.redis.hgetall(f"room:{room_code}")
        if not room_data:
            raise NotFoundError("Room not found", ErrorCode.ROOM_NOT_FOUND)

        admin_id = UUID(room_data["admin_id"])

        # Check authorization
        if current_user.id != admin_id:
            raise AuthorizationError("Only the room admin can start the game")

        game_id = UUID(room_data["game_id"])

        # Get players and validate count
        result = await self.db.execute(
            select(func.count(GamePlayer.id)).where(GamePlayer.game_id == game_id)
        )
        player_count = result.scalar() or 0

        if player_count != 4:
            raise ValidationError(
                f"Game requires 4 players, {player_count} in room",
                ErrorCode.ROOM_NOT_ENOUGH_PLAYERS,
            )

        # Update game status
        result = await self.db.execute(select(Game).where(Game.id == game_id))
        game = result.scalar_one()

        game.status = GameStatus.BIDDING_TRUMP
        game.current_round_number = 1
        await self.db.flush()

        # Update Redis
        now = datetime.utcnow().isoformat()
        await self.redis.hset(
            f"room:{room_code}",
            mapping={
                "status": "bidding_trump",
                "last_activity": now,
            },
        )
        await self._refresh_ttl(room_code)

        # Get the first bidder (player in seat 0)
        first_bidder_result = await self.db.execute(
            select(GamePlayer.user_id)
            .where(GamePlayer.game_id == game_id)
            .order_by(GamePlayer.seat_position)
            .limit(1)
        )
        first_bidder_id = first_bidder_result.scalar()

        return StartGameResponse(
            game_id=game_id,
            status="bidding_trump",
            current_round=1,
            first_bidder_id=first_bidder_id,  # Already a UUID from asyncpg
            message="Game started",
        )

    async def _refresh_ttl(self, room_code: str) -> None:
        """Refresh TTL on all room keys.

        Args:
            room_code: Room code
        """
        ttl_seconds = int(self.ROOM_TTL.total_seconds())
        pipe = self.redis.pipeline()
        pipe.expire(f"room:{room_code}", ttl_seconds)
        pipe.expire(f"room:{room_code}:players", ttl_seconds)
        pipe.expire(f"room:{room_code}:round", ttl_seconds)
        pipe.expire(f"room:{room_code}:bidding", ttl_seconds)
        await pipe.execute()
