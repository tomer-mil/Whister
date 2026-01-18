"""User-related schemas."""
from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, HttpUrl


class UserResponse(BaseModel):
    """User profile response schema."""

    id: UUID
    username: str
    display_name: str
    email: str
    avatar_url: HttpUrl | None = None
    created_at: datetime
    last_active: datetime
    is_active: bool = True

    model_config = ConfigDict(from_attributes=True)


class UserUpdateRequest(BaseModel):
    """User profile update request schema."""

    display_name: str | None = Field(default=None, max_length=64)
    avatar_url: HttpUrl | None = None


class PlayerStats(BaseModel):
    """Player statistics schema."""

    total_games: int = 0
    total_rounds: int = 0
    total_wins: int = 0
    win_rate: float = 0.0
    average_score: float = 0.0
    highest_score: int = 0
    lowest_score: int = 0
    contracts_made: int = 0
    contracts_failed: int = 0
    contract_success_rate: float = 0.0
    zeros_made: int = 0
    zeros_failed: int = 0
    zero_success_rate: float = 0.0

    model_config = ConfigDict(from_attributes=True)


class GameHistoryEntry(BaseModel):
    """Individual game history entry."""

    game_id: UUID
    room_code: str
    played_at: datetime
    final_score: int
    position: int
    rounds_played: int
    players: list[str]


class GameHistoryResponse(BaseModel):
    """Paginated game history response."""

    games: list[GameHistoryEntry]
    total: int
    page: int
    page_size: int
    has_more: bool
