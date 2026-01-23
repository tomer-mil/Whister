"""WebSocket game event handlers for bidding phase."""
import logging
from typing import Any

import socketio  # type: ignore

from app.schemas.game import TrumpSuit
from app.services.bidding_service import BiddingService
from app.websocket.connection_context import ConnectionContext
from app.websocket.room_manager import RoomManager
from app.websocket.schemas import (
    BidContractPayload,
    BidInfo,
    BidPassedPayload,
    BidPassPayload,
    BidPlacedPayload,
    BidTrumpPayload,
    ClientEvents,
    ErrorPayload,
    ServerEvents,
    WSErrorCode,
)

logger = logging.getLogger(__name__)


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
    await sio.emit(ServerEvents.ERROR, error_payload.model_dump(), to=sid)


def register_bidding_handlers(  # noqa: C901
    sio: "socketio.AsyncServer",  # type: ignore
    room_manager: RoomManager,
    bidding_service: BiddingService,
) -> None:
    """Register all bidding-related event handlers.

    Args:
        sio: Socket.IO server instance
        room_manager: RoomManager for room operations
        bidding_service: BiddingService for bidding logic
    """

    @sio.on(ClientEvents.BID_TRUMP)  # type: ignore
    async def handle_bid_trump(sid: str, data: dict[str, Any]) -> None:
        """Handle bid:trump event from client."""
        try:
            # Parse and validate payload
            try:
                payload = BidTrumpPayload(**data)
            except Exception as e:
                await emit_error(
                    sio,
                    sid,
                    WSErrorCode.INVALID_PAYLOAD,
                    "Invalid bid payload",
                    {"error": str(e)},
                )
                return

            # Get connection context
            ctx: ConnectionContext | None = sio.rooms.get(sid)  # type: ignore
            if not ctx or not ctx.is_authenticated:
                await emit_error(
                    sio,
                    sid,
                    WSErrorCode.AUTHENTICATION_REQUIRED,
                    "Not authenticated",
                )
                return

            # Get player info from room
            try:
                players = await room_manager._get_room_players(payload.room_code)
                player_info = next(
                    (p for p in players if p.user_id == ctx.user_id), None
                )
                if not player_info:
                    await emit_error(
                        sio,
                        sid,
                        WSErrorCode.NOT_IN_ROOM,
                        "Not in room",
                    )
                    return
            except Exception as e:
                logger.exception("Error getting player info: %s", e)
                await emit_error(
                    sio,
                    sid,
                    WSErrorCode.INTERNAL_ERROR,
                    "Internal error",
                )
                return

            # Place the bid
            success, error_msg = await bidding_service.place_trump_bid(
                payload.room_code,
                ctx.user_id,
                ctx.display_name,
                payload.amount,
                TrumpSuit(payload.suit),
            )

            if not success:
                await emit_error(
                    sio,
                    sid,
                    WSErrorCode.INVALID_BID_AMOUNT,
                    error_msg or "Invalid bid",
                )
                return

            # Create bid info for broadcast
            bid_info = BidInfo(
                player_id=ctx.user_id,
                player_name=ctx.display_name,
                amount=payload.amount,
                suit=TrumpSuit(payload.suit),
                is_pass=False,
            )

            # Broadcast bid to room
            broadcast_payload = BidPlacedPayload(
                bid=bid_info,
                is_highest=True,  # TODO: Calculate actual highest
                next_bidder_id=None,  # TODO: Determine next bidder
                next_bidder_name=None,
                next_bidder_seat=None,
                consecutive_passes=0,
            )
            await sio.emit(
                ServerEvents.BID_PLACED,
                broadcast_payload.model_dump(),
                room=payload.room_code,
            )

        except Exception as e:
            logger.exception("Error in handle_bid_trump: %s", e)
            await emit_error(
                sio,
                sid,
                WSErrorCode.INTERNAL_ERROR,
                "Internal error while processing bid",
            )

    @sio.on(ClientEvents.BID_PASS)  # type: ignore
    async def handle_bid_pass(sid: str, data: dict[str, Any]) -> None:
        """Handle bid:pass event from client."""
        try:
            # Parse and validate payload
            try:
                payload = BidPassPayload(**data)
            except Exception as e:
                await emit_error(
                    sio,
                    sid,
                    WSErrorCode.INVALID_PAYLOAD,
                    "Invalid pass payload",
                    {"error": str(e)},
                )
                return

            # Get connection context
            ctx: ConnectionContext | None = sio.rooms.get(sid)  # type: ignore
            if not ctx or not ctx.is_authenticated:
                await emit_error(
                    sio,
                    sid,
                    WSErrorCode.AUTHENTICATION_REQUIRED,
                    "Not authenticated",
                )
                return

            # Record the pass
            success, error_msg = await bidding_service.pass_trump_bid(
                payload.room_code,
                ctx.user_id,
            )

            if not success:
                await emit_error(
                    sio,
                    sid,
                    WSErrorCode.NOT_YOUR_TURN,
                    error_msg or "Cannot pass",
                )
                return

            # Broadcast pass to room
            broadcast_payload = BidPassedPayload(
                player_id=ctx.user_id,
                player_name=ctx.display_name,
                consecutive_passes=0,  # TODO: Get actual count
                next_bidder_id=None,
                next_bidder_name=None,
                next_bidder_seat=None,
            )
            await sio.emit(
                ServerEvents.BID_PASSED,
                broadcast_payload.model_dump(),
                room=payload.room_code,
            )

        except Exception as e:
            logger.exception("Error in handle_bid_pass: %s", e)
            await emit_error(
                sio,
                sid,
                WSErrorCode.INTERNAL_ERROR,
                "Internal error while processing pass",
            )

    @sio.on(ClientEvents.BID_CONTRACT)  # type: ignore
    async def handle_bid_contract(sid: str, data: dict[str, Any]) -> None:
        """Handle bid:contract event from client."""
        try:
            # Parse and validate payload
            try:
                payload = BidContractPayload(**data)
            except Exception as e:
                await emit_error(
                    sio,
                    sid,
                    WSErrorCode.INVALID_PAYLOAD,
                    "Invalid contract payload",
                    {"error": str(e)},
                )
                return

            # Get connection context
            ctx: ConnectionContext | None = sio.rooms.get(sid)  # type: ignore
            if not ctx or not ctx.is_authenticated:
                await emit_error(
                    sio,
                    sid,
                    WSErrorCode.AUTHENTICATION_REQUIRED,
                    "Not authenticated",
                )
                return

            # Place the contract bid
            success, error_msg = await bidding_service.place_contract_bid(
                payload.room_code,
                ctx.user_id,
                payload.amount,
            )

            if not success:
                await emit_error(
                    sio,
                    sid,
                    WSErrorCode.INVALID_BID_AMOUNT,
                    error_msg or "Invalid contract bid",
                )
                return

            # Broadcast contract bid to room
            # TODO: Determine next bidder and check if all contracts are placed
            broadcast_payload = BidPlacedPayload(
                bid=BidInfo(
                    player_id=ctx.user_id,
                    player_name=ctx.display_name,
                    amount=payload.amount,
                    is_pass=False,
                ),
                is_highest=True,
                next_bidder_id=None,
                next_bidder_name=None,
                next_bidder_seat=None,
                consecutive_passes=0,
            )
            await sio.emit(
                ServerEvents.BID_PLACED,
                broadcast_payload.model_dump(),
                room=payload.room_code,
            )

        except Exception as e:
            logger.exception("Error in handle_bid_contract: %s", e)
            await emit_error(
                sio,
                sid,
                WSErrorCode.INTERNAL_ERROR,
                "Internal error while processing contract bid",
            )
