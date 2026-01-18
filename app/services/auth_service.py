"""Authentication service."""
from datetime import datetime
from uuid import UUID

from redis.asyncio import Redis  # type: ignore
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession  # type: ignore

from app.core.exceptions import (
    AuthenticationError,
    UserAlreadyExistsError,
)
from app.core.security import (
    create_access_token,
    create_refresh_token,
    hash_password,
    verify_password,
)
from app.models import User
from app.schemas.auth import (
    LoginRequest,
    LoginResponse,
    RefreshRequest,
    RegisterRequest,
    RegisterResponse,
    TokenResponse,
    UserBrief,
)


class AuthService:
    """Authentication service for user registration and login."""

    def __init__(self, db: AsyncSession, redis: Redis) -> None:  # type: ignore
        """Initialize auth service with database and Redis clients."""
        self.db = db
        self.redis = redis

    async def register(self, request: RegisterRequest) -> RegisterResponse:
        """Register a new user.

        Args:
            request: Registration request with username, email, password, display_name

        Returns:
            RegisterResponse with user info and tokens

        Raises:
            UserAlreadyExistsError: If username or email already exists
        """
        # Check if username already exists
        result = await self.db.execute(
            select(User).where(User.username == request.username)
        )
        if result.scalar_one_or_none() is not None:
            raise UserAlreadyExistsError(field="username")

        # Check if email already exists
        result = await self.db.execute(
            select(User).where(User.email == request.email)
        )
        if result.scalar_one_or_none() is not None:
            raise UserAlreadyExistsError(field="email")

        # Create new user
        user = User(
            username=request.username,
            email=request.email,
            password_hash=hash_password(request.password),
            display_name=request.display_name,
            last_active=datetime.now(),
        )
        self.db.add(user)
        await self.db.flush()  # Get the ID without committing

        # Generate tokens
        access_token = create_access_token(str(user.id))
        refresh_token = create_refresh_token(str(user.id))

        # Store refresh token in Redis (format: user:{user_id}:refresh_token)
        await self.redis.setex(
            f"user:{user.id}:refresh_token",
            7 * 24 * 60 * 60,  # 7 days
            refresh_token,
        )

        return RegisterResponse(
            id=str(user.id),
            username=user.username,
            email=user.email,
            display_name=user.display_name,
            created_at=user.created_at,
            tokens=TokenResponse(
                access_token=access_token,
                refresh_token=refresh_token,
                expires_in=30 * 60,  # 30 minutes in seconds
            ),
        )

    async def login(self, request: LoginRequest) -> LoginResponse:
        """Authenticate a user and return tokens.

        Args:
            request: Login request with email and password

        Returns:
            LoginResponse with user info and tokens

        Raises:
            AuthenticationError: If email not found or password incorrect
        """
        # Find user by email
        result = await self.db.execute(
            select(User).where(User.email == request.email)
        )
        user = result.scalar_one_or_none()

        if user is None:
            raise AuthenticationError(
                message="Invalid email or password",
            )

        # Verify password
        if not verify_password(request.password, user.password_hash):
            raise AuthenticationError(
                message="Invalid email or password",
            )

        # Check if user is active
        if not user.is_active:
            raise AuthenticationError(
                message="User account is disabled",
            )

        # Update last_active timestamp
        user.last_active = datetime.now()
        self.db.add(user)

        # Generate tokens
        access_token = create_access_token(str(user.id))
        refresh_token = create_refresh_token(str(user.id))

        # Store refresh token in Redis
        await self.redis.setex(
            f"user:{user.id}:refresh_token",
            7 * 24 * 60 * 60,  # 7 days
            refresh_token,
        )

        return LoginResponse(
            user=UserBrief.model_validate(user),
            tokens=TokenResponse(
                access_token=access_token,
                refresh_token=refresh_token,
                expires_in=30 * 60,  # 30 minutes in seconds
            ),
        )

    async def refresh(self, request: RefreshRequest) -> TokenResponse:
        """Refresh authentication tokens.

        Uses refresh token to issue new access and refresh tokens.
        Implements refresh token rotation for security.

        Args:
            request: Refresh request with refresh token

        Returns:
            TokenResponse with new access and refresh tokens

        Raises:
            AuthenticationError: If refresh token is invalid or expired
        """
        from app.core.security import decode_token, verify_token_type

        try:
            # Decode and verify refresh token
            payload = decode_token(request.refresh_token)

            if not verify_token_type(payload, "refresh"):
                raise AuthenticationError(
                    message="Invalid token type",
                )

            user_id = UUID(payload["sub"])

            # Check if token exists in Redis (not revoked)
            stored_token = await self.redis.get(
                f"user:{user_id}:refresh_token"
            )
            if stored_token != request.refresh_token:
                raise AuthenticationError(
                    message="Refresh token is invalid or has been revoked",
                )

            # Get user to verify account is still active
            result = await self.db.execute(
                select(User).where(User.id == user_id)
            )
            user = result.scalar_one_or_none()

            if user is None or not user.is_active:
                raise AuthenticationError(
                    message="User account is disabled or no longer exists",
                )

            # Generate new tokens (token rotation)
            new_access_token = create_access_token(str(user.id))
            new_refresh_token = create_refresh_token(str(user.id))

            # Revoke old refresh token and store new one
            await self.redis.setex(
                f"user:{user.id}:refresh_token",
                7 * 24 * 60 * 60,  # 7 days
                new_refresh_token,
            )

            return TokenResponse(
                access_token=new_access_token,
                refresh_token=new_refresh_token,
                expires_in=30 * 60,  # 30 minutes in seconds
            )

        except AuthenticationError:
            raise
        except Exception as e:
            raise AuthenticationError(
                message="Invalid refresh token",
            ) from e

    async def logout(self, user_id: str) -> None:
        """Logout a user by revoking their refresh token.

        Args:
            user_id: UUID of the user logging out
        """
        # Delete the refresh token from Redis to invalidate it
        await self.redis.delete(f"user:{user_id}:refresh_token")
