"""Service layer dependencies."""
from typing import Annotated

from fastapi import Depends
from redis.asyncio import Redis  # type: ignore
from sqlalchemy.ext.asyncio import AsyncSession  # type: ignore

from app.dependencies.database import get_db_session
from app.dependencies.redis import get_redis
from app.services.auth_service import AuthService
from app.services.room_service import RoomService
from app.services.user_service import UserService


class GameService:
    """Game service placeholder."""

    pass


class ScoringService:
    """Scoring service placeholder."""

    pass


def get_auth_service(
    db: Annotated[AsyncSession, Depends(get_db_session)],  # type: ignore
    redis: Annotated[Redis, Depends(get_redis)],  # type: ignore
) -> AuthService:
    """Get auth service instance."""
    return AuthService(db, redis)


def get_user_service(
    db: Annotated[AsyncSession, Depends(get_db_session)],  # type: ignore
) -> UserService:
    """Get user service instance."""
    return UserService(db)


def get_room_service(
    db: Annotated[AsyncSession, Depends(get_db_session)],  # type: ignore
    redis: Annotated[Redis, Depends(get_redis)],  # type: ignore
) -> RoomService:
    """Get room service instance."""
    return RoomService(db, redis)


def get_game_service(
    db: Annotated[AsyncSession, Depends(get_db_session)],  # type: ignore
    redis: Annotated[Redis, Depends(get_redis)],  # type: ignore
) -> GameService:
    """Get game service instance."""
    return GameService()


# Type aliases
AuthServiceDep = Annotated[AuthService, Depends(get_auth_service)]
UserServiceDep = Annotated[UserService, Depends(get_user_service)]
RoomServiceDep = Annotated[RoomService, Depends(get_room_service)]
GameServiceDep = Annotated[GameService, Depends(get_game_service)]
