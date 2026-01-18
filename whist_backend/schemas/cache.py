"""Redis cache manager for real-time game state.

This module provides Redis data structures for:
- Room state management
- WebSocket connection tracking
- Session management
- Rate limiting support

All data structures are documented in the Database Schema LLD.
"""
import json
from datetime import datetime, timedelta
from typing import Any

from redis.asyncio import Redis


class RoomCacheManager:
    """Manages room state in Redis for real-time game access.

    Room data is stored across multiple keys:
    - room:{code} - Hash with room metadata
    - room:{code}:players - Hash with player data by seat
    - room:{code}:round - Hash with current round state
    - room:{code}:bidding - Hash with bidding phase state
    """

    ROOM_TTL = timedelta(hours=24)

    def __init__(self, redis: Redis) -> None:
        """Initialize with Redis client.

        Args:
            redis: Async Redis client instance
        """
        self.redis = redis

    async def create_room(
        self,
        room_code: str,
        game_id: str,
        admin_id: str,
    ) -> None:
        """Initialize a new room in Redis.

        Args:
            room_code: 6-character room code
            game_id: UUID of the game
            admin_id: UUID of the admin user
        """
        now = datetime.utcnow().isoformat()
        ttl_seconds = int(self.ROOM_TTL.total_seconds())

        pipe = self.redis.pipeline()

        # Set room state
        pipe.hset(
            f"room:{room_code}",
            mapping={
                "game_id": game_id,
                "admin_id": admin_id,
                "status": "waiting",
                "phase": "",
                "created_at": now,
                "last_activity": now,
            },
        )
        pipe.expire(f"room:{room_code}", ttl_seconds)

        # Initialize empty players hash
        pipe.delete(f"room:{room_code}:players")

        await pipe.execute()

    async def add_player(
        self,
        room_code: str,
        seat: int,
        player_data: dict[str, Any],
    ) -> None:
        """Add a player to a room.

        Args:
            room_code: Room code
            seat: Seat position (0-3)
            player_data: Dict with user_id, display_name, is_admin, is_connected
        """
        await self.redis.hset(
            f"room:{room_code}:players",
            str(seat),
            json.dumps(player_data),
        )
        await self._refresh_ttl(room_code)

    async def remove_player(self, room_code: str, seat: int) -> None:
        """Remove a player from a room.

        Args:
            room_code: Room code
            seat: Seat position to remove
        """
        await self.redis.hdel(f"room:{room_code}:players", str(seat))
        await self._refresh_ttl(room_code)

    async def update_player(
        self,
        room_code: str,
        seat: int,
        updates: dict[str, Any],
    ) -> None:
        """Update a player's data in the room.

        Args:
            room_code: Room code
            seat: Seat position
            updates: Fields to update
        """
        key = f"room:{room_code}:players"
        existing = await self.redis.hget(key, str(seat))

        if existing:
            data = json.loads(existing)
            data.update(updates)
            await self.redis.hset(key, str(seat), json.dumps(data))
            await self._refresh_ttl(room_code)

    async def get_room_state(self, room_code: str) -> dict[str, Any] | None:
        """Get complete room state.

        Args:
            room_code: Room code

        Returns:
            Dict with room, players, round, and bidding data, or None if not found
        """
        pipe = self.redis.pipeline()
        pipe.hgetall(f"room:{room_code}")
        pipe.hgetall(f"room:{room_code}:players")
        pipe.hgetall(f"room:{room_code}:round")
        pipe.hgetall(f"room:{room_code}:bidding")

        results = await pipe.execute()

        if not results[0]:
            return None

        return {
            "room": results[0],
            "players": {
                int(k): json.loads(v) for k, v in results[1].items()
            }
            if results[1]
            else {},
            "round": results[2] or None,
            "bidding": results[3] or None,
        }

    async def get_players(self, room_code: str) -> dict[int, dict[str, Any]]:
        """Get all players in a room.

        Args:
            room_code: Room code

        Returns:
            Dict mapping seat position to player data
        """
        data = await self.redis.hgetall(f"room:{room_code}:players")
        return {int(k): json.loads(v) for k, v in data.items()}

    async def update_game_status(
        self,
        room_code: str,
        status: str,
        phase: str | None = None,
    ) -> None:
        """Update game status.

        Args:
            room_code: Room code
            status: New game status
            phase: Optional new phase
        """
        update: dict[str, str] = {
            "status": status,
            "last_activity": datetime.utcnow().isoformat(),
        }
        if phase is not None:
            update["phase"] = phase

        await self.redis.hset(f"room:{room_code}", mapping=update)
        await self._refresh_ttl(room_code)

    async def set_round_state(
        self,
        room_code: str,
        round_data: dict[str, Any],
    ) -> None:
        """Set current round state.

        Args:
            room_code: Room code
            round_data: Round state data
        """
        # Convert nested objects to JSON strings
        serialized = {
            k: json.dumps(v) if isinstance(v, (dict, list)) else str(v)
            for k, v in round_data.items()
        }
        await self.redis.hset(f"room:{room_code}:round", mapping=serialized)
        await self._refresh_ttl(room_code)

    async def update_round_state(
        self,
        room_code: str,
        updates: dict[str, Any],
    ) -> None:
        """Update specific fields in round state.

        Args:
            room_code: Room code
            updates: Fields to update
        """
        serialized = {
            k: json.dumps(v) if isinstance(v, (dict, list)) else str(v)
            for k, v in updates.items()
        }
        await self.redis.hset(f"room:{room_code}:round", mapping=serialized)
        await self._refresh_ttl(room_code)

    async def set_bidding_state(
        self,
        room_code: str,
        bidding_data: dict[str, Any],
    ) -> None:
        """Set bidding phase state.

        Args:
            room_code: Room code
            bidding_data: Bidding state data
        """
        serialized = {
            k: json.dumps(v) if isinstance(v, (dict, list)) else str(v)
            for k, v in bidding_data.items()
        }
        await self.redis.hset(f"room:{room_code}:bidding", mapping=serialized)
        await self._refresh_ttl(room_code)

    async def clear_bidding_state(self, room_code: str) -> None:
        """Clear bidding state after bidding completes.

        Args:
            room_code: Room code
        """
        await self.redis.delete(f"room:{room_code}:bidding")

    async def delete_room(self, room_code: str) -> None:
        """Remove all room data from Redis.

        Args:
            room_code: Room code
        """
        await self.redis.delete(
            f"room:{room_code}",
            f"room:{room_code}:players",
            f"room:{room_code}:round",
            f"room:{room_code}:bidding",
            f"ws:room:{room_code}",
        )

    async def room_exists(self, room_code: str) -> bool:
        """Check if a room exists.

        Args:
            room_code: Room code

        Returns:
            True if room exists
        """
        return await self.redis.exists(f"room:{room_code}") > 0

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


