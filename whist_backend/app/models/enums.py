"""Enum definitions for database columns.

These enums are used both in SQLAlchemy models (mapped to PostgreSQL ENUM types)
and in Pydantic schemas for API validation.
"""
from enum import Enum


class GameStatus(str, Enum):
    """Game lifecycle states.

    The game progresses through these states in order (with possible loops
    for multiple rounds):

    WAITING -> BIDDING_TRUMP -> [FRISCH ->]* BIDDING_CONTRACT -> PLAYING ->
    ROUND_COMPLETE -> [loop back to BIDDING_TRUMP] or FINISHED
    """

    WAITING = "waiting"  # In lobby, waiting for players
    BIDDING_TRUMP = "bidding_trump"  # Trump suit bidding phase
    FRISCH = "frisch"  # Frisch (card exchange) phase
    BIDDING_CONTRACT = "bidding_contract"  # Contract bidding phase
    PLAYING = "playing"  # Round in progress
    ROUND_COMPLETE = "round_complete"  # Between rounds, viewing scores
    FINISHED = "finished"  # Game ended


class RoundPhase(str, Enum):
    """Round phase states.

    Each round goes through these phases:
    TRUMP_BIDDING -> [FRISCH ->]* CONTRACT_BIDDING -> PLAYING -> COMPLETE
    """

    TRUMP_BIDDING = "trump_bidding"
    FRISCH = "frisch"
    CONTRACT_BIDDING = "contract_bidding"
    PLAYING = "playing"
    COMPLETE = "complete"


class TrumpSuit(str, Enum):
    """Trump suit options.

    Ordered from lowest to highest for bid comparison:
    clubs < diamonds < hearts < spades < no_trump
    """

    CLUBS = "clubs"
    DIAMONDS = "diamonds"
    HEARTS = "hearts"
    SPADES = "spades"
    NO_TRUMP = "no_trump"

    @classmethod
    def get_order(cls) -> dict["TrumpSuit", int]:
        """Get suit ordering for bid comparison."""
        return {
            cls.CLUBS: 0,
            cls.DIAMONDS: 1,
            cls.HEARTS: 2,
            cls.SPADES: 3,
            cls.NO_TRUMP: 4,
        }

    def __lt__(self, other: "TrumpSuit") -> bool:
        """Compare suits by rank."""
        if not isinstance(other, TrumpSuit):
            return NotImplemented
        order = self.get_order()
        return order[self] < order[other]

    def __le__(self, other: "TrumpSuit") -> bool:
        """Compare suits by rank."""
        if not isinstance(other, TrumpSuit):
            return NotImplemented
        order = self.get_order()
        return order[self] <= order[other]

    def __gt__(self, other: "TrumpSuit") -> bool:
        """Compare suits by rank."""
        if not isinstance(other, TrumpSuit):
            return NotImplemented
        order = self.get_order()
        return order[self] > order[other]

    def __ge__(self, other: "TrumpSuit") -> bool:
        """Compare suits by rank."""
        if not isinstance(other, TrumpSuit):
            return NotImplemented
        order = self.get_order()
        return order[self] >= order[other]


class GameType(str, Enum):
    """Game type based on contract sum.

    Determined after all contract bids are placed:
    - OVER: Sum of contracts > 13
    - UNDER: Sum of contracts < 13

    Note: Sum can never equal 13 due to the last bidder rule.
    """

    OVER = "over"
    UNDER = "under"


class GroupRole(str, Enum):
    """Role within a group.

    - OWNER: Can manage members, delete group
    - MEMBER: Can participate in group games
    """

    OWNER = "owner"
    MEMBER = "member"
