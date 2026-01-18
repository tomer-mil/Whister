"""Error schemas and codes."""
from enum import Enum

from pydantic import BaseModel, Field


class ErrorCode(str, Enum):
    """Application error codes."""

    # Authentication errors (1xxx)
    INVALID_CREDENTIALS = "AUTH_1001"
    TOKEN_EXPIRED = "AUTH_1002"
    TOKEN_INVALID = "AUTH_1003"
    TOKEN_TYPE_INVALID = "AUTH_1004"
    USER_NOT_FOUND = "AUTH_1005"
    USER_INACTIVE = "AUTH_1006"
    USER_ALREADY_EXISTS = "AUTH_1007"
    EMAIL_ALREADY_EXISTS = "AUTH_1008"

    # Authorization errors (2xxx)
    PERMISSION_DENIED = "AUTHZ_2001"
    NOT_ROOM_ADMIN = "AUTHZ_2002"
    NOT_ROOM_PLAYER = "AUTHZ_2003"
    NOT_YOUR_TURN = "AUTHZ_2004"

    # Validation errors (3xxx)
    VALIDATION_ERROR = "VAL_3001"
    INVALID_BID_AMOUNT = "VAL_3002"
    INVALID_BID_SUIT = "VAL_3003"
    BID_TOO_LOW = "VAL_3004"
    MUST_BID_HIGHER = "VAL_3005"
    CANNOT_MAKE_SUM_13 = "VAL_3006"
    CONTRACT_BID_TOO_LOW = "VAL_3007"

    # Room errors (4xxx)
    ROOM_NOT_FOUND = "ROOM_4001"
    ROOM_FULL = "ROOM_4002"
    ROOM_ALREADY_STARTED = "ROOM_4003"
    ROOM_NOT_ENOUGH_PLAYERS = "ROOM_4004"
    ROOM_CODE_GENERATION_FAILED = "ROOM_4005"
    PLAYER_ALREADY_IN_ROOM = "ROOM_4006"
    PLAYER_NOT_IN_ROOM = "ROOM_4007"

    # Game errors (5xxx)
    GAME_NOT_FOUND = "GAME_5001"
    GAME_NOT_STARTED = "GAME_5002"
    GAME_ALREADY_ENDED = "GAME_5003"
    INVALID_GAME_PHASE = "GAME_5004"
    ROUND_NOT_FOUND = "GAME_5005"
    TRICKS_COMPLETE = "GAME_5006"
    MAX_FRISCH_REACHED = "GAME_5007"

    # Rate limiting (6xxx)
    RATE_LIMIT_EXCEEDED = "RATE_6001"

    # Server errors (9xxx)
    INTERNAL_ERROR = "SRV_9001"
    DATABASE_ERROR = "SRV_9002"
    REDIS_ERROR = "SRV_9003"


class ErrorDetail(BaseModel):
    """Detailed error information."""

    field: str | None = None
    message: str
    code: str | None = None


class ErrorResponse(BaseModel):
    """Standard error response schema."""

    error: str = Field(description="Error code")
    message: str = Field(description="Human-readable error message")
    details: list[ErrorDetail] | None = Field(default=None)
    request_id: str | None = Field(default=None)