class ConnectionManager:
    """Manages WebSocket connection tracking in Redis.

    Connection data:
    - ws:socket:{socket_id} - Hash with user_id, room_code, connected_at
    - ws:user:{user_id} - String with current socket_id
    - ws:room:{room_code} - Set of socket_ids in the room
    """

    CONNECTION_TTL = timedelta(minutes=10)

    def __init__(self, redis: Redis) -> None:
        """Initialize with Redis client.

        Args:
            redis: Async Redis client instance
        """
        self.redis = redis

    async def register_connection(
        self,
        socket_id: str,
        user_id: str,
        room_code: str | None = None,
    ) -> None:
        """Register a new WebSocket connection.

        Args:
            socket_id: Socket.IO session ID
            user_id: User's UUID
            room_code: Optional room code if joining a room
        """
        ttl_seconds = int(self.CONNECTION_TTL.total_seconds())
        now = datetime.utcnow().isoformat()

        pipe = self.redis.pipeline()

        # Store socket info
        socket_data: dict[str, str] = {
            "user_id": user_id,
            "connected_at": now,
        }
        if room_code:
            socket_data["room_code"] = room_code

        pipe.hset(f"ws:socket:{socket_id}", mapping=socket_data)
        pipe.expire(f"ws:socket:{socket_id}", ttl_seconds)

        # Map user to socket
        pipe.set(f"ws:user:{user_id}", socket_id, ex=ttl_seconds)

        # Add to room set if applicable
        if room_code:
            pipe.sadd(f"ws:room:{room_code}", socket_id)

        await pipe.execute()

    async def unregister_connection(self, socket_id: str) -> dict[str, str] | None:
        """Unregister a WebSocket connection.

        Args:
            socket_id: Socket.IO session ID

        Returns:
            Connection info (user_id, room_code) if found, else None
        """
        # Get socket info first
        socket_data = await self.redis.hgetall(f"ws:socket:{socket_id}")

        if not socket_data:
            return None

        pipe = self.redis.pipeline()

        # Remove socket info
        pipe.delete(f"ws:socket:{socket_id}")

        # Remove user mapping
        user_id = socket_data.get("user_id")
        if user_id:
            # Only delete if this socket is still the current one
            current_socket = await self.redis.get(f"ws:user:{user_id}")
            if current_socket == socket_id:
                pipe.delete(f"ws:user:{user_id}")

        # Remove from room set
        room_code = socket_data.get("room_code")
        if room_code:
            pipe.srem(f"ws:room:{room_code}", socket_id)

        await pipe.execute()

        return socket_data

    async def get_user_socket(self, user_id: str) -> str | None:
        """Get the current socket ID for a user.

        Args:
            user_id: User's UUID

        Returns:
            Socket ID if connected, else None
        """
        return await self.redis.get(f"ws:user:{user_id}")

    async def get_room_sockets(self, room_code: str) -> set[str]:
        """Get all socket IDs in a room.

        Args:
            room_code: Room code

        Returns:
            Set of socket IDs
        """
        return await self.redis.smembers(f"ws:room:{room_code}")

    async def refresh_connection(self, socket_id: str) -> None:
        """Refresh TTL on connection (called on heartbeat).

        Args:
            socket_id: Socket.IO session ID
        """
        ttl_seconds = int(self.CONNECTION_TTL.total_seconds())

        socket_data = await self.redis.hgetall(f"ws:socket:{socket_id}")
        if not socket_data:
            return

        pipe = self.redis.pipeline()
        pipe.expire(f"ws:socket:{socket_id}", ttl_seconds)

        user_id = socket_data.get("user_id")
        if user_id:
            pipe.expire(f"ws:user:{user_id}", ttl_seconds)

        await pipe.execute()


