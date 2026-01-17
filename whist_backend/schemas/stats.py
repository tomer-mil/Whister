"""Player statistics model definition.

Stores aggregated statistics for each player, updated incrementally
after each game completes.
"""
from typing import TYPE_CHECKING, Any
from uuid import UUID

from sqlalchemy import ForeignKey, Index, Integer
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.models.user import User


class PlayerStats(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """Aggregated player statistics.

    Updated incrementally after each game. Contains both all-time
    stats and recent performance data for trend analysis.

    Attributes:
        id: UUID primary key
        user_id: The user these stats belong to
        total_games: Total games played
        total_rounds: Total rounds played
        total_wins: Total games won
        total_points: Lifetime points scored
        highest_score: Highest single-game score
        lowest_score: Lowest single-game score
        highest_round_score: Highest single-round score
        contracts_attempted: Non-zero contracts attempted
        contracts_made: Contracts successfully made
        zeros_attempted: Zero bids attempted
        zeros_made: Zero bids made
        trump_wins: Times won the trump bid
        suit_wins: Trump wins by suit (JSON)
        recent_form: Last 10 game results (JSON)
        current_streak: Current win/loss streak
        best_streak: Best ever win streak
    """

    __tablename__ = "player_stats"

    user_id: Mapped[UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
        comment="The user these stats belong to",
    )

    # Game counts
    total_games: Mapped[int] = mapped_column(
        Integer,
        default=0,
        nullable=False,
        comment="Total games played",
    )
    total_rounds: Mapped[int] = mapped_column(
        Integer,
        default=0,
        nullable=False,
        comment="Total rounds played",
    )
    total_wins: Mapped[int] = mapped_column(
        Integer,
        default=0,
        nullable=False,
        comment="Total games won",
    )

    # Scoring stats
    total_points: Mapped[int] = mapped_column(
        Integer,
        default=0,
        nullable=False,
        comment="Total lifetime points scored",
    )
    highest_score: Mapped[int] = mapped_column(
        Integer,
        default=0,
        nullable=False,
        comment="Highest single-game score",
    )
    lowest_score: Mapped[int] = mapped_column(
        Integer,
        default=0,
        nullable=False,
        comment="Lowest single-game score",
    )
    highest_round_score: Mapped[int] = mapped_column(
        Integer,
        default=0,
        nullable=False,
        comment="Highest single-round score",
    )

    # Contract stats
    contracts_attempted: Mapped[int] = mapped_column(
        Integer,
        default=0,
        nullable=False,
        comment="Total non-zero contracts attempted",
    )
    contracts_made: Mapped[int] = mapped_column(
        Integer,
        default=0,
        nullable=False,
        comment="Total contracts successfully made",
    )

    # Zero bid stats
    zeros_attempted: Mapped[int] = mapped_column(
        Integer,
        default=0,
        nullable=False,
        comment="Total zero bids attempted",
    )
    zeros_made: Mapped[int] = mapped_column(
        Integer,
        default=0,
        nullable=False,
        comment="Total zero bids successfully made",
    )

    # Trump stats
    trump_wins: Mapped[int] = mapped_column(
        Integer,
        default=0,
        nullable=False,
        comment="Times won the trump bid",
    )

    # Suit preferences stored as JSON for flexibility
    # Format: {"clubs": 10, "diamonds": 8, "hearts": 15, "spades": 12, "no_trump": 5}
    suit_wins: Mapped[dict[str, int]] = mapped_column(
        JSONB,
        default=dict,
        nullable=False,
        server_default="{}",
        comment="Trump wins by suit",
    )

    # Recent form (last N games) for trend display
    # Format: ["W", "L", "W", "W", "L", ...] (max 10)
    recent_form: Mapped[list[str]] = mapped_column(
        JSONB,
        default=list,
        nullable=False,
        server_default="[]",
        comment="Win/loss results of last 10 games",
    )

    # Streak tracking
    current_streak: Mapped[int] = mapped_column(
        Integer,
        default=0,
        nullable=False,
        comment="Current win streak (negative for loss streak)",
    )
    best_streak: Mapped[int] = mapped_column(
        Integer,
        default=0,
        nullable=False,
        comment="Best ever win streak",
    )

    # Relationships
    user: Mapped["User"] = relationship(
        "User",
        back_populates="stats",
    )

    __table_args__ = (
        # Index for leaderboard by wins
        Index("ix_player_stats_total_wins", "total_wins"),
        # Index for leaderboard by points
        Index("ix_player_stats_total_points", "total_points"),
        # Index for leaderboard by games
        Index("ix_player_stats_total_games", "total_games"),
        {"comment": "Aggregated player statistics updated after each game"},
    )

    @property
    def win_rate(self) -> float:
        """Calculate win rate as a percentage."""
        if self.total_games == 0:
            return 0.0
        return (self.total_wins / self.total_games) * 100

    @property
    def average_score(self) -> float:
        """Calculate average score per game."""
        if self.total_games == 0:
            return 0.0
        return self.total_points / self.total_games

    @property
    def average_round_score(self) -> float:
        """Calculate average score per round."""
        if self.total_rounds == 0:
            return 0.0
        return self.total_points / self.total_rounds

    @property
    def contract_success_rate(self) -> float:
        """Calculate contract success rate as a percentage."""
        if self.contracts_attempted == 0:
            return 0.0
        return (self.contracts_made / self.contracts_attempted) * 100

    @property
    def zero_success_rate(self) -> float:
        """Calculate zero bid success rate as a percentage."""
        if self.zeros_attempted == 0:
            return 0.0
        return (self.zeros_made / self.zeros_attempted) * 100

    @property
    def favorite_suit(self) -> str | None:
        """Get the suit most often won in trump bidding."""
        if not self.suit_wins:
            return None
        return max(self.suit_wins, key=lambda k: self.suit_wins[k])

    def record_game_result(self, won: bool, score: int) -> None:
        """Record a game result and update stats.

        Args:
            won: Whether the player won the game
            score: The player's final score
        """
        self.total_games += 1
        self.total_points += score

        if won:
            self.total_wins += 1

        # Update high/low scores
        if score > self.highest_score or self.total_games == 1:
            self.highest_score = score
        if score < self.lowest_score or self.total_games == 1:
            self.lowest_score = score

        # Update streak
        if won:
            if self.current_streak >= 0:
                self.current_streak += 1
            else:
                self.current_streak = 1
            self.best_streak = max(self.best_streak, self.current_streak)
        else:
            if self.current_streak <= 0:
                self.current_streak -= 1
            else:
                self.current_streak = -1

        # Update recent form (keep last 10)
        result = "W" if won else "L"
        self.recent_form = ([result] + self.recent_form)[:10]

    def record_round_result(
        self,
        contract_bid: int,
        tricks_won: int,
        score: int,
        won_trump: bool = False,
        trump_suit: str | None = None,
    ) -> None:
        """Record a round result and update stats.

        Args:
            contract_bid: The player's contract bid
            tricks_won: Number of tricks won
            score: Score for the round
            won_trump: Whether player won the trump bid
            trump_suit: The trump suit if won_trump is True
        """
        self.total_rounds += 1

        # Update highest round score
        if score > self.highest_round_score:
            self.highest_round_score = score

        # Track contract stats
        made_contract = tricks_won == contract_bid
        if contract_bid == 0:
            self.zeros_attempted += 1
            if made_contract:
                self.zeros_made += 1
        else:
            self.contracts_attempted += 1
            if made_contract:
                self.contracts_made += 1

        # Track trump wins by suit
        if won_trump and trump_suit:
            if trump_suit not in self.suit_wins:
                self.suit_wins[trump_suit] = 0
            self.suit_wins[trump_suit] += 1
            self.trump_wins += 1

    def __repr__(self) -> str:
        """Return string representation."""
        return f"<PlayerStats(user_id={self.user_id}, games={self.total_games}, wins={self.total_wins})>"
