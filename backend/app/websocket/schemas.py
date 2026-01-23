"""WebSocket event schemas and payloads."""
from datetime import datetime
from enum import Enum
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.game import GameType, TrumpSuit


class GamePhase(str, Enum):
    """Game phase enumeration."""

    WAITING = "waiting"
    BIDDING_TRUMP = "bidding_trump"
    FRISCH = "frisch"
    BIDDING_CONTRACT = "bidding_contract"
    PLAYING = "playing"
    ROUND_COMPLETE = "round_complete"
    FINISHED = "finished"


class BasePayload(BaseModel):
    """Base payload for all WebSocket events."""

    model_config = ConfigDict(extra="forbid")

    def to_dict(self) -> dict:
        """Convert to dict with datetime objects serialized to ISO strings."""
        data = self.model_dump()
        return _serialize_datetimes(data)


def _serialize_datetimes(obj: dict | list | object) -> dict | list | object:
    """Recursively serialize datetime objects to ISO strings."""
    if isinstance(obj, dict):
        return {k: _serialize_datetimes(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [_serialize_datetimes(item) for item in obj]
    elif isinstance(obj, datetime):
        return obj.isoformat()
    return obj


class TimestampedPayload(BasePayload):
    """Payload with timestamp."""

    timestamp: datetime = Field(default_factory=datetime.utcnow)


class PlayerInfo(TimestampedPayload):
    """Player information in a room."""

    user_id: str
    display_name: str
    seat_position: int = Field(ge=0, le=3)
    is_admin: bool = False
    is_connected: bool = True
    avatar_url: str | None = None


# Client → Server Payloads

class RoomJoinPayload(BasePayload):
    """Payload for room:join event (client to server)."""

    room_code: str = Field(min_length=6, max_length=6)
    display_name: str | None = Field(default=None, max_length=64)


class RoomLeavePayload(BasePayload):
    """Payload for room:leave event (client to server)."""

    room_code: str = Field(min_length=6, max_length=6)


class SyncRequestPayload(BasePayload):
    """Payload for sync:request event (client to server)."""

    room_code: str = Field(min_length=6, max_length=6)


# Server → Client (Single) Payloads

class RoomJoinedPayload(TimestampedPayload):
    """Payload for room:joined event (server to joining player)."""

    room_code: str
    game_id: str
    your_seat: int = Field(ge=0, le=3)
    is_admin: bool
    players: list[PlayerInfo]
    phase: GamePhase
    current_round: int | None = None


class RoomLeftPayload(TimestampedPayload):
    """Payload for room:left event (server to leaving player)."""

    room_code: str
    reason: Literal["voluntary", "kicked", "room_closed"] = "voluntary"


class BidYourTurnPayload(TimestampedPayload):
    """Payload for bid:your_turn event (server to player)."""

    round_number: int
    minimum_bid: int
    time_limit_seconds: int = 30


class SyncStatePayload(TimestampedPayload):
    """Payload for sync:state event (server to client)."""

    room_code: str
    game_id: str
    phase: GamePhase
    players: list[PlayerInfo]
    current_round: int | None = None
    current_bidder: str | None = None
    additional_data: dict[str, Any] = Field(default_factory=dict)


# Server → Room (Broadcast) Payloads

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
    """Payload for room:player_disconnected event (broadcast to room)."""

    player_id: str
    player_name: str
    grace_period_seconds: int = 60


class RoomPlayerReconnectedPayload(TimestampedPayload):
    """Payload for room:player_reconnected event (broadcast to room)."""

    player_id: str
    player_name: str


class GameStartedPayload(TimestampedPayload):
    """Payload for game:started event (broadcast to room)."""

    game_id: str
    phase: GamePhase
    current_round: int
    first_bidder_id: str
    players: list[PlayerInfo]


class GameStartingPlayerInfo(BaseModel):
    """Simplified player info for game starting event."""

    user_id: str
    seat_position: int


class RoomGameStartingPayload(TimestampedPayload):
    """Payload for room:game_starting event (broadcast to room)."""

    game_id: str
    players: list[GameStartingPlayerInfo]


# Error Payloads

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

    # Validation errors
    INVALID_PAYLOAD = "WS_VAL_001"
    MISSING_REQUIRED_FIELD = "WS_VAL_002"
    INVALID_BID_AMOUNT = "WS_VAL_003"
    BID_TOO_LOW = "WS_VAL_004"

    # Round/trick errors
    ROUND_NOT_STARTED = "WS_ROUND_001"
    TRICKS_COMPLETE = "WS_ROUND_002"
    NO_TRICKS_TO_UNDO = "WS_ROUND_003"

    # Rate limiting
    RATE_LIMITED = "WS_RATE_001"

    # Internal errors
    INTERNAL_ERROR = "WS_INT_001"


# ============================================================================
# BIDDING PAYLOADS
# ============================================================================


# Client → Server Payloads
class BidTrumpPayload(BasePayload):
    """Payload for bid:trump event (client to server)."""

    room_code: str = Field(min_length=6, max_length=6)
    amount: int = Field(ge=5, le=13)
    suit: TrumpSuit


class BidPassPayload(BasePayload):
    """Payload for bid:pass event (client to server)."""

    room_code: str = Field(min_length=6, max_length=6)


class BidContractPayload(BasePayload):
    """Payload for bid:contract event (client to server)."""

    room_code: str = Field(min_length=6, max_length=6)
    amount: int = Field(ge=0, le=13)


# Server → Client (Broadcast) Payloads
class BidInfo(BaseModel):
    """Bid information for display."""

    player_id: str
    player_name: str
    amount: int
    suit: TrumpSuit | None = None
    is_pass: bool = False
    timestamp: datetime | None = None


class BidPlacedPayload(TimestampedPayload):
    """Payload for bid:placed event (broadcast)."""

    bid: BidInfo
    is_highest: bool
    next_bidder_id: str | None = None
    next_bidder_name: str | None = None
    next_bidder_seat: int | None = None
    consecutive_passes: int


class BidPassedPayload(TimestampedPayload):
    """Payload for bid:passed event (broadcast)."""

    player_id: str
    player_name: str
    consecutive_passes: int
    next_bidder_id: str | None = None
    next_bidder_name: str | None = None
    next_bidder_seat: int | None = None


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
    message: str = "Frisch triggered - cards will be exchanged"


class ContractInfo(BaseModel):
    """Contract bid information."""

    player_id: str
    player_name: str
    seat_position: int
    amount: int


class BidContractsSetPayload(TimestampedPayload):
    """Payload for bid:contracts_set event (broadcast)."""

    contracts: list[ContractInfo]
    total_contracts: int
    game_type: GameType
    first_player_id: str
    first_player_name: str


class BidPhaseYourTurnPayload(TimestampedPayload):
    """Payload for bid:your_turn event during bidding phase (sent to specific player)."""

    phase: Literal["trump_bidding", "contract_bidding"]
    minimum_bid: int | None = None  # For trump_bidding
    current_highest: BidInfo | None = None  # For trump_bidding
    forbidden_amount: int | None = None  # For contract_bidding (last bidder)
    current_contract_sum: int | None = None  # For contract_bidding
    is_last_bidder: bool = False
    is_trump_winner: bool = False
    trump_winning_bid: int | None = None


# ============================================================================
# TRICK EVENT PAYLOADS
# ============================================================================


# Client → Server Payloads
class RoundClaimTrickPayload(BasePayload):
    """Payload for round:claim_trick event."""

    room_code: str = Field(min_length=6, max_length=6)


class RoundUndoTrickPayload(BasePayload):
    """Payload for round:undo_trick event (admin only)."""

    room_code: str = Field(min_length=6, max_length=6)
    player_id: str = Field(description="Player whose trick to undo")


# Server → Client (Broadcast) Payloads
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


class CumulativeScoreInfo(BaseModel):
    """Cumulative score for a player."""

    player_id: str
    player_name: str
    round_score: int
    total_score: int
    position: int = Field(ge=1, le=4)


class RoundCompletePayload(TimestampedPayload):
    """Payload for round:complete event (broadcast)."""

    round_number: int
    trump_suit: TrumpSuit
    game_type: GameType
    players: list[ContractInfo]  # Includes tricks won and scores
    cumulative_scores: list[CumulativeScoreInfo]


class ErrorPayload(TimestampedPayload):
    """Error notification from server."""

    code: str = Field(description="Error code")
    message: str = Field(description="Human-readable error message")
    details: dict[str, str] | None = Field(
        default=None,
        description="Additional error details",
    )
    recoverable: bool = Field(
        default=True,
        description="Whether client can recover and retry",
    )


# Event constants

class ClientEvents:
    """Events sent from client to server."""

    ROOM_JOIN: str = "room:join"
    ROOM_LEAVE: str = "room:leave"
    SYNC_REQUEST: str = "sync:request"
    BID_TRUMP: str = "bid:trump"
    BID_PASS: str = "bid:pass"
    BID_CONTRACT: str = "bid:contract"
    ROUND_CLAIM_TRICK: str = "round:claim_trick"
    ROUND_UNDO_TRICK: str = "round:undo_trick"


class ServerEvents:
    """Events sent from server to client(s)."""

    # Connection status
    ROOM_JOINED: str = "room:joined"
    ROOM_LEFT: str = "room:left"
    ROOM_PLAYER_JOINED: str = "room:player_joined"
    ROOM_PLAYER_LEFT: str = "room:player_left"
    ROOM_PLAYER_DISCONNECTED: str = "room:player_disconnected"
    ROOM_PLAYER_RECONNECTED: str = "room:player_reconnected"

    # Game events
    GAME_STARTED: str = "game:started"
    ROOM_GAME_STARTING: str = "room:game_starting"

    # Bidding events
    BID_YOUR_TURN: str = "bid:your_turn"
    BID_PLACED: str = "bid:placed"
    BID_PASSED: str = "bid:passed"
    BID_TRUMP_SET: str = "bid:trump_set"
    BID_FRISCH_STARTED: str = "bid:frisch_started"
    BID_CONTRACTS_SET: str = "bid:contracts_set"

    # Round/trick events
    ROUND_TRICK_WON: str = "round:trick_won"
    ROUND_TRICK_UNDONE: str = "round:trick_undone"
    ROUND_COMPLETE: str = "round:complete"

    # State sync
    SYNC_STATE: str = "sync:state"

    # Errors
    ERROR: str = "error"