class ReconnectionManager:
    """Manages reconnection grace periods.

    Stores room info for disconnected users so they can rejoin:
    - reconnect:{user_id} - Hash with room_code, seat_position, disconnected_at
    """

    GRACE_PERIOD = timedelta(seconds=60)

    def __init__(self, redis: Redis) -> None:
        """Initialize with Redis client.

        Args:
            redis: Async Redis client instance
        """
        self.redis = redis

    async def start_grace_period(
        self,
        user_id: str,
        room_code: str,
        seat_position: int,
    ) -> None:
        """Start reconnection grace period for a user.

        Args:
            user_id: User's UUID
            room_code: Room they were in
            seat_position: Their seat position
        """
        ttl_seconds = int(self.GRACE_PERIOD.total_seconds())
        now = datetime.utcnow().isoformat()

        await self.redis.hset(
            f"reconnect:{user_id}",
            mapping={
                "room_code": room_code,
                "seat_position": str(seat_position),
                "disconnected_at": now,
            },
        )
        await self.redis.expire(f"reconnect:{user_id}", ttl_seconds)

    async def get_reconnection_info(self, user_id: str) -> dict[str, Any] | None:
        """Get reconnection info for a user.

        Args:
            user_id: User's UUID

        Returns:
            Dict with room_code, seat_position if in grace period, else None
        """
        data = await self.redis.hgetall(f"reconnect:{user_id}")
        if not data:
            return None

        return {
            "room_code": data["room_code"],
            "seat_position": int(data["seat_position"]),
            "disconnected_at": data["disconnected_at"],
        }

    async def cancel_grace_period(self, user_id: str) -> None:
        """Cancel reconnection grace period (user reconnected or left).

        Args:
            user_id: User's UUID
        """
        await self.redis.delete(f"reconnect:{user_id}")


