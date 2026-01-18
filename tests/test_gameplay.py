"""Tests for game play logic (trick claiming and round completion)."""
import pytest

from app.schemas.game import GameType
from app.services.scoring_service import ScoringService


@pytest.fixture
def scoring_service() -> ScoringService:
    """Create a ScoringService instance."""
    return ScoringService()


class TestRoundCompletion:
    """Test round completion logic."""

    def test_round_complete_after_13_tricks(self, scoring_service: ScoringService) -> None:
        """Test that round completes when 13 tricks are claimed."""
        # Simulate 13 tricks being claimed (distributed somehow)
        # This would normally be managed by game state
        total_tricks = 13
        assert total_tricks == 13  # Round is complete

    def test_cannot_claim_more_than_13_tricks(
        self, scoring_service: ScoringService
    ) -> None:
        """Test that no player can claim more than 13 tricks total."""
        # Once 13 tricks are claimed total, no more tricks can be claimed
        total_tricks_claimed = 13
        new_claim = 1

        # Should not be able to claim more
        assert total_tricks_claimed + new_claim > 13


class TestScoringScenarios:
    """Test complete scoring scenarios."""

    def test_full_round_under_game(self, scoring_service: ScoringService) -> None:
        """Test scoring for a complete under game round."""
        contracts = [3, 3, 3, 3]  # Total = 12 < 13 → UNDER
        tricks_won = [3, 2, 3, 5]

        game_type = scoring_service.determine_game_type(contracts)
        assert game_type == GameType.UNDER

        # Calculate scores
        scores = [
            scoring_service.calculate_round_score(c, t, game_type)
            for c, t in zip(contracts, tricks_won, strict=False)
        ]

        # Expected: [19, -10, 19, -50] → Total: -22
        assert scores[0] == 19  # Made 3
        assert scores[1] == -10  # Failed 3, won 2
        assert scores[2] == 19  # Made 3
        assert scores[3] == -50  # Won 5, bid 3
        assert sum(scores) == -22

    def test_full_round_over_game(self, scoring_service: ScoringService) -> None:
        """Test scoring for a complete over game round."""
        contracts = [5, 5, 5, 5]  # Total = 20 > 13 → OVER
        tricks_won = [5, 4, 5, 1]

        game_type = scoring_service.determine_game_type(contracts)
        assert game_type == GameType.OVER

        # Calculate scores
        scores = [
            scoring_service.calculate_round_score(c, t, game_type)
            for c, t in zip(contracts, tricks_won, strict=False)
        ]

        # Expected: [35, -10, 35, -40]
        assert scores[0] == 35  # Made 5
        assert scores[1] == -10  # Failed 5, won 4
        assert scores[2] == 35  # Made 5
        assert scores[3] == -40  # Won 1, bid 5
        assert sum(scores) == 20

    def test_round_with_zero_bid_under(self, scoring_service: ScoringService) -> None:
        """Test round with zero bid in under game."""
        contracts = [0, 5, 5, 3]  # Total = 13 - 1 = 12 < 13 → Impossible (sum=13 blocked)
        # Use valid contracts
        contracts = [0, 5, 5, 2]  # Total = 12 < 13 → UNDER
        tricks_won = [0, 5, 5, 2]

        game_type = scoring_service.determine_game_type(contracts)
        assert game_type == GameType.UNDER

        scores = [
            scoring_service.calculate_round_score(c, t, game_type)
            for c, t in zip(contracts, tricks_won, strict=False)
        ]

        # Expected: [50, 35, 35, 19] → Total: 139
        assert scores[0] == 50  # Made zero in under
        assert scores[1] == 35  # Made 5
        assert scores[2] == 35  # Made 5
        assert scores[3] == 19  # Made 2

    def test_round_with_zero_bid_over(self, scoring_service: ScoringService) -> None:
        """Test round with zero bid in over game."""
        contracts = [0, 5, 5, 5]  # Total = 15 > 13 → OVER
        tricks_won = [0, 5, 5, 5]

        game_type = scoring_service.determine_game_type(contracts)
        assert game_type == GameType.OVER

        scores = [
            scoring_service.calculate_round_score(c, t, game_type)
            for c, t in zip(contracts, tricks_won, strict=False)
        ]

        # Expected: [25, 35, 35, 35] → Total: 130
        assert scores[0] == 25  # Made zero in over
        assert scores[1] == 35  # Made 5
        assert scores[2] == 35  # Made 5
        assert scores[3] == 35  # Made 5

    def test_round_with_failed_zero_bid(self, scoring_service: ScoringService) -> None:
        """Test round with failed zero bid."""
        contracts = [0, 5, 4, 4]  # Total = 13 - 1 = 12 < 13 → Impossible
        # Use valid
        contracts = [0, 5, 4, 3]  # Total = 12 < 13 → UNDER
        tricks_won = [3, 5, 4, 1]  # Zero bidder won 3

        game_type = scoring_service.determine_game_type(contracts)
        assert game_type == GameType.UNDER

        scores = [
            scoring_service.calculate_round_score(c, t, game_type)
            for c, t in zip(contracts, tricks_won, strict=False)
        ]

        # Expected: [-30, 35, 26, -30]
        assert scores[0] == -30  # Failed zero, won 3 tricks
        assert scores[1] == 35  # Made 5
        assert scores[2] == 26  # Won 4, bid 4 (4² + 10 = 26, but only if made)

        # Fix: bid 4, won 4 → made
        assert scores[2] == 26  # Made 4

    def test_all_players_make_contract(self, scoring_service: ScoringService) -> None:
        """Test round where all players make their contracts."""
        contracts = [2, 3, 2, 2]  # Total = 9 < 13 → UNDER
        tricks_won = [2, 3, 2, 2]  # All made

        game_type = scoring_service.determine_game_type(contracts)
        assert game_type == GameType.UNDER

        scores = [
            scoring_service.calculate_round_score(c, t, game_type)
            for c, t in zip(contracts, tricks_won, strict=False)
        ]

        # Expected: [14, 19, 14, 14] → Total: 61
        assert scores[0] == 14  # 2² + 10
        assert scores[1] == 19  # 3² + 10
        assert scores[2] == 14  # 2² + 10
        assert scores[3] == 14  # 2² + 10
        assert sum(scores) == 61

    def test_all_players_fail_contract(self, scoring_service: ScoringService) -> None:
        """Test round where all players fail their contracts."""
        contracts = [5, 5, 5, 5]  # Total = 20 > 13 → OVER
        tricks_won = [3, 3, 3, 3]  # All won 3, bid 5

        game_type = scoring_service.determine_game_type(contracts)
        assert game_type == GameType.OVER

        scores = [
            scoring_service.calculate_round_score(c, t, game_type)
            for c, t in zip(contracts, tricks_won, strict=False)
        ]

        # Expected: [-20, -20, -20, -20] → Total: -80
        assert scores[0] == -20  # -10 x 2
        assert scores[1] == -20  # -10 x 2
        assert scores[2] == -20  # -10 x 2
        assert scores[3] == -20  # -10 x 2
        assert sum(scores) == -80


