"""Group-related schemas."""
from datetime import datetime
from enum import Enum
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field  # type: ignore[attr-defined]


class GroupRole(str, Enum):
    """Group member role enumeration."""

    OWNER = "owner"
    MEMBER = "member"


# ============================================================================
# GROUP MANAGEMENT SCHEMAS
# ============================================================================


class CreateGroupRequest(BaseModel):
    """Request to create a new group."""

    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=100)
    description: str | None = Field(default=None, max_length=500)


class GroupMember(BaseModel):
    """Group member information."""

    user_id: UUID
    display_name: str
    role: GroupRole
    joined_at: datetime


class GroupDetails(BaseModel):
    """Detailed group information."""

    group_id: UUID
    name: str
    description: str | None
    created_by: UUID
    created_by_name: str
    total_games: int
    total_rounds: int
    member_count: int
    members: list[GroupMember]
    created_at: datetime
    updated_at: datetime


class GroupResponse(BaseModel):
    """Basic group response."""

    group_id: UUID
    name: str
    description: str | None
    member_count: int
    created_at: datetime


class CreateGroupResponse(BaseModel):
    """Response after creating a group."""

    group_id: UUID
    name: str
    message: str = "Group created successfully"


class AddMemberRequest(BaseModel):
    """Request to add a member to a group."""

    model_config = ConfigDict(extra="forbid")

    user_id: UUID


class AddMemberResponse(BaseModel):
    """Response after adding a member."""

    group_id: UUID
    user_id: UUID
    display_name: str
    role: GroupRole
    message: str = "Member added successfully"


class RemoveMemberResponse(BaseModel):
    """Response after removing a member."""

    group_id: UUID
    user_id: UUID
    message: str = "Member removed successfully"


class ListGroupsResponse(BaseModel):
    """Response for listing groups."""

    groups: list[GroupResponse]
    total_count: int


# ============================================================================
# ANALYTICS SCHEMAS
# ============================================================================


class PlayerStats(BaseModel):
    """Player statistics."""

    user_id: UUID
    display_name: str
    total_games: int
    total_rounds: int
    wins: int
    losses: int
    win_rate: float
    average_score: float
    average_round_score: float
    total_made_contracts: int
    total_failed_contracts: int
    contract_success_rate: float
    zero_bid_made: int
    zero_bid_failed: int
    zero_bid_success_rate: float
    trump_win_count: int
    current_streak: int
    best_streak: int
    highest_round_score: int
    lowest_round_score: int
    updated_at: datetime


class GroupStats(BaseModel):
    """Group statistics."""

    group_id: UUID
    name: str
    total_games: int
    total_rounds: int
    member_count: int
    average_game_score: float
    average_round_score: float
    most_active_member: str | None
    created_at: datetime
    updated_at: datetime


class GroupLeaderboard(BaseModel):
    """Group leaderboard entry."""

    rank: int = Field(ge=1)
    user_id: UUID
    display_name: str
    total_score: int
    average_round_score: float
    win_count: int
    game_count: int


class GroupLeaderboardResponse(BaseModel):
    """Response for group leaderboard."""

    group_id: UUID
    group_name: str
    leaderboard: list[GroupLeaderboard]
    generated_at: datetime


class HeadToHeadStats(BaseModel):
    """Head-to-head statistics between two players."""

    player1_id: UUID
    player1_name: str
    player2_id: UUID
    player2_name: str
    player1_wins: int
    player2_wins: int
    total_games: int
    player1_average_score: float
    player2_average_score: float
    player1_win_rate: float
    player2_win_rate: float


class GameResult(BaseModel):
    """Result from a single game."""

    game_id: UUID
    round_number: int
    trump_suit: str
    game_type: str
    player_contract: int
    player_tricks_won: int
    player_score: int
    played_at: datetime


class PlayerGameHistory(BaseModel):
    """Player's game history."""

    user_id: UUID
    display_name: str
    total_games: int
    games: list[GameResult]
