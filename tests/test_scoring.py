"""Tests for scoring logic."""
import pytest

from app.schemas.game import GameType
from app.services.scoring_service import ScoringService


@pytest.fixture
def scoring_service() -> ScoringService:
    """Create a ScoringService instance."""
    return ScoringService()


class TestMadeContractScoring:
    """Test scoring for made contracts (non-zero)."""

    def test_made_contract_bid_3(self, scoring_service: ScoringService) -> None:
        """Test bid 3, won 3 → 3² + 10 = 19."""
        score = scoring_service.calculate_round_score(3, 3, GameType.UNDER)
        assert score == 19

    def test_made_contract_bid_5(self, scoring_service: ScoringService) -> None:
        """Test bid 5, won 5 → 5² + 10 = 35."""
        score = scoring_service.calculate_round_score(5, 5, GameType.OVER)
        assert score == 35

    def test_made_contract_bid_1(self, scoring_service: ScoringService) -> None:
        """Test bid 1, won 1 → 1² + 10 = 11."""
        score = scoring_service.calculate_round_score(1, 1, GameType.UNDER)
        assert score == 11

    def test_made_contract_bid_13(self, scoring_service: ScoringService) -> None:
        """Test bid 13, won 13 → 13² + 10 = 179."""
        score = scoring_service.calculate_round_score(13, 13, GameType.OVER)
        assert score == 179


class TestFailedContractScoring:
    """Test scoring for failed contracts (non-zero)."""

    def test_failed_contract_bid_5_won_3(self, scoring_service: ScoringService) -> None:
        """Test bid 5, won 3 → -10 x 2 = -20."""
        score = scoring_service.calculate_round_score(5, 3, GameType.UNDER)
        assert score == -20

    def test_failed_contract_bid_3_won_5(self, scoring_service: ScoringService) -> None:
        """Test bid 3, won 5 → -10 x 2 = -20."""
        score = scoring_service.calculate_round_score(3, 5, GameType.OVER)
        assert score == -20

    def test_failed_contract_by_1(self, scoring_service: ScoringService) -> None:
        """Test bid 5, won 4 → -10 x 1 = -10."""
        score = scoring_service.calculate_round_score(5, 4, GameType.UNDER)
        assert score == -10

    def test_failed_contract_by_many(self, scoring_service: ScoringService) -> None:
        """Test bid 10, won 3 → -10 x 7 = -70."""
        score = scoring_service.calculate_round_score(10, 3, GameType.OVER)
        assert score == -70


class TestZeroBidUnderGame:
    """Test scoring for zero bid in under game."""

    def test_made_zero_under_game(self, scoring_service: ScoringService) -> None:
        """Test bid 0, won 0 in under game → +50."""
        score = scoring_service.calculate_round_score(0, 0, GameType.UNDER)
        assert score == 50

    def test_failed_zero_1_trick_under_game(self, scoring_service: ScoringService) -> None:
        """Test bid 0, won 1 in under game → -50."""
        score = scoring_service.calculate_round_score(0, 1, GameType.UNDER)
        assert score == -50

    def test_failed_zero_2_tricks_under_game(self, scoring_service: ScoringService) -> None:
        """Test bid 0, won 2 in under game → -50 + 10x1 = -40."""
        score = scoring_service.calculate_round_score(0, 2, GameType.UNDER)
        assert score == -40

    def test_failed_zero_3_tricks_under_game(self, scoring_service: ScoringService) -> None:
        """Test bid 0, won 3 in under game → -50 + 10x2 = -30."""
        score = scoring_service.calculate_round_score(0, 3, GameType.UNDER)
        assert score == -30

    def test_failed_zero_13_tricks_under_game(self, scoring_service: ScoringService) -> None:
        """Test bid 0, won 13 in under game → -50 + 10x12 = 70."""
        score = scoring_service.calculate_round_score(0, 13, GameType.UNDER)
        assert score == 70


class TestZeroBidOverGame:
    """Test scoring for zero bid in over game."""

    def test_made_zero_over_game(self, scoring_service: ScoringService) -> None:
        """Test bid 0, won 0 in over game → +25."""
        score = scoring_service.calculate_round_score(0, 0, GameType.OVER)
        assert score == 25

    def test_failed_zero_1_trick_over_game(self, scoring_service: ScoringService) -> None:
        """Test bid 0, won 1 in over game → -50."""
        score = scoring_service.calculate_round_score(0, 1, GameType.OVER)
        assert score == -50

    def test_failed_zero_2_tricks_over_game(self, scoring_service: ScoringService) -> None:
        """Test bid 0, won 2 in over game → -50 + 10x1 = -40."""
        score = scoring_service.calculate_round_score(0, 2, GameType.OVER)
        assert score == -40

    def test_failed_zero_3_tricks_over_game(self, scoring_service: ScoringService) -> None:
        """Test bid 0, won 3 in over game → -50 + 10x2 = -30."""
        score = scoring_service.calculate_round_score(0, 3, GameType.OVER)
        assert score == -30


