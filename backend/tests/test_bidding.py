"""Tests for bidding logic."""
import pytest
from httpx import AsyncClient
from redis.asyncio import Redis  # type: ignore

from app.schemas.game import GameType, TrumpSuit
from app.services.bidding_service import BiddingService
from app.services.scoring_service import ScoringService
from app.websocket.schemas import BidInfo


@pytest.mark.asyncio
async def test_trump_bid_validation(client: AsyncClient) -> None:
    """Test that valid trump bids are accepted."""
    redis = Redis.from_url("redis://localhost")
    bidding_service = BiddingService(redis)

    # Valid initial bid (5 spades)
    is_valid, error = await bidding_service.validate_trump_bid(
        new_bid_amount=5,
        new_bid_suit=TrumpSuit.SPADES,
        current_highest=None,
        minimum_bid=5,
    )
    assert is_valid
    assert error is None

    await redis.close()


@pytest.mark.asyncio
async def test_trump_bid_too_low(client: AsyncClient) -> None:
    """Test that bids below minimum are rejected."""
    redis = Redis.from_url("redis://localhost")
    bidding_service = BiddingService(redis)

    # Bid below minimum (4 when minimum is 5)
    is_valid, error = await bidding_service.validate_trump_bid(
        new_bid_amount=4,
        new_bid_suit=TrumpSuit.SPADES,
        current_highest=None,
        minimum_bid=5,
    )
    assert not is_valid
    assert error is not None
    assert "at least 5" in error

    await redis.close()


@pytest.mark.asyncio
async def test_trump_bid_must_outbid(client: AsyncClient) -> None:
    """Test that new bids must outbid current highest."""
    redis = Redis.from_url("redis://localhost")
    bidding_service = BiddingService(redis)

    current_highest = BidInfo(
        player_id="player1",
        player_name="Alice",
        amount=6,
        suit=TrumpSuit.HEARTS,
    )

    # Trying to bid 6 clubs (same amount, lower suit) - should fail
    is_valid, error = await bidding_service.validate_trump_bid(
        new_bid_amount=6,
        new_bid_suit=TrumpSuit.CLUBS,
        current_highest=current_highest,
        minimum_bid=5,
    )
    assert not is_valid
    assert error is not None

    # Trying to bid 6 spades (same amount, higher suit) - should pass
    is_valid, error = await bidding_service.validate_trump_bid(
        new_bid_amount=6,
        new_bid_suit=TrumpSuit.SPADES,
        current_highest=current_highest,
        minimum_bid=5,
    )
    assert is_valid
    assert error is None

    # Trying to bid 7 clubs (higher amount) - should pass
    is_valid, error = await bidding_service.validate_trump_bid(
        new_bid_amount=7,
        new_bid_suit=TrumpSuit.CLUBS,
        current_highest=current_highest,
        minimum_bid=5,
    )
    assert is_valid
    assert error is None

    await redis.close()


@pytest.mark.asyncio
async def test_minimum_bid_progression(client: AsyncClient) -> None:
    """Test that minimum bid increases with frisch."""
    redis = Redis.from_url("redis://localhost")
    bidding_service = BiddingService(redis)

    # Initial: frisch_count=0, minimum_bid=5
    assert bidding_service.get_minimum_bid(0) == 5

    # After 1st frisch: frisch_count=1, minimum_bid=6
    assert bidding_service.get_minimum_bid(1) == 6

    # After 2nd frisch: frisch_count=2, minimum_bid=7
    assert bidding_service.get_minimum_bid(2) == 7

    # After 3rd frisch: frisch_count=3, minimum_bid=8
    assert bidding_service.get_minimum_bid(3) == 8

    await redis.close()


@pytest.mark.asyncio
async def test_contract_bid_validation_basic(client: AsyncClient) -> None:
    """Test basic contract bid validation."""
    redis = Redis.from_url("redis://localhost")
    scoring_service = ScoringService()

    # Valid contract: 5 tricks when current sum is 5 (not last bidder)
    is_valid, error = scoring_service.validate_contract_bid(
        bid_amount=5,
        current_sum=5,
        is_last_bidder=False,
    )
    assert is_valid
    assert error is None

    # Invalid: negative bid
    is_valid, error = scoring_service.validate_contract_bid(
        bid_amount=-1,
        current_sum=5,
        is_last_bidder=False,
    )
    assert not is_valid
    assert error is not None

    # Invalid: bid > 13
    is_valid, error = scoring_service.validate_contract_bid(
        bid_amount=14,
        current_sum=5,
        is_last_bidder=False,
    )
    assert not is_valid
    assert error is not None

    await redis.close()


