"""WebSocket game event handlers for bidding and playing phases."""
import json
import logging
from typing import Any

import socketio  # type: ignore

from app.schemas.game import GameType, RoundPhase, TrumpSuit
from app.services.bidding_service import BiddingService
from app.services.scoring_service import ScoringService
from app.websocket.connection_context import ConnectionContext
from app.websocket.room_manager import RoomManager

# Type alias for the connection context getter function
GetContextFn = type(lambda sid: None)  # Callable[[str], ConnectionContext | None]
from app.websocket.schemas import (
    BidContractPayload,
    BidInfo,
    BidPassedPayload,
    BidPassPayload,
    BidPlacedPayload,
    BidTrumpPayload,
    ClientEvents,
    ContractInfo,
    ContractsSetPayload,
    ErrorPayload,
    FrischStartedPayload,
    RoundClaimTrickPayload,
    RoundCompletePayload,
    RoundTrickWonPayload,
    RoundUndoTrickPayload,
    ServerEvents,
    TrumpSetPayload,
    WSErrorCode,
    YourTurnPayload,
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
    await sio.emit(ServerEvents.ERROR, error_payload.to_dict(), to=sid)


async def get_next_bidder(
    room_manager: RoomManager,
    room_code: str,
    current_seat: int,
    passed_players: set[str],
) -> tuple[str | None, str | None, int | None]:
    """Get the next bidder who hasn't passed.

    Args:
        room_manager: RoomManager instance
        room_code: Room code
        current_seat: Current bidder's seat
        passed_players: Set of user IDs who have passed

    Returns:
        Tuple of (next_bidder_id, next_bidder_name, next_bidder_seat) or (None, None, None) if no valid bidder
    """
    players = await room_manager._get_room_players(room_code)

    # Try each seat starting from the next one
    for i in range(1, 5):
        next_seat = (current_seat + i) % 4
        player = next((p for p in players if p.seat_position == next_seat), None)
        if player and player.user_id not in passed_players:
            return player.user_id, player.display_name, next_seat

    return None, None, None


async def emit_your_turn(
    sio: "socketio.AsyncServer",  # type: ignore
    room_manager: RoomManager,
    user_id: str,
    phase: str,
    **kwargs: Any,
) -> None:
    """Emit bid:your_turn to a specific player.

    Args:
        sio: Socket.IO server
        room_manager: RoomManager instance
        user_id: User ID to notify
        phase: Current phase
        **kwargs: Additional payload fields
    """
    socket_id = await room_manager.get_socket_for_user(user_id)
    if socket_id:
        payload = YourTurnPayload(phase=phase, **kwargs)
        await sio.emit(ServerEvents.YOUR_TURN, payload.to_dict(), to=socket_id)


def register_bidding_handlers(  # noqa: C901
    sio: "socketio.AsyncServer",  # type: ignore
    room_manager: RoomManager,
    bidding_service: BiddingService,
    connection_contexts: dict[str, ConnectionContext],
) -> None:
    """Register all bidding-related event handlers.

    Args:
        sio: Socket.IO server instance
        room_manager: RoomManager for room operations
        bidding_service: BiddingService for bidding logic
        connection_contexts: Dict mapping socket IDs to ConnectionContext
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

            room_code = payload.room_code.upper()

            # Get connection context
            ctx = connection_contexts.get(sid)
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
                players = await room_manager._get_room_players(room_code)
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
                room_code,
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

            # Get passed players
            passed_raw = await room_manager.redis.smembers(f"room:{room_code}:passed_players")
            passed_players = {p.decode() if isinstance(p, bytes) else p for p in passed_raw}

            # Remove current bidder from passed players (they just placed a bid)
            await room_manager.redis.srem(f"room:{room_code}:passed_players", ctx.user_id)

            # Get next bidder
            next_id, next_name, next_seat = await get_next_bidder(
                room_manager, room_code, player_info.seat_position, passed_players
            )

            # Update current bidder in Redis
            if next_id:
                await room_manager.redis.hset(
                    f"room:{room_code}:round",
                    mapping={
                        "current_bidder_id": next_id,
                        "current_bidder_seat": str(next_seat),
                    },
                )

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
                is_highest=True,
                next_bidder_id=next_id,
                next_bidder_name=next_name,
                next_bidder_seat=next_seat,
                consecutive_passes=0,
            )
            await sio.emit(
                ServerEvents.BID_PLACED,
                broadcast_payload.to_dict(),
                room=room_code,
            )

            # Emit your_turn to next bidder
            if next_id:
                round_data = await room_manager.get_room_round_state(room_code)
                await emit_your_turn(
                    sio,
                    room_manager,
                    next_id,
                    phase="trump_bidding",
                    minimum_bid=int(round_data.get("minimum_bid", 5)),
                    current_highest_bid=payload.amount,
                    current_highest_suit=payload.suit,
                    is_last_bidder=False,
                )

            # Return success acknowledgment to client
            return {"success": True}

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

            room_code = payload.room_code.upper()

            # Get connection context
            ctx = connection_contexts.get(sid)
            if not ctx or not ctx.is_authenticated:
                await emit_error(
                    sio,
                    sid,
                    WSErrorCode.AUTHENTICATION_REQUIRED,
                    "Not authenticated",
                )
                return

            # Get player seat
            players = await room_manager._get_room_players(room_code)
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

            # Record the pass
            success, error_msg = await bidding_service.pass_trump_bid(
                room_code,
                ctx.user_id,
                ctx.display_name,
            )

            if not success:
                await emit_error(
                    sio,
                    sid,
                    WSErrorCode.NOT_YOUR_TURN,
                    error_msg or "Cannot pass",
                )
                return

            # Add to passed players set
            await room_manager.redis.sadd(f"room:{room_code}:passed_players", ctx.user_id)

            # Get updated round state
            round_data = await room_manager.get_room_round_state(room_code)
            consecutive_passes = int(round_data.get("consecutive_passes", 0))
            highest_bid_json = round_data.get("highest_bid", "")
            frisch_count = int(round_data.get("frisch_count", 0))

            # Get passed players
            passed_raw = await room_manager.redis.smembers(f"room:{room_code}:passed_players")
            passed_players = {p.decode() if isinstance(p, bytes) else p for p in passed_raw}

            # Check for frisch (all 4 players passed with no bid)
            if len(passed_players) >= 4 and not highest_bid_json:
                if frisch_count < 3:
                    # Trigger frisch
                    await bidding_service.handle_frisch(room_code)

                    # Clear passed players for new round
                    await room_manager.redis.delete(f"room:{room_code}:passed_players")

                    new_minimum_bid = bidding_service.get_minimum_bid(frisch_count + 1)

                    # Reset to first bidder (seat 0)
                    first_player = next((p for p in players if p.seat_position == 0), players[0])
                    await room_manager.redis.hset(
                        f"room:{room_code}:round",
                        mapping={
                            "current_bidder_id": first_player.user_id,
                            "current_bidder_seat": str(first_player.seat_position),
                        },
                    )

                    # Emit frisch started
                    frisch_payload = FrischStartedPayload(
                        frisch_number=frisch_count + 1,
                        new_minimum_bid=new_minimum_bid,
                        first_bidder_id=first_player.user_id,
                        first_bidder_name=first_player.display_name,
                    )
                    await sio.emit(
                        ServerEvents.BID_FRISCH_STARTED,
                        frisch_payload.to_dict(),
                        room=room_code,
                    )

                    # Emit your_turn to first bidder
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
                    return {"success": True}
                else:
                    # Max frisch reached - this shouldn't normally happen
                    # Would need reshuffle logic here
                    logger.warning("Max frisch reached in room %s", room_code)
                    return {"success": True}

            # Check if trump is determined (3 passes after a valid bid)
            # Count non-passed players
            active_bidders = [p for p in players if p.user_id not in passed_players]

            logger.info(
                "Trump auction check - room: %s, passed_players: %s, active_bidders: %d, highest_bid: %s",
                room_code,
                passed_players,
                len(active_bidders),
                highest_bid_json,
            )

            if highest_bid_json and len(active_bidders) == 1:
                # Only one player left, they win the trump
                bid_data = json.loads(highest_bid_json)
                winner_id = bid_data["player_id"]
                winner_name = bid_data["player_name"]
                trump_suit = TrumpSuit(bid_data["suit"])
                winning_bid = bid_data["amount"]

                # Set trump and transition to contract bidding
                await bidding_service.set_trump(
                    room_code,
                    winner_id,
                    winner_name,
                    trump_suit,
                    winning_bid,
                )

                # Clear passed players for contract phase
                await room_manager.redis.delete(f"room:{room_code}:passed_players")

                # Set trump winner as first contract bidder
                await room_manager.redis.hset(
                    f"room:{room_code}:round",
                    mapping={
                        "current_bidder_id": winner_id,
                        "current_bidder_seat": str(active_bidders[0].seat_position),
                        "contract_bid_count": "0",
                    },
                )

                # Emit trump set
                trump_payload = TrumpSetPayload(
                    trump_suit=trump_suit.value,
                    winner_id=winner_id,
                    winner_name=winner_name,
                    winning_bid=winning_bid,
                    frisch_count=frisch_count,
                )
                await sio.emit(
                    ServerEvents.BID_TRUMP_SET,
                    trump_payload.to_dict(),
                    room=room_code,
                )

                # Emit your_turn to trump winner for contract bidding
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
                return {"success": True}

            # Normal pass - advance to next bidder
            next_id, next_name, next_seat = await get_next_bidder(
                room_manager, room_code, player_info.seat_position, passed_players
            )

            if next_id:
                # Update current bidder
                await room_manager.redis.hset(
                    f"room:{room_code}:round",
                    mapping={
                        "current_bidder_id": next_id,
                        "current_bidder_seat": str(next_seat),
                    },
                )

            # Broadcast pass to room
            broadcast_payload = BidPassedPayload(
                player_id=ctx.user_id,
                player_name=ctx.display_name,
                consecutive_passes=consecutive_passes,
                next_bidder_id=next_id,
                next_bidder_name=next_name,
                next_bidder_seat=next_seat,
            )
            await sio.emit(
                ServerEvents.BID_PASSED,
                broadcast_payload.to_dict(),
                room=room_code,
            )

            # Emit your_turn to next bidder
            if next_id:
                current_highest_bid = None
                current_highest_suit = None
                if highest_bid_json:
                    bid_data = json.loads(highest_bid_json)
                    current_highest_bid = bid_data.get("amount")
                    current_highest_suit = bid_data.get("suit")

                await emit_your_turn(
                    sio,
                    room_manager,
                    next_id,
                    phase="trump_bidding",
                    minimum_bid=int(round_data.get("minimum_bid", 5)),
                    current_highest_bid=current_highest_bid,
                    current_highest_suit=current_highest_suit,
                    is_last_bidder=False,
                )

            # Return success acknowledgment to client
            return {"success": True}

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

            room_code = payload.room_code.upper()

            # Get connection context
            ctx = connection_contexts.get(sid)
            if not ctx or not ctx.is_authenticated:
                await emit_error(
                    sio,
                    sid,
                    WSErrorCode.AUTHENTICATION_REQUIRED,
                    "Not authenticated",
                )
                return

            # Get player info
            players = await room_manager._get_room_players(room_code)
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

            # Get current round state
            round_data = await room_manager.get_room_round_state(room_code)
            trump_winner_id = round_data.get("trump_winner_id")
            trump_winning_bid = int(round_data.get("trump_winning_bid", 0))

            # Get current contracts
            contracts = await bidding_service.get_contracts(room_code)
            contract_count = len(contracts)
            current_sum = sum(contracts.values())

            # Determine if last bidder
            is_last_bidder = contract_count == 3
            is_trump_winner = ctx.user_id == trump_winner_id

            # Validate contract bid
            is_valid, error_msg = await bidding_service.validate_contract_bid(
                payload.amount,
                current_sum,
                is_last_bidder,
                is_trump_winner,
                trump_winning_bid,
            )

            if not is_valid:
                await emit_error(
                    sio,
                    sid,
                    WSErrorCode.INVALID_BID_AMOUNT,
                    error_msg or "Invalid contract bid",
                )
                return

            # Place the contract bid
            success, error_msg = await bidding_service.place_contract_bid(
                room_code,
                ctx.user_id,
                payload.amount,
            )

            if not success:
                await emit_error(
                    sio,
                    sid,
                    WSErrorCode.INVALID_BID_AMOUNT,
                    error_msg or "Failed to place contract bid",
                )
                return

            # Update bid count
            new_count = contract_count + 1
            await room_manager.redis.hset(
                f"room:{room_code}:round",
                "contract_bid_count",
                str(new_count),
            )

            # Check if all contracts placed
            if new_count == 4:
                # All contracts placed - transition to playing
                all_contracts = await bidding_service.get_contracts(room_code)
                total = sum(all_contracts.values())
                game_type = "over" if total > 13 else "under"

                # Update phase to playing
                await room_manager.redis.hset(
                    f"room:{room_code}:round",
                    mapping={
                        "phase": RoundPhase.PLAYING.value,
                        "total_contracts": str(total),
                        "game_type": game_type,
                    },
                )

                # Build contracts list
                contracts_list = []
                for player in players:
                    contract_amount = all_contracts.get(player.user_id, 0)
                    contracts_list.append(
                        ContractInfo(
                            player_id=player.user_id,
                            player_name=player.display_name,
                            seat_position=player.seat_position,
                            amount=contract_amount,
                        )
                    )

                # Emit contracts_set
                contracts_payload = ContractsSetPayload(
                    contracts=contracts_list,
                    total_contracts=total,
                    game_type=game_type,
                    first_player_id=trump_winner_id,
                )
                await sio.emit(
                    ServerEvents.BID_CONTRACTS_SET,
                    contracts_payload.to_dict(),
                    room=room_code,
                )
                return

            # Not all contracts yet - advance to next bidder
            # Contract bidding order: trump winner, then clockwise
            # Find trump winner's seat
            trump_winner_seat = next(
                (p.seat_position for p in players if p.user_id == trump_winner_id), 0
            )

            # Next bidder is the next seat clockwise that hasn't bid yet
            bidded_users = set(contracts.keys()) | {ctx.user_id}
            for i in range(1, 5):
                next_seat = (trump_winner_seat + i) % 4
                player = next((p for p in players if p.seat_position == next_seat), None)
                if player and player.user_id not in bidded_users:
                    # Update current bidder
                    await room_manager.redis.hset(
                        f"room:{room_code}:round",
                        mapping={
                            "current_bidder_id": player.user_id,
                            "current_bidder_seat": str(next_seat),
                        },
                    )

                    # Broadcast contract bid
                    bid_info = BidInfo(
                        player_id=ctx.user_id,
                        player_name=ctx.display_name,
                        amount=payload.amount,
                        is_pass=False,
                    )
                    broadcast_payload = BidPlacedPayload(
                        bid=bid_info,
                        is_highest=False,
                        next_bidder_id=player.user_id,
                        next_bidder_name=player.display_name,
                        next_bidder_seat=next_seat,
                        consecutive_passes=0,
                    )
                    await sio.emit(
                        ServerEvents.BID_PLACED,
                        broadcast_payload.to_dict(),
                        room=room_code,
                    )

                    # Check if next bidder is last
                    is_next_last = new_count == 3

                    # Emit your_turn to next bidder
                    await emit_your_turn(
                        sio,
                        room_manager,
                        player.user_id,
                        phase="contract_bidding",
                        is_trump_winner=player.user_id == trump_winner_id,
                        trump_winning_bid=trump_winning_bid,
                        current_contract_sum=current_sum + payload.amount,
                        is_last_bidder=is_next_last,
                    )
                    return {"success": True}

        except Exception as e:
            logger.exception("Error in handle_bid_contract: %s", e)
            await emit_error(
                sio,
                sid,
                WSErrorCode.INTERNAL_ERROR,
                "Internal error while processing contract bid",
            )


def register_playing_handlers(
    sio: "socketio.AsyncServer",  # type: ignore
    room_manager: RoomManager,
    bidding_service: BiddingService,
    scoring_service: ScoringService,
    connection_contexts: dict[str, ConnectionContext],
) -> None:
    """Register all playing phase event handlers.

    Args:
        sio: Socket.IO server instance
        room_manager: RoomManager for room operations
        bidding_service: BiddingService for getting contracts
        scoring_service: ScoringService for score calculation
        connection_contexts: Dict mapping socket IDs to ConnectionContext
    """

    @sio.on(ClientEvents.ROUND_CLAIM_TRICK)  # type: ignore
    async def handle_claim_trick(sid: str, data: dict[str, Any]) -> None:
        """Handle round:claim_trick event from client."""
        try:
            # Parse and validate payload
            try:
                payload = RoundClaimTrickPayload(**data)
            except Exception as e:
                await emit_error(
                    sio,
                    sid,
                    WSErrorCode.INVALID_PAYLOAD,
                    "Invalid claim payload",
                    {"error": str(e)},
                )
                return

            room_code = payload.room_code.upper()

            # Get connection context
            ctx = connection_contexts.get(sid)
            if not ctx or not ctx.is_authenticated:
                await emit_error(
                    sio,
                    sid,
                    WSErrorCode.AUTHENTICATION_REQUIRED,
                    "Not authenticated",
                )
                return

            # Get round state
            round_data = await room_manager.get_room_round_state(room_code)
            total_tricks = int(round_data.get("total_tricks_played", 0))

            if total_tricks >= 13:
                await emit_error(
                    sio,
                    sid,
                    WSErrorCode.GAME_ALREADY_STARTED,
                    "All 13 tricks have been played",
                )
                return

            # Check phase
            phase = round_data.get("phase", "")
            if phase != RoundPhase.PLAYING.value:
                await emit_error(
                    sio,
                    sid,
                    WSErrorCode.INVALID_GAME_PHASE,
                    "Not in playing phase",
                )
                return

            # Get player's current tricks
            tricks_key = f"room:{room_code}:tricks"
            current_tricks = await room_manager.redis.hget(tricks_key, ctx.user_id)
            current_tricks = int(current_tricks) if current_tricks else 0

            # Increment trick count
            new_tricks = current_tricks + 1
            await room_manager.redis.hset(tricks_key, ctx.user_id, str(new_tricks))

            # Update total tricks
            new_total = total_tricks + 1
            await room_manager.redis.hset(
                f"room:{room_code}:round",
                "total_tricks_played",
                str(new_total),
            )

            # Get player's contract
            contracts = await bidding_service.get_contracts(room_code)
            contract = contracts.get(ctx.user_id, 0)

            # Emit trick_won
            trick_payload = RoundTrickWonPayload(
                player_id=ctx.user_id,
                player_name=ctx.display_name,
                new_trick_count=new_tricks,
                contract=contract,
                total_tricks_played=new_total,
                remaining_tricks=13 - new_total,
            )
            await sio.emit(
                ServerEvents.ROUND_TRICK_WON,
                trick_payload.to_dict(),
                room=room_code,
            )

            # Check for round complete
            if new_total >= 13:
                await complete_round(
                    sio,
                    room_manager,
                    bidding_service,
                    scoring_service,
                    room_code,
                )

            # Return success acknowledgment to client
            return {"success": True}

        except Exception as e:
            logger.exception("Error in handle_claim_trick: %s", e)
            await emit_error(
                sio,
                sid,
                WSErrorCode.INTERNAL_ERROR,
                "Internal error while claiming trick",
            )

    @sio.on(ClientEvents.ROUND_UNDO_TRICK)  # type: ignore
    async def handle_undo_trick(sid: str, data: dict[str, Any]) -> None:
        """Handle round:undo_trick event from client (admin only)."""
        try:
            # Parse and validate payload
            try:
                payload = RoundUndoTrickPayload(**data)
            except Exception as e:
                await emit_error(
                    sio,
                    sid,
                    WSErrorCode.INVALID_PAYLOAD,
                    "Invalid undo payload",
                    {"error": str(e)},
                )
                return

            room_code = payload.room_code.upper()

            # Get connection context
            ctx = connection_contexts.get(sid)
            if not ctx or not ctx.is_authenticated:
                await emit_error(
                    sio,
                    sid,
                    WSErrorCode.AUTHENTICATION_REQUIRED,
                    "Not authenticated",
                )
                return

            # Verify admin
            is_admin = await room_manager.is_room_admin(room_code, ctx.user_id)
            if not is_admin:
                await emit_error(
                    sio,
                    sid,
                    WSErrorCode.NOT_ROOM_ADMIN,
                    "Only room admin can undo tricks",
                )
                return

            # Get player's current tricks
            tricks_key = f"room:{room_code}:tricks"
            current_tricks = await room_manager.redis.hget(tricks_key, payload.player_id)
            current_tricks = int(current_tricks) if current_tricks else 0

            if current_tricks <= 0:
                await emit_error(
                    sio,
                    sid,
                    WSErrorCode.INVALID_BID_AMOUNT,
                    "No tricks to undo for this player",
                )
                return

            # Decrement trick count
            new_tricks = current_tricks - 1
            await room_manager.redis.hset(tricks_key, payload.player_id, str(new_tricks))

            # Update total tricks
            round_data = await room_manager.get_room_round_state(room_code)
            total_tricks = int(round_data.get("total_tricks_played", 0))
            new_total = max(0, total_tricks - 1)
            await room_manager.redis.hset(
                f"room:{room_code}:round",
                "total_tricks_played",
                str(new_total),
            )

            # Get player name
            players = await room_manager._get_room_players(room_code)
            player = next((p for p in players if p.user_id == payload.player_id), None)
            player_name = player.display_name if player else "Unknown"

            # Emit trick_undone (reuse trick_won event structure)
            trick_payload = RoundTrickWonPayload(
                player_id=payload.player_id,
                player_name=player_name,
                new_trick_count=new_tricks,
                contract=0,  # Not important for undo
                total_tricks_played=new_total,
                remaining_tricks=13 - new_total,
            )
            await sio.emit(
                "round:trick_undone",
                trick_payload.to_dict(),
                room=room_code,
            )

            # Return success acknowledgment to client
            return {"success": True}

        except Exception as e:
            logger.exception("Error in handle_undo_trick: %s", e)
            await emit_error(
                sio,
                sid,
                WSErrorCode.INTERNAL_ERROR,
                "Internal error while undoing trick",
            )


async def complete_round(
    sio: "socketio.AsyncServer",  # type: ignore
    room_manager: RoomManager,
    bidding_service: BiddingService,
    scoring_service: ScoringService,
    room_code: str,
) -> None:
    """Calculate scores and emit round complete event.

    Args:
        sio: Socket.IO server
        room_manager: RoomManager instance
        bidding_service: BiddingService instance
        scoring_service: ScoringService instance
        room_code: Room code
    """
    try:
        # Get round data
        round_data = await room_manager.get_room_round_state(room_code)
        game_type_str = round_data.get("game_type", "under")
        game_type = GameType.OVER if game_type_str == "over" else GameType.UNDER
        trump_suit = round_data.get("trump_suit", "")
        round_number = int(round_data.get("round_number", 1))

        # Get tricks for each player
        tricks_data = await room_manager.redis.hgetall(f"room:{room_code}:tricks")
        tricks_dict = {k: int(v) for k, v in tricks_data.items()}

        # Get contracts
        contracts = await bidding_service.get_contracts(room_code)

        # Get players
        players = await room_manager._get_room_players(room_code)

        # Calculate scores for each player
        player_results = []
        for player in players:
            contract = contracts.get(player.user_id, 0)
            tricks = tricks_dict.get(player.user_id, 0)
            score = scoring_service.calculate_round_score(contract, tricks, game_type)
            made_contract = (contract == 0 and tricks == 0) or (contract > 0 and tricks >= contract)

            player_results.append({
                "player_id": player.user_id,
                "player_name": player.display_name,
                "seat_position": player.seat_position,
                "contract": contract,
                "tricks_won": tricks,
                "round_score": score,
                "made_contract": made_contract,
            })

        # Update phase to round_complete
        await room_manager.redis.hset(
            f"room:{room_code}:round",
            "phase",
            RoundPhase.COMPLETE.value,
        )

        # Emit round:complete
        complete_payload = RoundCompletePayload(
            round_number=round_number,
            trump_suit=trump_suit,
            game_type=game_type_str,
            players=player_results,
        )
        await sio.emit(
            ServerEvents.ROUND_COMPLETE,
            complete_payload.to_dict(),
            room=room_code,
        )

    except Exception as e:
        logger.exception("Error completing round: %s", e)
