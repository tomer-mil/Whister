"""Score table response schemas."""
from pydantic import BaseModel, Field

from app.schemas.game import GameType, TrumpSuit


class PlayerRoundScore(BaseModel):
    """Player's score for a single round."""

    user_id: str = Field(description="Player user ID")
    display_name: str = Field(description="Player display name")
    seat_position: int = Field(ge=0, le=3, description="Seat position (0-3)")
    contract_bid: int = Field(ge=0, le=13, description="Contract bid amount")
    tricks_won: int = Field(ge=0, le=13, description="Tricks won")
    score: int = Field(description="Score for this round")
    made_contract: bool = Field(description="Whether contract was made")


class RoundScore(BaseModel):
    """Complete round with all player scores."""

    round_number: int = Field(ge=1, description="Round number")
    trump_suit: TrumpSuit = Field(description="Trump suit")
    game_type: GameType = Field(description="Game type")
    players: list[PlayerRoundScore] = Field(description="Player scores for this round")


class PlayerInfo(BaseModel):
    """Basic player information."""

    user_id: str = Field(description="Player user ID")
    display_name: str = Field(description="Player display name")
    seat_position: int = Field(ge=0, le=3, description="Seat position (0-3)")


class ScoreTableResponse(BaseModel):
    """Complete score table for a game."""

    game_id: str = Field(description="Game UUID")
    room_code: str = Field(description="6-character room code")
    current_round: int = Field(description="Current round number")
    rounds: list[RoundScore] = Field(description="All completed rounds")
    cumulative_scores: dict[str, int] = Field(description="Total scores by user_id")
    players: list[PlayerInfo] = Field(description="Player info ordered by seat")


class EndGameResponse(BaseModel):
    """Response after ending a game."""

    game_id: str = Field(description="Game UUID")
    ended_at: str = Field(description="ISO 8601 datetime string")
    winner_id: str | None = Field(description="Winner's user ID, null if tie")
    final_scores: dict[str, int] = Field(description="Final scores by user_id")