@pytest.mark.asyncio
async def test_contract_bid_last_bidder_cannot_make_13(client: AsyncClient) -> None:
    """Test that last bidder cannot make sum equal to 13."""
    redis = Redis.from_url("redis://localhost")
    scoring_service = ScoringService()

    # Current sum is 10, last bidder bids 3 = 13 total - INVALID
    is_valid, error = scoring_service.validate_contract_bid(
        bid_amount=3,
        current_sum=10,
        is_last_bidder=True,
    )
    assert not is_valid
    assert "cannot make the sum equal 13" in error  # type: ignore

    # Current sum is 10, last bidder bids 2 = 12 total - VALID
    is_valid, error = scoring_service.validate_contract_bid(
        bid_amount=2,
        current_sum=10,
        is_last_bidder=True,
    )
    assert is_valid
    assert error is None

    await redis.close()


@pytest.mark.asyncio
async def test_contract_bid_trump_winner_minimum(client: AsyncClient) -> None:
    """Test that trump winner must bid >= their trump winning bid."""
    redis = Redis.from_url("redis://localhost")
    scoring_service = ScoringService()

    # Trump winner bid 7 in trump, now bidding 6 in contract - INVALID
    is_valid, error = scoring_service.validate_contract_bid(
        bid_amount=6,
        current_sum=5,
        is_last_bidder=False,
        is_trump_winner=True,
        trump_winning_bid=7,
    )
    assert not is_valid
    assert "must bid at least 7" in error  # type: ignore

    # Trump winner bid 7 in trump, now bidding 7 in contract - VALID
    is_valid, error = scoring_service.validate_contract_bid(
        bid_amount=7,
        current_sum=5,
        is_last_bidder=False,
        is_trump_winner=True,
        trump_winning_bid=7,
    )
    assert is_valid
    assert error is None

    await redis.close()


@pytest.mark.asyncio
async def test_determine_game_type_over(client: AsyncClient) -> None:
    """Test game type determination for over game."""
    redis = Redis.from_url("redis://localhost")
    scoring_service = ScoringService()

    # Contracts: [5, 5, 5, 5] = 20 > 13 → OVER
    game_type = scoring_service.determine_game_type([5, 5, 5, 5])
    assert game_type == GameType.OVER

    await redis.close()


@pytest.mark.asyncio
async def test_determine_game_type_under(client: AsyncClient) -> None:
    """Test game type determination for under game."""
    redis = Redis.from_url("redis://localhost")
    scoring_service = ScoringService()

    # Contracts: [3, 3, 3, 3] = 12 < 13 → UNDER
    game_type = scoring_service.determine_game_type([3, 3, 3, 3])
    assert game_type == GameType.UNDER

    await redis.close()


@pytest.mark.asyncio
async def test_determine_game_type_invalid(client: AsyncClient) -> None:
    """Test game type determination rejects sum of 13."""
    redis = Redis.from_url("redis://localhost")
    scoring_service = ScoringService()

    # Contracts: [5, 5, 2, 1] = 13 → INVALID
    with pytest.raises(ValueError, match="equals 13"):
        scoring_service.determine_game_type([5, 5, 2, 1])

    await redis.close()


@pytest.mark.asyncio
async def test_suit_ordering(client: AsyncClient) -> None:
    """Test that suit ordering is correct for bid comparison."""
    redis = Redis.from_url("redis://localhost")
    bidding_service = BiddingService(redis)

    current_highest = BidInfo(
        player_id="player1",
        player_name="Alice",
        amount=5,
        suit=TrumpSuit.DIAMONDS,
    )

    # Suit order: Clubs(0) < Diamonds(1) < Hearts(2) < Spades(3) < NO_TRUMP(4)
    # So 5 hearts should beat 5 diamonds

    is_valid, error = await bidding_service.validate_trump_bid(
        new_bid_amount=5,
        new_bid_suit=TrumpSuit.HEARTS,
        current_highest=current_highest,
        minimum_bid=5,
    )
    assert is_valid
    assert error is None

    # 5 clubs should not beat 5 diamonds
    is_valid, error = await bidding_service.validate_trump_bid(
        new_bid_amount=5,
        new_bid_suit=TrumpSuit.CLUBS,
        current_highest=current_highest,
        minimum_bid=5,
    )
    assert not is_valid
    assert error is not None

    await redis.close()


@pytest.mark.asyncio
async def test_no_trump_highest_suit(client: AsyncClient) -> None:
    """Test that no_trump is the highest suit."""
    redis = Redis.from_url("redis://localhost")
    bidding_service = BiddingService(redis)

    current_highest = BidInfo(
        player_id="player1",
        player_name="Alice",
        amount=5,
        suit=TrumpSuit.SPADES,
    )

    # 5 no_trump should beat 5 spades
    is_valid, error = await bidding_service.validate_trump_bid(
        new_bid_amount=5,
        new_bid_suit=TrumpSuit.NO_TRUMP,
        current_highest=current_highest,
        minimum_bid=5,
    )
    assert is_valid
    assert error is None

    await redis.close()
