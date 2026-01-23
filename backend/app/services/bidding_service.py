"""Bidding service for Trump and Contract bidding logic."""
import json
import logging
from typing import Any

from redis.asyncio import Redis  # type: ignore[import-untyped]

from app.schemas.game import (
    BidInfo,
    RoundPhase,
    TrumpSuit,
)
from app.services.scoring_service import ScoringService

logger = logging.getLogger(__name__)

# Trump suit ordering for comparing bids of same amount
SUIT_ORDER = {
    TrumpSuit.CLUBS: 0,
    TrumpSuit.DIAMONDS: 1,
    TrumpSuit.HEARTS: 2,
    TrumpSuit.SPADES: 3,
    TrumpSuit.NO_TRUMP: 4,
}

# Minimum bid progression based on frisch count
MINIMUM_BID_PROGRESSION = [5, 6, 7, 8]  # Index = frisch_count


class BiddingService:
    """Service for handling trump and contract bidding logic."""

    def __init__(self, redis: Redis) -> None:  # type: ignore[type-arg]
        """Initialize the bidding service.

        Args:
            redis: Redis client instance
        """
        self.redis = redis
        self.scoring_service = ScoringService()

    def get_minimum_bid(self, frisch_count: int) -> int:
        """Get the minimum bid based on frisch count.

        Args:
            frisch_count: Number of frisch rounds that have occurred (0-3)

        Returns:
            Minimum bid amount

        Frisch progression:
            - 0 frisch: 5 (initial)
            - 1 frisch: 6 (after 1st frisch)
            - 2 frisch: 7 (after 2nd frisch)
            - 3 frisch: 8 (after 3rd frisch)
        """
        if frisch_count >= len(MINIMUM_BID_PROGRESSION):
            frisch_count = len(MINIMUM_BID_PROGRESSION) - 1
        return MINIMUM_BID_PROGRESSION[frisch_count]

    async def validate_trump_bid(
        self,
        new_bid_amount: int,
        new_bid_suit: TrumpSuit,
        current_highest: BidInfo | None,
        minimum_bid: int,
    ) -> tuple[bool, str | None]:
        """Validate a trump bid.

        Args:
            new_bid_amount: The bid amount (5-13)
            new_bid_suit: The trump suit being bid
            current_highest: Current highest bid, or None
            minimum_bid: Minimum allowed bid

        Returns:
            Tuple of (is_valid, error_message)

        Rules:
            1. Amount must be >= minimum_bid
            2. If no previous bid: any bid >= minimum is valid
            3. If previous bid exists: must bid HIGHER (any of):
               - amount > previous.amount, OR
               - amount == previous.amount AND suit > previous.suit (by SUIT_ORDER)
        """
        # Rule 1: Check minimum bid
        if new_bid_amount < minimum_bid:
            return False, f"Bid must be at least {minimum_bid}"

        # Rule 1: Check maximum bid
        if new_bid_amount > 13:
            return False, "Bid cannot exceed 13"

        # Rule 2: If no previous bid, valid
        if current_highest is None:
            return True, None

        # Rule 3: Must outbid current highest
        if new_bid_amount > current_highest.amount:
            # Amount is higher, valid
            return True, None

        if new_bid_amount == current_highest.amount:
            # Same amount, must have higher suit
            if current_highest.suit is None:
                return False, "Cannot bid without a suit"

            current_suit_order = SUIT_ORDER.get(
                TrumpSuit(current_highest.suit), -1
            )
            new_suit_order = SUIT_ORDER.get(new_bid_suit, -1)

            if new_suit_order > current_suit_order:
                return True, None

            return (
                False,
                f"Must bid higher than {current_highest.amount} {current_highest.suit}, "
                f"or same amount with higher suit",
            )

        # New bid is lower than current highest
        return (
            False,
            f"Must bid at least {current_highest.amount} {current_highest.suit}",
        )

    async def place_trump_bid(
        self,
        room_code: str,
        user_id: str,
        player_name: str,
        bid_amount: int,
        bid_suit: TrumpSuit,
    ) -> tuple[bool, str | None]:
        """Place a trump bid.

        Args:
            room_code: Room code
            user_id: User placing the bid
            player_name: Player's display name
            bid_amount: Bid amount
            bid_suit: Trump suit

        Returns:
            Tuple of (success, error_message)

        Side effects:
            - Updates highest_bid in Redis
            - Resets consecutive_passes to 0
            - Updates current_bidder for next player
        """
        round_key = f"room:{room_code}:round"

        try:
            # Get current round state
            round_data = await self.redis.hgetall(round_key)
            if not round_data:
                return False, "Round not found"

            # Check if it's this player's turn
            current_bidder_id = round_data.get("current_bidder_id")
            if current_bidder_id is None or current_bidder_id != user_id:
                return False, "Not your turn"

            # Get current highest bid
            highest_bid_json = round_data.get("highest_bid")
            current_highest = None
            if highest_bid_json:
                bid_data = json.loads(highest_bid_json)
                current_highest = BidInfo(**bid_data)

            # Get minimum bid
            minimum_bid = int(round_data.get("minimum_bid", 5))

            # Validate the bid
            is_valid, error_msg = await self.validate_trump_bid(
                bid_amount, bid_suit, current_highest, minimum_bid
            )
            if not is_valid:
                return False, error_msg

            # Create new bid info
            new_bid = BidInfo(
                player_id=user_id,
                player_name=player_name,
                amount=bid_amount,
                suit=bid_suit,
                is_pass=False,
            )

            # Update round state
            await self.redis.hset(
                round_key,
                mapping={
                    "highest_bid": new_bid.model_dump_json(),
                    "consecutive_passes": 0,
                },
            )

            return True, None

        except Exception as e:
            logger.exception("Error placing trump bid: %s", e)
            return False, "Internal error while placing bid"

    async def pass_trump_bid(self, room_code: str, user_id: str) -> tuple[bool, str | None]:
        """Record a player passing in trump bidding.

        Args:
            room_code: Room code
            user_id: User passing

        Returns:
            Tuple of (success, error_message)

        Side effects:
            - Increments consecutive_passes
            - Updates current_bidder for next player
        """
        round_key = f"room:{room_code}:round"

        try:
            # Get current round state
            round_data = await self.redis.hgetall(round_key)
            if not round_data:
                return False, "Round not found"

            # Check if it's this player's turn
            current_bidder_id = round_data.get("current_bidder_id")
            if current_bidder_id is None or current_bidder_id != user_id:
                return False, "Not your turn"

            # Increment consecutive passes
            current_passes = int(round_data.get("consecutive_passes", 0))
            new_passes = current_passes + 1

            await self.redis.hset(
                round_key,
                mapping={"consecutive_passes": new_passes},
            )

            return True, None

        except Exception as e:
            logger.exception("Error passing trump bid: %s", e)
            return False, "Internal error while passing"

    async def handle_frisch(self, room_code: str) -> tuple[bool, str | None]:
        """Trigger a frisch round (all 4 players passed).

        Args:
            room_code: Room code

        Returns:
            Tuple of (success, error_message)

        Side effects:
            - Increments frisch_count
            - Resets minimum_bid based on frisch_count
            - Resets highest_bid and consecutive_passes
        """
        round_key = f"room:{room_code}:round"

        try:
            # Get current round state
            round_data = await self.redis.hgetall(round_key)
            if not round_data:
                return False, "Round not found"

            # Get current frisch count
            frisch_count = int(round_data.get("frisch_count", 0))

            # Check if max frisch reached
            if frisch_count >= 3:
                return False, "Maximum frisch rounds (3) reached"

            # Increment frisch count and get new minimum bid
            new_frisch_count = frisch_count + 1
            new_minimum_bid = self.get_minimum_bid(new_frisch_count)

            # Reset bidding state for frisch
            await self.redis.hset(
                round_key,
                mapping={
                    "frisch_count": new_frisch_count,
                    "minimum_bid": new_minimum_bid,
                    "highest_bid": "",
                    "consecutive_passes": 0,
                },
            )

            return True, None

        except Exception as e:
            logger.exception("Error handling frisch: %s", e)
            return False, "Internal error while handling frisch"

    async def set_trump(
        self,
        room_code: str,
        trump_winner_id: str,
        trump_winner_name: str,
        trump_suit: TrumpSuit,
        trump_winning_bid: int,
    ) -> tuple[bool, str | None]:
        """Set the trump suit and mark bidding complete.

        Args:
            room_code: Room code
            trump_winner_id: ID of player who won trump bidding
            trump_winner_name: Name of trump winner
            trump_suit: Trump suit that was bid
            trump_winning_bid: The amount of the winning bid

        Returns:
            Tuple of (success, error_message)

        Side effects:
            - Updates trump_suit, trump_winner_id, trump_winner_name, trump_winning_bid
            - Transitions phase to contract_bidding
        """
        round_key = f"room:{room_code}:round"

        try:
            await self.redis.hset(
                round_key,
                mapping={
                    "trump_suit": trump_suit.value,
                    "trump_winner_id": trump_winner_id,
                    "trump_winner_name": trump_winner_name,
                    "trump_winning_bid": trump_winning_bid,
                    "phase": RoundPhase.CONTRACT_BIDDING.value,
                    "highest_bid": "",
                    "consecutive_passes": 0,
                },
            )

            return True, None

        except Exception as e:
            logger.exception("Error setting trump: %s", e)
            return False, "Internal error while setting trump"

    async def validate_contract_bid(
        self,
        bid_amount: int,
        current_sum: int,
        is_last_bidder: bool,
        is_trump_winner: bool = False,
        trump_winning_bid: int = 0,
    ) -> tuple[bool, str | None]:
        """Validate a contract bid.

        Args:
            bid_amount: The contract bid
            current_sum: Sum of bids placed so far
            is_last_bidder: Whether this is the last bidder
            is_trump_winner: Whether this player won trump bidding
            trump_winning_bid: The amount they bid to win trump

        Returns:
            Tuple of (is_valid, error_message)
        """
        return self.scoring_service.validate_contract_bid(
            bid_amount, current_sum, is_last_bidder, is_trump_winner, trump_winning_bid
        )

    async def place_contract_bid(
        self,
        room_code: str,
        user_id: str,
        bid_amount: int,
    ) -> tuple[bool, str | None]:
        """Place a contract bid.

        Args:
            room_code: Room code
            user_id: User placing bid
            bid_amount: Contract bid amount (0-13)

        Returns:
            Tuple of (success, error_message)

        Side effects:
            - Records the contract bid for this player
            - Updates current_bidder for next player
        """
        round_key = f"room:{room_code}:round"
        contracts_key = f"room:{room_code}:contracts"

        try:
            # Get current round state
            round_data = await self.redis.hgetall(round_key)
            if not round_data:
                return False, "Round not found"

            # Check if it's this player's turn
            current_bidder_id = round_data.get("current_bidder_id")
            if current_bidder_id is None or current_bidder_id != user_id:
                return False, "Not your turn"

            # Store contract bid
            await self.redis.hset(contracts_key, user_id, bid_amount)

            return True, None

        except Exception as e:
            logger.exception("Error placing contract bid: %s", e)
            return False, "Internal error while placing contract bid"

    async def get_contract_sum(self, room_code: str) -> int:
        """Get the sum of all contract bids placed.

        Args:
            room_code: Room code

        Returns:
            Sum of contract bids
        """
        contracts_key = f"room:{room_code}:contracts"

        try:
            contracts = await self.redis.hgetall(contracts_key)
            return sum(int(v) for v in contracts.values())
        except Exception:
            return 0

    async def get_contracts(self, room_code: str) -> dict[str, int]:
        """Get all contract bids.

        Args:
            room_code: Room code

        Returns:
            Dict of user_id -> bid_amount
        """
        contracts_key = f"room:{room_code}:contracts"

        try:
            contracts = await self.redis.hgetall(contracts_key)
            return {k: int(v) for k, v in contracts.items()}
        except Exception:
            return {}

    async def clear_contracts(self, room_code: str) -> None:
        """Clear all contract bids for a new round.

        Args:
            room_code: Room code
        """
        contracts_key = f"room:{room_code}:contracts"
        await self.redis.delete(contracts_key)
