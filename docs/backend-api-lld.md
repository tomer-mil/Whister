# Backend API Low-Level Design
## Whist Score Keeper Platform

**Version:** 1.0  
**Date:** January 2026  
**Status:** Draft  

---

## Table of Contents

1. [Overview](#1-overview)
2. [Project Structure](#2-project-structure)
3. [Core Infrastructure](#3-core-infrastructure)
4. [Dependency Injection](#4-dependency-injection)
5. [Error Handling](#5-error-handling)
6. [Rate Limiting](#6-rate-limiting)
7. [Auth Service](#7-auth-service)
8. [User Service](#8-user-service)
9. [Room Service](#9-room-service)
10. [Game Service](#10-game-service)
11. [Testing Strategy](#11-testing-strategy)
12. [API Endpoint Summary](#12-api-endpoint-summary)

---

## 1. Overview

### 1.1 Purpose

This Low-Level Design document specifies the implementation details for the Whist Score Keeper backend API, including complete endpoint specifications, Pydantic schemas, authentication flows, error handling patterns, and dependency injection structure.

### 1.2 Technology Stack

```
Python 3.11+
FastAPI 0.109+
python-socketio 5.11+
SQLAlchemy 2.0+ (async)
Pydantic v2
PostgreSQL 15+
Redis 7+
python-jose (JWT)
passlib[bcrypt]
```

### 1.3 API Versioning

All REST endpoints are prefixed with `/api/v1/`. WebSocket connections use a separate namespace at `/ws`.

---

## 2. Project Structure

```
whist_backend/
├── app/
│   ├── __init__.py
│   ├── main.py                    # FastAPI application factory
│   ├── config.py                  # Settings using pydantic-settings
│   │
│   ├── core/                      # Core infrastructure
│   │   ├── __init__.py
│   │   ├── database.py            # SQLAlchemy async engine & session
│   │   ├── redis.py               # Redis connection pool
│   │   ├── security.py            # JWT & password utilities
│   │   ├── exceptions.py          # Custom exception classes
│   │   ├── error_handlers.py      # Exception handlers
│   │   └── rate_limiter.py        # Rate limiting middleware
│   │
│   ├── dependencies/              # FastAPI dependencies
│   │   ├── __init__.py
│   │   ├── auth.py                # Authentication dependencies
│   │   ├── database.py            # DB session dependency
│   │   ├── redis.py               # Redis dependency
│   │   └── services.py            # Service layer dependencies
│   │
│   ├── models/                    # SQLAlchemy ORM models
│   │   ├── __init__.py
│   │   ├── base.py                # Base model class
│   │   ├── user.py
│   │   ├── game.py
│   │   ├── round.py
│   │   └── group.py
│   │
│   ├── schemas/                   # Pydantic schemas
│   │   ├── __init__.py
│   │   ├── base.py                # Base schemas & common types
│   │   ├── auth.py
│   │   ├── user.py
│   │   ├── room.py
│   │   ├── game.py
│   │   └── errors.py
│   │
│   ├── services/                  # Business logic layer
│   │   ├── __init__.py
│   │   ├── auth_service.py
│   │   ├── user_service.py
│   │   ├── room_service.py
│   │   ├── game_service.py
│   │   └── scoring_service.py
│   │
│   ├── api/                       # API routes
│   │   ├── __init__.py
│   │   ├── router.py              # Main router aggregator
│   │   ├── auth.py
│   │   ├── users.py
│   │   ├── rooms.py
│   │   ├── games.py
│   │   └── groups.py
│   │
│   └── websocket/                 # WebSocket handlers
│       ├── __init__.py
│       ├── server.py              # Socket.IO server setup
│       ├── events.py              # Event handlers
│       └── room_manager.py        # Room state management
│
├── alembic/                       # Database migrations
│   ├── versions/
│   └── env.py
│
├── tests/
│   ├── conftest.py
│   ├── test_auth.py
│   ├── test_users.py
│   ├── test_rooms.py
│   └── test_games.py
│
├── alembic.ini
├── pyproject.toml
└── docker-compose.yml
```

---

## 3. Core Infrastructure

### 3.1 Configuration (config.py)

```python
"""Application configuration using pydantic-settings."""
from functools import lru_cache
from typing import Literal

from pydantic import PostgresDsn, RedisDsn, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""
    
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )
    
    # Application
    app_name: str = "Whist Score Keeper"
    app_version: str = "1.0.0"
    debug: bool = False
    environment: Literal["development", "staging", "production"] = "development"
    
    # Server
    host: str = "0.0.0.0"
    port: int = 8000
    workers: int = 1
    
    # Database
    database_url: PostgresDsn
    database_pool_size: int = 10
    database_max_overflow: int = 20
    database_pool_timeout: int = 30
    
    # Redis
    redis_url: RedisDsn
    redis_pool_size: int = 10
    
    # JWT
    jwt_secret_key: str
    jwt_algorithm: str = "HS256"
    jwt_access_token_expire_minutes: int = 30
    jwt_refresh_token_expire_days: int = 7
    
    # Security
    bcrypt_rounds: int = 12
    cors_origins: list[str] = ["http://localhost:3000"]
    
    # Rate Limiting
    rate_limit_enabled: bool = True
    rate_limit_default_requests: int = 100
    rate_limit_default_window_seconds: int = 60
    
    # Room settings
    room_code_length: int = 6
    room_ttl_hours: int = 24
    room_max_reconnect_seconds: int = 60
    
    @field_validator("cors_origins", mode="before")
    @classmethod
    def parse_cors_origins(cls, v: str | list[str]) -> list[str]:
        """Parse CORS origins from comma-separated string or list."""
        if isinstance(v, str):
            return [origin.strip() for origin in v.split(",")]
        return v


@lru_cache
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()
```

### 3.2 Database Connection (core/database.py)

```python
"""Async SQLAlchemy database configuration."""
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase

from app.config import get_settings


class Base(DeclarativeBase):
    """Base class for all SQLAlchemy models."""
    pass


class DatabaseManager:
    """Manages database connections and sessions."""
    
    def __init__(self) -> None:
        self._engine: AsyncEngine | None = None
        self._session_factory: async_sessionmaker[AsyncSession] | None = None
    
    def initialize(self, database_url: str) -> None:
        """Initialize the database engine and session factory."""
        if database_url.startswith("postgres://"):
            database_url = database_url.replace(
                "postgres://", "postgresql+asyncpg://", 1
            )
        elif database_url.startswith("postgresql://"):
            database_url = database_url.replace(
                "postgresql://", "postgresql+asyncpg://", 1
            )
        
        settings = get_settings()
        
        self._engine = create_async_engine(
            database_url,
            pool_size=settings.database_pool_size,
            max_overflow=settings.database_max_overflow,
            pool_timeout=settings.database_pool_timeout,
            pool_recycle=1800,
            echo=settings.debug,
        )
        
        self._session_factory = async_sessionmaker(
            bind=self._engine,
            class_=AsyncSession,
            expire_on_commit=False,
            autocommit=False,
            autoflush=False,
        )
    
    @asynccontextmanager
    async def session(self) -> AsyncGenerator[AsyncSession, None]:
        """Provide a transactional scope around a series of operations."""
        if self._session_factory is None:
            raise RuntimeError("Database not initialized")
        
        session = self._session_factory()
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()
    
    async def close(self) -> None:
        """Close the database engine."""
        if self._engine:
            await self._engine.dispose()


db_manager = DatabaseManager()
```

### 3.3 Redis Connection (core/redis.py)

```python
"""Redis connection pool management."""
from typing import Any
from redis.asyncio import ConnectionPool, Redis
from app.config import get_settings


class RedisManager:
    """Manages Redis connections."""
    
    def __init__(self) -> None:
        self._pool: ConnectionPool | None = None
        self._client: Redis | None = None
    
    async def initialize(self, redis_url: str) -> None:
        """Initialize the Redis connection pool."""
        settings = get_settings()
        self._pool = ConnectionPool.from_url(
            redis_url,
            max_connections=settings.redis_pool_size,
            decode_responses=True,
        )
        self._client = Redis(connection_pool=self._pool)
    
    @property
    def client(self) -> Redis:
        """Get the Redis client."""
        if self._client is None:
            raise RuntimeError("Redis not initialized")
        return self._client
    
    async def close(self) -> None:
        """Close the Redis connection pool."""
        if self._client:
            await self._client.close()
        if self._pool:
            await self._pool.disconnect()


redis_manager = RedisManager()
```

### 3.4 Security Utilities (core/security.py)

```python
"""Security utilities for password hashing and JWT tokens."""
from datetime import UTC, datetime, timedelta
from typing import Any

from jose import JWTError, jwt
from passlib.context import CryptContext

from app.config import get_settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    """Hash a password using bcrypt."""
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a password against a hash."""
    return pwd_context.verify(plain_password, hashed_password)


def create_access_token(
    subject: str,
    additional_claims: dict[str, Any] | None = None,
    expires_delta: timedelta | None = None,
) -> str:
    """Create a JWT access token."""
    settings = get_settings()
    
    if expires_delta is None:
        expires_delta = timedelta(minutes=settings.jwt_access_token_expire_minutes)
    
    now = datetime.now(UTC)
    expire = now + expires_delta
    
    to_encode: dict[str, Any] = {
        "sub": subject,
        "iat": now,
        "exp": expire,
        "type": "access",
    }
    
    if additional_claims:
        to_encode.update(additional_claims)
    
    return jwt.encode(
        to_encode,
        settings.jwt_secret_key,
        algorithm=settings.jwt_algorithm,
    )


def create_refresh_token(
    subject: str,
    expires_delta: timedelta | None = None,
) -> str:
    """Create a JWT refresh token."""
    settings = get_settings()
    
    if expires_delta is None:
        expires_delta = timedelta(days=settings.jwt_refresh_token_expire_days)
    
    now = datetime.now(UTC)
    expire = now + expires_delta
    
    to_encode = {
        "sub": subject,
        "iat": now,
        "exp": expire,
        "type": "refresh",
    }
    
    return jwt.encode(
        to_encode,
        settings.jwt_secret_key,
        algorithm=settings.jwt_algorithm,
    )


def decode_token(token: str) -> dict[str, Any]:
    """Decode and verify a JWT token."""
    settings = get_settings()
    return jwt.decode(
        token,
        settings.jwt_secret_key,
        algorithms=[settings.jwt_algorithm],
    )


def verify_token_type(token_payload: dict[str, Any], expected_type: str) -> bool:
    """Verify that a token is of the expected type."""
    return token_payload.get("type") == expected_type
```

---

## 4. Dependency Injection

### 4.1 Database Dependency (dependencies/database.py)

```python
"""Database session dependency."""
from collections.abc import AsyncGenerator
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import db_manager


async def get_db_session() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency that provides a database session."""
    async with db_manager.session() as session:
        yield session
```

### 4.2 Authentication Dependencies (dependencies/auth.py)

```python
"""Authentication dependencies."""
from typing import Annotated
from uuid import UUID

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import decode_token, verify_token_type
from app.dependencies.database import get_db_session
from app.models.user import User
from app.schemas.auth import TokenPayload

security = HTTPBearer(scheme_name="JWT", auto_error=True)


async def get_token_payload(
    credentials: Annotated[HTTPAuthorizationCredentials, Depends(security)],
) -> TokenPayload:
    """Extract and validate JWT token from Authorization header."""
    try:
        payload = decode_token(credentials.credentials)
        
        if not verify_token_type(payload, "access"):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token type",
                headers={"WWW-Authenticate": "Bearer"},
            )
        
        return TokenPayload(
            sub=payload["sub"],
            exp=payload["exp"],
            iat=payload["iat"],
            token_type=payload["type"],
        )
        
    except JWTError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        ) from e


async def get_current_user(
    token_payload: Annotated[TokenPayload, Depends(get_token_payload)],
    db: Annotated[AsyncSession, Depends(get_db_session)],
) -> User:
    """Get the current authenticated user."""
    try:
        user_id = UUID(token_payload.sub)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid user identifier",
        ) from e
    
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
        )
    
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is disabled",
        )
    
    return user


# Type aliases
CurrentUser = Annotated[User, Depends(get_current_user)]
DBSession = Annotated[AsyncSession, Depends(get_db_session)]
```

### 4.3 Service Dependencies (dependencies/services.py)

```python
"""Service layer dependencies."""
from typing import Annotated
from fastapi import Depends
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies.database import get_db_session
from app.dependencies.redis import get_redis
from app.services.auth_service import AuthService
from app.services.game_service import GameService
from app.services.room_service import RoomService
from app.services.scoring_service import ScoringService
from app.services.user_service import UserService


def get_auth_service(
    db: Annotated[AsyncSession, Depends(get_db_session)],
    redis: Annotated[Redis, Depends(get_redis)],
) -> AuthService:
    return AuthService(db=db, redis=redis)


def get_user_service(
    db: Annotated[AsyncSession, Depends(get_db_session)],
) -> UserService:
    return UserService(db=db)


def get_room_service(
    db: Annotated[AsyncSession, Depends(get_db_session)],
    redis: Annotated[Redis, Depends(get_redis)],
) -> RoomService:
    return RoomService(db=db, redis=redis)


def get_game_service(
    db: Annotated[AsyncSession, Depends(get_db_session)],
    redis: Annotated[Redis, Depends(get_redis)],
) -> GameService:
    return GameService(db=db, redis=redis, scoring=ScoringService())


# Type aliases
AuthServiceDep = Annotated[AuthService, Depends(get_auth_service)]
UserServiceDep = Annotated[UserService, Depends(get_user_service)]
RoomServiceDep = Annotated[RoomService, Depends(get_room_service)]
GameServiceDep = Annotated[GameService, Depends(get_game_service)]
```

---

## 5. Error Handling

### 5.1 Error Codes (schemas/errors.py)

```python
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
```

### 5.2 Custom Exceptions (core/exceptions.py)

```python
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
        super().__init__(message=message, error_code=error_code, status_code=401)


class AuthorizationError(AppException):
    """Authorization denied."""
    def __init__(
        self,
        message: str = "Permission denied",
        error_code: ErrorCode = ErrorCode.PERMISSION_DENIED,
    ) -> None:
        super().__init__(message=message, error_code=error_code, status_code=403)


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
        super().__init__(message=message, error_code=error_code, status_code=404)


class RoomNotFoundError(NotFoundError):
    """Room not found."""
    def __init__(self, room_code: str | None = None) -> None:
        message = f"Room '{room_code}' not found" if room_code else "Room not found"
        super().__init__(message=message, error_code=ErrorCode.ROOM_NOT_FOUND)


class ConflictError(AppException):
    """Resource conflict."""
    def __init__(self, message: str, error_code: ErrorCode) -> None:
        super().__init__(message=message, error_code=error_code, status_code=409)


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
```

---

## 6. Rate Limiting

### 6.1 Rate Limit Configuration

```python
"""Rate limiting configuration."""
from dataclasses import dataclass


@dataclass
class RateLimitConfig:
    """Configuration for a rate limit rule."""
    requests: int
    window_seconds: int
    key_prefix: str = "ratelimit"


RATE_LIMITS: dict[str, RateLimitConfig] = {
    # Authentication endpoints
    "POST:/api/v1/auth/login": RateLimitConfig(
        requests=5, window_seconds=900, key_prefix="auth_login"
    ),
    "POST:/api/v1/auth/register": RateLimitConfig(
        requests=3, window_seconds=3600, key_prefix="auth_register"
    ),
    "POST:/api/v1/auth/refresh": RateLimitConfig(
        requests=20, window_seconds=60, key_prefix="auth_refresh"
    ),
    
    # Room endpoints
    "POST:/api/v1/rooms": RateLimitConfig(
        requests=10, window_seconds=3600, key_prefix="room_create"
    ),
    "POST:/api/v1/rooms/*/join": RateLimitConfig(
        requests=30, window_seconds=60, key_prefix="room_join"
    ),
    
    # Game endpoints
    "POST:/api/v1/games/*/bid": RateLimitConfig(
        requests=60, window_seconds=60, key_prefix="game_bid"
    ),
    "POST:/api/v1/games/*/trick": RateLimitConfig(
        requests=60, window_seconds=60, key_prefix="game_trick"
    ),
    
    # Default
    "DEFAULT": RateLimitConfig(
        requests=100, window_seconds=60, key_prefix="default"
    ),
}
```

### 6.2 Rate Limit Summary Table

| Endpoint | Requests | Window | Description |
|----------|----------|--------|-------------|
| `POST /auth/login` | 5 | 15 min | Prevent brute force |
| `POST /auth/register` | 3 | 1 hour | Prevent spam accounts |
| `POST /auth/refresh` | 20 | 1 min | Normal refresh patterns |
| `POST /rooms` | 10 | 1 hour | Limit room creation |
| `POST /rooms/*/join` | 30 | 1 min | Allow room hopping |
| `POST /games/*/bid` | 60 | 1 min | Fast bidding support |
| `POST /games/*/trick` | 60 | 1 min | Fast trick claiming |
| All other endpoints | 100 | 1 min | General protection |

---

## 7. Auth Service

### 7.1 Pydantic Schemas (schemas/auth.py)

```python
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
    username: Annotated[str, Field(min_length=3, max_length=32, pattern=r"^[a-zA-Z][a-zA-Z0-9_-]*$")]
    email: EmailStr
    password: Annotated[str, Field(min_length=8, max_length=128)]
    display_name: Annotated[str, Field(max_length=64)]
    
    @field_validator("password")
    @classmethod
    def validate_password_strength(cls, v: str) -> str:
        if not any(c.isupper() for c in v):
            raise ValueError("Password must contain at least one uppercase letter")
        if not any(c.islower() for c in v):
            raise ValueError("Password must contain at least one lowercase letter")
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


class LoginResponse(BaseModel):
    """User login response."""
    user: "UserBrief"
    tokens: TokenResponse


class RefreshRequest(BaseModel):
    """Token refresh request."""
    refresh_token: str


class UserBrief(BaseModel):
    """Brief user information."""
    id: str
    username: str
    email: str
    display_name: str
    avatar_url: str | None = None
    
    model_config = ConfigDict(from_attributes=True)


LoginResponse.model_rebuild()
```

### 7.2 Auth API Routes (api/auth.py)

```python
"""Authentication API routes."""
from fastapi import APIRouter, status
from app.dependencies.auth import CurrentUser
from app.dependencies.services import AuthServiceDep
from app.schemas.auth import (
    LoginRequest, LoginResponse, RefreshRequest,
    RegisterRequest, RegisterResponse, TokenResponse, UserBrief,
)
from app.schemas.errors import ErrorResponse

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post(
    "/register",
    response_model=RegisterResponse,
    status_code=status.HTTP_201_CREATED,
    responses={
        201: {"description": "User registered successfully"},
        409: {"description": "User already exists", "model": ErrorResponse},
        422: {"description": "Validation error", "model": ErrorResponse},
    },
)
async def register(
    request: RegisterRequest,
    auth_service: AuthServiceDep,
) -> RegisterResponse:
    """Register a new user."""
    return await auth_service.register(request)


@router.post(
    "/login",
    response_model=LoginResponse,
    responses={
        200: {"description": "Login successful"},
        401: {"description": "Invalid credentials", "model": ErrorResponse},
    },
)
async def login(
    request: LoginRequest,
    auth_service: AuthServiceDep,
) -> LoginResponse:
    """Authenticate a user."""
    return await auth_service.login(request)


@router.post(
    "/refresh",
    response_model=TokenResponse,
    responses={
        200: {"description": "Tokens refreshed"},
        401: {"description": "Invalid refresh token", "model": ErrorResponse},
    },
)
async def refresh(
    request: RefreshRequest,
    auth_service: AuthServiceDep,
) -> TokenResponse:
    """Refresh authentication tokens."""
    return await auth_service.refresh(request)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(current_user: CurrentUser, auth_service: AuthServiceDep) -> None:
    """Logout the current user."""
    await auth_service.logout(str(current_user.id))


@router.get("/me", response_model=UserBrief)
async def get_me(current_user: CurrentUser) -> UserBrief:
    """Get the current authenticated user."""
    return UserBrief.model_validate(current_user)
```

---

## 8. User Service

### 8.1 Pydantic Schemas (schemas/user.py)

```python
"""User schemas."""
from datetime import datetime
from uuid import UUID
from pydantic import BaseModel, ConfigDict, Field, HttpUrl


class UserResponse(BaseModel):
    """Full user response."""
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
    """User profile update request."""
    display_name: str | None = Field(default=None, max_length=64)
    avatar_url: HttpUrl | None = None


class PlayerStats(BaseModel):
    """Player statistics."""
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


class GameHistoryEntry(BaseModel):
    """Single game history entry."""
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
```

### 8.2 User API Routes (api/users.py)

```python
"""User API routes."""
from typing import Annotated
from uuid import UUID
from fastapi import APIRouter, Query
from app.core.exceptions import AuthorizationError
from app.dependencies.auth import CurrentUser
from app.dependencies.services import UserServiceDep
from app.schemas.user import (
    GameHistoryResponse, PlayerStats, UserResponse, UserUpdateRequest,
)

router = APIRouter(prefix="/users", tags=["Users"])


@router.get("/{user_id}", response_model=UserResponse)
async def get_user(
    user_id: UUID,
    current_user: CurrentUser,
    user_service: UserServiceDep,
) -> UserResponse:
    """Get a user by ID."""
    return await user_service.get_user(user_id)


@router.put("/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: UUID,
    request: UserUpdateRequest,
    current_user: CurrentUser,
    user_service: UserServiceDep,
) -> UserResponse:
    """Update a user's profile (own only)."""
    if user_id != current_user.id:
        raise AuthorizationError("You can only update your own profile")
    return await user_service.update_user(user_id, request)


@router.get("/{user_id}/stats", response_model=PlayerStats)
async def get_user_stats(
    user_id: UUID,
    current_user: CurrentUser,
    user_service: UserServiceDep,
) -> PlayerStats:
    """Get a user's game statistics."""
    return await user_service.get_user_stats(user_id)


@router.get("/{user_id}/history", response_model=GameHistoryResponse)
async def get_user_history(
    user_id: UUID,
    current_user: CurrentUser,
    user_service: UserServiceDep,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
) -> GameHistoryResponse:
    """Get a user's game history (own only)."""
    if user_id != current_user.id:
        raise AuthorizationError("You can only view your own game history")
    return await user_service.get_user_history(user_id, page, page_size)
```

---

## 9. Room Service

### 9.1 Pydantic Schemas (schemas/room.py)

```python
"""Room schemas."""
from datetime import datetime
from typing import Literal
from uuid import UUID
from pydantic import BaseModel, Field

GameStatus = Literal[
    "waiting", "bidding_trump", "frisch", "bidding_contract",
    "playing", "round_complete", "finished",
]


class PlayerInRoom(BaseModel):
    """Player information within a room."""
    user_id: UUID
    display_name: str
    seat_position: int = Field(ge=0, le=3)
    is_admin: bool = False
    is_connected: bool = True
    avatar_url: str | None = None


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
```

### 9.2 Room API Routes (api/rooms.py)

```python
"""Room API routes."""
from fastapi import APIRouter, status
from app.dependencies.auth import CurrentUser
from app.dependencies.services import RoomServiceDep
from app.schemas.room import (
    CreateRoomRequest, CreateRoomResponse, JoinRoomRequest,
    JoinRoomResponse, RoomState, StartGameResponse, UpdateSeatingRequest,
)

router = APIRouter(prefix="/rooms", tags=["Rooms"])


@router.post("", response_model=CreateRoomResponse, status_code=status.HTTP_201_CREATED)
async def create_room(
    current_user: CurrentUser,
    room_service: RoomServiceDep,
    request: CreateRoomRequest | None = None,
) -> CreateRoomResponse:
    """Create a new game room."""
    return await room_service.create_room(current_user, request or CreateRoomRequest())


@router.get("/{room_code}", response_model=RoomState)
async def get_room(
    room_code: str,
    current_user: CurrentUser,
    room_service: RoomServiceDep,
) -> RoomState:
    """Get room state by code."""
    return await room_service.get_room(room_code.upper())


@router.post("/{room_code}/join", response_model=JoinRoomResponse)
async def join_room(
    room_code: str,
    current_user: CurrentUser,
    room_service: RoomServiceDep,
    request: JoinRoomRequest | None = None,
) -> JoinRoomResponse:
    """Join a game room."""
    return await room_service.join_room(
        room_code.upper(), current_user, request or JoinRoomRequest()
    )


@router.post("/{room_code}/leave", status_code=status.HTTP_204_NO_CONTENT)
async def leave_room(
    room_code: str,
    current_user: CurrentUser,
    room_service: RoomServiceDep,
) -> None:
    """Leave a game room."""
    await room_service.leave_room(room_code.upper(), current_user)


@router.put("/{room_code}/seating", response_model=RoomState)
async def update_seating(
    room_code: str,
    request: UpdateSeatingRequest,
    current_user: CurrentUser,
    room_service: RoomServiceDep,
) -> RoomState:
    """Update seating arrangement (admin only)."""
    return await room_service.update_seating(room_code.upper(), current_user, request)


@router.post("/{room_code}/start", response_model=StartGameResponse)
async def start_game(
    room_code: str,
    current_user: CurrentUser,
    room_service: RoomServiceDep,
) -> StartGameResponse:
    """Start the game (admin only)."""
    return await room_service.start_game(room_code.upper(), current_user)
```

---

## 10. Game Service

### 10.1 Pydantic Schemas (schemas/game.py)

```python
"""Game schemas."""
from datetime import datetime
from typing import Literal
from uuid import UUID
from pydantic import BaseModel, Field, field_validator

TrumpSuit = Literal["clubs", "diamonds", "hearts", "spades", "no_trump"]
RoundPhase = Literal["trump_bidding", "frisch", "contract_bidding", "playing", "complete"]
GameType = Literal["over", "under"]

SUIT_ORDER: dict[TrumpSuit, int] = {
    "clubs": 0, "diamonds": 1, "hearts": 2, "spades": 3, "no_trump": 4,
}


class TrumpBidRequest(BaseModel):
    """Trump bid request."""
    suit: TrumpSuit
    amount: int = Field(ge=5, le=13)


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
    message: str


class TrumpSetResponse(BaseModel):
    """Trump suit has been set."""
    trump_suit: TrumpSuit
    winner_id: UUID
    winner_name: str
    winning_bid: int
    message: str


class ContractBidRequest(BaseModel):
    """Contract bid request."""
    amount: int = Field(ge=0, le=13)


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
    message: str


class TrickClaimedResponse(BaseModel):
    """Trick claimed response."""
    player_id: UUID
    player_name: str
    new_trick_count: int
    total_tricks_played: int


class RoundPlayerState(BaseModel):
    """Player state within a round."""
    user_id: UUID
    display_name: str
    seat_position: int
    contract_bid: int
    tricks_won: int
    score: int | None = None
    made_contract: bool | None = None


class RoundCompleteResponse(BaseModel):
    """Round complete with scores."""
    round_number: int
    trump_suit: TrumpSuit
    game_type: GameType
    players: list[RoundPlayerState]
    commentary: list[str]


class UndoTrickRequest(BaseModel):
    """Undo last trick (admin only)."""
    player_id: UUID
```

### 10.2 Scoring Service (services/scoring_service.py)

```python
"""Scoring service for calculating round scores."""
from app.schemas.game import GameType, RoundPlayerState


class ScoringService:
    """Service for score calculations."""
    
    def calculate_round_score(
        self,
        contract_bid: int,
        tricks_won: int,
        game_type: GameType,
    ) -> int:
        """
        Calculate score for a player.
        
        Scoring rules:
        - Made contract (non-zero): bid² + 10
        - Failed contract (non-zero): -10 per deviation
        - Made zero (under game): 50 points
        - Made zero (over game): 25 points
        - Failed zero (1 trick): -50 points
        - Failed zero (2+ tricks): -50 + 10 per extra trick
        """
        is_over = game_type == "over"
        
        if contract_bid == 0:
            if tricks_won == 0:
                return 25 if is_over else 50
            elif tricks_won == 1:
                return -50
            else:
                return -50 + (tricks_won - 1) * 10
        
        if tricks_won == contract_bid:
            return (contract_bid * contract_bid) + 10
        else:
            deviation = abs(tricks_won - contract_bid)
            return deviation * -10
    
    def determine_game_type(self, contracts: list[int]) -> GameType:
        """Determine if the game is 'over' (sum > 13) or 'under' (sum < 13)."""
        return "over" if sum(contracts) > 13 else "under"
    
    def calculate_round_scores(
        self,
        players: list[RoundPlayerState],
    ) -> list[RoundPlayerState]:
        """Calculate scores for all players in a round."""
        contracts = [p.contract_bid for p in players]
        game_type = self.determine_game_type(contracts)
        
        for player in players:
            player.score = self.calculate_round_score(
                player.contract_bid, player.tricks_won, game_type
            )
            player.made_contract = player.tricks_won == player.contract_bid
        
        return players
    
    def validate_contract_bid(
        self,
        bid_amount: int,
        current_sum: int,
        is_last_bidder: bool,
        is_trump_winner: bool = False,
        trump_winning_bid: int = 0,
    ) -> tuple[bool, str | None]:
        """Validate a contract bid."""
        if not 0 <= bid_amount <= 13:
            return False, "Contract must be between 0 and 13"
        
        if is_trump_winner and bid_amount < trump_winning_bid:
            return False, f"Trump winner must bid at least {trump_winning_bid}"
        
        if is_last_bidder and (current_sum + bid_amount == 13):
            return False, "Last bidder cannot make the sum equal 13"
        
        return True, None
```

### 10.3 Game API Routes (api/games.py)

```python
"""Game API routes."""
from uuid import UUID
from fastapi import APIRouter
from app.dependencies.auth import CurrentUser
from app.dependencies.services import GameServiceDep
from app.schemas.game import (
    ContractBidRequest, ContractBidResponse, ContractsSetResponse,
    FrischStartedResponse, PassResponse, RoundCompleteResponse,
    TrickClaimedResponse, TrumpBidRequest, TrumpBidResponse,
    TrumpSetResponse, UndoTrickRequest,
)

router = APIRouter(prefix="/games", tags=["Games"])


@router.post(
    "/{game_id}/bid/trump",
    response_model=TrumpBidResponse | FrischStartedResponse | TrumpSetResponse,
)
async def place_trump_bid(
    game_id: UUID,
    request: TrumpBidRequest,
    current_user: CurrentUser,
    game_service: GameServiceDep,
) -> TrumpBidResponse | FrischStartedResponse | TrumpSetResponse:
    """Place a trump bid."""
    return await game_service.place_trump_bid(game_id, current_user.id, request)


@router.post(
    "/{game_id}/bid/pass",
    response_model=PassResponse | FrischStartedResponse | TrumpSetResponse,
)
async def pass_trump_bid(
    game_id: UUID,
    current_user: CurrentUser,
    game_service: GameServiceDep,
) -> PassResponse | FrischStartedResponse | TrumpSetResponse:
    """Pass on trump bidding."""
    return await game_service.pass_trump_bid(game_id, current_user.id)


@router.post(
    "/{game_id}/bid/contract",
    response_model=ContractBidResponse | ContractsSetResponse,
)
async def place_contract_bid(
    game_id: UUID,
    request: ContractBidRequest,
    current_user: CurrentUser,
    game_service: GameServiceDep,
) -> ContractBidResponse | ContractsSetResponse:
    """Place a contract bid."""
    return await game_service.place_contract_bid(game_id, current_user.id, request)


@router.post(
    "/{game_id}/trick",
    response_model=TrickClaimedResponse | RoundCompleteResponse,
)
async def claim_trick(
    game_id: UUID,
    current_user: CurrentUser,
    game_service: GameServiceDep,
) -> TrickClaimedResponse | RoundCompleteResponse:
    """Claim a trick."""
    return await game_service.claim_trick(game_id, current_user.id)


@router.post("/{game_id}/trick/undo", response_model=TrickClaimedResponse)
async def undo_trick(
    game_id: UUID,
    request: UndoTrickRequest,
    current_user: CurrentUser,
    game_service: GameServiceDep,
) -> TrickClaimedResponse:
    """Undo a trick (admin only)."""
    return await game_service.undo_trick(game_id, current_user.id, request.player_id)
```

---

## 11. Testing Strategy

### 11.1 Test Configuration (tests/conftest.py)

```python
"""Test configuration and fixtures."""
import asyncio
from collections.abc import AsyncGenerator
from uuid import uuid4

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.database import Base
from app.models.user import User


@pytest.fixture(scope="session")
def event_loop():
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()


@pytest_asyncio.fixture(scope="function")
async def test_db_engine():
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        poolclass=StaticPool,
        echo=False,
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield engine
    await engine.dispose()


@pytest_asyncio.fixture
async def test_user(test_db_session: AsyncSession) -> User:
    from app.core.security import hash_password
    
    user = User(
        id=uuid4(),
        username="testuser",
        email="test@example.com",
        password_hash=hash_password("TestPass123"),
        display_name="Test User",
        is_active=True,
    )
    test_db_session.add(user)
    await test_db_session.commit()
    return user
```

### 11.2 Example Scoring Tests

```python
"""Tests for scoring service."""
import pytest
from app.services.scoring_service import ScoringService


class TestScoringService:
    @pytest.fixture
    def scoring(self) -> ScoringService:
        return ScoringService()
    
    def test_made_contract_score(self, scoring: ScoringService) -> None:
        # Bid 3, won 3 -> 3² + 10 = 19
        assert scoring.calculate_round_score(3, 3, "under") == 19
        # Bid 5, won 5 -> 5² + 10 = 35
        assert scoring.calculate_round_score(5, 5, "over") == 35
    
    def test_failed_contract_score(self, scoring: ScoringService) -> None:
        # Bid 5, won 3 -> -10 × 2 = -20
        assert scoring.calculate_round_score(5, 3, "under") == -20
    
    def test_zero_bid_success(self, scoring: ScoringService) -> None:
        assert scoring.calculate_round_score(0, 0, "under") == 50
        assert scoring.calculate_round_score(0, 0, "over") == 25
    
    def test_zero_bid_failed(self, scoring: ScoringService) -> None:
        assert scoring.calculate_round_score(0, 1, "under") == -50
        assert scoring.calculate_round_score(0, 3, "under") == -30
    
    def test_determine_game_type(self, scoring: ScoringService) -> None:
        assert scoring.determine_game_type([5, 4, 3, 2]) == "over"
        assert scoring.determine_game_type([3, 3, 3, 3]) == "under"
    
    def test_last_bidder_cannot_make_sum_13(self, scoring: ScoringService) -> None:
        is_valid, error = scoring.validate_contract_bid(
            bid_amount=5, current_sum=8, is_last_bidder=True
        )
        assert not is_valid
        assert "13" in error
```

---

## 12. API Endpoint Summary

### Authentication (`/api/v1/auth`)

| Method | Endpoint | Description | Auth | Rate Limit |
|--------|----------|-------------|------|------------|
| POST | `/register` | Register new user | No | 3/hour |
| POST | `/login` | Login with credentials | No | 5/15min |
| POST | `/refresh` | Refresh access token | No | 20/min |
| POST | `/logout` | Logout current user | Yes | Default |
| GET | `/me` | Get current user info | Yes | Default |

### Users (`/api/v1/users`)

| Method | Endpoint | Description | Auth | Rate Limit |
|--------|----------|-------------|------|------------|
| GET | `/{user_id}` | Get user profile | Yes | Default |
| PUT | `/{user_id}` | Update own profile | Yes | Default |
| GET | `/{user_id}/stats` | Get player statistics | Yes | Default |
| GET | `/{user_id}/history` | Get game history | Yes | Default |

### Rooms (`/api/v1/rooms`)

| Method | Endpoint | Description | Auth | Rate Limit |
|--------|----------|-------------|------|------------|
| POST | `/` | Create new room | Yes | 10/hour |
| GET | `/{room_code}` | Get room state | Yes | Default |
| POST | `/{room_code}/join` | Join room | Yes | 30/min |
| POST | `/{room_code}/leave` | Leave room | Yes | Default |
| PUT | `/{room_code}/seating` | Update seating (admin) | Yes | Default |
| POST | `/{room_code}/start` | Start game (admin) | Yes | Default |

### Games (`/api/v1/games`)

| Method | Endpoint | Description | Auth | Rate Limit |
|--------|----------|-------------|------|------------|
| GET | `/{game_id}` | Get game state | Yes | Default |
| POST | `/{game_id}/bid/trump` | Place trump bid | Yes | 60/min |
| POST | `/{game_id}/bid/pass` | Pass on trump bid | Yes | 60/min |
| POST | `/{game_id}/bid/contract` | Place contract bid | Yes | 60/min |
| POST | `/{game_id}/trick` | Claim a trick | Yes | 60/min |
| POST | `/{game_id}/trick/undo` | Undo trick (admin) | Yes | Default |
| GET | `/{game_id}/scores` | Get final scores | Yes | Default |

---

## Document History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | January 2026 | Tech Lead | Initial LLD |

---

*This LLD provides implementation specifications for the Whist Score Keeper backend. All code examples follow Python 3.11+, FastAPI, and Pydantic v2 conventions. Code should pass `ruff` and `mypy --strict` checks.*
