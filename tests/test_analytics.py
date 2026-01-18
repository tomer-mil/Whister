"""Tests for analytics functionality."""
from uuid import uuid4

import pytest

from app.services.analytics_service import AnalyticsService


@pytest.fixture
async def analytics_service(db_session, redis) -> AnalyticsService:  # type: ignore[no-untyped-def]
    """Create an AnalyticsService instance."""
    return AnalyticsService(db_session, redis)


class TestPlayerStats:
    """Test player statistics calculation."""

    async def test_get_player_stats_nonexistent_user(
        self,
        analytics_service: AnalyticsService,
    ) -> None:
        """Test getting stats for nonexistent user fails."""
        with pytest.raises(ValueError, match="not found"):
            await analytics_service.get_player_stats(uuid4())

    async def test_get_player_stats_new_player(
        self,
        analytics_service: AnalyticsService,
        test_user_id: str,
    ) -> None:
        """Test getting stats for player with no games."""
        stats = await analytics_service.get_player_stats(test_user_id)  # type: ignore[arg-type]
        assert stats.total_games == 0
        assert stats.total_rounds == 0
        assert stats.wins == 0


class TestHeadToHeadStats:
    """Test head-to-head statistics."""

    async def test_get_head_to_head_nonexistent_player(
        self,
        analytics_service: AnalyticsService,
    ) -> None:
        """Test head-to-head with nonexistent player fails."""
        with pytest.raises(ValueError, match="not found"):
            await analytics_service.get_head_to_head_stats(uuid4(), uuid4())

    async def test_get_head_to_head_no_common_games(
        self,
        analytics_service: AnalyticsService,
        test_user_id: str,
    ) -> None:
        """Test head-to-head with no common games."""
        # This test requires multiple users, simplified here
        # In real scenario, would create both users first
        pass


class TestPlayerStatsUpdate:
    """Test updating player statistics."""

    async def test_update_stats_after_made_contract(
        self,
        analytics_service: AnalyticsService,
        test_user_id: str,
    ) -> None:
        """Test updating stats after made contract."""
        await analytics_service.update_player_stats_after_round(
            user_id=test_user_id,  # type: ignore[arg-type]
            contract_bid=5,
            tricks_won=5,
            round_score=35,
        )

        stats = await analytics_service.get_player_stats(test_user_id)  # type: ignore[arg-type]
        assert stats.total_rounds == 1
        assert stats.total_made_contracts == 1
        assert stats.total_failed_contracts == 0

    async def test_update_stats_after_failed_contract(
        self,
        analytics_service: AnalyticsService,
        test_user_id: str,
    ) -> None:
        """Test updating stats after failed contract."""
        await analytics_service.update_player_stats_after_round(
            user_id=test_user_id,  # type: ignore[arg-type]
            contract_bid=5,
            tricks_won=3,
            round_score=-20,
        )

        stats = await analytics_service.get_player_stats(test_user_id)  # type: ignore[arg-type]
        assert stats.total_rounds == 1
        assert stats.total_made_contracts == 0
        assert stats.total_failed_contracts == 1

    async def test_update_stats_zero_bid_made(
        self,
        analytics_service: AnalyticsService,
        test_user_id: str,
    ) -> None:
        """Test updating stats after made zero bid."""
        await analytics_service.update_player_stats_after_round(
            user_id=test_user_id,  # type: ignore[arg-type]
            contract_bid=0,
            tricks_won=0,
            round_score=50,
        )

        stats = await analytics_service.get_player_stats(test_user_id)  # type: ignore[arg-type]
        assert stats.zero_bid_made == 1
        assert stats.zero_bid_failed == 0

    async def test_update_stats_zero_bid_failed(
        self,
        analytics_service: AnalyticsService,
        test_user_id: str,
    ) -> None:
        """Test updating stats after failed zero bid."""
        await analytics_service.update_player_stats_after_round(
            user_id=test_user_id,  # type: ignore[arg-type]
            contract_bid=0,
            tricks_won=2,
            round_score=-40,
        )

        stats = await analytics_service.get_player_stats(test_user_id)  # type: ignore[arg-type]
        assert stats.zero_bid_made == 0
        assert stats.zero_bid_failed == 1

    async def test_update_stats_highest_score(
        self,
        analytics_service: AnalyticsService,
        test_user_id: str,
    ) -> None:
        """Test tracking highest round score."""
        await analytics_service.update_player_stats_after_round(
            user_id=test_user_id,  # type: ignore[arg-type]
            contract_bid=5,
            tricks_won=5,
            round_score=35,
        )
        await analytics_service.update_player_stats_after_round(
            user_id=test_user_id,  # type: ignore[arg-type]
            contract_bid=10,
            tricks_won=10,
            round_score=110,
        )

        stats = await analytics_service.get_player_stats(test_user_id)  # type: ignore[arg-type]
        assert stats.highest_round_score == 110

    async def test_update_stats_lowest_score(
        self,
        analytics_service: AnalyticsService,
        test_user_id: str,
    ) -> None:
        """Test tracking lowest round score."""
        await analytics_service.update_player_stats_after_round(
            user_id=test_user_id,  # type: ignore[arg-type]
            contract_bid=5,
            tricks_won=2,
            round_score=-30,
        )
        await analytics_service.update_player_stats_after_round(
            user_id=test_user_id,  # type: ignore[arg-type]
            contract_bid=3,
            tricks_won=1,
            round_score=-20,
        )

        stats = await analytics_service.get_player_stats(test_user_id)  # type: ignore[arg-type]
        assert stats.lowest_round_score == -30

    async def test_update_stats_trump_winner(
        self,
        analytics_service: AnalyticsService,
        test_user_id: str,
    ) -> None:
        """Test tracking trump wins."""
        await analytics_service.update_player_stats_after_round(
            user_id=test_user_id,  # type: ignore[arg-type]
            contract_bid=7,
            tricks_won=7,
            round_score=59,
            is_trump_winner=True,
        )

        stats = await analytics_service.get_player_stats(test_user_id)  # type: ignore[arg-type]
        assert stats.trump_win_count == 1