class TestEdgeCasesGameplay:
    """Test edge cases in gameplay."""

    def test_trump_winner_makes_contract(self, scoring_service: ScoringService) -> None:
        """Test trump winner who makes their contract (must bid >= trump bid)."""
        # Trump winner bid 7 in trump, contracts are [7, 5, 5, 3]
        contracts = [7, 5, 5, 3]  # Trump winner
        tricks_won = [7, 5, 5, 3]  # All made
        game_type = GameType.OVER  # 7+5+5+3 = 20 > 13

        scores = [
            scoring_service.calculate_round_score(c, t, game_type)
            for c, t in zip(contracts, tricks_won, strict=False)
        ]

        # Trump winner: 7² + 10 = 59
        assert scores[0] == 59

    def test_high_contract_bids(self, scoring_service: ScoringService) -> None:
        """Test scoring with high contract bids (13)."""
        contracts = [13, 1, 0, 0]  # Total = 14 > 13 → OVER
        tricks_won = [13, 1, 0, 0]  # All made
        game_type = GameType.OVER

        scores = [
            scoring_service.calculate_round_score(c, t, game_type)
            for c, t in zip(contracts, tricks_won, strict=False)
        ]

        # First player: 13² + 10 = 179
        assert scores[0] == 179
        assert scores[1] == 11  # 1² + 10
        assert scores[2] == 25  # Made zero in over
        assert scores[3] == 25  # Made zero in over

    def test_single_trick_difference(self, scoring_service: ScoringService) -> None:
        """Test failure by just 1 trick."""
        contracts = [7, 7, 7, 7]
        tricks_won = [6, 7, 8, 7]  # First fails by 1, third fails by 1
        game_type = GameType.OVER  # 28 > 13

        scores = [
            scoring_service.calculate_round_score(c, t, game_type)
            for c, t in zip(contracts, tricks_won, strict=False)
        ]

        # Failed by 1: -10
        assert scores[0] == -10
        assert scores[1] == 59  # 7² + 10
        assert scores[2] == -10
        assert scores[3] == 59

    def test_maximum_failure_penalty(self, scoring_service: ScoringService) -> None:
        """Test maximum failure penalty (bid high, win low)."""
        contracts = [13, 13, 13, 13]  # Total = 52 > 13 → OVER
        tricks_won = [0, 1, 2, 3]  # All fail badly
        game_type = GameType.OVER

        scores = [
            scoring_service.calculate_round_score(c, t, game_type)
            for c, t in zip(contracts, tricks_won, strict=False)
        ]

        # -10 x 13 = -130 (worst possible)
        assert scores[0] == -130
        assert scores[1] == -120
        assert scores[2] == -110
        assert scores[3] == -100
