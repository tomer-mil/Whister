"""Scoring service for calculating scores and validating bids."""
from app.schemas.game import GameType


class ScoringService:
    """Service for score calculations and contract validation."""

    def validate_contract_bid(
        self,
        bid_amount: int,
        current_sum: int,
        is_last_bidder: bool,
        is_trump_winner: bool = False,
        trump_winning_bid: int = 0,
    ) -> tuple[bool, str | None]:
        """Validate a contract bid.

        Args:
            bid_amount: The contract bid amount (0-13)
            current_sum: Sum of all contract bids placed so far
            is_last_bidder: Whether this is the last bidder
            is_trump_winner: Whether this player won the trump bidding
            trump_winning_bid: The amount the player bid to win trump

        Returns:
            Tuple of (is_valid, error_message)

        Rules:
            1. Amount must be 0-13
            2. If is_trump_winner: bid_amount >= trump_winning_bid
            3. If is_last_bidder: (current_sum + bid_amount) != 13
        """
        # Rule 1: Amount must be valid range
        if not 0 <= bid_amount <= 13:
            return False, "Contract must be between 0 and 13"

        # Rule 2: Trump winner must bid at least their trump bid
        if is_trump_winner and bid_amount < trump_winning_bid:
            return (
                False,
                f"Trump winner must bid at least {trump_winning_bid}",
            )

        # Rule 3: Last bidder cannot make sum equal to 13
        if is_last_bidder and (current_sum + bid_amount == 13):
            return False, "Last bidder cannot make the sum equal 13"

        return True, None

    def determine_game_type(self, contracts: list[int]) -> GameType:
        """Determine if game is 'over' or 'under' based on contract sum.

        Args:
            contracts: List of contract bids (4 values)

        Returns:
            GameType.OVER if sum > 13, GameType.UNDER if sum < 13
            Note: sum can never equal 13 due to last_bidder rule

        Raises:
            ValueError: If contracts list doesn't have exactly 4 bids or sum equals 13
        """
        if len(contracts) != 4:
            raise ValueError(f"Expected 4 contracts, got {len(contracts)}")

        total = sum(contracts)

        if total == 13:
            raise ValueError(
                "Invalid contract sum: equals 13 (violates last_bidder rule)"
            )

        return GameType.OVER if total > 13 else GameType.UNDER

    def calculate_tricks_needed(self, contracts: list[int], game_type: GameType) -> int:
        """Calculate tricks needed to achieve game type.

        Args:
            contracts: List of contract bids
            game_type: Whether game is over or under

        Returns:
            Number of tricks needed
        """
        total = sum(contracts)

        if game_type == GameType.OVER:
            # In over game, team needs to get more tricks than contract sum
            return total + 1
        # In under game, team needs to get less tricks than contract sum
        return total

    def calculate_round_score(
        self,
        contract_bid: int,
        tricks_won: int,
        game_type: GameType,
    ) -> int:
        """Calculate score for a player for a single round.

        Args:
            contract_bid: The contract bid (0-13)
            tricks_won: Number of tricks won
            game_type: Whether the game is "over" or "under"

        Returns:
            Points scored by the player

        Scoring rules:
            - Made contract (bid >= 1): bid^2 + 10
            - Failed contract (bid >= 1): -10 per trick deviation
            - Zero bid in an OVER game scores like any other contract:
              made (won 0) -> 0^2 + 10 = +10; failed -> -10 per trick won
            - Zero bid in an UNDER game has special scoring:
              made (won 0) -> +50; failed 1 trick -> -50;
              failed 2+ tricks -> -50 + 10*(tricks - 1)
        """
        is_over = game_type == GameType.OVER

        # A zero bid is only special in an UNDER game. In an OVER game a zero
        # bid scores exactly like any other contract (handled by the path below).
        if contract_bid == 0 and not is_over:
            if tricks_won == 0:
                # Made zero contract (under game)
                return 50
            if tricks_won == 1:
                # Failed zero by 1 trick
                return -50
            # Failed zero by 2+ tricks
            return -50 + (tricks_won - 1) * 10

        # Non-zero contract, or any zero bid in an over game.
        if tricks_won == contract_bid:
            # Made contract: bid^2 + 10 (a made over-game zero gives 0 + 10 = 10)
            return (contract_bid * contract_bid) + 10
        # Failed contract: -10 per trick deviation, same formula in all game types
        deviation = abs(tricks_won - contract_bid)
        return deviation * -10
