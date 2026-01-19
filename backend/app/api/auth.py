"""Authentication API routes."""

from fastapi import APIRouter, status

from app.dependencies.auth import CurrentUser
from app.dependencies.services import AuthServiceDep
from app.schemas.auth import (
    LoginRequest,
    LoginResponse,
    RefreshRequest,
    RegisterRequest,
    RegisterResponse,
    TokenResponse,
    UserBrief,
)
from app.schemas.errors import ErrorResponse

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post(  # type: ignore
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
    """Register a new user.

    **Request:**
    - username: 3-32 chars, alphanumeric + _-
    - email: Valid email address
    - password: Min 8 chars, uppercase, lowercase, digit
    - display_name: Max 64 chars

    **Response:**
    - User info with access and refresh tokens
    - Access token expires in 30 minutes
    - Refresh token expires in 7 days

    **Errors:**
    - 409: Username or email already exists
    - 422: Validation failed (password too weak, invalid format)
    """
    return await auth_service.register(request)


@router.post(  # type: ignore
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
    """Authenticate a user.

    **Request:**
    - email: User email
    - password: User password

    **Response:**
    - User brief info (id, username, email, display_name, avatar_url)
    - Access and refresh tokens

    **Errors:**
    - 401: Email not found or password incorrect
    """
    return await auth_service.login(request)


@router.post(  # type: ignore
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
    """Refresh authentication tokens.

    Uses a valid refresh token to obtain new access and refresh tokens.
    Implements refresh token rotation for enhanced security.

    **Request:**
    - refresh_token: Valid refresh token from login or previous refresh

    **Response:**
    - New access token (30 min expiry)
    - New refresh token (7 day expiry)
    - Old refresh token is invalidated

    **Errors:**
    - 401: Refresh token is invalid, expired, or has been revoked
    """
    return await auth_service.refresh(request)


@router.post(  # type: ignore
    "/logout",
    status_code=status.HTTP_204_NO_CONTENT,
    responses={
        204: {"description": "Logout successful"},
        401: {"description": "Unauthorized", "model": ErrorResponse},
    },
)
async def logout(
    current_user: CurrentUser,
    auth_service: AuthServiceDep,
) -> None:
    """Logout the current user.

    Invalidates the user's refresh token, preventing further token refreshes.
    The access token remains valid until its expiration.

    **Authentication:**
    - Requires valid access token in Authorization header

    **Response:**
    - 204 No Content

    **Errors:**
    - 401: Missing or invalid access token
    """
    await auth_service.logout(str(current_user.id))


@router.get(  # type: ignore
    "/me",
    response_model=UserBrief,
    responses={
        200: {"description": "Current user info"},
        401: {"description": "Unauthorized", "model": ErrorResponse},
    },
)
async def get_me(current_user: CurrentUser) -> UserBrief:
    """Get the current authenticated user.

    Returns the profile information of the user associated with the current access token.

    **Authentication:**
    - Requires valid access token in Authorization header

    **Response:**
    - id: User UUID
    - username: Unique username
    - email: User email
    - display_name: Display name shown in games
    - avatar_url: Profile image URL (optional)

    **Errors:**
    - 401: Missing or invalid access token
    """
    return UserBrief(
        id=str(current_user.id),
        username=current_user.username,
        email=current_user.email,
        display_name=current_user.display_name,
        avatar_url=current_user.avatar_url,
    )
