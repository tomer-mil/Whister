"""Game-related schemas."""
from datetime import datetime
from enum import Enum
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class TrumpSuit(str, Enum):
    """Trump suit enumeration."""

    CLUBS = "clubs"
    DIAMONDS = "diamonds"
    HEARTS = "hearts"
    SPADES = "spades"
    NO_TRUMP = "no_trump"


class GameType(str, Enum):
    """Game type enumeration."""

    OVER = "over"
    UNDER = "under"


class RoundPhase(str, Enum):
    """Round phase enumeration."""

    TRUMP_BIDDING = "trump_bidding"
    FRISCH = "frisch"
    CONTRACT_BIDDING = "contract_bidding"
    PLAYING = "playing"
    COMPLETE = "complete"


class GameStatus(str, Enum):
    """Game status enumeration."""

    WAITING = "waiting"
    BIDDING_TRUMP = "bidding_trump"
    BIDDING_CONTRACT = "bidding_contract"
    PLAYING = "playing"
    ROUND_COMPLETE = "round_complete"
    FINISHED = "finished"


# ============================================================================
# TRUMP BIDDING SCHEMAS
# ============================================================================


class TrumpBidRequest(BaseModel):
    """Trump bid request."""

    model_config = ConfigDict(extra="forbid")

    suit: TrumpSuit
    amount: int = Field(ge=5, le=13)


class BidInfo(BaseModel):
    """Bid information for display."""

    player_id: str
    player_name: str
    amount: int
    suit: TrumpSuit | None = None
    is_pass: bool = False
    timestamp: datetime | None = None


class TrumpBidResponse(BaseModel):
    """Trump bid response."""

    bid_id: UUID
    player_id: UUID
    player_name: str
    suit: TrumpSuit
    amount: int
    timestamp: datetime
    is_highest: bool


class PassResponse(BaseModel):
    """Pass response."""

    player_id: UUID
    player_name: str
    consecutive_passes: int
    timestamp: datetime


class FrischStartedResponse(BaseModel):
    """Frisch round started."""

    frisch_number: int = Field(ge=1, le=3)
    new_minimum_bid: int
    message: str = "Frisch triggered - cards will be exchanged"


class TrumpSetResponse(BaseModel):
    """Trump suit has been set."""

    trump_suit: TrumpSuit
    winner_id: UUID
    winner_name: str
    winning_bid: int
    frisch_count: int
    message: str = "Trump suit has been set"


# ============================================================================
# CONTRACT BIDDING SCHEMAS
# ============================================================================


class ContractBidRequest(BaseModel):
    """Contract bid request."""

    model_config = ConfigDict(extra="forbid")

    amount: int = Field(ge=0, le=13)


class ContractInfo(BaseModel):
    """Contract bid information."""

    player_id: str
    player_name: str
    seat_position: int
    amount: int


class ContractBidResponse(BaseModel):
    """Contract bid response."""

    player_id: UUID
    player_name: str
    seat_position: int
    amount: int
    timestamp: datetime


class ContractsSetResponse(BaseModel):
    """All contracts have been set."""

    contracts: list[ContractBidResponse]
    total_contracts: int
    game_type: GameType
    message: str = "All contracts have been set"


# ============================================================================
# BIDDING STATE
# ============================================================================


class RoundPlayerBiddingState(BaseModel):
    """Player state during bidding."""

    user_id: str
    display_name: str
    seat_position: int
    trump_bid: int | None = None
    trump_suit: TrumpSuit | None = None
    has_passed_trump: bool = False
    contract_bid: int | None = None
    is_trump_winner: bool = False


class BiddingState(BaseModel):
    """Current bidding state for a round."""

    round_number: int
    phase: RoundPhase
    trump_suit: TrumpSuit | None = None
    trump_winner_id: str | None = None
    trump_winner_name: str | None = None
    trump_winning_bid: int | None = None
    game_type: GameType | None = None
    minimum_bid: int = 5
    frisch_count: int = 0
    current_bidder_id: str | None = None
    current_bidder_seat: int | None = None
    highest_bid: BidInfo | None = None
    consecutive_passes: int = 0
    players: list[RoundPlayerBiddingState]
    total_tricks_played: int = 0
    timestamp: datetime = Field(default_factory=datetime.utcnow)


# ============================================================================
# TRICK & SCORING SCHEMAS
# ============================================================================


class RoundPlayerResult(BaseModel):
    """Player result for a completed round."""

    user_id: str
    display_name: str
    seat_position: int
    contract_bid: int
    tricks_won: int
    made_contract: bool
    round_score: int


class RoundScores(BaseModel):
    """Scores for all players after a round."""

    round_number: int
    trump_suit: TrumpSuit
    game_type: GameType
    players: list[RoundPlayerResult]
    total_tricks_played: int


class TrickClaimedResponse(BaseModel):
    """Response when a trick is claimed."""

    player_id: str
    player_name: str
    tricks_won: int
    contract_bid: int
    total_tricks_played: int
    remaining_tricks: int


class RoundCompleteResponse(BaseModel):
    """Response when round is complete."""

    round_number: int
    trump_suit: TrumpSuit
    game_type: GameType
    players: list[RoundPlayerResult]
    total_tricks_played: int


class UndoTrickRequest(BaseModel):
    """Request to undo a trick (admin only)."""

    player_id: str


# ============================================================================
# VALIDATION HELPER SCHEMAS
# ============================================================================


class TrumpBidValidationResult(BaseModel):
    """Result of trump bid validation."""

    is_valid: bool
    error_message: str | None = None


class ContractBidValidationResult(BaseModel):
    """Result of contract bid validation."""

    is_valid: bool
    error_message: str | None = None
