# WebSocket Events Low-Level Design
## Whist Score Keeper Platform

**Version:** 1.0  
**Date:** January 2026  
**Status:** Draft  

---

## Table of Contents

1. [Overview](#1-overview)
2. [Architecture](#2-architecture)
3. [Event Naming Conventions](#3-event-naming-conventions)
4. [Payload Schemas](#4-payload-schemas)
5. [Client → Server Events](#5-client--server-events)
6. [Server → Client Events](#6-server--client-events)
7. [Room Management](#7-room-management)
8. [State Synchronization](#8-state-synchronization)
9. [Error Handling](#9-error-handling)
10. [Event Ordering & Race Conditions](#10-event-ordering--race-conditions)
11. [Testing Strategy](#11-testing-strategy)

---

## 1. Overview

### 1.1 Purpose

This document specifies the complete WebSocket event system for real-time communication between clients and the server, including event schemas, handler implementations, room management, and state synchronization strategies.

### 1.2 Technology Stack

```
python-socketio 5.11+    Socket.IO server implementation
pydantic 2.6+            Event payload validation
redis 5.0+               Pub/Sub for cross-node messaging
asyncio                  Async event handling
```

### 1.3 Design Goals

1. **Low Latency**: Events processed and broadcast within 50ms
2. **Reliability**: No lost events, proper ordering guarantees
3. **Resilience**: Graceful handling of disconnections and reconnections
4. **Type Safety**: All payloads validated with Pydantic schemas
5. **Scalability**: Support for multiple server nodes via Redis Pub/Sub

---

## 2. Architecture

### 2.1 WebSocket Server Setup

```python
"""WebSocket server configuration and setup."""
from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Any

import socketio
from redis.asyncio import Redis

from app.config import get_settings

if TYPE_CHECKING:
    from app.websocket.room_manager import RoomManager

logger = logging.getLogger(__name__)


def create_socketio_server(redis: Redis) -> socketio.AsyncServer:
    """
    Create and configure the Socket.IO async server.
    
    Uses Redis as the message queue for cross-node communication
    in multi-server deployments.
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
    
    return sio


def create_socketio_app(
    sio: socketio.AsyncServer,
    other_asgi_app: Any,
) -> socketio.ASGIApp:
    """
    Create the ASGI application wrapping Socket.IO and FastAPI.
    
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
```

### 2.2 High-Level Event Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           EVENT FLOW ARCHITECTURE                            │
└─────────────────────────────────────────────────────────────────────────────┘

  Client A          Client B          Client C          Client D
     │                 │                 │                 │
     │  bid:trump      │                 │                 │
     ├────────────────►│                 │                 │
     │                 │                 │                 │
     │           ┌─────┴─────────────────┴─────────────────┴─────┐
     │           │              WebSocket Gateway                 │
     │           │  ┌─────────────────────────────────────────┐  │
     │           │  │         Event Dispatcher                │  │
     │           │  │  ┌───────────┐  ┌───────────────────┐   │  │
     │           │  │  │ Validator │  │ Permission Check  │   │  │
     │           │  │  └─────┬─────┘  └─────────┬─────────┘   │  │
     │           │  │        │                  │             │  │
     │           │  │        └────────┬─────────┘             │  │
     │           │  │                 ▼                       │  │
     │           │  │         ┌─────────────┐                 │  │
     │           │  │         │   Handler   │                 │  │
     │           │  │         └──────┬──────┘                 │  │
     │           │  └────────────────┼────────────────────────┘  │
     │           │                   │                           │
     │           │         ┌─────────┴─────────┐                 │
     │           │         ▼                   ▼                 │
     │           │  ┌─────────────┐     ┌─────────────┐          │
     │           │  │   Redis     │     │  Database   │          │
     │           │  │  (State)    │     │ (Persist)   │          │
     │           │  └──────┬──────┘     └─────────────┘          │
     │           │         │                                     │
     │           │         ▼                                     │
     │           │  ┌─────────────────────────────────────────┐  │
     │           │  │         Room Broadcaster                │  │
     │           │  │    (Redis Pub/Sub for multi-node)       │  │
     │           │  └─────────────────────────────────────────┘  │
     │           └───────────────────────────────────────────────┘
     │                 │                 │                 │
     │◄────────────────┤◄────────────────┤◄────────────────┤
     │  bid:placed     │  bid:placed     │  bid:placed     │
     │                 │                 │                 │
```

---

## 3. Event Naming Conventions

### 3.1 Naming Pattern

```
{domain}:{action}
```

| Domain | Description |
|--------|-------------|
| `room` | Room lifecycle events (join, leave, state) |
| `game` | Game lifecycle events (start, end, phase change) |
| `bid` | Bidding events (trump and contract) |
| `round` | Round play events (tricks, scores) |
| `player` | Player status events (connection, ready) |
| `error` | Error events |
| `sync` | State synchronization events |

### 3.2 Event Categories

| Category | Direction | Examples |
|----------|-----------|----------|
| **Request** | Client → Server | `bid:trump`, `round:claim_trick` |
| **Response** | Server → Client (single) | `error:validation`, `sync:state` |
| **Broadcast** | Server → Room | `bid:placed`, `round:trick_won` |
| **System** | Server → Client | `connect`, `disconnect` |

### 3.3 Complete Event List

```python
"""Event name constants for type safety."""
from typing import Final


class ClientEvents:
    """Events sent from client to server."""
    
    # Room events
    ROOM_JOIN: Final[str] = "room:join"
    ROOM_LEAVE: Final[str] = "room:leave"
    ROOM_UPDATE_SEATING: Final[str] = "room:update_seating"
    
    # Game events
    GAME_START: Final[str] = "game:start"
    GAME_NEW_ROUND: Final[str] = "game:new_round"
    GAME_END: Final[str] = "game:end"
    
    # Bidding events
    BID_TRUMP: Final[str] = "bid:trump"
    BID_PASS: Final[str] = "bid:pass"
    BID_CONTRACT: Final[str] = "bid:contract"
    
    # Round events
    ROUND_CLAIM_TRICK: Final[str] = "round:claim_trick"
    ROUND_UNDO_TRICK: Final[str] = "round:undo_trick"
    
    # Sync events
    SYNC_REQUEST: Final[str] = "sync:request"
    
    # Player events
    PLAYER_READY: Final[str] = "player:ready"
    PLAYER_PING: Final[str] = "player:ping"


class ServerEvents:
    """Events sent from server to client(s)."""
    
    # Room events
    ROOM_JOINED: Final[str] = "room:joined"
    ROOM_LEFT: Final[str] = "room:left"
    ROOM_PLAYER_JOINED: Final[str] = "room:player_joined"
    ROOM_PLAYER_LEFT: Final[str] = "room:player_left"
    ROOM_PLAYER_DISCONNECTED: Final[str] = "room:player_disconnected"
    ROOM_PLAYER_RECONNECTED: Final[str] = "room:player_reconnected"
    ROOM_SEATING_UPDATED: Final[str] = "room:seating_updated"
    ROOM_STATE: Final[str] = "room:state"
    
    # Game events
    GAME_STARTED: Final[str] = "game:started"
    GAME_PHASE_CHANGED: Final[str] = "game:phase_changed"
    GAME_ENDED: Final[str] = "game:ended"
    
    # Bidding events
    BID_PLACED: Final[str] = "bid:placed"
    BID_PASSED: Final[str] = "bid:passed"
    BID_YOUR_TURN: Final[str] = "bid:your_turn"
    BID_TRUMP_SET: Final[str] = "bid:trump_set"
    BID_FRISCH_STARTED: Final[str] = "bid:frisch_started"
    BID_CONTRACTS_SET: Final[str] = "bid:contracts_set"
    
    # Round events
    ROUND_STARTED: Final[str] = "round:started"
    ROUND_TRICK_WON: Final[str] = "round:trick_won"
    ROUND_TRICK_UNDONE: Final[str] = "round:trick_undone"
    ROUND_COMPLETE: Final[str] = "round:complete"
    
    # Sync events
    SYNC_STATE: Final[str] = "sync:state"
    SYNC_ACK: Final[str] = "sync:ack"
    
    # Player events
    PLAYER_PONG: Final[str] = "player:pong"
    
    # Error events
    ERROR: Final[str] = "error"
```

---

## 4. Payload Schemas

### 4.1 Base Schemas

```python
"""Base schemas for WebSocket events."""
from __future__ import annotations

from datetime import datetime
from typing import Any, Generic, Literal, TypeVar
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

T = TypeVar("T")


class BasePayload(BaseModel):
    """Base class for all event payloads."""
    
    model_config = ConfigDict(
        extra="forbid",  # Reject unknown fields
        frozen=True,     # Immutable after creation
    )


class TimestampedPayload(BasePayload):
    """Payload with server timestamp."""
    
    timestamp: datetime = Field(
        default_factory=datetime.utcnow,
        description="Server timestamp when event was processed",
    )


class EventEnvelope(BaseModel, Generic[T]):
    """
    Wrapper for all events sent to clients.
    
    Provides consistent structure with sequence numbers
    for ordering and acknowledgment.
    """
    
    event: str = Field(description="Event name")
    data: T = Field(description="Event payload")
    seq: int = Field(description="Sequence number for ordering")
    room_code: str | None = Field(
        default=None,
        description="Room code if room-specific event",
    )
    
    model_config = ConfigDict(frozen=True)
```

### 4.2 Common Types

```python
"""Common types used across event schemas."""
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

# Trump suit type
TrumpSuit = Literal["clubs", "diamonds", "hearts", "spades", "no_trump"]

# Game phase type  
GamePhase = Literal[
    "waiting",
    "bidding_trump", 
    "frisch",
    "bidding_contract",
    "playing",
    "round_complete",
    "finished",
]

# Game type (over/under)
GameType = Literal["over", "under"]


class PlayerInfo(BaseModel):
    """Player information included in events."""
    
    user_id: str
    display_name: str
    seat_position: int = Field(ge=0, le=3)
    is_admin: bool = False
    is_connected: bool = True
    avatar_url: str | None = None
    
    model_config = ConfigDict(frozen=True)


class BidInfo(BaseModel):
    """Bid information for display."""
    
    player_id: str
    player_name: str
    amount: int
    suit: TrumpSuit | None = None
    is_pass: bool = False
    
    model_config = ConfigDict(frozen=True)


class ContractInfo(BaseModel):
    """Contract bid information."""
    
    player_id: str
    player_name: str
    seat_position: int
    amount: int
    
    model_config = ConfigDict(frozen=True)


class RoundPlayerState(BaseModel):
    """Player state within a round."""
    
    user_id: str
    display_name: str
    seat_position: int
    contract_bid: int | None = None
    tricks_won: int = 0
    score: int | None = None
    made_contract: bool | None = None
    
    model_config = ConfigDict(frozen=True)
```

### 4.3 Client → Server Payload Schemas

```python
"""Client to server event payload schemas."""
from __future__ import annotations

from pydantic import Field, field_validator

from app.websocket.schemas.base import BasePayload
from app.websocket.schemas.common import TrumpSuit


# ============================================================================
# Room Events
# ============================================================================

class RoomJoinPayload(BasePayload):
    """Payload for room:join event."""
    
    room_code: str = Field(
        min_length=6,
        max_length=6,
        description="6-character room code",
    )
    display_name: str | None = Field(
        default=None,
        max_length=64,
        description="Optional display name override",
    )
    
    @field_validator("room_code")
    @classmethod
    def uppercase_room_code(cls, v: str) -> str:
        return v.upper()


class RoomLeavePayload(BasePayload):
    """Payload for room:leave event."""
    
    room_code: str = Field(min_length=6, max_length=6)


class RoomUpdateSeatingPayload(BasePayload):
    """Payload for room:update_seating event (admin only)."""
    
    room_code: str = Field(min_length=6, max_length=6)
    positions: list[str] = Field(
        min_length=4,
        max_length=4,
        description="User IDs in order of seat positions 0-3",
    )


# ============================================================================
# Game Events
# ============================================================================

class GameStartPayload(BasePayload):
    """Payload for game:start event (admin only)."""
    
    room_code: str = Field(min_length=6, max_length=6)


class GameNewRoundPayload(BasePayload):
    """Payload for game:new_round event (admin only)."""
    
    room_code: str = Field(min_length=6, max_length=6)


class GameEndPayload(BasePayload):
    """Payload for game:end event (admin only)."""
    
    room_code: str = Field(min_length=6, max_length=6)


# ============================================================================
# Bidding Events
# ============================================================================

class BidTrumpPayload(BasePayload):
    """Payload for bid:trump event."""
    
    room_code: str = Field(min_length=6, max_length=6)
    amount: int = Field(ge=5, le=13, description="Bid amount (5-13)")
    suit: TrumpSuit = Field(description="Trump suit")


class BidPassPayload(BasePayload):
    """Payload for bid:pass event."""
    
    room_code: str = Field(min_length=6, max_length=6)


class BidContractPayload(BasePayload):
    """Payload for bid:contract event."""
    
    room_code: str = Field(min_length=6, max_length=6)
    amount: int = Field(ge=0, le=13, description="Contract amount (0-13)")


# ============================================================================
# Round Events
# ============================================================================

class RoundClaimTrickPayload(BasePayload):
    """Payload for round:claim_trick event."""
    
    room_code: str = Field(min_length=6, max_length=6)


class RoundUndoTrickPayload(BasePayload):
    """Payload for round:undo_trick event (admin only)."""
    
    room_code: str = Field(min_length=6, max_length=6)
    player_id: str = Field(description="Player whose trick to undo")


# ============================================================================
# Sync Events
# ============================================================================

class SyncRequestPayload(BasePayload):
    """Payload for sync:request event."""
    
    room_code: str = Field(min_length=6, max_length=6)
    last_seq: int | None = Field(
        default=None,
        description="Last received sequence number for delta sync",
    )


# ============================================================================
# Player Events
# ============================================================================

class PlayerReadyPayload(BasePayload):
    """Payload for player:ready event."""
    
    room_code: str = Field(min_length=6, max_length=6)


class PlayerPingPayload(BasePayload):
    """Payload for player:ping event (heartbeat)."""
    
    room_code: str | None = Field(
        default=None,
        description="Room code if in a room",
    )
```

### 4.4 Server → Client Payload Schemas

```python
"""Server to client event payload schemas."""
from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import Field

from app.websocket.schemas.base import BasePayload, TimestampedPayload
from app.websocket.schemas.common import (
    BidInfo,
    ContractInfo,
    GamePhase,
    GameType,
    PlayerInfo,
    RoundPlayerState,
    TrumpSuit,
)


# ============================================================================
# Room Events
# ============================================================================

class RoomJoinedPayload(TimestampedPayload):
    """Payload for room:joined event (sent to joining player)."""
    
    room_code: str
    game_id: str
    your_seat: int = Field(ge=0, le=3)
    is_admin: bool
    players: list[PlayerInfo]
    phase: GamePhase
    current_round: int | None = None


class RoomLeftPayload(TimestampedPayload):
    """Payload for room:left event (confirmation to leaving player)."""
    
    room_code: str
    reason: Literal["voluntary", "kicked", "room_closed"] = "voluntary"


class RoomPlayerJoinedPayload(TimestampedPayload):
    """Payload for room:player_joined event (broadcast to room)."""
    
    player: PlayerInfo
    player_count: int


class RoomPlayerLeftPayload(TimestampedPayload):
    """Payload for room:player_left event (broadcast to room)."""
    
    player_id: str
    player_name: str
    reason: Literal["voluntary", "kicked", "disconnected"]
    player_count: int


class RoomPlayerDisconnectedPayload(TimestampedPayload):
    """Payload for room:player_disconnected event (broadcast)."""
    
    player_id: str
    player_name: str
    grace_period_seconds: int = 60


class RoomPlayerReconnectedPayload(TimestampedPayload):
    """Payload for room:player_reconnected event (broadcast)."""
    
    player_id: str
    player_name: str


class RoomSeatingUpdatedPayload(TimestampedPayload):
    """Payload for room:seating_updated event (broadcast)."""
    
    players: list[PlayerInfo]
    updated_by: str  # Admin user ID


class RoomStatePayload(TimestampedPayload):
    """
    Full room state payload for sync:state event.
    
    Sent on reconnection or explicit sync request.
    """
    
    room_code: str
    game_id: str
    admin_id: str
    phase: GamePhase
    players: list[PlayerInfo]
    current_round: int | None = None
    round_state: RoundStatePayload | None = None


# ============================================================================
# Game Events
# ============================================================================

class GameStartedPayload(TimestampedPayload):
    """Payload for game:started event (broadcast)."""
    
    game_id: str
    phase: Literal["bidding_trump"] = "bidding_trump"
    round_number: int = 1
    first_bidder_id: str
    first_bidder_name: str
    dealer_seat: int = Field(ge=0, le=3)


class GamePhaseChangedPayload(TimestampedPayload):
    """Payload for game:phase_changed event (broadcast)."""
    
    previous_phase: GamePhase
    new_phase: GamePhase
    round_number: int


class GameEndedPayload(TimestampedPayload):
    """Payload for game:ended event (broadcast)."""
    
    game_id: str
    winner_id: str | None
    winner_name: str | None
    final_scores: list[FinalScorePayload]
    total_rounds: int
    duration_minutes: int


class FinalScorePayload(BasePayload):
    """Final score for a player."""
    
    player_id: str
    player_name: str
    total_score: int
    position: int = Field(ge=1, le=4)
    rounds_won: int
    contracts_made: int
    contracts_failed: int


# ============================================================================
# Bidding Events
# ============================================================================

class BidPlacedPayload(TimestampedPayload):
    """Payload for bid:placed event (broadcast)."""
    
    bid: BidInfo
    is_highest: bool
    next_bidder_id: str
    next_bidder_name: str
    next_bidder_seat: int
    consecutive_passes: int


class BidPassedPayload(TimestampedPayload):
    """Payload for bid:passed event (broadcast)."""
    
    player_id: str
    player_name: str
    consecutive_passes: int
    next_bidder_id: str | None  # None if phase ending
    next_bidder_name: str | None
    next_bidder_seat: int | None


class BidYourTurnPayload(TimestampedPayload):
    """Payload for bid:your_turn event (sent to specific player)."""
    
    phase: Literal["trump_bidding", "contract_bidding"]
    minimum_bid: int | None = Field(
        default=None,
        description="Minimum trump bid amount (for trump bidding)",
    )
    current_highest: BidInfo | None = Field(
        default=None,
        description="Current highest bid (for trump bidding)",
    )
    forbidden_amount: int | None = Field(
        default=None,
        description="Forbidden contract amount for last bidder",
    )
    current_contract_sum: int | None = Field(
        default=None,
        description="Current sum of contracts (for contract bidding)",
    )
    is_last_bidder: bool = False
    is_trump_winner: bool = False
    trump_winning_bid: int | None = None


class BidTrumpSetPayload(TimestampedPayload):
    """Payload for bid:trump_set event (broadcast)."""
    
    trump_suit: TrumpSuit
    winner_id: str
    winner_name: str
    winning_bid: int
    frisch_count: int


class BidFrischStartedPayload(TimestampedPayload):
    """Payload for bid:frisch_started event (broadcast)."""
    
    frisch_number: int = Field(ge=1, le=3)
    new_minimum_bid: int
    message: str


class BidContractsSetPayload(TimestampedPayload):
    """Payload for bid:contracts_set event (broadcast)."""
    
    contracts: list[ContractInfo]
    total_contracts: int
    game_type: GameType
    first_player_id: str
    first_player_name: str


# ============================================================================
# Round Events
# ============================================================================

class RoundStartedPayload(TimestampedPayload):
    """Payload for round:started event (broadcast)."""
    
    round_number: int
    trump_suit: TrumpSuit
    game_type: GameType
    first_player_id: str
    players: list[RoundPlayerState]


class RoundTrickWonPayload(TimestampedPayload):
    """Payload for round:trick_won event (broadcast)."""
    
    player_id: str
    player_name: str
    new_trick_count: int
    contract: int
    total_tricks_played: int
    remaining_tricks: int


class RoundTrickUndonePayload(TimestampedPayload):
    """Payload for round:trick_undone event (broadcast)."""
    
    player_id: str
    player_name: str
    new_trick_count: int
    total_tricks_played: int
    undone_by: str  # Admin user ID


class RoundCompletePayload(TimestampedPayload):
    """Payload for round:complete event (broadcast)."""
    
    round_number: int
    trump_suit: TrumpSuit
    game_type: GameType
    players: list[RoundPlayerState]
    commentary: list[str]
    cumulative_scores: list[CumulativeScorePayload]


class CumulativeScorePayload(BasePayload):
    """Cumulative score for a player."""
    
    player_id: str
    player_name: str
    round_score: int
    total_score: int
    position: int = Field(ge=1, le=4)


class RoundStatePayload(BasePayload):
    """Current round state for sync."""
    
    round_number: int
    phase: Literal["trump_bidding", "frisch", "contract_bidding", "playing", "complete"]
    trump_suit: TrumpSuit | None = None
    trump_winner_id: str | None = None
    game_type: GameType | None = None
    minimum_bid: int = 5
    frisch_count: int = 0
    current_bidder_id: str | None = None
    current_bidder_seat: int | None = None
    highest_bid: BidInfo | None = None
    consecutive_passes: int = 0
    players: list[RoundPlayerState]
    total_tricks_played: int = 0


# ============================================================================
# Sync Events
# ============================================================================

class SyncStatePayload(TimestampedPayload):
    """Full state sync payload."""
    
    room: RoomStatePayload
    seq: int = Field(description="Current sequence number")


class SyncAckPayload(TimestampedPayload):
    """Acknowledgment of sync request."""
    
    seq: int
    status: Literal["ok", "error"]
    message: str | None = None


# ============================================================================
# Error Events
# ============================================================================

class ErrorPayload(TimestampedPayload):
    """Payload for error events."""
    
    code: str = Field(description="Error code")
    message: str = Field(description="Human-readable error message")
    details: dict[str, str] | None = None
    recoverable: bool = True


# ============================================================================
# Player Events
# ============================================================================

class PlayerPongPayload(TimestampedPayload):
    """Payload for player:pong event (heartbeat response)."""
    
    server_time: datetime
```

---

## 5. Client → Server Events

### 5.1 Event Handler Base

```python
"""Base event handler with common functionality."""
from __future__ import annotations

import logging
from abc import ABC, abstractmethod
from typing import TYPE_CHECKING, Any, Generic, TypeVar

from pydantic import BaseModel, ValidationError

from app.core.exceptions import (
    AppException,
    AuthorizationError,
    NotRoomAdminError,
    ValidationError as AppValidationError,
)
from app.websocket.schemas.base import BasePayload
from app.websocket.schemas.server import ErrorPayload

if TYPE_CHECKING:
    from app.websocket.context import ConnectionContext
    from app.websocket.room_manager import RoomManager

logger = logging.getLogger(__name__)

T = TypeVar("T", bound=BasePayload)


class EventHandler(ABC, Generic[T]):
    """
    Base class for all event handlers.
    
    Provides common functionality:
    - Payload validation
    - Permission checking
    - Error handling
    - Logging
    """
    
    payload_class: type[T]
    requires_auth: bool = True
    requires_room: bool = False
    requires_admin: bool = False
    
    def __init__(self, room_manager: RoomManager) -> None:
        self.room_manager = room_manager
    
    async def __call__(
        self,
        ctx: ConnectionContext,
        data: dict[str, Any],
    ) -> None:
        """
        Main entry point for event handling.
        
        Validates payload, checks permissions, and delegates to handle().
        """
        try:
            # Validate payload
            payload = self._validate_payload(data)
            
            # Check authentication
            if self.requires_auth and not ctx.is_authenticated:
                raise AuthorizationError("Authentication required")
            
            # Check room membership
            if self.requires_room:
                room_code = getattr(payload, "room_code", None)
                if room_code and not await self._is_in_room(ctx, room_code):
                    raise AuthorizationError("Not a member of this room")
            
            # Check admin permission
            if self.requires_admin:
                room_code = getattr(payload, "room_code", None)
                if room_code and not await self._is_room_admin(ctx, room_code):
                    raise NotRoomAdminError()
            
            # Delegate to concrete handler
            await self.handle(ctx, payload)
            
        except ValidationError as e:
            await self._send_error(
                ctx,
                code="VALIDATION_ERROR",
                message="Invalid event payload",
                details={"errors": str(e)},
            )
        except AppException as e:
            await self._send_error(
                ctx,
                code=e.error_code.value,
                message=e.message,
                recoverable=True,
            )
        except Exception:
            logger.exception("Unhandled error in event handler")
            await self._send_error(
                ctx,
                code="INTERNAL_ERROR",
                message="An unexpected error occurred",
                recoverable=False,
            )
    
    @abstractmethod
    async def handle(self, ctx: ConnectionContext, payload: T) -> None:
        """Handle the validated event. Must be implemented by subclasses."""
        ...
    
    def _validate_payload(self, data: dict[str, Any]) -> T:
        """Validate and parse the event payload."""
        return self.payload_class.model_validate(data)
    
    async def _is_in_room(self, ctx: ConnectionContext, room_code: str) -> bool:
        """Check if the user is in the specified room."""
        return await self.room_manager.is_player_in_room(
            room_code, ctx.user_id
        )
    
    async def _is_room_admin(self, ctx: ConnectionContext, room_code: str) -> bool:
        """Check if the user is the room admin."""
        return await self.room_manager.is_room_admin(
            room_code, ctx.user_id
        )
    
    async def _send_error(
        self,
        ctx: ConnectionContext,
        code: str,
        message: str,
        details: dict[str, str] | None = None,
        recoverable: bool = True,
    ) -> None:
        """Send error event to the client."""
        error = ErrorPayload(
            code=code,
            message=message,
            details=details,
            recoverable=recoverable,
        )
        await ctx.emit("error", error.model_dump())
```

### 5.2 Room Event Handlers

```python
"""Room event handlers."""
from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from app.websocket.handlers.base import EventHandler
from app.websocket.schemas.client import (
    RoomJoinPayload,
    RoomLeavePayload,
    RoomUpdateSeatingPayload,
)
from app.websocket.schemas.server import (
    RoomJoinedPayload,
    RoomLeftPayload,
    RoomPlayerJoinedPayload,
    RoomSeatingUpdatedPayload,
)
from app.websocket.events import ClientEvents, ServerEvents

if TYPE_CHECKING:
    from app.websocket.context import ConnectionContext

logger = logging.getLogger(__name__)


class RoomJoinHandler(EventHandler[RoomJoinPayload]):
    """Handler for room:join event."""
    
    payload_class = RoomJoinPayload
    requires_auth = True
    requires_room = False  # Not in room yet
    requires_admin = False
    
    async def handle(
        self,
        ctx: ConnectionContext,
        payload: RoomJoinPayload,
    ) -> None:
        """
        Handle player joining a room.
        
        1. Validate room exists and has space
        2. Add player to room
        3. Join Socket.IO room
        4. Send confirmation to player
        5. Broadcast to other players
        """
        room_code = payload.room_code
        
        # Add player to room (validates room state)
        join_result = await self.room_manager.join_room(
            room_code=room_code,
            user_id=ctx.user_id,
            display_name=payload.display_name or ctx.display_name,
            socket_id=ctx.socket_id,
        )
        
        # Join Socket.IO room for broadcasts
        await ctx.join_room(f"room:{room_code}")
        
        # Update connection context
        ctx.current_room = room_code
        
        # Send confirmation to joining player
        joined_payload = RoomJoinedPayload(
            room_code=room_code,
            game_id=join_result.game_id,
            your_seat=join_result.seat_position,
            is_admin=join_result.is_admin,
            players=join_result.players,
            phase=join_result.phase,
            current_round=join_result.current_round,
        )
        await ctx.emit(ServerEvents.ROOM_JOINED, joined_payload.model_dump())
        
        # Broadcast to other players in room
        player_joined_payload = RoomPlayerJoinedPayload(
            player=join_result.player_info,
            player_count=len(join_result.players),
        )
        await ctx.broadcast_to_room(
            f"room:{room_code}",
            ServerEvents.ROOM_PLAYER_JOINED,
            player_joined_payload.model_dump(),
            exclude_self=True,
        )
        
        logger.info(
            "Player %s joined room %s at seat %d",
            ctx.user_id,
            room_code,
            join_result.seat_position,
        )


class RoomLeaveHandler(EventHandler[RoomLeavePayload]):
    """Handler for room:leave event."""
    
    payload_class = RoomLeavePayload
    requires_auth = True
    requires_room = True
    requires_admin = False
    
    async def handle(
        self,
        ctx: ConnectionContext,
        payload: RoomLeavePayload,
    ) -> None:
        """
        Handle player leaving a room voluntarily.
        
        1. Remove player from room
        2. Leave Socket.IO room
        3. Send confirmation
        4. Broadcast to remaining players
        """
        room_code = payload.room_code
        
        # Remove player from room
        leave_result = await self.room_manager.leave_room(
            room_code=room_code,
            user_id=ctx.user_id,
            reason="voluntary",
        )
        
        # Leave Socket.IO room
        await ctx.leave_room(f"room:{room_code}")
        ctx.current_room = None
        
        # Send confirmation to leaving player
        left_payload = RoomLeftPayload(
            room_code=room_code,
            reason="voluntary",
        )
        await ctx.emit(ServerEvents.ROOM_LEFT, left_payload.model_dump())
        
        # Broadcast to remaining players if room still exists
        if leave_result.room_still_exists:
            await ctx.broadcast_to_room(
                f"room:{room_code}",
                ServerEvents.ROOM_PLAYER_LEFT,
                leave_result.broadcast_payload.model_dump(),
            )
        
        logger.info("Player %s left room %s", ctx.user_id, room_code)


class RoomUpdateSeatingHandler(EventHandler[RoomUpdateSeatingPayload]):
    """Handler for room:update_seating event (admin only)."""
    
    payload_class = RoomUpdateSeatingPayload
    requires_auth = True
    requires_room = True
    requires_admin = True
    
    async def handle(
        self,
        ctx: ConnectionContext,
        payload: RoomUpdateSeatingPayload,
    ) -> None:
        """
        Handle seating arrangement update.
        
        Only admin can update seating, and only in waiting phase.
        """
        room_code = payload.room_code
        
        # Update seating
        result = await self.room_manager.update_seating(
            room_code=room_code,
            new_positions=payload.positions,
            admin_id=ctx.user_id,
        )
        
        # Broadcast new seating to all players
        seating_payload = RoomSeatingUpdatedPayload(
            players=result.players,
            updated_by=ctx.user_id,
        )
        await ctx.broadcast_to_room(
            f"room:{room_code}",
            ServerEvents.ROOM_SEATING_UPDATED,
            seating_payload.model_dump(),
        )
        
        logger.info("Seating updated in room %s by admin %s", room_code, ctx.user_id)
```

### 5.3 Bidding Event Handlers

```python
"""Bidding event handlers."""
from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Any

from app.core.exceptions import BidValidationError, GameStateError
from app.websocket.handlers.base import EventHandler
from app.websocket.schemas.client import (
    BidContractPayload,
    BidPassPayload,
    BidTrumpPayload,
)
from app.websocket.schemas.server import (
    BidContractsSetPayload,
    BidFrischStartedPayload,
    BidPassedPayload,
    BidPlacedPayload,
    BidTrumpSetPayload,
    BidYourTurnPayload,
    RoundStartedPayload,
)
from app.websocket.events import ServerEvents

if TYPE_CHECKING:
    from app.websocket.context import ConnectionContext

logger = logging.getLogger(__name__)


class BidTrumpHandler(EventHandler[BidTrumpPayload]):
    """Handler for bid:trump event."""
    
    payload_class = BidTrumpPayload
    requires_auth = True
    requires_room = True
    requires_admin = False
    
    async def handle(
        self,
        ctx: ConnectionContext,
        payload: BidTrumpPayload,
    ) -> None:
        """
        Handle trump bid placement.
        
        Validates:
        - It's the player's turn
        - Game is in trump_bidding phase
        - Bid is valid (>= minimum, > current highest)
        
        Outcomes:
        - Bid placed, next player's turn
        - 3 consecutive passes after bid = trump set
        - 4 passes = frisch (if < 3 frisch)
        """
        room_code = payload.room_code
        
        # Place the bid
        result = await self.room_manager.place_trump_bid(
            room_code=room_code,
            player_id=ctx.user_id,
            amount=payload.amount,
            suit=payload.suit,
        )
        
        if result.outcome == "bid_placed":
            # Normal case: bid placed, next player's turn
            bid_payload = BidPlacedPayload(
                bid=result.bid_info,
                is_highest=True,
                next_bidder_id=result.next_bidder_id,
                next_bidder_name=result.next_bidder_name,
                next_bidder_seat=result.next_bidder_seat,
                consecutive_passes=0,
            )
            await ctx.broadcast_to_room(
                f"room:{room_code}",
                ServerEvents.BID_PLACED,
                bid_payload.model_dump(),
            )
            
            # Send "your turn" to next player
            await self._send_your_turn(ctx, room_code, result.next_bidder_id, result)
            
        elif result.outcome == "trump_set":
            # Bidding complete, trump suit is set
            trump_set_payload = BidTrumpSetPayload(
                trump_suit=result.trump_suit,
                winner_id=result.winner_id,
                winner_name=result.winner_name,
                winning_bid=result.winning_bid,
                frisch_count=result.frisch_count,
            )
            await ctx.broadcast_to_room(
                f"room:{room_code}",
                ServerEvents.BID_TRUMP_SET,
                trump_set_payload.model_dump(),
            )
            
            # Start contract bidding (trump winner bids first)
            await self._start_contract_bidding(ctx, room_code, result)
    
    async def _send_your_turn(
        self,
        ctx: ConnectionContext,
        room_code: str,
        next_player_id: str,
        result: Any,
    ) -> None:
        """Send bid:your_turn to the next player."""
        your_turn_payload = BidYourTurnPayload(
            phase="trump_bidding",
            minimum_bid=result.minimum_bid,
            current_highest=result.current_highest,
            is_last_bidder=False,
            is_trump_winner=False,
        )
        await ctx.emit_to_user(
            next_player_id,
            ServerEvents.BID_YOUR_TURN,
            your_turn_payload.model_dump(),
        )
    
    async def _start_contract_bidding(
        self,
        ctx: ConnectionContext,
        room_code: str,
        result: Any,
    ) -> None:
        """Transition to contract bidding phase."""
        # Send "your turn" to trump winner (they bid first)
        your_turn_payload = BidYourTurnPayload(
            phase="contract_bidding",
            is_trump_winner=True,
            trump_winning_bid=result.winning_bid,
            current_contract_sum=0,
            is_last_bidder=False,
        )
        await ctx.emit_to_user(
            result.winner_id,
            ServerEvents.BID_YOUR_TURN,
            your_turn_payload.model_dump(),
        )


class BidPassHandler(EventHandler[BidPassPayload]):
    """Handler for bid:pass event."""
    
    payload_class = BidPassPayload
    requires_auth = True
    requires_room = True
    requires_admin = False
    
    async def handle(
        self,
        ctx: ConnectionContext,
        payload: BidPassPayload,
    ) -> None:
        """
        Handle trump bid pass.
        
        Outcomes:
        - Pass recorded, next player's turn
        - 3 consecutive passes = trump set (if there's a highest bid)
        - 4 consecutive passes = frisch
        """
        room_code = payload.room_code
        
        result = await self.room_manager.pass_trump_bid(
            room_code=room_code,
            player_id=ctx.user_id,
        )
        
        if result.outcome == "passed":
            # Normal case: pass recorded
            pass_payload = BidPassedPayload(
                player_id=ctx.user_id,
                player_name=ctx.display_name,
                consecutive_passes=result.consecutive_passes,
                next_bidder_id=result.next_bidder_id,
                next_bidder_name=result.next_bidder_name,
                next_bidder_seat=result.next_bidder_seat,
            )
            await ctx.broadcast_to_room(
                f"room:{room_code}",
                ServerEvents.BID_PASSED,
                pass_payload.model_dump(),
            )
            
            # Send "your turn" to next player
            if result.next_bidder_id:
                your_turn_payload = BidYourTurnPayload(
                    phase="trump_bidding",
                    minimum_bid=result.minimum_bid,
                    current_highest=result.current_highest,
                )
                await ctx.emit_to_user(
                    result.next_bidder_id,
                    ServerEvents.BID_YOUR_TURN,
                    your_turn_payload.model_dump(),
                )
                
        elif result.outcome == "trump_set":
            # 3 passes after a bid = trump is set
            trump_set_payload = BidTrumpSetPayload(
                trump_suit=result.trump_suit,
                winner_id=result.winner_id,
                winner_name=result.winner_name,
                winning_bid=result.winning_bid,
                frisch_count=result.frisch_count,
            )
            await ctx.broadcast_to_room(
                f"room:{room_code}",
                ServerEvents.BID_TRUMP_SET,
                trump_set_payload.model_dump(),
            )
            
        elif result.outcome == "frisch":
            # All 4 passed, start frisch
            frisch_payload = BidFrischStartedPayload(
                frisch_number=result.frisch_count,
                new_minimum_bid=result.minimum_bid,
                message=f"Frisch #{result.frisch_count}! Exchange 3 cards. Minimum bid is now {result.minimum_bid}.",
            )
            await ctx.broadcast_to_room(
                f"room:{room_code}",
                ServerEvents.BID_FRISCH_STARTED,
                frisch_payload.model_dump(),
            )


class BidContractHandler(EventHandler[BidContractPayload]):
    """Handler for bid:contract event."""
    
    payload_class = BidContractPayload
    requires_auth = True
    requires_room = True
    requires_admin = False
    
    async def handle(
        self,
        ctx: ConnectionContext,
        payload: BidContractPayload,
    ) -> None:
        """
        Handle contract bid placement.
        
        Validates:
        - It's the player's turn
        - Game is in contract_bidding phase
        - Last bidder can't make sum = 13
        - Trump winner must bid >= their trump bid
        """
        room_code = payload.room_code
        
        result = await self.room_manager.place_contract_bid(
            room_code=room_code,
            player_id=ctx.user_id,
            amount=payload.amount,
        )
        
        if result.outcome == "bid_placed":
            # More players need to bid
            # Notify next player
            if result.next_bidder_id:
                your_turn_payload = BidYourTurnPayload(
                    phase="contract_bidding",
                    current_contract_sum=result.current_sum,
                    is_last_bidder=result.is_next_last_bidder,
                    forbidden_amount=result.forbidden_amount,
                    is_trump_winner=False,
                )
                await ctx.emit_to_user(
                    result.next_bidder_id,
                    ServerEvents.BID_YOUR_TURN,
                    your_turn_payload.model_dump(),
                )
                
        elif result.outcome == "contracts_set":
            # All contracts placed, start playing
            contracts_payload = BidContractsSetPayload(
                contracts=result.contracts,
                total_contracts=result.total_contracts,
                game_type=result.game_type,
                first_player_id=result.first_player_id,
                first_player_name=result.first_player_name,
            )
            await ctx.broadcast_to_room(
                f"room:{room_code}",
                ServerEvents.BID_CONTRACTS_SET,
                contracts_payload.model_dump(),
            )
            
            # Send round:started
            round_started_payload = RoundStartedPayload(
                round_number=result.round_number,
                trump_suit=result.trump_suit,
                game_type=result.game_type,
                first_player_id=result.first_player_id,
                players=result.player_states,
            )
            await ctx.broadcast_to_room(
                f"room:{room_code}",
                ServerEvents.ROUND_STARTED,
                round_started_payload.model_dump(),
            )
```

### 5.4 Round Event Handlers

```python
"""Round play event handlers."""
from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from app.websocket.handlers.base import EventHandler
from app.websocket.schemas.client import (
    RoundClaimTrickPayload,
    RoundUndoTrickPayload,
)
from app.websocket.schemas.server import (
    RoundCompletePayload,
    RoundTrickUndonePayload,
    RoundTrickWonPayload,
)
from app.websocket.events import ServerEvents

if TYPE_CHECKING:
    from app.websocket.context import ConnectionContext

logger = logging.getLogger(__name__)


class RoundClaimTrickHandler(EventHandler[RoundClaimTrickPayload]):
    """Handler for round:claim_trick event."""
    
    payload_class = RoundClaimTrickPayload
    requires_auth = True
    requires_room = True
    requires_admin = False
    
    async def handle(
        self,
        ctx: ConnectionContext,
        payload: RoundClaimTrickPayload,
    ) -> None:
        """
        Handle player claiming a trick.
        
        Any player can claim they won a trick. The app doesn't
        track individual cards, just trick counts.
        
        When 13 tricks are reached, round completes automatically.
        """
        room_code = payload.room_code
        
        result = await self.room_manager.claim_trick(
            room_code=room_code,
            player_id=ctx.user_id,
        )
        
        if result.outcome == "trick_claimed":
            # Trick recorded, round continues
            trick_payload = RoundTrickWonPayload(
                player_id=ctx.user_id,
                player_name=ctx.display_name,
                new_trick_count=result.new_trick_count,
                contract=result.contract,
                total_tricks_played=result.total_tricks_played,
                remaining_tricks=13 - result.total_tricks_played,
            )
            await ctx.broadcast_to_room(
                f"room:{room_code}",
                ServerEvents.ROUND_TRICK_WON,
                trick_payload.model_dump(),
            )
            
        elif result.outcome == "round_complete":
            # All 13 tricks played, calculate scores
            complete_payload = RoundCompletePayload(
                round_number=result.round_number,
                trump_suit=result.trump_suit,
                game_type=result.game_type,
                players=result.player_results,
                commentary=result.commentary,
                cumulative_scores=result.cumulative_scores,
            )
            await ctx.broadcast_to_room(
                f"room:{room_code}",
                ServerEvents.ROUND_COMPLETE,
                complete_payload.model_dump(),
            )
            
            logger.info(
                "Round %d complete in room %s",
                result.round_number,
                room_code,
            )


class RoundUndoTrickHandler(EventHandler[RoundUndoTrickPayload]):
    """Handler for round:undo_trick event (admin only)."""
    
    payload_class = RoundUndoTrickPayload
    requires_auth = True
    requires_room = True
    requires_admin = True
    
    async def handle(
        self,
        ctx: ConnectionContext,
        payload: RoundUndoTrickPayload,
    ) -> None:
        """
        Handle undo of a trick (admin only).
        
        Used to correct mistakes when wrong player claimed a trick.
        """
        room_code = payload.room_code
        
        result = await self.room_manager.undo_trick(
            room_code=room_code,
            player_id=payload.player_id,
            admin_id=ctx.user_id,
        )
        
        undo_payload = RoundTrickUndonePayload(
            player_id=payload.player_id,
            player_name=result.player_name,
            new_trick_count=result.new_trick_count,
            total_tricks_played=result.total_tricks_played,
            undone_by=ctx.user_id,
        )
        await ctx.broadcast_to_room(
            f"room:{room_code}",
            ServerEvents.ROUND_TRICK_UNDONE,
            undo_payload.model_dump(),
        )
        
        logger.info(
            "Trick undone for player %s in room %s by admin %s",
            payload.player_id,
            room_code,
            ctx.user_id,
        )
```

### 5.5 Game Control Event Handlers

```python
"""Game control event handlers."""
from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from app.core.exceptions import GameStateError
from app.websocket.handlers.base import EventHandler
from app.websocket.schemas.client import (
    GameEndPayload,
    GameNewRoundPayload,
    GameStartPayload,
)
from app.websocket.schemas.server import (
    BidYourTurnPayload,
    GameEndedPayload,
    GamePhaseChangedPayload,
    GameStartedPayload,
)
from app.websocket.events import ServerEvents

if TYPE_CHECKING:
    from app.websocket.context import ConnectionContext

logger = logging.getLogger(__name__)


class GameStartHandler(EventHandler[GameStartPayload]):
    """Handler for game:start event (admin only)."""
    
    payload_class = GameStartPayload
    requires_auth = True
    requires_room = True
    requires_admin = True
    
    async def handle(
        self,
        ctx: ConnectionContext,
        payload: GameStartPayload,
    ) -> None:
        """
        Handle game start (admin only).
        
        Requires exactly 4 players in the room.
        Initializes round 1 and starts trump bidding.
        """
        room_code = payload.room_code
        
        result = await self.room_manager.start_game(
            room_code=room_code,
            admin_id=ctx.user_id,
        )
        
        # Broadcast game started
        started_payload = GameStartedPayload(
            game_id=result.game_id,
            phase="bidding_trump",
            round_number=1,
            first_bidder_id=result.first_bidder_id,
            first_bidder_name=result.first_bidder_name,
            dealer_seat=result.dealer_seat,
        )
        await ctx.broadcast_to_room(
            f"room:{room_code}",
            ServerEvents.GAME_STARTED,
            started_payload.model_dump(),
        )
        
        # Send "your turn" to first bidder
        your_turn_payload = BidYourTurnPayload(
            phase="trump_bidding",
            minimum_bid=5,
            current_highest=None,
        )
        await ctx.emit_to_user(
            result.first_bidder_id,
            ServerEvents.BID_YOUR_TURN,
            your_turn_payload.model_dump(),
        )
        
        logger.info(
            "Game started in room %s by admin %s",
            room_code,
            ctx.user_id,
        )


class GameNewRoundHandler(EventHandler[GameNewRoundPayload]):
    """Handler for game:new_round event (admin only)."""
    
    payload_class = GameNewRoundPayload
    requires_auth = True
    requires_room = True
    requires_admin = True
    
    async def handle(
        self,
        ctx: ConnectionContext,
        payload: GameNewRoundPayload,
    ) -> None:
        """
        Handle starting a new round (admin only).
        
        Only valid in round_complete phase.
        """
        room_code = payload.room_code
        
        result = await self.room_manager.start_new_round(
            room_code=room_code,
            admin_id=ctx.user_id,
        )
        
        # Broadcast phase change
        phase_payload = GamePhaseChangedPayload(
            previous_phase="round_complete",
            new_phase="bidding_trump",
            round_number=result.round_number,
        )
        await ctx.broadcast_to_room(
            f"room:{room_code}",
            ServerEvents.GAME_PHASE_CHANGED,
            phase_payload.model_dump(),
        )
        
        # Send "your turn" to first bidder
        your_turn_payload = BidYourTurnPayload(
            phase="trump_bidding",
            minimum_bid=5,
            current_highest=None,
        )
        await ctx.emit_to_user(
            result.first_bidder_id,
            ServerEvents.BID_YOUR_TURN,
            your_turn_payload.model_dump(),
        )
        
        logger.info(
            "Round %d started in room %s",
            result.round_number,
            room_code,
        )


class GameEndHandler(EventHandler[GameEndPayload]):
    """Handler for game:end event (admin only)."""
    
    payload_class = GameEndPayload
    requires_auth = True
    requires_room = True
    requires_admin = True
    
    async def handle(
        self,
        ctx: ConnectionContext,
        payload: GameEndPayload,
    ) -> None:
        """
        Handle ending the game (admin only).
        
        Can be called at any time. Calculates final scores
        and determines winner.
        """
        room_code = payload.room_code
        
        result = await self.room_manager.end_game(
            room_code=room_code,
            admin_id=ctx.user_id,
        )
        
        ended_payload = GameEndedPayload(
            game_id=result.game_id,
            winner_id=result.winner_id,
            winner_name=result.winner_name,
            final_scores=result.final_scores,
            total_rounds=result.total_rounds,
            duration_minutes=result.duration_minutes,
        )
        await ctx.broadcast_to_room(
            f"room:{room_code}",
            ServerEvents.GAME_ENDED,
            ended_payload.model_dump(),
        )
        
        logger.info(
            "Game ended in room %s. Winner: %s",
            room_code,
            result.winner_name,
        )
```

---

## 6. Server → Client Events

### 6.1 Event Dispatcher

```python
"""Event dispatcher for sending events to clients."""
from __future__ import annotations

import json
import logging
from typing import TYPE_CHECKING, Any

import socketio

from app.websocket.events import ServerEvents

if TYPE_CHECKING:
    from redis.asyncio import Redis

logger = logging.getLogger(__name__)


class EventDispatcher:
    """
    Dispatches events to clients with sequence numbering.
    
    Handles both room broadcasts and targeted user messages.
    Maintains sequence numbers per room for ordering guarantees.
    """
    
    def __init__(
        self,
        sio: socketio.AsyncServer,
        redis: Redis,
    ) -> None:
        self.sio = sio
        self.redis = redis
    
    async def emit_to_room(
        self,
        room: str,
        event: str,
        data: dict[str, Any],
        skip_sid: str | None = None,
    ) -> int:
        """
        Emit event to all clients in a room.
        
        Returns the sequence number assigned to this event.
        """
        seq = await self._get_next_seq(room)
        
        envelope = {
            "event": event,
            "data": data,
            "seq": seq,
            "room_code": room.replace("room:", ""),
        }
        
        await self.sio.emit(
            event,
            envelope,
            room=room,
            skip_sid=skip_sid,
        )
        
        # Store event for replay (keep last 100 events)
        await self._store_event(room, envelope)
        
        logger.debug(
            "Emitted %s to room %s (seq=%d)",
            event,
            room,
            seq,
        )
        
        return seq
    
    async def emit_to_user(
        self,
        user_id: str,
        event: str,
        data: dict[str, Any],
    ) -> None:
        """Emit event to a specific user by their user ID."""
        # Look up socket ID for user
        socket_id = await self.redis.get(f"ws:user:{user_id}")
        
        if socket_id:
            await self.sio.emit(
                event,
                data,
                to=socket_id,
            )
            logger.debug("Emitted %s to user %s", event, user_id)
        else:
            logger.warning(
                "Cannot emit %s to user %s: no active connection",
                event,
                user_id,
            )
    
    async def emit_to_sid(
        self,
        sid: str,
        event: str,
        data: dict[str, Any],
    ) -> None:
        """Emit event to a specific socket ID."""
        await self.sio.emit(event, data, to=sid)
    
    async def _get_next_seq(self, room: str) -> int:
        """Get and increment sequence number for a room."""
        return await self.redis.incr(f"seq:{room}")
    
    async def _store_event(
        self,
        room: str,
        envelope: dict[str, Any],
    ) -> None:
        """
        Store event for potential replay on reconnection.
        
        Keeps the last 100 events per room.
        """
        key = f"events:{room}"
        
        # Add to sorted set with seq as score
        await self.redis.zadd(
            key,
            {json.dumps(envelope): envelope["seq"]},
        )
        
        # Trim to last 100 events
        await self.redis.zremrangebyrank(key, 0, -101)
        
        # Set expiry (same as room TTL)
        await self.redis.expire(key, 86400)
    
    async def get_events_since(
        self,
        room: str,
        since_seq: int,
    ) -> list[dict[str, Any]]:
        """
        Get all events since a given sequence number.
        
        Used for state recovery on reconnection.
        """
        key = f"events:{room}"
        
        # Get events with seq > since_seq
        events = await self.redis.zrangebyscore(
            key,
            min=since_seq + 1,
            max="+inf",
        )
        
        return [json.loads(e) for e in events]
```

---

## 7. Room Management

### 7.1 Connection Context

```python
"""Connection context for WebSocket sessions."""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    import socketio


@dataclass
class ConnectionContext:
    """
    Context for a WebSocket connection.
    
    Maintains session state and provides helper methods
    for emitting events.
    """
    
    sio: socketio.AsyncServer
    socket_id: str
    user_id: str
    display_name: str
    is_authenticated: bool = False
    current_room: str | None = None
    connected_at: datetime = field(default_factory=datetime.utcnow)
    last_activity: datetime = field(default_factory=datetime.utcnow)
    
    async def emit(self, event: str, data: dict[str, Any]) -> None:
        """Emit event to this connection."""
        await self.sio.emit(event, data, to=self.socket_id)
    
    async def emit_to_user(
        self,
        user_id: str,
        event: str,
        data: dict[str, Any],
    ) -> None:
        """Emit event to a specific user (via dispatcher)."""
        # This should be delegated to EventDispatcher
        from app.websocket.server import get_event_dispatcher
        dispatcher = get_event_dispatcher()
        await dispatcher.emit_to_user(user_id, event, data)
    
    async def broadcast_to_room(
        self,
        room: str,
        event: str,
        data: dict[str, Any],
        exclude_self: bool = False,
    ) -> None:
        """Broadcast event to all clients in a room."""
        skip_sid = self.socket_id if exclude_self else None
        await self.sio.emit(event, data, room=room, skip_sid=skip_sid)
    
    async def join_room(self, room: str) -> None:
        """Join a Socket.IO room."""
        self.sio.enter_room(self.socket_id, room)
    
    async def leave_room(self, room: str) -> None:
        """Leave a Socket.IO room."""
        self.sio.leave_room(self.socket_id, room)
    
    def update_activity(self) -> None:
        """Update last activity timestamp."""
        self.last_activity = datetime.utcnow()
```

### 7.2 Room Manager

```python
"""Room manager for WebSocket room state."""
from __future__ import annotations

import json
import logging
import secrets
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import TYPE_CHECKING, Any

from redis.asyncio import Redis

from app.config import get_settings
from app.core.exceptions import (
    GameStateError,
    NotFoundError,
    RoomFullError,
    RoomNotFoundError,
)
from app.schemas.errors import ErrorCode
from app.websocket.schemas.common import GamePhase, PlayerInfo
from app.websocket.schemas.server import RoomPlayerLeftPayload

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

ROOM_CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ"
ROOM_CODE_LENGTH = 6


@dataclass
class JoinRoomResult:
    """Result of joining a room."""
    game_id: str
    seat_position: int
    is_admin: bool
    players: list[PlayerInfo]
    player_info: PlayerInfo
    phase: GamePhase
    current_round: int | None


@dataclass
class LeaveRoomResult:
    """Result of leaving a room."""
    room_still_exists: bool
    broadcast_payload: RoomPlayerLeftPayload | None


class RoomManager:
    """
    Manages room state in Redis and coordinates with database.
    
    Responsibilities:
    - Room creation and destruction
    - Player join/leave/reconnection
    - Seating arrangement
    - Game state transitions
    - WebSocket connection tracking
    """
    
    ROOM_TTL = timedelta(hours=24)
    RECONNECT_GRACE_PERIOD = timedelta(seconds=60)
    
    def __init__(
        self,
        redis: Redis,
        db_session_factory: Any,
    ) -> None:
        self.redis = redis
        self.db_session_factory = db_session_factory
        self.settings = get_settings()
    
    # ========================================================================
    # Room Lifecycle
    # ========================================================================
    
    async def create_room(
        self,
        admin_id: str,
        admin_display_name: str,
        group_id: str | None = None,
    ) -> tuple[str, str]:
        """
        Create a new room.
        
        Returns:
            Tuple of (room_code, game_id)
        """
        # Generate unique room code
        room_code = await self._generate_unique_room_code()
        
        # Create game in database
        async with self.db_session_factory() as db:
            game = await self._create_game_in_db(
                db=db,
                room_code=room_code,
                admin_id=admin_id,
                group_id=group_id,
            )
            game_id = str(game.id)
        
        # Initialize room state in Redis
        now = datetime.utcnow().isoformat()
        
        pipe = self.redis.pipeline()
        
        # Room metadata
        pipe.hset(
            f"room:{room_code}",
            mapping={
                "game_id": game_id,
                "admin_id": admin_id,
                "status": "waiting",
                "phase": "waiting",
                "created_at": now,
                "last_activity": now,
            },
        )
        pipe.expire(f"room:{room_code}", int(self.ROOM_TTL.total_seconds()))
        
        # Admin is automatically seat 0
        admin_player = PlayerInfo(
            user_id=admin_id,
            display_name=admin_display_name,
            seat_position=0,
            is_admin=True,
            is_connected=True,
        )
        pipe.hset(
            f"room:{room_code}:players",
            "0",
            admin_player.model_dump_json(),
        )
        pipe.expire(f"room:{room_code}:players", int(self.ROOM_TTL.total_seconds()))
        
        await pipe.execute()
        
        logger.info(
            "Room %s created by admin %s (game_id=%s)",
            room_code,
            admin_id,
            game_id,
        )
        
        return room_code, game_id
    
    async def _generate_unique_room_code(self, max_attempts: int = 10) -> str:
        """Generate a unique room code."""
        for _ in range(max_attempts):
            code = "".join(
                secrets.choice(ROOM_CODE_CHARS)
                for _ in range(ROOM_CODE_LENGTH)
            )
            
            exists = await self.redis.exists(f"room:{code}")
            if not exists:
                return code
        
        raise RuntimeError("Could not generate unique room code")
    
    async def _create_game_in_db(
        self,
        db: Any,  # AsyncSession
        room_code: str,
        admin_id: str,
        group_id: str | None,
    ) -> Any:
        """Create game record in database."""
        from app.models.game import Game, GameStatus
        from uuid import UUID
        
        game = Game(
            room_code=room_code,
            admin_id=UUID(admin_id),
            group_id=UUID(group_id) if group_id else None,
            status=GameStatus.WAITING,
        )
        db.add(game)
        await db.commit()
        await db.refresh(game)
        return game
    
    # ========================================================================
    # Join / Leave
    # ========================================================================
    
    async def join_room(
        self,
        room_code: str,
        user_id: str,
        display_name: str,
        socket_id: str,
    ) -> JoinRoomResult:
        """
        Handle player joining a room.
        
        Checks for reconnection vs new join.
        """
        room_code = room_code.upper()
        
        # Check room exists
        room_data = await self.redis.hgetall(f"room:{room_code}")
        if not room_data:
            raise RoomNotFoundError(room_code)
        
        # Check for reconnection
        reconnect_data = await self.redis.hgetall(f"reconnect:{user_id}")
        if reconnect_data and reconnect_data.get("room_code") == room_code:
            return await self._handle_reconnection(
                room_code=room_code,
                user_id=user_id,
                display_name=display_name,
                socket_id=socket_id,
                seat_position=int(reconnect_data["seat_position"]),
            )
        
        # Check if already in room
        existing_seat = await self._find_player_seat(room_code, user_id)
        if existing_seat is not None:
            # Already in room, just update connection
            return await self._update_player_connection(
                room_code=room_code,
                user_id=user_id,
                socket_id=socket_id,
                seat_position=existing_seat,
            )
        
        # New join - find available seat
        players = await self._get_room_players(room_code)
        if len(players) >= 4:
            raise RoomFullError()
        
        # Check game hasn't started
        phase = room_data.get("phase", "waiting")
        if phase != "waiting":
            raise GameStateError(
                message="Cannot join a game in progress",
                error_code=ErrorCode.ROOM_ALREADY_STARTED,
            )
        
        # Find first available seat
        occupied_seats = {p.seat_position for p in players}
        available_seat = next(s for s in range(4) if s not in occupied_seats)
        
        # Add player
        is_admin = room_data.get("admin_id") == user_id
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
        
        # Refresh room TTL
        await self._refresh_room_ttl(room_code)
        
        # Get updated player list
        updated_players = await self._get_room_players(room_code)
        
        return JoinRoomResult(
            game_id=room_data["game_id"],
            seat_position=available_seat,
            is_admin=is_admin,
            players=updated_players,
            player_info=player_info,
            phase=phase,
            current_round=None,
        )
    
    async def leave_room(
        self,
        room_code: str,
        user_id: str,
        reason: str = "voluntary",
    ) -> LeaveRoomResult:
        """Handle player leaving a room."""
        room_code = room_code.upper()
        
        # Find player's seat
        seat = await self._find_player_seat(room_code, user_id)
        if seat is None:
            raise NotFoundError(
                message="Player not in room",
                error_code=ErrorCode.PLAYER_NOT_IN_ROOM,
            )
        
        # Get player info before removal
        player_data = await self.redis.hget(
            f"room:{room_code}:players",
            str(seat),
        )
        player_info = PlayerInfo.model_validate_json(player_data)
        
        # Remove player
        await self.redis.hdel(f"room:{room_code}:players", str(seat))
        
        # Clear connection tracking
        socket_id = await self.redis.get(f"ws:user:{user_id}")
        if socket_id:
            await self._clear_connection(socket_id)
        
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
        """
        Handle WebSocket disconnection.
        
        Returns:
            Tuple of (room_code, user_id) if player was in a room
        """
        # Get connection info
        conn_data = await self.redis.hgetall(f"ws:socket:{socket_id}")
        if not conn_data:
            return None, None
        
        user_id = conn_data.get("user_id")
        room_code = conn_data.get("room_code")
        
        if not user_id or not room_code:
            await self._clear_connection(socket_id)
            return None, None
        
        # Find player's seat
        seat = await self._find_player_seat(room_code, user_id)
        if seat is None:
            await self._clear_connection(socket_id)
            return None, None
        
        # Get room phase
        room_data = await self.redis.hgetall(f"room:{room_code}")
        phase = room_data.get("phase", "waiting")
        
        if phase == "waiting":
            # Game hasn't started, just remove player
            await self.leave_room(room_code, user_id, reason="disconnected")
        else:
            # Game in progress, mark as disconnected with grace period
            await self._mark_player_disconnected(room_code, user_id, seat)
        
        # Clear connection
        await self._clear_connection(socket_id)
        
        return room_code, user_id
    
    async def _mark_player_disconnected(
        self,
        room_code: str,
        user_id: str,
        seat: int,
    ) -> None:
        """Mark player as disconnected with reconnection grace period."""
        # Update player connection status
        player_data = await self.redis.hget(
            f"room:{room_code}:players",
            str(seat),
        )
        if player_data:
            player = PlayerInfo.model_validate_json(player_data)
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
            self.RECONNECT_GRACE_PERIOD.total_seconds(),
        )
    
    async def _handle_reconnection(
        self,
        room_code: str,
        user_id: str,
        display_name: str,
        socket_id: str,
        seat_position: int,
    ) -> JoinRoomResult:
        """Handle player reconnecting within grace period."""
        # Update player as connected
        player_data = await self.redis.hget(
            f"room:{room_code}:players",
            str(seat_position),
        )
        
        if player_data:
            player = PlayerInfo.model_validate_json(player_data)
            updated = player.model_copy(update={"is_connected": True})
            await self.redis.hset(
                f"room:{room_code}:players",
                str(seat_position),
                updated.model_dump_json(),
            )
        
        # Clear reconnection record
        await self.redis.delete(f"reconnect:{user_id}")
        
        # Track new connection
        await self._track_connection(socket_id, user_id, room_code)
        
        # Get room state
        room_data = await self.redis.hgetall(f"room:{room_code}")
        players = await self._get_room_players(room_code)
        
        is_admin = room_data.get("admin_id") == user_id
        
        logger.info(
            "Player %s reconnected to room %s at seat %d",
            user_id,
            room_code,
            seat_position,
        )
        
        return JoinRoomResult(
            game_id=room_data["game_id"],
            seat_position=seat_position,
            is_admin=is_admin,
            players=players,
            player_info=next(p for p in players if p.user_id == user_id),
            phase=room_data.get("phase", "waiting"),
            current_round=(
                int(room_data["current_round"])
                if room_data.get("current_round")
                else None
            ),
        )
    
    # ========================================================================
    # Helper Methods
    # ========================================================================
    
    async def _get_room_players(self, room_code: str) -> list[PlayerInfo]:
        """Get all players in a room."""
        players_data = await self.redis.hgetall(f"room:{room_code}:players")
        players = []
        for seat, data in players_data.items():
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
            user_id = conn_data.get("user_id")
            room_code = conn_data.get("room_code")
            
            pipe = self.redis.pipeline()
            pipe.delete(f"ws:socket:{socket_id}")
            
            if user_id:
                pipe.delete(f"ws:user:{user_id}")
            
            if room_code:
                pipe.srem(f"ws:room:{room_code}", socket_id)
            
            await pipe.execute()
    
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
            f"seq:room:{room_code}",
            f"events:room:{room_code}",
        )
        logger.info("Room %s deleted", room_code)
    
    async def is_player_in_room(self, room_code: str, user_id: str) -> bool:
        """Check if a player is in a room."""
        seat = await self._find_player_seat(room_code, user_id)
        return seat is not None
    
    async def is_room_admin(self, room_code: str, user_id: str) -> bool:
        """Check if a user is the room admin."""
        admin_id = await self.redis.hget(f"room:{room_code}", "admin_id")
        return admin_id == user_id
```

---

## 8. State Synchronization

### 8.1 Sync Strategy

```python
"""State synchronization handlers."""
from __future__ import annotations

import json
import logging
from typing import TYPE_CHECKING

from app.websocket.handlers.base import EventHandler
from app.websocket.schemas.client import SyncRequestPayload
from app.websocket.schemas.server import (
    RoomStatePayload,
    RoundStatePayload,
    SyncAckPayload,
    SyncStatePayload,
)
from app.websocket.events import ServerEvents

if TYPE_CHECKING:
    from app.websocket.context import ConnectionContext

logger = logging.getLogger(__name__)


class SyncRequestHandler(EventHandler[SyncRequestPayload]):
    """Handler for sync:request event."""
    
    payload_class = SyncRequestPayload
    requires_auth = True
    requires_room = True
    requires_admin = False
    
    async def handle(
        self,
        ctx: ConnectionContext,
        payload: SyncRequestPayload,
    ) -> None:
        """
        Handle state sync request.
        
        Two modes:
        1. Full sync (last_seq is None): Send complete room state
        2. Delta sync (last_seq provided): Send events since that sequence
        """
        room_code = payload.room_code
        
        if payload.last_seq is None:
            # Full state sync
            await self._send_full_state(ctx, room_code)
        else:
            # Delta sync - send missed events
            await self._send_delta(ctx, room_code, payload.last_seq)
    
    async def _send_full_state(
        self,
        ctx: ConnectionContext,
        room_code: str,
    ) -> None:
        """Send complete room state to client."""
        # Get room metadata
        room_data = await self.room_manager.redis.hgetall(f"room:{room_code}")
        if not room_data:
            await ctx.emit(
                ServerEvents.SYNC_ACK,
                SyncAckPayload(
                    seq=0,
                    status="error",
                    message="Room not found",
                ).model_dump(),
            )
            return
        
        # Get players
        players = await self.room_manager._get_room_players(room_code)
        
        # Get current round state if game in progress
        round_state = None
        if room_data.get("phase") not in ("waiting", "finished"):
            round_state = await self._get_round_state(room_code)
        
        # Get current sequence number
        current_seq = int(
            await self.room_manager.redis.get(f"seq:room:{room_code}") or 0
        )
        
        # Build full state payload
        room_state = RoomStatePayload(
            room_code=room_code,
            game_id=room_data["game_id"],
            admin_id=room_data["admin_id"],
            phase=room_data.get("phase", "waiting"),
            players=players,
            current_round=(
                int(room_data["current_round"])
                if room_data.get("current_round")
                else None
            ),
            round_state=round_state,
        )
        
        sync_payload = SyncStatePayload(
            room=room_state,
            seq=current_seq,
        )
        
        await ctx.emit(ServerEvents.SYNC_STATE, sync_payload.model_dump())
        
        logger.debug(
            "Sent full state sync to %s for room %s (seq=%d)",
            ctx.user_id,
            room_code,
            current_seq,
        )
    
    async def _send_delta(
        self,
        ctx: ConnectionContext,
        room_code: str,
        last_seq: int,
    ) -> None:
        """Send missed events since last_seq."""
        from app.websocket.server import get_event_dispatcher
        
        dispatcher = get_event_dispatcher()
        missed_events = await dispatcher.get_events_since(
            f"room:{room_code}",
            last_seq,
        )
        
        if not missed_events:
            # No missed events, just ack
            current_seq = int(
                await self.room_manager.redis.get(f"seq:room:{room_code}") or 0
            )
            await ctx.emit(
                ServerEvents.SYNC_ACK,
                SyncAckPayload(seq=current_seq, status="ok").model_dump(),
            )
            return
        
        # Check if too many events missed (fall back to full sync)
        if len(missed_events) > 50:
            logger.info(
                "Too many missed events (%d) for %s, sending full sync",
                len(missed_events),
                ctx.user_id,
            )
            await self._send_full_state(ctx, room_code)
            return
        
        # Replay missed events
        for event_envelope in missed_events:
            await ctx.emit(event_envelope["event"], event_envelope)
        
        # Send ack with current seq
        current_seq = missed_events[-1]["seq"]
        await ctx.emit(
            ServerEvents.SYNC_ACK,
            SyncAckPayload(seq=current_seq, status="ok").model_dump(),
        )
        
        logger.debug(
            "Sent %d missed events to %s (seq %d -> %d)",
            len(missed_events),
            ctx.user_id,
            last_seq,
            current_seq,
        )
    
    async def _get_round_state(self, room_code: str) -> RoundStatePayload | None:
        """Get current round state from Redis."""
        round_data = await self.room_manager.redis.hgetall(
            f"room:{room_code}:round"
        )
        
        if not round_data:
            return None
        
        # Parse players from round state
        players_json = round_data.get("players", "[]")
        players_data = json.loads(players_json)
        
        from app.websocket.schemas.common import RoundPlayerState
        players = [RoundPlayerState.model_validate(p) for p in players_data]
        
        # Parse highest bid if present
        highest_bid = None
        if round_data.get("highest_bid"):
            from app.websocket.schemas.common import BidInfo
            highest_bid = BidInfo.model_validate_json(round_data["highest_bid"])
        
        return RoundStatePayload(
            round_number=int(round_data.get("round_number", 1)),
            phase=round_data.get("phase", "trump_bidding"),
            trump_suit=round_data.get("trump_suit"),
            trump_winner_id=round_data.get("trump_winner_id"),
            game_type=round_data.get("game_type"),
            minimum_bid=int(round_data.get("minimum_bid", 5)),
            frisch_count=int(round_data.get("frisch_count", 0)),
            current_bidder_id=round_data.get("current_bidder_id"),
            current_bidder_seat=(
                int(round_data["current_bidder_seat"])
                if round_data.get("current_bidder_seat")
                else None
            ),
            highest_bid=highest_bid,
            consecutive_passes=int(round_data.get("consecutive_passes", 0)),
            players=players,
            total_tricks_played=int(round_data.get("total_tricks_played", 0)),
        )
```

### 8.2 Reconnection Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        RECONNECTION FLOW                                     │
└─────────────────────────────────────────────────────────────────────────────┘

  Client                    Server                           Redis
    │                         │                                │
    │ WebSocket disconnects   │                                │
    │ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─►  │                                │
    │                         │                                │
    │                         │  Store reconnect info          │
    │                         ├───────────────────────────────►│
    │                         │  TTL: 60 seconds               │
    │                         │                                │
    │                         │  Mark player disconnected      │
    │                         │◄───────────────────────────────┤
    │                         │                                │
    │                         │  Broadcast disconnect event    │
    │                         │  (to other players in room)    │
    │                         │                                │
    │     ... time passes ... │                                │
    │                         │                                │
    │ WebSocket reconnects    │                                │
    │ ─────────────────────►  │                                │
    │                         │                                │
    │ room:join               │                                │
    │ {room_code: "ABC123"}   │                                │
    │ ─────────────────────►  │                                │
    │                         │                                │
    │                         │  Check reconnect:{user_id}     │
    │                         ├───────────────────────────────►│
    │                         │                                │
    │                         │  Found: {room, seat}           │
    │                         │◄───────────────────────────────┤
    │                         │                                │
    │                         │  Restore player at same seat   │
    │                         │  Mark as connected             │
    │                         ├───────────────────────────────►│
    │                         │                                │
    │ room:joined             │                                │
    │ (with full state)       │                                │
    │◄─────────────────────── │                                │
    │                         │                                │
    │ sync:state              │                                │
    │ (full game state)       │                                │
    │◄─────────────────────── │                                │
    │                         │                                │
    │                         │  Broadcast reconnect event     │
    │                         │  (to other players)            │
    │                         │                                │
```

---

## 9. Error Handling

### 9.1 Error Codes for WebSocket Events

```python
"""WebSocket-specific error codes."""
from enum import Enum


class WSErrorCode(str, Enum):
    """Error codes for WebSocket events."""
    
    # Connection errors
    CONNECTION_FAILED = "WS_CONN_001"
    AUTHENTICATION_REQUIRED = "WS_CONN_002"
    SESSION_EXPIRED = "WS_CONN_003"
    
    # Room errors
    ROOM_NOT_FOUND = "WS_ROOM_001"
    ROOM_FULL = "WS_ROOM_002"
    NOT_IN_ROOM = "WS_ROOM_003"
    NOT_ROOM_ADMIN = "WS_ROOM_004"
    ROOM_ALREADY_STARTED = "WS_ROOM_005"
    
    # Game state errors
    INVALID_GAME_PHASE = "WS_GAME_001"
    NOT_YOUR_TURN = "WS_GAME_002"
    GAME_NOT_STARTED = "WS_GAME_003"
    GAME_ALREADY_ENDED = "WS_GAME_004"
    
    # Bidding errors
    INVALID_BID_AMOUNT = "WS_BID_001"
    BID_TOO_LOW = "WS_BID_002"
    MUST_BID_HIGHER = "WS_BID_003"
    CANNOT_MAKE_SUM_13 = "WS_BID_004"
    CONTRACT_BID_TOO_LOW = "WS_BID_005"
    
    # Round errors
    ROUND_NOT_STARTED = "WS_ROUND_001"
    TRICKS_COMPLETE = "WS_ROUND_002"
    NO_TRICKS_TO_UNDO = "WS_ROUND_003"
    
    # Validation errors
    INVALID_PAYLOAD = "WS_VAL_001"
    MISSING_REQUIRED_FIELD = "WS_VAL_002"
    
    # Rate limiting
    RATE_LIMITED = "WS_RATE_001"
    
    # Internal errors
    INTERNAL_ERROR = "WS_INT_001"
```

### 9.2 Error Event Handler

```python
"""Error handling utilities for WebSocket events."""
from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Any

from pydantic import ValidationError

from app.core.exceptions import AppException
from app.websocket.schemas.server import ErrorPayload

if TYPE_CHECKING:
    from app.websocket.context import ConnectionContext

logger = logging.getLogger(__name__)


async def handle_event_error(
    ctx: ConnectionContext,
    error: Exception,
    event_name: str,
) -> None:
    """
    Handle errors during event processing.
    
    Sends appropriate error event to client and logs the error.
    """
    if isinstance(error, ValidationError):
        # Pydantic validation error
        error_payload = ErrorPayload(
            code="WS_VAL_001",
            message="Invalid event payload",
            details={"validation_errors": str(error)},
            recoverable=True,
        )
        logger.warning(
            "Validation error in %s from %s: %s",
            event_name,
            ctx.user_id,
            error,
        )
        
    elif isinstance(error, AppException):
        # Known application error
        error_payload = ErrorPayload(
            code=error.error_code.value,
            message=error.message,
            details=error.details[0] if error.details else None,
            recoverable=True,
        )
        logger.warning(
            "App error in %s from %s: %s",
            event_name,
            ctx.user_id,
            error.message,
        )
        
    else:
        # Unknown error
        error_payload = ErrorPayload(
            code="WS_INT_001",
            message="An unexpected error occurred",
            recoverable=False,
        )
        logger.exception(
            "Unexpected error in %s from %s",
            event_name,
            ctx.user_id,
        )
    
    await ctx.emit("error", error_payload.model_dump())


class RateLimiter:
    """
    Rate limiter for WebSocket events.
    
    Uses sliding window algorithm with Redis.
    """
    
    def __init__(self, redis: Any) -> None:
        self.redis = redis
    
    async def check_rate_limit(
        self,
        key: str,
        max_requests: int,
        window_seconds: int,
    ) -> tuple[bool, int]:
        """
        Check if request is within rate limit.
        
        Returns:
            Tuple of (allowed, retry_after_seconds)
        """
        import time
        
        now = time.time()
        window_start = now - window_seconds
        
        pipe = self.redis.pipeline()
        
        # Remove old entries
        pipe.zremrangebyscore(key, "-inf", window_start)
        
        # Count current entries
        pipe.zcard(key)
        
        # Add current request
        pipe.zadd(key, {str(now): now})
        
        # Set expiry
        pipe.expire(key, window_seconds)
        
        results = await pipe.execute()
        current_count = results[1]
        
        if current_count >= max_requests:
            # Get oldest entry to calculate retry time
            oldest = await self.redis.zrange(key, 0, 0, withscores=True)
            if oldest:
                retry_after = int(oldest[0][1] + window_seconds - now)
                return False, max(retry_after, 1)
            return False, window_seconds
        
        return True, 0


# Rate limit configuration for WebSocket events
WS_RATE_LIMITS = {
    "bid:trump": (60, 60),          # 60 per minute
    "bid:pass": (60, 60),           # 60 per minute
    "bid:contract": (60, 60),       # 60 per minute
    "round:claim_trick": (60, 60),  # 60 per minute
    "room:join": (30, 60),          # 30 per minute
    "sync:request": (10, 60),       # 10 per minute
    "default": (100, 60),           # 100 per minute
}
```

---

## 10. Event Ordering & Race Conditions

### 10.1 Sequence Number System

```python
"""Event ordering and sequence management."""
from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from redis.asyncio import Redis

if TYPE_CHECKING:
    pass

logger = logging.getLogger(__name__)


class SequenceManager:
    """
    Manages event sequence numbers for ordering guarantees.
    
    Each room has an independent sequence counter that increments
    atomically for every event broadcasted to that room.
    """
    
    def __init__(self, redis: Redis) -> None:
        self.redis = redis
    
    async def get_next_seq(self, room_code: str) -> int:
        """
        Get the next sequence number for a room.
        
        Uses Redis INCR for atomic increment.
        """
        return await self.redis.incr(f"seq:room:{room_code}")
    
    async def get_current_seq(self, room_code: str) -> int:
        """Get the current sequence number without incrementing."""
        seq = await self.redis.get(f"seq:room:{room_code}")
        return int(seq) if seq else 0
    
    async def reset_seq(self, room_code: str) -> None:
        """Reset sequence number (used when room is deleted)."""
        await self.redis.delete(f"seq:room:{room_code}")
```

### 10.2 Turn-Based Locking

```python
"""Turn-based locking for bidding and game actions."""
from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from redis.asyncio import Redis

logger = logging.getLogger(__name__)


class TurnLock:
    """
    Distributed lock for turn-based actions.
    
    Ensures only one player can perform an action at a time,
    preventing race conditions in bidding and trick claiming.
    """
    
    LOCK_TTL = 5  # seconds
    
    def __init__(self, redis: Redis) -> None:
        self.redis = redis
    
    @asynccontextmanager
    async def acquire(
        self,
        room_code: str,
        action_type: str,
        player_id: str,
        expected_player_id: str | None = None,
    ) -> AsyncGenerator[bool, None]:
        """
        Acquire lock for a turn-based action.
        
        Args:
            room_code: The room where action is happening
            action_type: Type of action (e.g., "trump_bid", "contract_bid")
            player_id: ID of player attempting action
            expected_player_id: Expected current player (for turn validation)
            
        Yields:
            True if lock acquired, False otherwise
        """
        lock_key = f"lock:{room_code}:{action_type}"
        
        # Try to acquire lock
        acquired = await self.redis.set(
            lock_key,
            player_id,
            nx=True,  # Only set if not exists
            ex=self.LOCK_TTL,
        )
        
        if not acquired:
            # Lock held by someone else
            current_holder = await self.redis.get(lock_key)
            logger.debug(
                "Lock %s held by %s, %s cannot acquire",
                lock_key,
                current_holder,
                player_id,
            )
            yield False
            return
        
        try:
            # Validate it's the player's turn (if expected_player_id provided)
            if expected_player_id and player_id != expected_player_id:
                logger.debug(
                    "Turn mismatch: expected %s, got %s",
                    expected_player_id,
                    player_id,
                )
                yield False
                return
            
            yield True
            
        finally:
            # Release lock (only if we still hold it)
            current = await self.redis.get(lock_key)
            if current == player_id:
                await self.redis.delete(lock_key)


class ActionQueue:
    """
    Queue for ordering actions within a room.
    
    Used for actions that don't have strict turn order
    (like claiming tricks where any player can claim).
    """
    
    def __init__(self, redis: Redis) -> None:
        self.redis = redis
        self._locks: dict[str, asyncio.Lock] = {}
    
    def _get_lock(self, room_code: str) -> asyncio.Lock:
        """Get or create a lock for a room."""
        if room_code not in self._locks:
            self._locks[room_code] = asyncio.Lock()
        return self._locks[room_code]
    
    @asynccontextmanager
    async def serialize(
        self,
        room_code: str,
    ) -> AsyncGenerator[None, None]:
        """
        Serialize actions within a room.
        
        Uses local asyncio.Lock for single-node deployments.
        For multi-node, should use Redis-based lock.
        """
        lock = self._get_lock(room_code)
        
        async with lock:
            yield
```

### 10.3 Handling Concurrent Bids

```python
"""Handling concurrent bid attempts."""
from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any

from app.core.exceptions import NotYourTurnError
from app.websocket.ordering import TurnLock

if TYPE_CHECKING:
    from app.websocket.room_manager import RoomManager

logger = logging.getLogger(__name__)


@dataclass
class BidAttemptResult:
    """Result of attempting to place a bid."""
    
    success: bool
    error_message: str | None = None
    was_outbid: bool = False


class BidCoordinator:
    """
    Coordinates bid attempts to handle race conditions.
    
    Scenario: Two players try to bid at the same time.
    - Player A bids 6♥
    - Player B bids 6♠ (higher)
    - Only one should succeed based on server receipt order
    """
    
    def __init__(
        self,
        room_manager: RoomManager,
        turn_lock: TurnLock,
    ) -> None:
        self.room_manager = room_manager
        self.turn_lock = turn_lock
    
    async def attempt_trump_bid(
        self,
        room_code: str,
        player_id: str,
        amount: int,
        suit: str,
    ) -> BidAttemptResult:
        """
        Attempt to place a trump bid with race condition protection.
        
        Uses distributed lock to ensure only one bid is processed at a time.
        """
        # Get expected current bidder
        current_bidder = await self.room_manager.get_current_bidder(room_code)
        
        async with self.turn_lock.acquire(
            room_code=room_code,
            action_type="trump_bid",
            player_id=player_id,
            expected_player_id=current_bidder,
        ) as acquired:
            if not acquired:
                # Check if it's actually not their turn
                actual_current = await self.room_manager.get_current_bidder(
                    room_code
                )
                if actual_current != player_id:
                    raise NotYourTurnError(actual_current)
                
                # Race condition - another request in progress
                return BidAttemptResult(
                    success=False,
                    error_message="Another action is being processed",
                )
            
            # We have the lock - proceed with bid
            # Re-validate state since it might have changed
            current_state = await self.room_manager.get_bidding_state(room_code)
            
            # Validate bid is still valid
            if not self._is_valid_bid(amount, suit, current_state):
                return BidAttemptResult(
                    success=False,
                    error_message="Bid is no longer valid",
                    was_outbid=True,
                )
            
            # Place the bid
            await self.room_manager.record_trump_bid(
                room_code=room_code,
                player_id=player_id,
                amount=amount,
                suit=suit,
            )
            
            return BidAttemptResult(success=True)
    
    def _is_valid_bid(
        self,
        amount: int,
        suit: str,
        state: dict[str, Any],
    ) -> bool:
        """Check if bid is still valid given current state."""
        min_bid = state.get("minimum_bid", 5)
        highest = state.get("highest_bid")
        
        if amount < min_bid:
            return False
        
        if highest:
            if amount < highest["amount"]:
                return False
            if amount == highest["amount"]:
                suit_order = [
                    "clubs", "diamonds", "hearts", "spades", "no_trump"
                ]
                if suit_order.index(suit) <= suit_order.index(highest["suit"]):
                    return False
        
        return True
```

### 10.4 Client-Side Sequence Handling

Client should track sequence numbers and request sync if gaps are detected:

```typescript
// Client-side sequence tracking (TypeScript pseudocode)
interface EventEnvelope<T> {
  event: string;
  data: T;
  seq: number;
  room_code: string | null;
}

class EventHandler {
  private lastSeq: number = 0;
  private pendingEvents: Map<number, EventEnvelope<unknown>> = new Map();
  
  handleEvent<T>(envelope: EventEnvelope<T>): void {
    const { seq } = envelope;
    
    // Check for gap
    if (seq > this.lastSeq + 1) {
      console.warn(`Sequence gap detected: expected ${this.lastSeq + 1}, got ${seq}`);
      
      // Buffer this event
      this.pendingEvents.set(seq, envelope);
      
      // Request missing events
      this.requestSync(this.lastSeq);
      return;
    }
    
    // Process event
    this.processEvent(envelope);
    this.lastSeq = seq;
    
    // Process any buffered events
    this.processPendingEvents();
  }
  
  private processPendingEvents(): void {
    while (this.pendingEvents.has(this.lastSeq + 1)) {
      const next = this.pendingEvents.get(this.lastSeq + 1)!;
      this.pendingEvents.delete(this.lastSeq + 1);
      this.processEvent(next);
      this.lastSeq = next.seq;
    }
  }
  
  private requestSync(lastSeq: number): void {
    socket.emit('sync:request', { 
      room_code: this.roomCode,
      last_seq: lastSeq 
    });
  }
}
```

---

## 11. Testing Strategy

### 11.1 Unit Tests for Event Handlers

```python
"""Tests for WebSocket event handlers."""
from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock

import pytest

from app.websocket.context import ConnectionContext
from app.websocket.handlers.room import RoomJoinHandler
from app.websocket.schemas.client import RoomJoinPayload


@pytest.fixture
def mock_room_manager() -> AsyncMock:
    """Create mock room manager."""
    manager = AsyncMock()
    return manager


@pytest.fixture
def mock_context() -> ConnectionContext:
    """Create mock connection context."""
    sio = AsyncMock()
    return ConnectionContext(
        sio=sio,
        socket_id="test_socket_id",
        user_id="test_user_id",
        display_name="Test User",
        is_authenticated=True,
    )


class TestRoomJoinHandler:
    """Tests for room:join event handler."""
    
    @pytest.mark.asyncio
    async def test_successful_join(
        self,
        mock_room_manager: AsyncMock,
        mock_context: ConnectionContext,
    ) -> None:
        """Test successful room join."""
        # Setup
        from app.websocket.schemas.common import PlayerInfo
        
        mock_room_manager.join_room.return_value = MagicMock(
            game_id="game_123",
            seat_position=1,
            is_admin=False,
            players=[
                PlayerInfo(
                    user_id="admin_id",
                    display_name="Admin",
                    seat_position=0,
                    is_admin=True,
                ),
                PlayerInfo(
                    user_id="test_user_id",
                    display_name="Test User",
                    seat_position=1,
                    is_admin=False,
                ),
            ],
            player_info=PlayerInfo(
                user_id="test_user_id",
                display_name="Test User",
                seat_position=1,
                is_admin=False,
            ),
            phase="waiting",
            current_round=None,
        )
        
        handler = RoomJoinHandler(mock_room_manager)
        payload_data = {"room_code": "ABC123"}
        
        # Execute
        await handler(mock_context, payload_data)
        
        # Verify
        mock_room_manager.join_room.assert_called_once_with(
            room_code="ABC123",
            user_id="test_user_id",
            display_name="Test User",
            socket_id="test_socket_id",
        )
        
        # Check that room:joined was emitted
        mock_context.sio.emit.assert_called()
    
    @pytest.mark.asyncio
    async def test_join_full_room(
        self,
        mock_room_manager: AsyncMock,
        mock_context: ConnectionContext,
    ) -> None:
        """Test joining a full room raises error."""
        from app.core.exceptions import RoomFullError
        
        mock_room_manager.join_room.side_effect = RoomFullError()
        
        handler = RoomJoinHandler(mock_room_manager)
        payload_data = {"room_code": "ABC123"}
        
        # Execute - should send error event
        await handler(mock_context, payload_data)
        
        # Verify error was emitted
        calls = mock_context.sio.emit.call_args_list
        error_call = next(c for c in calls if c[0][0] == "error")
        assert "ROOM_FULL" in str(error_call)
```

### 11.2 Integration Tests

```python
"""Integration tests for WebSocket functionality."""
from __future__ import annotations

import asyncio

import pytest
import socketio
from httpx import AsyncClient


@pytest.fixture
async def socket_client() -> socketio.AsyncClient:
    """Create Socket.IO test client."""
    client = socketio.AsyncClient()
    yield client
    if client.connected:
        await client.disconnect()


@pytest.mark.asyncio
class TestRoomFlow:
    """Integration tests for room lifecycle."""
    
    async def test_create_and_join_room(
        self,
        socket_client: socketio.AsyncClient,
        auth_token: str,
    ) -> None:
        """Test creating a room and another player joining."""
        received_events: list[tuple[str, dict]] = []
        
        @socket_client.on("*")
        async def catch_all(event: str, data: dict) -> None:
            received_events.append((event, data))
        
        # Connect
        await socket_client.connect(
            "http://localhost:8000",
            socketio_path="/ws/socket.io",
            auth={"token": auth_token},
        )
        
        # Create room via REST API first, then join via WebSocket
        await socket_client.emit(
            "room:join",
            {"room_code": "TEST01"},
        )
        
        # Wait for response
        await asyncio.sleep(0.5)
        
        # Check we received room:joined event
        joined_events = [e for e in received_events if e[0] == "room:joined"]
        assert len(joined_events) == 1
        
        join_data = joined_events[0][1]
        assert join_data["room_code"] == "TEST01"
        assert "your_seat" in join_data
```

### 11.3 Load Testing Considerations

```python
"""Load test configuration for WebSocket events."""
# Use locust or similar for load testing

# Key metrics to measure:
# - Event latency (time from client send to broadcast receipt)
# - Connection handling (connections per second)
# - Memory usage under load
# - Redis operation latency

LOAD_TEST_SCENARIOS = {
    "steady_state": {
        "concurrent_rooms": 100,
        "players_per_room": 4,
        "events_per_second": 2,  # Per room
        "duration_minutes": 10,
    },
    "burst": {
        "concurrent_rooms": 500,
        "players_per_room": 4,
        "events_per_second": 10,  # Per room
        "duration_minutes": 2,
    },
    "reconnection_storm": {
        "concurrent_rooms": 50,
        "disconnect_percentage": 50,
        "reconnect_within_seconds": 5,
        "cycles": 10,
    },
}
```

---

## Event Summary Table

| Event | Direction | Payload | Auth | Room | Admin | Description |
|-------|-----------|---------|------|------|-------|-------------|
| `room:join` | C→S | `RoomJoinPayload` | ✓ | - | - | Join a room |
| `room:leave` | C→S | `RoomLeavePayload` | ✓ | ✓ | - | Leave current room |
| `room:update_seating` | C→S | `RoomUpdateSeatingPayload` | ✓ | ✓ | ✓ | Change seat order |
| `game:start` | C→S | `GameStartPayload` | ✓ | ✓ | ✓ | Start the game |
| `game:new_round` | C→S | `GameNewRoundPayload` | ✓ | ✓ | ✓ | Start next round |
| `game:end` | C→S | `GameEndPayload` | ✓ | ✓ | ✓ | End the game |
| `bid:trump` | C→S | `BidTrumpPayload` | ✓ | ✓ | - | Place trump bid |
| `bid:pass` | C→S | `BidPassPayload` | ✓ | ✓ | - | Pass on trump |
| `bid:contract` | C→S | `BidContractPayload` | ✓ | ✓ | - | Place contract bid |
| `round:claim_trick` | C→S | `RoundClaimTrickPayload` | ✓ | ✓ | - | Claim a trick |
| `round:undo_trick` | C→S | `RoundUndoTrickPayload` | ✓ | ✓ | ✓ | Undo last trick |
| `sync:request` | C→S | `SyncRequestPayload` | ✓ | ✓ | - | Request state sync |
| `room:joined` | S→C | `RoomJoinedPayload` | - | - | - | Join confirmation |
| `room:player_joined` | S→R | `RoomPlayerJoinedPayload` | - | - | - | Player joined |
| `room:player_left` | S→R | `RoomPlayerLeftPayload` | - | - | - | Player left |
| `room:player_disconnected` | S→R | `RoomPlayerDisconnectedPayload` | - | - | - | Player disconnected |
| `room:player_reconnected` | S→R | `RoomPlayerReconnectedPayload` | - | - | - | Player reconnected |
| `game:started` | S→R | `GameStartedPayload` | - | - | - | Game started |
| `game:phase_changed` | S→R | `GamePhaseChangedPayload` | - | - | - | Phase transition |
| `game:ended` | S→R | `GameEndedPayload` | - | - | - | Game ended |
| `bid:placed` | S→R | `BidPlacedPayload` | - | - | - | Bid placed |
| `bid:passed` | S→R | `BidPassedPayload` | - | - | - | Player passed |
| `bid:your_turn` | S→C | `BidYourTurnPayload` | - | - | - | Your turn to bid |
| `bid:trump_set` | S→R | `BidTrumpSetPayload` | - | - | - | Trump determined |
| `bid:frisch_started` | S→R | `BidFrischStartedPayload` | - | - | - | Frisch started |
| `bid:contracts_set` | S→R | `BidContractsSetPayload` | - | - | - | All contracts set |
| `round:started` | S→R | `RoundStartedPayload` | - | - | - | Round play starts |
| `round:trick_won` | S→R | `RoundTrickWonPayload` | - | - | - | Trick claimed |
| `round:complete` | S→R | `RoundCompletePayload` | - | - | - | Round complete |
| `sync:state` | S→C | `SyncStatePayload` | - | - | - | Full state sync |
| `error` | S→C | `ErrorPayload` | - | - | - | Error notification |

**Legend:**
- C→S: Client to Server
- S→C: Server to specific Client
- S→R: Server to Room (broadcast)

---

## Document History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | January 2026 | Tech Lead | Initial WebSocket Events LLD |

---

*This document specifies the complete WebSocket event system for the Whist Score Keeper platform. All code examples use python-socketio patterns with Pydantic v2 schemas and must pass `ruff` and `mypy --strict` validation.*
