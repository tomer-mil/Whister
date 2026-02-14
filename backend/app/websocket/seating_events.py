"""WebSocket seating event handlers."""
import logging
from typing import Any

import socketio  # type: ignore

from app.core.database import db_manager
from app.models.base import GameStatus
from app.services.room_service import RoomService
from app.websocket.connection_context import ConnectionContext
from app.websocket.room_manager import RoomManager
from app.websocket.schemas import (
    ClientEvents,
    ErrorPayload,
    PlayerInfo,
    SeatingConfirmPayload,
    SeatingSetPayload,
    SeatingSwapPayload,
    SeatingUpdatedPayload,
    ServerEvents,
    WSErrorCode,
)

logger = logging.getLogger(__name__)


async def emit_error(
    sio: "socketio.AsyncServer",
    sid: str,
    code: str,
    message: str,
    details: dict[str, str] | None = None,
    recoverable: bool = True,
) -> None:
    """Emit an error event to a client.

    Args:
        sio: Socket.IO server
        sid: Socket ID
        code: Error code
        message: Human-readable error message
        details: Additional error details
        recoverable: Whether client can retry
    """
    error_payload = ErrorPayload(
        code=code,
        message=message,
        details=details,
        recoverable=recoverable,
    )
    await sio.emit(ServerEvents.ERROR, error_payload.to_dict(), to=sid)


def register_seating_handlers(
    sio: "socketio.AsyncServer",  # type: ignore
    room_manager: RoomManager,
    connection_contexts: dict[str, ConnectionContext],
) -> None:
    """Register seating-related event handlers."""

    @sio.on(ClientEvents.SEATING_SWAP)  # type: ignore
    async def handle_seating_swap(sid: str, data: dict[str, Any]) -> dict[str, bool] | None:
        """Handle game:seating_swap event from admin."""
        try:
            # Parse payload
            try:
                payload = SeatingSwapPayload(**data)
            except Exception as e:
                await emit_error(sio, sid, WSErrorCode.INVALID_PAYLOAD, f"Invalid payload: {e}")
                return None

            room_code = payload.room_code.upper()

            # Get connection context
            ctx = connection_contexts.get(sid)
            if not ctx or not ctx.is_authenticated:
                await emit_error(sio, sid, WSErrorCode.AUTHENTICATION_REQUIRED, "Not authenticated")
                return None

            # Verify admin
            is_admin = await room_manager.is_room_admin(room_code, ctx.user_id)
            if not is_admin:
                await emit_error(sio, sid, WSErrorCode.NOT_ROOM_ADMIN, "Only admin can change seating")
                return None

            # Verify game is in SEATING phase
            room_data = await room_manager.redis.hgetall(f"room:{room_code}")
            if not room_data:
                await emit_error(sio, sid, WSErrorCode.ROOM_NOT_FOUND, "Room not found")
                return None

            status = room_data.get("status", "")
            if isinstance(status, bytes):
                status = status.decode()
            if status != GameStatus.SEATING.value:
                await emit_error(sio, sid, WSErrorCode.INVALID_GAME_PHASE, "Game is not in seating phase")
                return None

            # Get current players
            players = await room_manager._get_room_players(room_code)

            # Find the two players to swap
            player_a = next((p for p in players if p.user_id == payload.player_a_id), None)
            player_b = next((p for p in players if p.user_id == payload.player_b_id), None)

            if not player_a or not player_b:
                await emit_error(sio, sid, WSErrorCode.INVALID_PAYLOAD, "Player not found in room")
                return None

            # Swap seat positions in Redis
            seat_a = player_a.seat_position
            seat_b = player_b.seat_position

            updated_a = player_a.model_copy(update={"seat_position": seat_b})
            updated_b = player_b.model_copy(update={"seat_position": seat_a})

            pipe = room_manager.redis.pipeline()
            pipe.hset(f"room:{room_code}:players", str(seat_b), updated_a.model_dump_json())
            pipe.hset(f"room:{room_code}:players", str(seat_a), updated_b.model_dump_json())
            await pipe.execute()

            # Get updated player list and broadcast
            updated_players = await room_manager._get_room_players(room_code)
            broadcast_payload = SeatingUpdatedPayload(
                players=updated_players,
            )
            await sio.emit(
                ServerEvents.SEATING_UPDATED,
                broadcast_payload.to_dict(),
                room=f"room:{room_code}",
            )

            return {"success": True}

        except Exception as e:
            logger.exception("Error in handle_seating_swap: %s", e)
            await emit_error(sio, sid, WSErrorCode.INTERNAL_ERROR, "Internal error")
            return None

    @sio.on(ClientEvents.SEATING_CONFIRMED)  # type: ignore
    async def handle_seating_confirmed(sid: str, data: dict[str, Any]) -> dict[str, bool] | None:
        """Handle game:seating_confirmed event from admin."""
        try:
            # Parse payload
            try:
                payload = SeatingConfirmPayload(**data)
            except Exception as e:
                await emit_error(sio, sid, WSErrorCode.INVALID_PAYLOAD, f"Invalid payload: {e}")
                return None

            room_code = payload.room_code.upper()

            # Get connection context
            ctx = connection_contexts.get(sid)
            if not ctx or not ctx.is_authenticated:
                await emit_error(sio, sid, WSErrorCode.AUTHENTICATION_REQUIRED, "Not authenticated")
                return None

            # Use RoomService to confirm seating and create Round 1
            async with db_manager.session() as db:
                from app.models import User
                from sqlalchemy import select

                # Get user from DB
                user_result = await db.execute(
                    select(User).where(User.id == ctx.user_id)
                )
                user = user_result.scalar_one_or_none()
                if not user:
                    await emit_error(sio, sid, WSErrorCode.AUTHENTICATION_REQUIRED, "User not found")
                    return None

                room_service = RoomService(db, room_manager.redis)
                result = await room_service.confirm_seating(room_code, user)

            # Get final player list
            updated_players = await room_manager._get_room_players(room_code)

            # Broadcast seating_set
            set_payload = SeatingSetPayload(
                players=updated_players,
                game_id=str(result.game_id),
                first_bidder_id=str(result.first_bidder_id),
            )
            await sio.emit(
                ServerEvents.SEATING_SET,
                set_payload.to_dict(),
                room=f"room:{room_code}",
            )

            return {"success": True}

        except Exception as e:
            logger.exception("Error in handle_seating_confirmed: %s", e)
            await emit_error(sio, sid, WSErrorCode.INTERNAL_ERROR, "Internal error")
            return None
