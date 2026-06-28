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

# Store connection contexts by socket ID
# (sio.rooms is a method, not a dict, so we use our own storage)
# This is exported for use by other modules (e.g., game_events.py)
_connection_contexts: dict[str, ConnectionContext] = {}


def get_connection_context(sid: str) -> ConnectionContext | None:
    """Get connection context for a socket ID.

    Args:
        sid: Socket ID

    Returns:
        ConnectionContext if found, None otherwise
    """
    return _connection_contexts.get(sid)


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
                user_id = payload.get("sub")
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
            _connection_contexts[sid] = ctx
            logger.info("User %s connected with socket %s", user_id, sid)
            return True

        except Exception as e:
            logger.exception("Error in connect handler: %s", e)
            return False

    @sio.event  # type: ignore
    async def disconnect(sid: str) -> None:
        """Handle WebSocket disconnection."""
        try:
            ctx = _connection_contexts.get(sid)
            if ctx:
                # Read round state BEFORE handle_disconnect in case it modifies Redis
                round_state_snapshot: dict[str, str] = {}
                if ctx.current_room:
                    try:
                        round_state_snapshot = await room_manager.get_room_round_state(ctx.current_room)
                    except Exception:
                        pass

                room_code, user_id = await room_manager.handle_disconnect(sid)
                if room_code and user_id:
                    broadcast_payload = RoomPlayerDisconnectedPayload(
                        player_id=user_id,
                        player_name=ctx.display_name,
                        grace_period_seconds=60,
                    )
                    await ctx.broadcast_to_room(
                        f"room:{room_code}",
                        ServerEvents.ROOM_PLAYER_DISCONNECTED,
                        broadcast_payload.to_dict(),
                    )
                    logger.info(
                        "User %s disconnected from room %s", user_id, room_code
                    )

                    # --- Auto-pass if disconnected player was the active trump bidder ---
                    try:
                        phase = round_state_snapshot.get("phase", "")
                        current_bidder_id = round_state_snapshot.get("current_bidder_id")

                        if phase == "trump_bidding" and current_bidder_id == user_id:
                            logger.info(
                                "Active trump bidder %s disconnected — auto-passing", user_id
                            )
                            from app.services.bidding_service import BiddingService  # lazy import
                            bidding_svc = BiddingService(room_manager.redis)
                            passed, error_msg = await bidding_svc.pass_trump_bid(
                                room_code, user_id, ctx.display_name
                            )
                            if passed:
                                # Add to passed_players set
                                await room_manager.redis.sadd(
                                    f"room:{room_code}:passed_players", user_id
                                )
                                # Determine next bidder
                                passed_raw = await room_manager.redis.smembers(
                                    f"room:{room_code}:passed_players"
                                )
                                passed_players = {
                                    p.decode() if isinstance(p, bytes) else p
                                    for p in passed_raw
                                }
                                current_seat = int(
                                    round_state_snapshot.get("current_bidder_seat", 0)
                                )
                                # Fetch fresh round state and player list for terminal-state checks
                                fresh_round = await room_manager.get_room_round_state(room_code)
                                highest_bid_json = fresh_round.get("highest_bid", "")
                                frisch_count = int(fresh_round.get("frisch_count", 0))
                                players = await room_manager._get_room_players(room_code)
                                active_bidders = [p for p in players if p.user_id not in passed_players]

                                from app.websocket.game_events import get_next_bidder, emit_your_turn  # lazy import
                                next_id, _next_name, next_seat = await get_next_bidder(
                                    room_manager, room_code, current_seat, passed_players
                                )
                                if next_id and next_seat is not None:
                                    # Advance current_bidder_id in Redis
                                    await room_manager.redis.hset(
                                        f"room:{room_code}:round",
                                        mapping={
                                            "current_bidder_id": next_id,
                                            "current_bidder_seat": str(next_seat),
                                        },
                                    )
                                    minimum_bid = int(
                                        fresh_round.get("minimum_bid", 5)
                                    )
                                    await emit_your_turn(
                                        sio,
                                        room_manager,
                                        next_id,
                                        phase="trump_bidding",
                                        minimum_bid=minimum_bid,
                                        is_last_bidder=False,
                                    )
                                    logger.info(
                                        "Auto-pass complete; next bidder is %s", next_id
                                    )
                                elif not next_id and highest_bid_json and len(active_bidders) == 1:
                                    # Last bidder with highest bid — settle trump, transition to contract bidding
                                    import json as _json
                                    from app.schemas.game import TrumpSuit
                                    from app.websocket.schemas import BidTrumpSetPayload
                                    bid_data = _json.loads(highest_bid_json)
                                    winner_id = bid_data["player_id"]
                                    winner_name = bid_data["player_name"]
                                    trump_suit = TrumpSuit(bid_data["suit"])
                                    winning_bid = bid_data["amount"]
                                    await bidding_svc.set_trump(
                                        room_code, winner_id, winner_name, trump_suit, winning_bid
                                    )
                                    await room_manager.redis.delete(f"room:{room_code}:passed_players")
                                    await room_manager.redis.hset(
                                        f"room:{room_code}:round",
                                        mapping={
                                            "current_bidder_id": winner_id,
                                            "current_bidder_seat": str(active_bidders[0].seat_position),
                                            "contract_bid_count": "0",
                                        },
                                    )
                                    trump_payload = BidTrumpSetPayload(
                                        trump_suit=trump_suit.value,
                                        winner_id=winner_id,
                                        winner_name=winner_name,
                                        winning_bid=winning_bid,
                                        frisch_count=frisch_count,
                                    )
                                    await sio.emit(
                                        ServerEvents.BID_TRUMP_SET,
                                        trump_payload.to_dict(),
                                        room=f"room:{room_code}",
                                    )
                                    await emit_your_turn(
                                        sio,
                                        room_manager,
                                        winner_id,
                                        phase="contract_bidding",
                                        is_trump_winner=True,
                                        trump_winning_bid=winning_bid,
                                        current_contract_sum=0,
                                        is_last_bidder=False,
                                    )
                                    logger.info(
                                        "Auto-pass: trump settled for winner %s in room %s",
                                        winner_id, room_code,
                                    )
                                elif not next_id and not highest_bid_json:
                                    # All 4 players passed with no bid — frisch
                                    from app.websocket.schemas import FrischStartedPayload
                                    if frisch_count < 3:
                                        await bidding_svc.handle_frisch(room_code)
                                        await room_manager.redis.delete(f"room:{room_code}:passed_players")
                                        new_minimum_bid = bidding_svc.get_minimum_bid(frisch_count + 1)
                                        first_player = next(
                                            (p for p in players if p.seat_position == 0), players[0]
                                        )
                                        await room_manager.redis.hset(
                                            f"room:{room_code}:round",
                                            mapping={
                                                "current_bidder_id": first_player.user_id,
                                                "current_bidder_seat": str(first_player.seat_position),
                                            },
                                        )
                                        frisch_payload = FrischStartedPayload(
                                            frisch_number=frisch_count + 1,
                                            new_minimum_bid=new_minimum_bid,
                                            first_bidder_id=first_player.user_id,
                                            first_bidder_name=first_player.display_name,
                                        )
                                        await sio.emit(
                                            ServerEvents.BID_FRISCH_STARTED,
                                            frisch_payload.to_dict(),
                                            room=f"room:{room_code}",
                                        )
                                        await emit_your_turn(
                                            sio,
                                            room_manager,
                                            first_player.user_id,
                                            phase="trump_bidding",
                                            minimum_bid=new_minimum_bid,
                                            current_highest_bid=None,
                                            current_highest_suit=None,
                                            is_last_bidder=False,
                                        )
                                        logger.info(
                                            "Auto-pass: frisch %d started in room %s",
                                            frisch_count + 1, room_code,
                                        )
                                    else:
                                        logger.warning(
                                            "Auto-pass: max frisch reached in room %s", room_code
                                        )
                            else:
                                logger.warning(
                                    "Auto-pass failed for %s in room %s: %s",
                                    user_id, room_code, error_msg,
                                )
                    except Exception as auto_pass_err:
                        logger.exception(
                            "Auto-pass failed for %s in room %s: %s",
                            user_id, room_code, auto_pass_err,
                        )
                else:
                    logger.info("User %s disconnected", ctx.user_id)

                del _connection_contexts[sid]
        except Exception as e:
            logger.exception("Error in disconnect handler: %s", e)

    @sio.on(ClientEvents.ROOM_JOIN)  # type: ignore
    async def handle_room_join(sid: str, data: dict[str, Any]) -> None:
        """Handle room:join event."""
        try:
            ctx = _connection_contexts.get(sid)
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
                logger.info(
                    "User %s attempting to join room %s",
                    ctx.user_id,
                    payload.room_code,
                )
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

                # Get current bidder ID if in bidding phase
                current_bidder_id = None
                if join_result.phase in ["bidding_trump", "bidding_contract"]:
                    round_key = f"room:{payload.room_code}:round"
                    round_data = await room_manager.redis.hgetall(round_key)
                    if round_data:
                        current_bidder_id = round_data.get("current_bidder_id")

                # Send confirmation
                joined_payload = RoomJoinedPayload(
                    room_code=payload.room_code,
                    game_id=join_result.game_id,
                    your_seat=join_result.seat_position,
                    is_admin=join_result.is_admin,
                    players=join_result.players,
                    phase=join_result.phase,  # type: ignore
                    current_round=join_result.current_round,
                    current_bidder_id=current_bidder_id,
                )
                await ctx.emit(ServerEvents.ROOM_JOINED, joined_payload.to_dict())

                # Check if it's this player's turn to bid
                try:
                    if join_result.phase in ["bidding_trump", "bidding_contract"]:
                        from app.websocket.game_events import emit_your_turn
                        round_key = f"room:{payload.room_code}:round"
                        round_data = await room_manager.redis.hgetall(round_key)

                        if round_data:
                            current_bidder_id = round_data.get("current_bidder_id")
                            if current_bidder_id == ctx.user_id:
                                # It's this player's turn - emit bid:your_turn
                                phase_value = round_data.get("phase", "trump_bidding")
                                minimum_bid = int(round_data.get("minimum_bid", 5))

                                # Get highest bid for trump bidding
                                highest_bid_json = round_data.get("highest_bid")
                                current_highest_bid = None
                                current_highest_suit = None

                                if highest_bid_json:
                                    import json
                                    bid_data = json.loads(highest_bid_json)
                                    current_highest_bid = bid_data.get("amount")
                                    current_highest_suit = bid_data.get("suit")

                                await emit_your_turn(
                                    sio,
                                    room_manager,
                                    ctx.user_id,
                                    phase=phase_value,
                                    minimum_bid=minimum_bid,
                                    current_highest_bid=current_highest_bid,
                                    current_highest_suit=current_highest_suit,
                                    is_last_bidder=False,
                                )
                                logger.info("Emitted bid:your_turn to %s upon joining", ctx.user_id)
                except Exception as e:
                    logger.exception("Error emitting bid:your_turn on join: %s", e)

                # Broadcast to room
                player_joined_payload = RoomPlayerJoinedPayload(
                    player=join_result.player_info,
                    player_count=len(join_result.players),
                )
                await ctx.broadcast_to_room(
                    f"room:{payload.room_code}",
                    ServerEvents.ROOM_PLAYER_JOINED,
                    player_joined_payload.to_dict(),
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
            ctx = _connection_contexts.get(sid)
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
                await ctx.emit(ServerEvents.ROOM_LEFT, left_payload.to_dict())

                # Broadcast if room still exists
                if leave_result.room_still_exists and leave_result.broadcast_payload:
                    await ctx.broadcast_to_room(
                        f"room:{payload.room_code}",
                        ServerEvents.ROOM_PLAYER_LEFT,
                        leave_result.broadcast_payload.to_dict(),
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
    await sio.emit(ServerEvents.ERROR, error_payload.to_dict(), to=sid)
