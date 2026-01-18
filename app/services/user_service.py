"""User service for profile and statistics management."""
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Game, GamePlayer, PlayerStats, Round, User
from app.schemas.errors import ErrorCode
from app.schemas.user import (
    GameHistoryEntry,
    GameHistoryResponse,
    PlayerStats as PlayerStatsSchema,
    UserResponse,
    UserUpdateRequest,
)


class UserService:
    """Service for user profile, stats, and history management."""

    def __init__(self, db: AsyncSession) -> None:
        """Initialize user service.

        Args:
            db: Database session
        """
        self.db = db

    async def get_user(self, user_id: UUID) -> UserResponse:
        """Get user profile by ID.

        Args:
            user_id: User ID

        Returns:
            User profile response

        Raises:
            NotFoundError: If user does not exist
        """
        from app.core.exceptions import NotFoundError

        result = await self.db.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()

        if not user:
            raise NotFoundError("User not found", ErrorCode.USER_NOT_FOUND)

        return UserResponse.model_validate(user)  # type: ignore

    async def update_user(
        self, user_id: UUID, request: UserUpdateRequest
    ) -> UserResponse:
        """Update user profile.

        Args:
            user_id: User ID
            request: Update request with optional display_name and avatar_url

        Returns:
            Updated user profile response

        Raises:
            NotFoundError: If user does not exist
        """
        from app.core.exceptions import NotFoundError

        result = await self.db.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()

        if not user:
            raise NotFoundError("User not found", ErrorCode.USER_NOT_FOUND)

        if request.display_name is not None:
            user.display_name = request.display_name
        if request.avatar_url is not None:
            user.avatar_url = str(request.avatar_url)

        await self.db.flush()

        return UserResponse.model_validate(user)  # type: ignore

    async def get_user_stats(self, user_id: UUID) -> PlayerStatsSchema:
        """Get user statistics.

        Args:
            user_id: User ID

        Returns:
            Player statistics

        Raises:
            NotFoundError: If user does not exist
        """
        from app.core.exceptions import NotFoundError

        # Verify user exists
        result = await self.db.execute(
            select(User).where(User.id == user_id).limit(1)
        )
        if not result.scalar_one_or_none():
            raise NotFoundError("User not found", ErrorCode.USER_NOT_FOUND)

        # Get stats from PlayerStats table
        result = await self.db.execute(
            select(PlayerStats).where(PlayerStats.user_id == user_id)
        )
        stats = result.scalar_one_or_none()

        if not stats:
            # Return empty stats if no record exists
            return PlayerStatsSchema()

        return PlayerStatsSchema.model_validate(stats)  # type: ignore

    async def get_user_history(
        self, user_id: UUID, page: int = 1, page_size: int = 20
    ) -> GameHistoryResponse:
        """Get user game history with pagination.

        Args:
            user_id: User ID
            page: Page number (1-indexed)
            page_size: Number of games per page (1-100)

        Returns:
            Paginated game history response

        Raises:
            NotFoundError: If user does not exist
        """
        from app.core.exceptions import NotFoundError

        # Verify user exists
        result = await self.db.execute(
            select(User).where(User.id == user_id).limit(1)
        )
        if not result.scalar_one_or_none():
            raise NotFoundError("User not found", ErrorCode.USER_NOT_FOUND)

        # Get total count of games
        count_result = await self.db.execute(
            select(func.count(Game.id))
            .join(GamePlayer, GamePlayer.game_id == Game.id)
            .where(GamePlayer.user_id == user_id)
        )
        total = count_result.scalar() or 0

        # Get paginated games
        offset = (page - 1) * page_size
        result = await self.db.execute(
            select(Game)
            .join(GamePlayer, GamePlayer.game_id == Game.id)
            .where(GamePlayer.user_id == user_id)
            .order_by(Game.created_at.desc())
            .offset(offset)
            .limit(page_size)
        )
        games = result.scalars().unique().all()

        # Build game history entries
        entries: list[GameHistoryEntry] = []
        for game in games:
            # Get game player record to fetch score and position
            gp_result = await self.db.execute(
                select(GamePlayer).where(
                    (GamePlayer.game_id == game.id)
                    & (GamePlayer.user_id == user_id)
                )
            )
            game_player = gp_result.scalar_one()

            # Count rounds in this game
            round_result = await self.db.execute(
                select(func.count(Round.id)).where(Round.game_id == game.id)
            )
            rounds_played = round_result.scalar() or 0

            # Get player names
            players_result = await self.db.execute(
                select(User.username)
                .join(GamePlayer, GamePlayer.user_id == User.id)
                .where(GamePlayer.game_id == game.id)
                .order_by(GamePlayer.seat_position)
            )
            players = players_result.scalars().all()

            entry = GameHistoryEntry(
                game_id=game.id,
                room_code=game.room_code,  # type: ignore
                played_at=game.created_at,
                final_score=game_player.final_score or 0,
                position=game_player.seat_position or 0,
                rounds_played=rounds_played,
                players=list(players),
            )
            entries.append(entry)

        has_more = (page - 1) * page_size + page_size < total

        return GameHistoryResponse(
            games=entries,
            total=total,
            page=page,
            page_size=page_size,
            has_more=has_more,
        )
