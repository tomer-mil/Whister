"""Round, RoundPlayer, and TrumpBid models."""
from datetime import datetime
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Enum,
    ForeignKey,
    Index,
    Integer,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import (
    Base,
    GameType,
    RoundPhase,
    TimestampMixin,
    TrumpSuit,
    UUIDPrimaryKeyMixin,
)

if TYPE_CHECKING:
    from app.models.game import Game
    from app.models.user import User


class Round(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """
    Round within a game.

    Each game consists of multiple rounds. A round has trump bidding,
    optional frisch, contract bidding, and play phases.
    """

    __tablename__ = "rounds"

    game_id: Mapped[UUID] = mapped_column(
        ForeignKey("games.id", ondelete="CASCADE"),
        nullable=False,
        comment="The game this round belongs to",
    )
    round_number: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        comment="Round number within the game (1-indexed)",
    )

    # Current phase
    phase: Mapped[RoundPhase] = mapped_column(
        Enum(RoundPhase, name="round_phase", native_enum=True, values_callable=lambda x: [e.value for e in x]),
        default=RoundPhase.TRUMP_BIDDING,
        nullable=False,
        comment="Current phase of the round",
    )

    # Trump bidding results
    trump_suit: Mapped[TrumpSuit | None] = mapped_column(
        Enum(TrumpSuit, name="trump_suit", native_enum=True, values_callable=lambda x: [e.value for e in x]),
        nullable=True,
        comment="The winning trump suit (null during bidding)",
    )
    trump_winner_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        comment="User who won the trump bid",
    )
    trump_bid_amount: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True,
        comment="The winning trump bid amount",
    )

    # Frisch tracking
    frisch_count: Mapped[int] = mapped_column(
        Integer,
        default=0,
        nullable=False,
        comment="Number of frisch rounds (0-3)",
    )
    minimum_bid: Mapped[int] = mapped_column(
        Integer,
        default=5,
        nullable=False,
        comment="Current minimum bid (increases after frisch)",
    )

    # Contract bidding state
    game_type: Mapped[GameType | None] = mapped_column(
        Enum(GameType, name="game_type", native_enum=True, values_callable=lambda x: [e.value for e in x]),
        nullable=True,
        comment="Over/under based on contract sum (set after all bids)",
    )
    total_contracts: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True,
        comment="Sum of all contract bids",
    )

    # Bidding progress tracking
    current_bidder_seat: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True,
        comment="Seat position of current bidder (0-3)",
    )
    consecutive_passes: Mapped[int] = mapped_column(
        Integer,
        default=0,
        nullable=False,
        comment="Number of consecutive passes in trump bidding",
    )

    # Play tracking
    total_tricks_played: Mapped[int] = mapped_column(
        Integer,
        default=0,
        nullable=False,
        comment="Total tricks completed (0-13)",
    )

    # Optimistic locking
    version: Mapped[int] = mapped_column(
        Integer,
        default=1,
        nullable=False,
        comment="Version for optimistic locking",
    )

    # Relationships
    game: Mapped["Game"] = relationship(
        "Game",
        back_populates="rounds",
    )
    trump_winner: Mapped["User | None"] = relationship(
        "User",
        foreign_keys=[trump_winner_id],
    )
    players: Mapped[list["RoundPlayer"]] = relationship(
        "RoundPlayer",
        back_populates="round",
        cascade="all, delete-orphan",
        order_by="RoundPlayer.seat_position",
    )
    trump_bids: Mapped[list["TrumpBid"]] = relationship(
        "TrumpBid",
        back_populates="round",
        cascade="all, delete-orphan",
        order_by="TrumpBid.created_at",
    )

    __table_args__ = (
        # Each game can only have one round with a given number
        UniqueConstraint(
            "game_id", "round_number", name="uq_rounds_game_round"
        ),
        # Round number must be positive
        CheckConstraint("round_number > 0", name="round_number_positive"),
        # Frisch count must be 0-3
        CheckConstraint(
            "frisch_count >= 0 AND frisch_count <= 3",
            name="frisch_count_valid",
        ),
        # Minimum bid must be 5-8
        CheckConstraint(
            "minimum_bid >= 5 AND minimum_bid <= 8",
            name="minimum_bid_valid",
        ),
        # Tricks played must be 0-13
        CheckConstraint(
            "total_tricks_played >= 0 AND total_tricks_played <= 13",
            name="tricks_valid",
        ),
        # Index for getting current round of a game
        Index("ix_rounds_game_number", "game_id", "round_number"),
        # Index for finding rounds by trump winner
        Index("ix_rounds_trump_winner", "trump_winner_id"),
        {
            "comment": "Rounds within games with bidding and play state"
        },
    )

    def __repr__(self) -> str:
        return f"<Round(game_id={self.game_id}, number={self.round_number}, phase={self.phase})>"


