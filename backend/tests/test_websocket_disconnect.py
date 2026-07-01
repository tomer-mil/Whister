"""Focused tests for WebSocket disconnect behavior."""
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
import socketio

from app.schemas.game import RoundPhase
from app.websocket.connection_context import ConnectionContext
from app.websocket.schemas import ServerEvents
from app.websocket.server import _connection_contexts, register_socketio_handlers


@pytest.mark.asyncio
async def test_active_bidder_disconnect_broadcasts_automatic_pass() -> None:
    """Auto-pass must update every room member, not only the next bidder."""
    sio = socketio.AsyncServer(async_mode="asgi")
    sio.emit = AsyncMock()  # type: ignore[method-assign]

    redis = MagicMock()
    redis.sadd = AsyncMock()
    redis.smembers = AsyncMock(return_value={"player-1"})
    redis.hset = AsyncMock()

    room_manager = MagicMock()
    room_manager.redis = redis
    room_manager.handle_disconnect = AsyncMock(return_value=("ABC123", "player-1"))
    room_manager.get_room_round_state = AsyncMock(
        side_effect=[
            {
                "phase": RoundPhase.TRUMP_BIDDING.value,
                "current_bidder_id": "player-1",
                "current_bidder_seat": "0",
            },
            {
                "consecutive_passes": "1",
                "minimum_bid": "5",
                "highest_bid": "",
                "frisch_count": "0",
            },
        ]
    )
    room_manager._get_room_players = AsyncMock(
        return_value=[
            SimpleNamespace(user_id="player-1", display_name="Player 1", seat_position=0),
            SimpleNamespace(user_id="player-2", display_name="Player 2", seat_position=1),
            SimpleNamespace(user_id="player-3", display_name="Player 3", seat_position=2),
            SimpleNamespace(user_id="player-4", display_name="Player 4", seat_position=3),
        ]
    )

    register_socketio_handlers(sio, room_manager)
    disconnect = sio.handlers["/"]["disconnect"]
    sid = "socket-1"
    _connection_contexts[sid] = ConnectionContext(
        sio=sio,
        socket_id=sid,
        user_id="player-1",
        display_name="Player 1",
        is_authenticated=True,
        current_room="ABC123",
    )

    bidding_service = MagicMock()
    bidding_service.pass_trump_bid = AsyncMock(return_value=(True, None))

    try:
        with (
            patch(
                "app.services.bidding_service.BiddingService",
                return_value=bidding_service,
            ),
            patch(
                "app.websocket.game_events.get_next_bidder",
                new=AsyncMock(return_value=("player-2", "Player 2", 1)),
            ),
            patch(
                "app.websocket.game_events.emit_your_turn",
                new=AsyncMock(),
            ),
        ):
            await disconnect(sid)
    finally:
        _connection_contexts.pop(sid, None)

    pass_emits = [
        call
        for call in sio.emit.await_args_list
        if call.args and call.args[0] == ServerEvents.BID_PASSED
    ]
    assert len(pass_emits) == 1
    assert pass_emits[0].kwargs["room"] == "room:ABC123"
    assert pass_emits[0].args[1]["player_id"] == "player-1"
    assert pass_emits[0].args[1]["next_bidder_id"] == "player-2"
    assert pass_emits[0].args[1]["consecutive_passes"] == 1
