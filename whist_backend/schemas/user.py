"""User model definition.

Users represent registered accounts with authentication credentials
and profile information.
"""
from datetime import datetime
from typing import TYPE_CHECKING, Any

from sqlalchemy import Boolean, Index, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.models.game import Game, GamePlayer
    from app.models.group import Group, GroupMember
    from app.models.stats import PlayerStats


class User(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """User account model.

    Stores authentication credentials, profile information, and preferences.
    Users can create/join games, belong to groups, and accumulate statistics.

    Attributes:
        id: UUID primary key
        username: Unique username for login (3-32 chars)
        email: Unique email for login and recovery
        password_hash: Bcrypt hashed password
        display_name: Name shown in games (changeable)
        avatar_url: Optional profile picture URL
        is_active: Whether account is enabled
        last_active: Last activity timestamp
        preferences: JSON object with user settings
        created_at: Account creation timestamp
        updated_at: Last modification timestamp
    """

    __tablename__ = "users"

    # Authentication fields
    username: Mapped[str] = mapped_column(
        String(32),
        unique=True,
        nullable=False,
        index=True,
        comment="Unique username for login (3-32 chars, alphanumeric + _-)",
    )
    email: Mapped[str] = mapped_column(
        String(255),
        unique=True,
        nullable=False,
        index=True,
        comment="Unique email address for login and recovery",
    )
    password_hash: Mapped[str] = mapped_column(
        String(128),
        nullable=False,
        comment="Bcrypt hashed password",
    )

    # Profile fields
    display_name: Mapped[str] = mapped_column(
        String(64),
        nullable=False,
        comment="Display name shown in games (can be changed freely)",
    )
    avatar_url: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
        comment="URL to user's avatar image",
    )

    # Account status
    is_active: Mapped[bool] = mapped_column(
        Boolean,
        default=True,
        nullable=False,
        comment="Whether the account is active (false = disabled)",
    )
    last_active: Mapped[datetime] = mapped_column(
        nullable=False,
        server_default=func.now(),
        comment="Last activity timestamp for presence tracking",
    )

    # User preferences (stored as JSON for flexibility)
    preferences: Mapped[dict[str, Any]] = mapped_column(
        JSONB,
        default=dict,
        nullable=False,
        server_default="{}",
        comment="User preferences: theme, notifications, language",
    )

    # Relationships
    created_groups: Mapped[list["Group"]] = relationship(
        "Group",
        back_populates="creator",
        foreign_keys="Group.created_by",
    )
    group_memberships: Mapped[list["GroupMember"]] = relationship(
        "GroupMember",
        back_populates="user",
        cascade="all, delete-orphan",
    )
    administered_games: Mapped[list["Game"]] = relationship(
        "Game",
        back_populates="admin",
        foreign_keys="Game.admin_id",
    )
    game_participations: Mapped[list["GamePlayer"]] = relationship(
        "GamePlayer",
        back_populates="user",
        cascade="all, delete-orphan",
    )
    stats: Mapped["PlayerStats | None"] = relationship(
        "PlayerStats",
        back_populates="user",
        uselist=False,
        cascade="all, delete-orphan",
    )

    __table_args__ = (
        # Composite index for login queries (email + active check)
        Index("ix_users_email_active", "email", "is_active"),
        # Functional index for case-insensitive username lookup
        Index("ix_users_username_lower", func.lower(username), unique=True),
        {"comment": "User accounts with authentication and profile data"},
    )

    def __repr__(self) -> str:
        """Return string representation."""
        return f"<User(id={self.id}, username={self.username!r})>"
