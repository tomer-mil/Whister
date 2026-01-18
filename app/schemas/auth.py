"""Authentication schemas."""
from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator


class TokenPayload(BaseModel):
    """JWT token payload."""

    sub: str
    exp: int
    iat: int
    token_type: str


class TokenResponse(BaseModel):
    """Token response after successful authentication."""

    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int


class RegisterRequest(BaseModel):
    """User registration request."""

    username: Annotated[
        str,
        Field(
            min_length=3,
            max_length=32,
            pattern=r"^[a-zA-Z][a-zA-Z0-9_-]*$",
        ),
    ]
    email: EmailStr
    password: Annotated[str, Field(min_length=8, max_length=128)]
    display_name: Annotated[str, Field(max_length=64)]

    @field_validator("password")  # type: ignore
    @classmethod
    def validate_password_strength(cls, v: str) -> str:
        if not any(c.isupper() for c in v):
            raise ValueError(
                "Password must contain at least one uppercase letter"
            )
        if not any(c.islower() for c in v):
            raise ValueError(
                "Password must contain at least one lowercase letter"
            )
        if not any(c.isdigit() for c in v):
            raise ValueError("Password must contain at least one digit")
        return v


class RegisterResponse(BaseModel):
    """User registration response."""

    id: str
    username: str
    email: str
    display_name: str
    created_at: datetime
    tokens: TokenResponse


class LoginRequest(BaseModel):
    """User login request."""

    email: EmailStr
    password: str


class UserBrief(BaseModel):
    """Brief user information."""

    id: str
    username: str
    email: str
    display_name: str
    avatar_url: str | None = None

    model_config = ConfigDict(from_attributes=True)


class LoginResponse(BaseModel):
    """User login response."""

    user: UserBrief
    tokens: TokenResponse


class RefreshRequest(BaseModel):
    """Token refresh request."""

    refresh_token: str


LoginResponse.model_rebuild()
