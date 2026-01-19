"""WebSocket server configuration and event handlers."""
import logging
from typing import Any

import socketio  # type: ignore

from app.config import get_settings
from app.core.exceptions import AppException
from app.core.security import decode_token
from app.websocket.connection_context import ConnectionContext
from app.websocket.room_manager import RoomManager
from app.websocket.schemas import (
    ClientEvents,
    ErrorPayload,
    RoomJoinedPayload,
    RoomJoinPayload,
    RoomLeavePayload,
    RoomLeftPayload,
    RoomPlayerDisconnectedPayload,
    RoomPlayerJoinedPayload,
    ServerEvents,
    WSErrorCode,
)

logger = logging.getLogger(__name__)


def create_socketio_server(redis: Any) -> "socketio.AsyncServer":  # type: ignore
    """Create and configure the Socket.IO async server.

    Uses Redis as the message queue for cross-node communication
    in multi-server deployments.

    Args:
        redis: Redis client instance

    Returns:
        Configured Socket.IO AsyncServer
    """
    settings = get_settings()

    # Redis manager for multi-node support
    mgr = socketio.AsyncRedisManager(
        str(settings.redis_url),
        write_only=False,
    )

    sio = socketio.AsyncServer(
        async_mode="asgi",
        cors_allowed_origins=settings.cors_origins,
        logger=settings.debug,
        engineio_logger=settings.debug,
        # Connection settings
        ping_interval=25,
        ping_timeout=5,
        max_http_buffer_size=16384,  # 16KB max payload
        # Use Redis for cross-node messaging
        client_manager=mgr,
    )

    return sio  # noqa: RET504


def create_socketio_app(
    sio: "socketio.AsyncServer",  # type: ignore
    other_asgi_app: Any,
) -> "socketio.ASGIApp":  # type: ignore
    """Create the ASGI application wrapping Socket.IO and FastAPI.

    Args:
        sio: The Socket.IO server instance
        other_asgi_app: The FastAPI application to wrap

    Returns:
        Combined ASGI application
    """
    return socketio.ASGIApp(
        sio,
        other_asgi_app,
        socketio_path="/ws/socket.io",
    )