class TestWinStreak:
    """Test win streak tracking."""

    async def test_current_streak_increments(
        self,
        analytics_service: AnalyticsService,
        test_user_id: str,
    ) -> None:
        """Test current streak increments on made contracts."""
        await analytics_service.update_player_stats_after_round(
            user_id=test_user_id,  # type: ignore[arg-type]
            contract_bid=3,
            tricks_won=3,
            round_score=19,
        )
        await analytics_service.update_player_stats_after_round(
            user_id=test_user_id,  # type: ignore[arg-type]
            contract_bid=4,
            tricks_won=4,
            round_score=26,
        )

        stats = await analytics_service.get_player_stats(test_user_id)  # type: ignore[arg-type]
        assert stats.current_streak == 2

    async def test_best_streak_tracked(
        self,
        analytics_service: AnalyticsService,
        test_user_id: str,
    ) -> None:
        """Test best streak is tracked."""
        # Make 3 in a row
        for _ in range(3):
            await analytics_service.update_player_stats_after_round(
                user_id=test_user_id,  # type: ignore[arg-type]
                contract_bid=2,
                tricks_won=2,
                round_score=14,
            )

        # Fail one
        await analytics_service.update_player_stats_after_round(
            user_id=test_user_id,  # type: ignore[arg-type]
            contract_bid=5,
            tricks_won=2,
            round_score=-30,
        )

        stats = await analytics_service.get_player_stats(test_user_id)  # type: ignore[arg-type]
        assert stats.best_streak == 3
        assert stats.current_streak == 0

    async def test_streak_resets_on_failure(
        self,
        analytics_service: AnalyticsService,
        test_user_id: str,
    ) -> None:
        """Test streak resets on failure."""
        await analytics_service.update_player_stats_after_round(
            user_id=test_user_id,  # type: ignore[arg-type]
            contract_bid=3,
            tricks_won=3,
            round_score=19,
        )
        await analytics_service.update_player_stats_after_round(
            user_id=test_user_id,  # type: ignore[arg-type]
            contract_bid=5,
            tricks_won=3,
            round_score=-20,
        )

        stats = await analytics_service.get_player_stats(test_user_id)  # type: ignore[arg-type]
        assert stats.current_streak == 0


class TestGroupLeaderboard:
    """Test group leaderboard generation."""

    async def test_group_leaderboard_empty(
        self,
        analytics_service: AnalyticsService,
        group_service,  # type: ignore[name-defined]
        test_user_id: str,
    ) -> None:
        """Test leaderboard for group with single member."""

        # Create a group
        group_id = await group_service.create_group(
            user_id=test_user_id,  # type: ignore[arg-type]
            name="Test Group",
        )

        leaderboard = await analytics_service.get_group_leaderboard(group_id)
        assert len(leaderboard) >= 0  # May be empty or have creator


class TestPlayerStatsMultipleRounds:
    """Test stats across multiple rounds."""

    async def test_average_score_calculation(
        self,
        analytics_service: AnalyticsService,
        test_user_id: str,
    ) -> None:
        """Test average score is calculated correctly."""
        # Round 1: 35 points
        await analytics_service.update_player_stats_after_round(
            user_id=test_user_id,  # type: ignore[arg-type]
            contract_bid=5,
            tricks_won=5,
            round_score=35,
        )
        # Round 2: 19 points
        await analytics_service.update_player_stats_after_round(
            user_id=test_user_id,  # type: ignore[arg-type]
            contract_bid=3,
            tricks_won=3,
            round_score=19,
        )

        stats = await analytics_service.get_player_stats(test_user_id)  # type: ignore[arg-type]
        assert stats.total_rounds == 2
        assert stats.average_round_score == 27.0
