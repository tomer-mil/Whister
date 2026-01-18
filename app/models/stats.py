"""PlayerStats model."""
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import ForeignKey, Index, Integer
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.models.user import User


class PlayerStats(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """
    Aggregated player statistics.

    Updated incrementally after each game. Contains both all-time
    stats and recent performance data for trend analysis.
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
        {
            "comment": "Aggregated player statistics updated after each game"
        },
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

    def __repr__(self) -> str:
        return f"<PlayerStats(user_id={self.user_id}, games={self.total_games}, wins={self.total_wins})>"
