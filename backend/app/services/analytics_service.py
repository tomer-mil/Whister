"""Analytics service for calculating player and group statistics."""
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from redis.asyncio import Redis  # type: ignore[import-untyped]
from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Game, GroupMember, PlayerStats, User  # type: ignore[attr-defined]
from app.schemas.group import GroupLeaderboard, HeadToHeadStats
from app.schemas.group import PlayerStats as PlayerStatsSchema


class AnalyticsService:
    """Service for analytics and statistics calculations."""

    def __init__(self, db: AsyncSession, redis: Redis) -> None:  # type: ignore[type-arg]
        """Initialize analytics service.

        Args:
            db: Database session
            redis: Redis connection
        """
        self.db = db
        self.redis = redis

    async def get_player_stats(self, user_id: UUID) -> PlayerStatsSchema:
        """Get comprehensive statistics for a player.

        Args:
            user_id: ID of player

        Returns:
            PlayerStats with calculated statistics

        Raises:
            ValueError: If player not found
        """
        # Verify user exists
        user_result = await self.db.execute(select(User).where(User.id == user_id))
        user = user_result.scalar_one_or_none()
        if not user:
            raise ValueError(f"User {user_id} not found")

        # Check cache
        cache_key = f"player_stats:{user_id}"
        cached = await self.redis.get(cache_key)
        if cached:
            # Cache hit would need deserialization, skip for now
            pass

        # Fetch PlayerStats record from database
        stats_result = await self.db.execute(
            select(PlayerStats).where(PlayerStats.user_id == user_id)
        )
        stats = stats_result.scalar_one_or_none()
        if not stats:
            # Create default stats if not found
            stats = PlayerStats(
                user_id=user_id,
                total_games=0,
                total_rounds=0,
                contracts_made=0,
                contracts_attempted=0,
                zeros_made=0,
                zeros_attempted=0,
                trump_wins=0,
                current_streak=0,
                best_streak=0,
                highest_round_score=0,
                total_wins=0,
                total_points=0,
            )

        # Calculate derived statistics
        total_rounds = stats.total_rounds if stats.total_rounds > 0 else 1
        total_contracts = stats.contracts_attempted
        total_contracts_denom = total_contracts if total_contracts > 0 else 1
        total_zero_bids = stats.zeros_attempted
        total_zero_bids_denom = total_zero_bids if total_zero_bids > 0 else 1

        win_rate = (
            (stats.contracts_made / total_contracts_denom) * 100
            if stats.contracts_made > 0
            else 0.0
        )
        zero_bid_rate = (
            (stats.zeros_made / total_zero_bids_denom) * 100
            if stats.zeros_made > 0
            else 0.0
        )

        # Use total_points from stats record
        total_points = stats.total_points
        average_score = total_points / stats.total_games if stats.total_games > 0 else 0.0
        average_round_score = (
            total_points / total_rounds if total_rounds > 0 else 0.0
        )

        # Fetch wins count (games where player had highest total score)
        # This is a simplified approach - in production you'd track this explicitly
        wins = 0

        return PlayerStatsSchema(
            user_id=user_id,
            display_name=user.display_name,
            total_games=stats.total_games,
            total_rounds=stats.total_rounds,
            wins=stats.total_wins,
            losses=stats.total_games - stats.total_wins,
            win_rate=stats.win_rate,
            average_score=average_score,
            average_round_score=average_round_score,
            total_made_contracts=stats.contracts_made,
            total_failed_contracts=stats.contracts_attempted - stats.contracts_made,
            contract_success_rate=win_rate,
            zero_bid_made=stats.zeros_made,
            zero_bid_failed=stats.zeros_attempted - stats.zeros_made,
            zero_bid_success_rate=zero_bid_rate,
            trump_win_count=stats.trump_wins,
            current_streak=stats.current_streak,
            best_streak=stats.best_streak,
            highest_round_score=stats.highest_round_score,
            lowest_round_score=stats.lowest_score if stats.lowest_score is not None else 0,
            updated_at=stats.updated_at or datetime.now(UTC),
        )

    async def get_group_leaderboard(
        self,
        group_id: UUID,
        limit: int = 50,
    ) -> list[GroupLeaderboard]:
        """Get leaderboard for a group.

        Args:
            group_id: ID of group
            limit: Maximum number of entries to return

        Returns:
            List of leaderboard entries sorted by score
        """
        # Fetch all group members
        members_result = await self.db.execute(
            select(GroupMember.user_id).where(GroupMember.group_id == group_id)
        )
        user_ids = members_result.scalars().all()

        # Fetch stats for each member
        leaderboard_entries = []
        for rank, user_id in enumerate(user_ids, 1):
            # Get user info
            user_result = await self.db.execute(
                select(User).where(User.id == user_id)
            )
            user = user_result.scalar_one_or_none()
            if not user:
                continue

            # Get stats
            stats_result = await self.db.execute(
                select(PlayerStats).where(PlayerStats.user_id == user_id)
            )
            stats = stats_result.scalar_one_or_none()
            if not stats:
                continue

            # Get total score
            try:
                from app.models import RoundResult as RoundResultModel  # type: ignore[attr-defined]
                score_result = await self.db.execute(
                    select(func.sum(RoundResultModel.score)).where(
                        RoundResultModel.user_id == user_id
                    )
                )
                total_score = score_result.scalar() or 0
            except (ImportError, AttributeError):
                total_score = 0

            # Calculate average round score
            total_rounds = stats.total_rounds if stats.total_rounds > 0 else 1
            average_round_score = (
                total_score / total_rounds if total_rounds > 0 else 0.0
            )

            leaderboard_entries.append(
                GroupLeaderboard(
                    rank=rank,
                    user_id=user_id,
                    display_name=user.display_name,
                    total_score=int(total_score),
                    average_round_score=average_round_score,
                    win_count=0,  # Simplified - would need game outcomes
                    game_count=stats.total_games,
                )
            )

        # Sort by total score descending
        leaderboard_entries.sort(key=lambda x: x.total_score, reverse=True)

        # Update ranks
        for rank, entry in enumerate(leaderboard_entries[:limit], 1):
            entry.rank = rank

        return leaderboard_entries[:limit]

    async def get_head_to_head_stats(
        self,
        user1_id: UUID,
        user2_id: UUID,
    ) -> HeadToHeadStats:
        """Get head-to-head statistics between two players.

        Args:
            user1_id: First player ID
            user2_id: Second player ID

        Returns:
            HeadToHeadStats with comparison data

        Raises:
            ValueError: If players not found
        """
        # Verify both users exist
        user1_result = await self.db.execute(
            select(User).where(User.id == user1_id)
        )
        user1 = user1_result.scalar_one_or_none()
        if not user1:
            raise ValueError(f"User {user1_id} not found")

        user2_result = await self.db.execute(
            select(User).where(User.id == user2_id)
        )
        user2 = user2_result.scalar_one_or_none()
        if not user2:
            raise ValueError(f"User {user2_id} not found")

        # Get common games
        # Note: RoundResult table not yet defined in models
        try:
            from app.models import RoundResult as RoundResultModel  # type: ignore[attr-defined]
            games_result = await self.db.execute(
                select(Game.id).where(
                    and_(
                        Game.id.in_(
                            select(RoundResultModel.game_id).where(
                                RoundResultModel.user_id == user1_id
                            )
                        ),
                        Game.id.in_(
                            select(RoundResultModel.game_id).where(
                                RoundResultModel.user_id == user2_id
                            )
                        ),
                    )
                )
            )
            game_ids = games_result.scalars().all()
            total_games = len(game_ids)

            # Get scores for each player in common games
            user1_score_result = await self.db.execute(
                select(func.sum(RoundResultModel.score)).where(
                    and_(
                        RoundResultModel.user_id == user1_id,
                        RoundResultModel.game_id.in_(game_ids),
                    )
                )
            )
            user1_total_score = user1_score_result.scalar() or 0

            user2_score_result = await self.db.execute(
                select(func.sum(RoundResultModel.score)).where(
                    and_(
                        RoundResultModel.user_id == user2_id,
                        RoundResultModel.game_id.in_(game_ids),
                    )
                )
            )
            user2_total_score = user2_score_result.scalar() or 0
        except (ImportError, AttributeError):
            total_games = 0
            user1_total_score = 0
            user2_total_score = 0

        # Simplified win count (would need game outcome tracking)
        user1_wins = 0
        user2_wins = 0

        user1_avg = user1_total_score / total_games if total_games > 0 else 0.0
        user2_avg = user2_total_score / total_games if total_games > 0 else 0.0
        user1_rate = (
            (user1_wins / total_games * 100) if total_games > 0 else 0.0
        )
        user2_rate = (
            (user2_wins / total_games * 100) if total_games > 0 else 0.0
        )

        return HeadToHeadStats(
            player1_id=user1_id,
            player1_name=user1.display_name,
            player2_id=user2_id,
            player2_name=user2.display_name,
            player1_wins=user1_wins,
            player2_wins=user2_wins,
            total_games=total_games,
            player1_average_score=user1_avg,
            player2_average_score=user2_avg,
            player1_win_rate=user1_rate,
            player2_win_rate=user2_rate,
        )

    async def update_player_stats_after_round(
        self,
        user_id: UUID,
        contract_bid: int,
        tricks_won: int,
        round_score: int,
        is_trump_winner: bool = False,
    ) -> None:
        """Update player statistics after a round completes.

        Args:
            user_id: ID of player
            contract_bid: Contract bid amount
            tricks_won: Tricks won
            round_score: Score for round
            is_trump_winner: Whether player won trump bidding
        """
        # Get or create stats record
        stats_result = await self.db.execute(
            select(PlayerStats).where(PlayerStats.user_id == user_id)
        )
        stats = stats_result.scalar_one_or_none()
        if not stats:
            stats = PlayerStats(user_id=user_id)
            self.db.add(stats)
            await self.db.flush()

        # Update counts
        stats.total_rounds += 1
        if contract_bid == 0:
            stats.zeros_attempted += 1
            if tricks_won == 0:
                stats.zeros_made += 1
        else:
            stats.contracts_attempted += 1
            if tricks_won == contract_bid:
                stats.contracts_made += 1

        # Update score tracking
        stats.total_points += round_score
        if round_score > stats.highest_round_score:
            stats.highest_round_score = round_score
        if stats.lowest_score == 0 or round_score < stats.lowest_score:
            stats.lowest_score = round_score

        # Update trump wins
        if is_trump_winner:
            stats.trump_wins += 1

        # Update streak (simplified - only tracks made contracts)
        if tricks_won == contract_bid and contract_bid > 0:
            stats.current_streak += 1
            if stats.current_streak > stats.best_streak:
                stats.best_streak = stats.current_streak
        else:
            stats.current_streak = 0

        await self.db.commit()

        # Invalidate player cache
        cache_key = f"player_stats:{user_id}"
        await self.redis.delete(cache_key)
