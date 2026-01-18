"""Room-related schemas."""
from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

GameStatus = Literal[
    "waiting",
    "bidding_trump",
    "frisch",
    "bidding_contract",
    "playing",
    "round_complete",
    "finished",
]


class PlayerInRoom(BaseModel):
    """Player information within a room."""

    user_id: UUID
    display_name: str
    seat_position: int = Field(ge=0, le=3)
    is_admin: bool = False
    is_connected: bool = True
    avatar_url: str | None = None

    model_config = ConfigDict(from_attributes=True)


class CreateRoomRequest(BaseModel):
    """Room creation request."""

    group_id: UUID | None = None


class CreateRoomResponse(BaseModel):
    """Room creation response."""

    room_code: str
    game_id: UUID
    admin_id: UUID
    status: GameStatus = "waiting"
    ws_endpoint: str


class RoomState(BaseModel):
    """Current room state."""

    room_code: str
    game_id: UUID
    admin_id: UUID
    status: GameStatus
    players: list[PlayerInRoom]
    created_at: datetime
    current_round: int | None = None

    model_config = ConfigDict(from_attributes=True)


class JoinRoomRequest(BaseModel):
    """Room join request."""

    display_name: str | None = Field(default=None, max_length=64)


class JoinRoomResponse(BaseModel):
    """Room join response."""

    room: RoomState
    your_seat: int
    ws_endpoint: str


class UpdateSeatingRequest(BaseModel):
    """Update seating arrangement request (admin only)."""

    positions: list[UUID] = Field(min_length=4, max_length=4)


class StartGameResponse(BaseModel):
    """Start game response."""

    game_id: UUID
    status: GameStatus
    current_round: int
    first_bidder_id: UUID
    message: str = "Game started"
