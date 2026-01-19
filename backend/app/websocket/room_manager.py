"""Room manager for WebSocket room state management."""
from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import TYPE_CHECKING, Any, Literal

from redis.asyncio import Redis  # type: ignore

from app.core.exceptions import NotFoundError
from app.schemas.errors import ErrorCode
from app.websocket.schemas import (
    PlayerInfo,
    RoomPlayerLeftPayload,
)

if TYPE_CHECKING:
    pass

logger = logging.getLogger(__name__)


@dataclass
class JoinRoomResult:
    """Result of joining a room."""

    game_id: str
    seat_position: int
    is_admin: bool
    players: list[PlayerInfo]
    player_info: PlayerInfo
    phase: str
    current_round: int | None = None


@dataclass
class LeaveRoomResult:
    """Result of leaving a room."""

    room_still_exists: bool
    broadcast_payload: RoomPlayerLeftPayload | None


class RoomManager:
    """
    Manages room state in Redis and coordinates with database.

    Responsibilities:
    - Player join/leave/reconnection
    - WebSocket connection tracking
    - Room state synchronization
    """

    ROOM_TTL = timedelta(hours=24)
    RECONNECT_GRACE_PERIOD = timedelta(seconds=60)

    def __init__(
        self,
        redis: Redis,  # type: ignore
        db_session_factory: Any,
    ) -> None:
        """Initialize room manager.

        Args:
            redis: Redis client for state management
            db_session_factory: SQLAlchemy session factory
        """
        self.redis = redis
        self.db_session_factory = db_session_factory

    async def join_room(
        self,
        room_code: str,
        user_id: str,
        display_name: str,
        socket_id: str,
    ) -> JoinRoomResult:
        """Handle player joining a room.

        Checks for reconnection vs new join and adds player to next available seat.

        Args:
            room_code: 6-character room code
            user_id: UUID of joining user
            display_name: Display name for the player
            socket_id: Socket.IO socket ID

        Returns:
            JoinRoomResult with room state and seat assignment

        Raises:
            NotFoundError: If room doesn't exist
        """
        room_code = room_code.upper()

        # Check room exists
        room_data = await self.redis.hgetall(f"room:{room_code}")
        if not room_data:
            raise NotFoundError("Room not found", ErrorCode.ROOM_NOT_FOUND)

        # Get players
        players = await self._get_room_players(room_code)
        if len(players) >= 4:
            raise NotFoundError("Room is full", ErrorCode.ROOM_FULL)

        # Check for reconnection
        reconnect_data = await self.redis.hgetall(f"reconnect:{user_id}")
        if reconnect_data and reconnect_data.get(b"room_code") == room_code.encode():
            # Handle reconnection - reuse same seat
            seat_position = int(reconnect_data[b"seat_position"])
            await self._clear_reconnection(user_id)
            await self._update_player_connection(
                room_code, user_id, socket_id, seat_position
            )
            players = await self._get_room_players(room_code)
            return JoinRoomResult(
                game_id=room_data[b"game_id"].decode(),
                seat_position=seat_position,
                is_admin=room_data[b"admin_id"].decode() == user_id,
                players=players,
                player_info=next(p for p in players if p.seat_position == seat_position),
                phase=room_data[b"status"].decode(),
                current_round=None,
            )

        # Check if player already in room
        existing_seat = await self._find_player_seat(room_code, user_id)
        if existing_seat is not None:
            # Already in room, just update connection
            await self._update_player_connection(
                room_code, user_id, socket_id, existing_seat
            )
            players = await self._get_room_players(room_code)
            return JoinRoomResult(
                game_id=room_data[b"game_id"].decode(),
                seat_position=existing_seat,
                is_admin=room_data[b"admin_id"].decode() == user_id,
                players=players,
                player_info=next(p for p in players if p.seat_position == existing_seat),
                phase=room_data[b"status"].decode(),
                current_round=None,
            )

        # New join - find available seat
        occupied_seats = {p.seat_position for p in players}
        available_seat = next(s for s in range(4) if s not in occupied_seats)

        # Add player
        is_admin = room_data[b"admin_id"].decode() == user_id
        player_info = PlayerInfo(
            user_id=user_id,
            display_name=display_name,
            seat_position=available_seat,
            is_admin=is_admin,
            is_connected=True,
        )

        await self.redis.hset(
            f"room:{room_code}:players",
            str(available_seat),
            player_info.model_dump_json(),
        )

        # Track socket connection
        await self._track_connection(socket_id, user_id, room_code)
        await self._refresh_room_ttl(room_code)

        # Get updated player list
        updated_players = await self._get_room_players(room_code)

        return JoinRoomResult(
            game_id=room_data[b"game_id"].decode(),
            seat_position=available_seat,
            is_admin=is_admin,
            players=updated_players,
            player_info=player_info,
            phase=room_data[b"status"].decode(),
            current_round=None,
        )

    async def leave_room(
        self,
        room_code: str,
        user_id: str,
        reason: Literal["voluntary", "kicked", "disconnected"] = "voluntary",
    ) -> LeaveRoomResult:
        """Handle player leaving a room.

        Args:
            room_code: 6-character room code
            user_id: UUID of leaving user
            reason: Reason for leaving (voluntary, kicked, disconnected)

        Returns:
            LeaveRoomResult with room status and broadcast info

        Raises:
            NotFoundError: If player not in room
        """
        room_code = room_code.upper()

        # Find player's seat
        seat = await self._find_player_seat(room_code, user_id)
        if seat is None:
            raise NotFoundError("Player not in room", ErrorCode.PLAYER_NOT_IN_ROOM)

        # Get player info before removal
        player_data = await self.redis.hget(
            f"room:{room_code}:players",
            str(seat),
        )
        player_info = PlayerInfo.model_validate_json(player_data)  # type: ignore[arg-type]

        # Remove player
        await self.redis.hdel(f"room:{room_code}:players", str(seat))

        # Clear connection tracking
        socket_id = await self.redis.get(f"ws:user:{user_id}")
        if socket_id:
            await self._clear_connection(socket_id.decode())  # type: ignore

        # Check if room is now empty
        remaining_players = await self._get_room_players(room_code)

        if not remaining_players:
            # Room is empty, clean up
            await self._delete_room(room_code)
            return LeaveRoomResult(
                room_still_exists=False,
                broadcast_payload=None,
            )

        # Room still has players
        broadcast_payload = RoomPlayerLeftPayload(
            player_id=user_id,
            player_name=player_info.display_name,
            reason=reason,
            player_count=len(remaining_players),
        )

        return LeaveRoomResult(
            room_still_exists=True,
            broadcast_payload=broadcast_payload,
        )

    async def handle_disconnect(
        self,
        socket_id: str,
    ) -> tuple[str | None, str | None]:
        """Handle WebSocket disconnection.

        Args:
            socket_id: Socket.IO socket ID

        Returns:
            Tuple of (room_code, user_id) if player was in a room
        """
        # Get connection info
        conn_data = await self.redis.hgetall(f"ws:socket:{socket_id}")
        if not conn_data:
            return None, None

        user_id = conn_data.get(b"user_id")
        room_code = conn_data.get(b"room_code")

        if not user_id or not room_code:
            await self._clear_connection(socket_id)
            return None, None

        user_id_str = user_id.decode()
        room_code_str = room_code.decode()

        # Find player's seat
        seat = await self._find_player_seat(room_code_str, user_id_str)
        if seat is None:
            await self._clear_connection(socket_id)
            return None, None

        # Get room phase
        room_data = await self.redis.hgetall(f"room:{room_code_str}")
        phase = room_data.get(b"status", b"waiting").decode()

        if phase == "waiting":
            # Game hasn't started, just remove player
            await self.leave_room(room_code_str, user_id_str, reason="disconnected")
        else:
            # Game in progress, mark as disconnected with grace period
            await self._mark_player_disconnected(room_code_str, user_id_str, seat)

        # Clear connection
        await self._clear_connection(socket_id)

        return room_code_str, user_id_str

    async def _get_room_players(self, room_code: str) -> list[PlayerInfo]:
        """Get all players in a room."""
        players_data = await self.redis.hgetall(f"room:{room_code}:players")
        players = []
        for _seat, data in players_data.items():
            player = PlayerInfo.model_validate_json(data)
            players.append(player)
        return sorted(players, key=lambda p: p.seat_position)

    async def _find_player_seat(
        self,
        room_code: str,
        user_id: str,
    ) -> int | None:
        """Find a player's seat in a room."""
        players_data = await self.redis.hgetall(f"room:{room_code}:players")
        for seat, data in players_data.items():
            player = PlayerInfo.model_validate_json(data)
            if player.user_id == user_id:
                return int(seat)
        return None

    async def _track_connection(
        self,
        socket_id: str,
        user_id: str,
        room_code: str,
    ) -> None:
        """Track WebSocket connection."""
        pipe = self.redis.pipeline()

        pipe.hset(
            f"ws:socket:{socket_id}",
            mapping={
                "user_id": user_id,
                "room_code": room_code,
                "connected_at": datetime.utcnow().isoformat(),
            },
        )
        pipe.expire(f"ws:socket:{socket_id}", 600)  # 10 minutes

        pipe.set(f"ws:user:{user_id}", socket_id)
        pipe.expire(f"ws:user:{user_id}", 600)

        pipe.sadd(f"ws:room:{room_code}", socket_id)

        await pipe.execute()

    async def _clear_connection(self, socket_id: str) -> None:
        """Clear WebSocket connection tracking."""
        conn_data = await self.redis.hgetall(f"ws:socket:{socket_id}")

        if conn_data:
            user_id = conn_data.get(b"user_id")
            room_code = conn_data.get(b"room_code")

            pipe = self.redis.pipeline()
            pipe.delete(f"ws:socket:{socket_id}")

            if user_id:
                pipe.delete(f"ws:user:{user_id.decode()}")

            if room_code:
                pipe.srem(f"ws:room:{room_code.decode()}", socket_id)

            await pipe.execute()

    async def _update_player_connection(
        self,
        room_code: str,
        user_id: str,
        socket_id: str,
        seat_position: int,
    ) -> None:
        """Update player connection status."""
        player_data = await self.redis.hget(
            f"room:{room_code}:players",
            str(seat_position),
        )
        if player_data:
            player = PlayerInfo.model_validate_json(player_data)  # type: ignore
            updated = player.model_copy(update={"is_connected": True})
            await self.redis.hset(
                f"room:{room_code}:players",
                str(seat_position),
                updated.model_dump_json(),
            )

        await self._track_connection(socket_id, user_id, room_code)

    async def _mark_player_disconnected(
        self,
        room_code: str,
        user_id: str,
        seat: int,
    ) -> None:
        """Mark player as disconnected with grace period."""
        # Update player connection status
        player_data = await self.redis.hget(
            f"room:{room_code}:players",
            str(seat),
        )
        if player_data:
            player = PlayerInfo.model_validate_json(player_data)  # type: ignore
            updated = player.model_copy(update={"is_connected": False})
            await self.redis.hset(
                f"room:{room_code}:players",
                str(seat),
                updated.model_dump_json(),
            )

        # Store reconnection info
        await self.redis.hset(
            f"reconnect:{user_id}",
            mapping={
                "room_code": room_code,
                "seat_position": str(seat),
                "disconnected_at": datetime.utcnow().isoformat(),
            },
        )
        await self.redis.expire(
            f"reconnect:{user_id}",
            int(self.RECONNECT_GRACE_PERIOD.total_seconds()),
        )

        logger.info(
            "Player %s marked disconnected in room %s (grace period: %ds)",
            user_id,
            room_code,
            int(self.RECONNECT_GRACE_PERIOD.total_seconds()),
        )

    async def _clear_reconnection(self, user_id: str) -> None:
        """Clear reconnection grace period."""
        await self.redis.delete(f"reconnect:{user_id}")

    async def _refresh_room_ttl(self, room_code: str) -> None:
        """Refresh TTL on all room keys."""
        ttl = int(self.ROOM_TTL.total_seconds())
        pipe = self.redis.pipeline()
        pipe.expire(f"room:{room_code}", ttl)
        pipe.expire(f"room:{room_code}:players", ttl)
        pipe.expire(f"room:{room_code}:round", ttl)
        pipe.expire(f"room:{room_code}:bidding", ttl)
        pipe.hset(
            f"room:{room_code}",
            "last_activity",
            datetime.utcnow().isoformat(),
        )
        await pipe.execute()

    async def _delete_room(self, room_code: str) -> None:
        """Delete all room data from Redis."""
        await self.redis.delete(
            f"room:{room_code}",
            f"room:{room_code}:players",
            f"room:{room_code}:round",
            f"room:{room_code}:bidding",
            f"ws:room:{room_code}",
        )
        logger.info("Room %s deleted", room_code)

    async def is_player_in_room(self, room_code: str, user_id: str) -> bool:
        """Check if a player is in a room."""
        seat = await self._find_player_seat(room_code, user_id)
        return seat is not None

    async def is_room_admin(self, room_code: str, user_id: str) -> bool:
        """Check if a user is the room admin."""
        admin_id = await self.redis.hget(f"room:{room_code}", "admin_id")
        return admin_id == user_id.encode() if isinstance(admin_id, bytes) else admin_id == user_id