class RoundPlayer(Base, UUIDPrimaryKeyMixin):
    """
    Player state within a round.

    Tracks each player's contract bid, tricks won, and calculated score
    for a single round.
    """

    __tablename__ = "round_players"

    round_id: Mapped[UUID] = mapped_column(
        ForeignKey("rounds.id", ondelete="CASCADE"),
        nullable=False,
        comment="The round this record belongs to",
    )
    user_id: Mapped[UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        comment="The user this record is for",
    )
    seat_position: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        comment="Seat position (0-3), denormalized for easy access",
    )

    # Contract bidding
    contract_bid: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True,
        comment="Player's contract bid (0-13, null if not yet bid)",
    )
    bid_order: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True,
        comment="Order in which player bid (1-4, for last bidder rule)",
    )

    # Play tracking
    tricks_won: Mapped[int] = mapped_column(
        Integer,
        default=0,
        nullable=False,
        comment="Number of tricks won this round (0-13)",
    )

    # Results (calculated after round ends)
    score: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True,
        comment="Score for this round (calculated from contract/tricks)",
    )
    made_contract: Mapped[bool | None] = mapped_column(
        Boolean,
        nullable=True,
        comment="Whether player made their contract",
    )

    # Relationships
    round: Mapped["Round"] = relationship(
        "Round",
        back_populates="players",
    )
    user: Mapped["User"] = relationship("User")

    __table_args__ = (
        # A user can only appear once per round
        UniqueConstraint(
            "round_id", "user_id", name="uq_round_players_round_user"
        ),
        # Each seat can only have one player per round
        UniqueConstraint(
            "round_id", "seat_position", name="uq_round_players_round_seat"
        ),
        # Seat position must be 0-3
        CheckConstraint(
            "seat_position >= 0 AND seat_position <= 3",
            name="seat_position_valid",
        ),
        # Contract bid must be 0-13 when set
        CheckConstraint(
            "contract_bid IS NULL OR (contract_bid >= 0 AND contract_bid <= 13)",
            name="contract_bid_valid",
        ),
        # Tricks won must be 0-13
        CheckConstraint(
            "tricks_won >= 0 AND tricks_won <= 13",
            name="tricks_won_valid",
        ),
        # Index for getting all players in a round
        Index("ix_round_players_round_id", "round_id"),
        # Composite for looking up specific player in round
        Index("ix_round_players_round_user", "round_id", "user_id"),
        {
            "comment": "Player state within rounds including contracts and tricks"
        },
    )

    def __repr__(self) -> str:
        return f"<RoundPlayer(round_id={self.round_id}, user_id={self.user_id}, seat={self.seat_position})>"


class TrumpBid(Base, UUIDPrimaryKeyMixin):
    """
    Individual trump bid record.

    Records each bid made during the trump bidding phase for history
    and analytics. Passes are recorded with amount=0 and suit=null.
    """

    __tablename__ = "trump_bids"

    round_id: Mapped[UUID] = mapped_column(
        ForeignKey("rounds.id", ondelete="CASCADE"),
        nullable=False,
        comment="The round this bid was made in",
    )
    player_id: Mapped[UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        comment="The user who made the bid",
    )

    # Bid details
    amount: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        comment="Bid amount (0 for pass, 5-13 for actual bids)",
    )
    suit: Mapped[TrumpSuit | None] = mapped_column(
        Enum(
            TrumpSuit,
            name="trump_suit",
            native_enum=True,
            create_constraint=False,
            values_callable=lambda x: [e.value for e in x],
        ),
        nullable=True,
        comment="Bid suit (null for pass)",
    )
    is_pass: Mapped[bool] = mapped_column(
        default=False,
        nullable=False,
        comment="Whether this was a pass (for clarity in queries)",
    )

    # Timing
    created_at: Mapped[datetime] = mapped_column(
        nullable=False,
        server_default=func.now(),
        comment="When the bid was made",
    )

    # Relationships
    round: Mapped["Round"] = relationship(
        "Round",
        back_populates="trump_bids",
    )
    player: Mapped["User"] = relationship("User")

    __table_args__ = (
        # Bid amount must be valid
        CheckConstraint(
            "(is_pass = TRUE AND amount = 0 AND suit IS NULL) OR "
            "(is_pass = FALSE AND amount >= 5 AND amount <= 13 AND suit IS NOT NULL)",
            name="bid_valid",
        ),
        # Index for getting all bids in a round (ordered by time)
        Index("ix_trump_bids_round_created", "round_id", "created_at"),
        # Index for player bid history
        Index("ix_trump_bids_player", "player_id"),
        {
            "comment": "Trump bid history during bidding phase"
        },
    )

    def __repr__(self) -> str:
        if self.is_pass:
            return f"<TrumpBid(round_id={self.round_id}, player_id={self.player_id}, PASS)>"
        return f"<TrumpBid(round_id={self.round_id}, player_id={self.player_id}, {self.amount}{self.suit})>"