class TestGameTypeDetermination:
    """Test game type determination based on contract sum."""

    def test_determine_over_game(self, scoring_service: ScoringService) -> None:
        """Test contracts [5, 5, 5, 5] = 20 > 13 → OVER."""
        game_type = scoring_service.determine_game_type([5, 5, 5, 5])
        assert game_type == GameType.OVER

    def test_determine_under_game(self, scoring_service: ScoringService) -> None:
        """Test contracts [3, 3, 3, 3] = 12 < 13 → UNDER."""
        game_type = scoring_service.determine_game_type([3, 3, 3, 3])
        assert game_type == GameType.UNDER

    def test_determine_over_with_zero(self, scoring_service: ScoringService) -> None:
        """Test contracts [0, 5, 5, 5] = 15 > 13 → OVER."""
        game_type = scoring_service.determine_game_type([0, 5, 5, 5])
        assert game_type == GameType.OVER

    def test_determine_under_with_zero(self, scoring_service: ScoringService) -> None:
        """Test contracts [0, 3, 3, 3] = 9 < 13 → UNDER."""
        game_type = scoring_service.determine_game_type([0, 3, 3, 3])
        assert game_type == GameType.UNDER

    def test_determine_invalid_sum_13(self, scoring_service: ScoringService) -> None:
        """Test contracts [5, 5, 2, 1] = 13 → INVALID."""
        with pytest.raises(ValueError, match="equals 13"):
            scoring_service.determine_game_type([5, 5, 2, 1])


class TestContractValidation:
    """Test contract bid validation."""

    def test_valid_contract_mid_range(self, scoring_service: ScoringService) -> None:
        """Test valid contract bid in middle range."""
        is_valid, error = scoring_service.validate_contract_bid(
            bid_amount=5,
            current_sum=5,
            is_last_bidder=False,
        )
        assert is_valid
        assert error is None

    def test_invalid_contract_negative(self, scoring_service: ScoringService) -> None:
        """Test contract bid cannot be negative."""
        is_valid, error = scoring_service.validate_contract_bid(
            bid_amount=-1,
            current_sum=5,
            is_last_bidder=False,
        )
        assert not is_valid
        assert error is not None

    def test_invalid_contract_too_high(self, scoring_service: ScoringService) -> None:
        """Test contract bid cannot exceed 13."""
        is_valid, error = scoring_service.validate_contract_bid(
            bid_amount=14,
            current_sum=5,
            is_last_bidder=False,
        )
        assert not is_valid
        assert error is not None

    def test_last_bidder_cannot_make_13(self, scoring_service: ScoringService) -> None:
        """Test last bidder cannot make sum equal 13."""
        is_valid, error = scoring_service.validate_contract_bid(
            bid_amount=3,
            current_sum=10,
            is_last_bidder=True,
        )
        assert not is_valid
        assert "cannot make the sum equal 13" in error  # type: ignore

    def test_last_bidder_can_make_12(self, scoring_service: ScoringService) -> None:
        """Test last bidder can make sum equal 12."""
        is_valid, error = scoring_service.validate_contract_bid(
            bid_amount=2,
            current_sum=10,
            is_last_bidder=True,
        )
        assert is_valid
        assert error is None

    def test_trump_winner_minimum_bid(self, scoring_service: ScoringService) -> None:
        """Test trump winner must bid >= trump winning bid."""
        is_valid, error = scoring_service.validate_contract_bid(
            bid_amount=6,
            current_sum=5,
            is_last_bidder=False,
            is_trump_winner=True,
            trump_winning_bid=7,
        )
        assert not is_valid
        assert "must bid at least 7" in error  # type: ignore

    def test_trump_winner_can_bid_exact(self, scoring_service: ScoringService) -> None:
        """Test trump winner can bid their trump winning amount."""
        is_valid, error = scoring_service.validate_contract_bid(
            bid_amount=7,
            current_sum=5,
            is_last_bidder=False,
            is_trump_winner=True,
            trump_winning_bid=7,
        )
        assert is_valid
        assert error is None


class TestContractBidEdgeCases:
    """Test edge cases for contract bid validation."""

    def test_zero_bid_always_valid(self, scoring_service: ScoringService) -> None:
        """Test zero bid is always valid (except last bidder)."""
        is_valid, error = scoring_service.validate_contract_bid(
            bid_amount=0,
            current_sum=10,
            is_last_bidder=False,
        )
        assert is_valid
        assert error is None

    def test_last_bidder_can_bid_zero(self, scoring_service: ScoringService) -> None:
        """Test last bidder can bid zero (sum < 13)."""
        is_valid, error = scoring_service.validate_contract_bid(
            bid_amount=0,
            current_sum=10,
            is_last_bidder=True,
        )
        assert is_valid
        assert error is None

    def test_contract_13_is_valid(self, scoring_service: ScoringService) -> None:
        """Test bidding 13 is valid (for non-last players)."""
        is_valid, error = scoring_service.validate_contract_bid(
            bid_amount=13,
            current_sum=0,
            is_last_bidder=False,
        )
        assert is_valid
        assert error is None