def register_socketio_handlers(  # noqa: C901
    sio: "socketio.AsyncServer",  # type: ignore
    room_manager: RoomManager,
) -> None:
    """Register all Socket.IO event handlers.

    Args:
        sio: Socket.IO server instance
        room_manager: RoomManager for room operations
    """

    @sio.event  # type: ignore
    async def connect(sid: str, environ: dict[str, Any], auth: dict[str, Any] | None) -> bool:
        """Handle WebSocket connection."""
        try:
            # Extract token from auth
            token = auth.get("token") if auth else None
            if not token:
                logger.warning("Connection attempt without token from %s", sid)
                return False

            # Verify token
            try:
                payload = decode_token(token)
                user_id = payload.get("user_id")
                if not user_id:
                    logger.warning("Invalid token payload for %s", sid)
                    return False
            except Exception as e:
                logger.warning("Token verification failed for %s: %s", sid, e)
                return False

            # Create context (we'll fetch display_name on room join)
            ctx = ConnectionContext(
                sio=sio,
                socket_id=sid,
                user_id=user_id,
                display_name="Unknown",  # Will be set on room join
                is_authenticated=True,
            )

            # Store context
            sio.rooms[sid] = ctx
            logger.info("User %s connected with socket %s", user_id, sid)
            return True

        except Exception as e:
            logger.exception("Error in connect handler: %s", e)
            return False

    @sio.event  # type: ignore
    async def disconnect(sid: str) -> None:
        """Handle WebSocket disconnection."""
        try:
            ctx = sio.rooms.get(sid)
            if ctx:
                # Handle room disconnect
                room_code, user_id = await room_manager.handle_disconnect(sid)
                if room_code and user_id:
                    # Broadcast disconnect to room
                    broadcast_payload = RoomPlayerDisconnectedPayload(
                        player_id=user_id,
                        player_name=ctx.display_name,
                        grace_period_seconds=60,
                    )
                    await ctx.broadcast_to_room(
                        f"room:{room_code}",
                        ServerEvents.ROOM_PLAYER_DISCONNECTED,
                        broadcast_payload.model_dump(),
                    )
                    logger.info(
                        "User %s disconnected from room %s", user_id, room_code
                    )
                else:
                    logger.info("User %s disconnected", ctx.user_id)

                del sio.rooms[sid]
        except Exception as e:
            logger.exception("Error in disconnect handler: %s", e)

    @sio.on(ClientEvents.ROOM_JOIN)  # type: ignore
    async def handle_room_join(sid: str, data: dict[str, Any]) -> None:
        """Handle room:join event."""
        try:
            ctx = sio.rooms.get(sid)
            if not ctx:
                await emit_error(
                    sio,
                    sid,
                    WSErrorCode.CONNECTION_FAILED,
                    "Not connected",
                    recoverable=False,
                )
                return

            # Parse payload
            try:
                payload = RoomJoinPayload(**data)
            except Exception as e:
                await emit_error(
                    sio,
                    sid,
                    WSErrorCode.INVALID_PAYLOAD,
                    f"Invalid payload: {e!s}",
                )
                return

            # Join room
            try:
                join_result = await room_manager.join_room(
                    room_code=payload.room_code,
                    user_id=ctx.user_id,
                    display_name=payload.display_name or ctx.display_name,
                    socket_id=sid,
                )

                # Update context
                ctx.current_room = payload.room_code
                ctx.display_name = (
                    payload.display_name or ctx.display_name
                )

                # Join Socket.IO room
                await ctx.join_room(f"room:{payload.room_code}")

                # Send confirmation
                joined_payload = RoomJoinedPayload(
                    room_code=payload.room_code,
                    game_id=join_result.game_id,
                    your_seat=join_result.seat_position,
                    is_admin=join_result.is_admin,
                    players=join_result.players,
                    phase=join_result.phase,  # type: ignore
                    current_round=join_result.current_round,
                )
                await ctx.emit(ServerEvents.ROOM_JOINED, joined_payload.model_dump())

                # Broadcast to room
                player_joined_payload = RoomPlayerJoinedPayload(
                    player=join_result.player_info,
                    player_count=len(join_result.players),
                )
                await ctx.broadcast_to_room(
                    f"room:{payload.room_code}",
                    ServerEvents.ROOM_PLAYER_JOINED,
                    player_joined_payload.model_dump(),
                    exclude_self=True,
                )

                logger.info(
                    "User %s joined room %s at seat %d",
                    ctx.user_id,
                    payload.room_code,
                    join_result.seat_position,
                )

            except AppException as e:
                await emit_error(
                    sio, sid, e.error_code.value, e.message
                )
            except Exception as e:
                logger.exception("Error in room_join: %s", e)
                await emit_error(
                    sio,
                    sid,
                    WSErrorCode.INTERNAL_ERROR,
                    "Internal server error",
                    recoverable=False,
                )

        except Exception as e:
            logger.exception("Error in handle_room_join: %s", e)

    @sio.on(ClientEvents.ROOM_LEAVE)  # type: ignore
    async def handle_room_leave(sid: str, data: dict[str, Any]) -> None:
        """Handle room:leave event."""
        try:
            ctx = sio.rooms.get(sid)
            if not ctx:
                await emit_error(
                    sio,
                    sid,
                    WSErrorCode.CONNECTION_FAILED,
                    "Not connected",
                    recoverable=False,
                )
                return

            # Parse payload
            try:
                payload = RoomLeavePayload(**data)
            except Exception as e:
                await emit_error(
                    sio,
                    sid,
                    WSErrorCode.INVALID_PAYLOAD,
                    f"Invalid payload: {e!s}",
                )
                return

            # Leave room
            try:
                leave_result = await room_manager.leave_room(
                    room_code=payload.room_code,
                    user_id=ctx.user_id,
                    reason="voluntary",
                )

                # Leave Socket.IO room
                await ctx.leave_room(f"room:{payload.room_code}")
                ctx.current_room = None

                # Send confirmation
                left_payload = RoomLeftPayload(
                    room_code=payload.room_code,
                    reason="voluntary",
                )
                await ctx.emit(ServerEvents.ROOM_LEFT, left_payload.model_dump())

                # Broadcast if room still exists
                if leave_result.room_still_exists and leave_result.broadcast_payload:
                    await ctx.broadcast_to_room(
                        f"room:{payload.room_code}",
                        ServerEvents.ROOM_PLAYER_LEFT,
                        leave_result.broadcast_payload.model_dump(),
                    )

                logger.info("User %s left room %s", ctx.user_id, payload.room_code)

            except AppException as e:
                await emit_error(
                    sio, sid, e.error_code.value, e.message
                )
            except Exception as e:
                logger.exception("Error in room_leave: %s", e)
                await emit_error(
                    sio,
                    sid,
                    WSErrorCode.INTERNAL_ERROR,
                    "Internal server error",
                    recoverable=False,
                )

        except Exception as e:
            logger.exception("Error in handle_room_leave: %s", e)


async def emit_error(
    sio: "socketio.AsyncServer",  # type: ignore
    sid: str,
    code: str,
    message: str,
    details: dict[str, str] | None = None,
    recoverable: bool = True,
) -> None:
    """Emit an error event to a client.

    Args:
        sio: Socket.IO server
        sid: Socket ID to send to
        code: Error code
        message: Error message
        details: Additional error details
        recoverable: Whether the client can recover
    """
    error_payload = ErrorPayload(
        code=code,
        message=message,
        details=details,
        recoverable=recoverable,
    )
    await sio.emit(ServerEvents.ERROR, error_payload.model_dump(), to=sid)
