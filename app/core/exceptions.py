"""Custom exception classes."""
from typing import Any

from app.schemas.errors import ErrorCode


class AppException(Exception):
    """Base exception for all application errors."""

    def __init__(
        self,
        message: str,
        error_code: ErrorCode,
        status_code: int = 400,
        details: list[dict[str, Any]] | None = None,
    ) -> None:
        self.message = message
        self.error_code = error_code
        self.status_code = status_code
        self.details = details
        super().__init__(message)


class AuthenticationError(AppException):
    """Authentication failed."""

    def __init__(
        self,
        message: str = "Authentication failed",
        error_code: ErrorCode = ErrorCode.INVALID_CREDENTIALS,
    ) -> None:
        super().__init__(
            message=message, error_code=error_code, status_code=401
        )


class AuthorizationError(AppException):
    """Authorization denied."""

    def __init__(
        self,
        message: str = "Permission denied",
        error_code: ErrorCode = ErrorCode.PERMISSION_DENIED,
    ) -> None:
        super().__init__(
            message=message, error_code=error_code, status_code=403
        )


class NotRoomAdminError(AuthorizationError):
    """User is not the room admin."""

    def __init__(self) -> None:
        super().__init__(
            message="Only the room admin can perform this action",
            error_code=ErrorCode.NOT_ROOM_ADMIN,
        )


class NotYourTurnError(AuthorizationError):
    """It's not the player's turn."""

    def __init__(self, current_player_id: str | None = None) -> None:
        super().__init__(
            message="It's not your turn",
            error_code=ErrorCode.NOT_YOUR_TURN,
        )


class ValidationError(AppException):
    """Input validation failed."""

    def __init__(
        self,
        message: str,
        error_code: ErrorCode = ErrorCode.VALIDATION_ERROR,
        details: list[dict[str, Any]] | None = None,
    ) -> None:
        super().__init__(
            message=message, error_code=error_code, status_code=422, details=details
        )


class BidValidationError(ValidationError):
    """Bid validation failed."""

    pass


class NotFoundError(AppException):
    """Resource not found."""

    def __init__(self, message: str, error_code: ErrorCode) -> None:
        super().__init__(
            message=message, error_code=error_code, status_code=404
        )


class RoomNotFoundError(NotFoundError):
    """Room not found."""

    def __init__(self, room_code: str | None = None) -> None:
        message = (
            f"Room '{room_code}' not found"
            if room_code
            else "Room not found"
        )
        super().__init__(
            message=message, error_code=ErrorCode.ROOM_NOT_FOUND
        )


class ConflictError(AppException):
    """Resource conflict."""

    def __init__(self, message: str, error_code: ErrorCode) -> None:
        super().__init__(
            message=message, error_code=error_code, status_code=409
        )


class UserAlreadyExistsError(ConflictError):
    """User already exists."""

    def __init__(self, field: str = "user") -> None:
        if field == "username":
            message = "Username already exists"
            error_code = ErrorCode.USER_ALREADY_EXISTS
        elif field == "email":
            message = "Email already registered"
            error_code = ErrorCode.EMAIL_ALREADY_EXISTS
        else:
            message = "User already exists"
            error_code = ErrorCode.USER_ALREADY_EXISTS

        super().__init__(message=message, error_code=error_code)


class RoomFullError(ConflictError):
    """Room is full."""

    def __init__(self) -> None:
        super().__init__(
            message="Room is full (maximum 4 players)",
            error_code=ErrorCode.ROOM_FULL,
        )


class GameStateError(ConflictError):
    """Invalid game state for operation."""

    pass


class RateLimitExceededError(AppException):
    """Rate limit exceeded."""

    def __init__(self, retry_after: int | None = None) -> None:
        details = [{"retry_after_seconds": retry_after}] if retry_after else None
        super().__init__(
            message="Rate limit exceeded. Please try again later.",
            error_code=ErrorCode.RATE_LIMIT_EXCEEDED,
            status_code=429,
            details=details,
        )
