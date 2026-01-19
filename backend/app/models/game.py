"""Game and GamePlayer models."""
from datetime import datetime
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import (
    CheckConstraint,
    Enum,
    ForeignKey,
    Index,
    Integer,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, GameStatus, TimestampMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.models.group import Group
    from app.models.round import Round
    from app.models.user import User


class Game(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """
    Game session model.

    A game represents a single session where 4 players play multiple rounds.
    Games have a unique room code for joining and track their current state.
    """

    __tablename__ = "games"

    # Room identification
    room_code: Mapped[str] = mapped_column(
        String(6),
        unique=True,
        nullable=False,
        index=True,
        comment="6-character room code for joining (e.g., 'ABC123')",
    )

    # Ownership and grouping
    admin_id: Mapped[UUID] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
        comment="User who created and controls the game",
    )
    group_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("groups.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
        comment="Optional group this game belongs to (for group stats)",
    )

    # Game state
    status: Mapped[GameStatus] = mapped_column(
        Enum(GameStatus, name="game_status", native_enum=True),
        default=GameStatus.WAITING,
        nullable=False,
        index=True,
        comment="Current game lifecycle state",
    )
    current_round_number: Mapped[int] = mapped_column(
        Integer,
        default=0,
        nullable=False,
        comment="Current round number (0 = not started)",
    )

    # Optimistic locking for concurrent updates
    version: Mapped[int] = mapped_column(
        Integer,
        default=1,
        nullable=False,
        comment="Version for optimistic locking",
    )

    # Game completion
    ended_at: Mapped[datetime | None] = mapped_column(
        nullable=True,
        comment="When the game ended (null if in progress)",
    )
    winner_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        comment="User who won the game (null if not finished or tie)",
    )

    # Relationships
    admin: Mapped["User"] = relationship(
        "User",
        back_populates="administered_games",
        foreign_keys=[admin_id],
    )
    group: Mapped["Group | None"] = relationship(
        "Group",
        back_populates="games",
    )
    players: Mapped[list["GamePlayer"]] = relationship(
        "GamePlayer",
        back_populates="game",
        cascade="all, delete-orphan",
        order_by="GamePlayer.seat_position",
    )
    rounds: Mapped[list["Round"]] = relationship(
        "Round",
        back_populates="game",
        cascade="all, delete-orphan",
        order_by="Round.round_number",
    )

    __table_args__ = (
        # Room codes are always uppercase
        CheckConstraint(
            "room_code = UPPER(room_code)",
            name="room_code_uppercase",
        ),
        # Round number must be non-negative
        CheckConstraint(
            "current_round_number >= 0",
            name="round_number_non_negative",
        ),
        # Composite index for finding active games in a group
        Index("ix_games_group_status", "group_id", "status"),
        # Index for finding games by admin
        Index("ix_games_admin_created", "admin_id", "created_at"),
        # Partial index for active games only (most queries)
        Index(
            "ix_games_active_room_code",
            "room_code",
            postgresql_where=(status != GameStatus.FINISHED),
        ),
        {
            "comment": "Game sessions with room codes and state tracking"
        },
    )

    def __repr__(self) -> str:
        return f"<Game(id={self.id}, room_code={self.room_code!r}, status={self.status})>"


class GamePlayer(Base, UUIDPrimaryKeyMixin):
    """
    Player participation in a game.

    Links a user to a game with their seat position and tracks
    their final score and winner status.
    """

    __tablename__ = "game_players"

    game_id: Mapped[UUID] = mapped_column(
        ForeignKey("games.id", ondelete="CASCADE"),
        nullable=False,
        comment="The game this player is in",
    )
    user_id: Mapped[UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        comment="The user playing",
    )

    # Display name at time of game (in case user changes display_name later)
    display_name: Mapped[str] = mapped_column(
        String(64),
        nullable=False,
        comment="Player's display name at time of joining",
    )

    # Seating
    seat_position: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        comment="Seat position (0-3, clockwise from dealer)",
    )

    # Role and status
    is_admin: Mapped[bool] = mapped_column(
        default=False,
        nullable=False,
        comment="Whether this player is the room admin",
    )
    is_connected: Mapped[bool] = mapped_column(
        default=True,
        nullable=False,
        comment="Current WebSocket connection status",
    )

    # Results (populated when game ends)
    final_score: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True,
        comment="Total score at game end",
    )
    is_winner: Mapped[bool] = mapped_column(
        default=False,
        nullable=False,
        comment="Whether this player won the game",
    )

    # Timestamps
    joined_at: Mapped[datetime] = mapped_column(
        nullable=False,
        server_default=func.now(),
        comment="When the player joined the room",
    )

    # Relationships
    game: Mapped["Game"] = relationship(
        "Game",
        back_populates="players",
    )
    user: Mapped["User"] = relationship(
        "User",
        back_populates="game_participations",
    )

    __table_args__ = (
        # A user can only be in a game once
        UniqueConstraint(
            "game_id", "user_id", name="uq_game_players_game_user"
        ),
        # Each seat can only have one player
        UniqueConstraint(
            "game_id", "seat_position", name="uq_game_players_game_seat"
        ),
        # Seat position must be 0-3
        CheckConstraint(
            "seat_position >= 0 AND seat_position <= 3",
            name="seat_position_valid",
        ),
        # Index for getting all players in a game (most common query)
        Index("ix_game_players_game_id", "game_id"),
        # Index for getting all games for a user
        Index("ix_game_players_user_id", "user_id"),
        # Composite for looking up specific player in game
        Index("ix_game_players_game_user", "game_id", "user_id"),
        {
            "comment": "Players participating in games with seating and scores"
        },
    )

    def __repr__(self) -> str:
        return f"<GamePlayer(game_id={self.game_id}, user_id={self.user_id}, seat={self.seat_position})>"