class SessionManager:
    """Manages user sessions and JWT tokens.

    Keys:
    - session:{user_id} - Hash with last_active, current_room, socket_id
    - refresh_token:{hash} - String with user_id
    - blacklist:jwt:{jti} - String marker for revoked tokens
    """

    SESSION_TTL = timedelta(hours=24)
    REFRESH_TOKEN_TTL = timedelta(days=7)

    def __init__(self, redis: Redis) -> None:
        """Initialize with Redis client.

        Args:
            redis: Async Redis client instance
        """
        self.redis = redis

    async def create_session(
        self,
        user_id: str,
        refresh_token_hash: str,
    ) -> None:
        """Create a new user session.

        Args:
            user_id: User's UUID
            refresh_token_hash: Hash of the refresh token
        """
        now = datetime.utcnow().isoformat()
        session_ttl = int(self.SESSION_TTL.total_seconds())
        refresh_ttl = int(self.REFRESH_TOKEN_TTL.total_seconds())

        pipe = self.redis.pipeline()

        # Store session info
        pipe.hset(
            f"session:{user_id}",
            mapping={
                "last_active": now,
                "current_room": "",
            },
        )
        pipe.expire(f"session:{user_id}", session_ttl)

        # Store refresh token mapping
        pipe.set(f"refresh_token:{refresh_token_hash}", user_id, ex=refresh_ttl)

        await pipe.execute()

    async def validate_refresh_token(self, token_hash: str) -> str | None:
        """Validate a refresh token.

        Args:
            token_hash: Hash of the refresh token

        Returns:
            User ID if valid, else None
        """
        return await self.redis.get(f"refresh_token:{token_hash}")

    async def revoke_refresh_token(self, token_hash: str) -> None:
        """Revoke a refresh token.

        Args:
            token_hash: Hash of the refresh token
        """
        await self.redis.delete(f"refresh_token:{token_hash}")

    async def blacklist_access_token(self, jti: str, expires_in: int) -> None:
        """Blacklist an access token.

        Args:
            jti: JWT ID
            expires_in: Seconds until token expires
        """
        await self.redis.set(f"blacklist:jwt:{jti}", "1", ex=expires_in)

    async def is_token_blacklisted(self, jti: str) -> bool:
        """Check if an access token is blacklisted.

        Args:
            jti: JWT ID

        Returns:
            True if blacklisted
        """
        return await self.redis.exists(f"blacklist:jwt:{jti}") > 0

    async def update_session_room(self, user_id: str, room_code: str | None) -> None:
        """Update the current room for a user session.

        Args:
            user_id: User's UUID
            room_code: Room code or None if leaving
        """
        await self.redis.hset(
            f"session:{user_id}",
            "current_room",
            room_code or "",
        )

    async def touch_session(self, user_id: str) -> None:
        """Update last_active timestamp.

        Args:
            user_id: User's UUID
        """
        session_ttl = int(self.SESSION_TTL.total_seconds())
        pipe = self.redis.pipeline()
        pipe.hset(f"session:{user_id}", "last_active", datetime.utcnow().isoformat())
        pipe.expire(f"session:{user_id}", session_ttl)
        await pipe.execute()

    async def end_session(self, user_id: str) -> None:
        """End a user session (logout).

        Args:
            user_id: User's UUID
        """
        await self.redis.delete(f"session:{user_id}")
