"""Group and GroupMember models."""
from datetime import datetime
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import Enum, ForeignKey, Index, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, GroupRole, TimestampMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.models.game import Game
    from app.models.user import User


class Group(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """
    Player group for recurring games.

    Groups allow tracking statistics across multiple games with the same
    players. A group must have exactly 4 members to start games.
    """

    __tablename__ = "groups"

    name: Mapped[str] = mapped_column(
        String(64),
        nullable=False,
        comment="Group display name (e.g., 'Friday Night Whist')",
    )
    description: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
        comment="Optional group description",
    )
    created_by: Mapped[UUID] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
        comment="User who created the group (cannot delete user while group exists)",
    )

    # Denormalized stats for quick access (updated after each game)
    total_games: Mapped[int] = mapped_column(
        default=0,
        nullable=False,
        comment="Total games played by this group",
    )
    total_rounds: Mapped[int] = mapped_column(
        default=0,
        nullable=False,
        comment="Total rounds played by this group",
    )
    last_played_at: Mapped[datetime | None] = mapped_column(
        nullable=True,
        comment="When the group last played a game",
    )

    # Relationships
    creator: Mapped["User"] = relationship(
        "User",
        back_populates="created_groups",
        foreign_keys=[created_by],
    )
    members: Mapped[list["GroupMember"]] = relationship(
        "GroupMember",
        back_populates="group",
        cascade="all, delete-orphan",
        order_by="GroupMember.joined_at",
    )
    games: Mapped[list["Game"]] = relationship(
        "Game",
        back_populates="group",
    )

    __table_args__ = (
        Index("ix_groups_created_by_created_at", "created_by", "created_at"),
        {
            "comment": "Player groups for recurring game sessions"
        },
    )

    def __repr__(self) -> str:
        return f"<Group(id={self.id}, name={self.name!r})>"


class GroupMember(Base, UUIDPrimaryKeyMixin):
    """
    Group membership junction table.

    Links users to groups with their role (owner or member).
    A group can have at most 4 members.
    """

    __tablename__ = "group_members"

    group_id: Mapped[UUID] = mapped_column(
        ForeignKey("groups.id", ondelete="CASCADE"),
        nullable=False,
        comment="The group this membership belongs to",
    )
    user_id: Mapped[UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        comment="The user who is a member",
    )
    role: Mapped[GroupRole] = mapped_column(
        Enum(GroupRole, name="group_role", native_enum=True, values_callable=lambda x: [e.value for e in x]),
        default=GroupRole.MEMBER,
        nullable=False,
        comment="Role within the group (owner can manage members)",
    )
    joined_at: Mapped[datetime] = mapped_column(
        nullable=False,
        server_default=func.now(),
        comment="When the user joined the group",
    )

    # Relationships
    group: Mapped["Group"] = relationship(
        "Group",
        back_populates="members",
    )
    user: Mapped["User"] = relationship(
        "User",
        back_populates="group_memberships",
    )

    __table_args__ = (
        # A user can only be in a group once
        UniqueConstraint(
            "group_id", "user_id", name="uq_group_members_group_user"
        ),
        # Fast lookup: all groups for a user
        Index("ix_group_members_user_id", "user_id"),
        # Fast lookup: all members of a group
        Index("ix_group_members_group_id", "group_id"),
        {
            "comment": "Junction table linking users to groups"
        },
    )

    def __repr__(self) -> str:
        return f"<GroupMember(group_id={self.group_id}, user_id={self.user_id}, role={self.role})>"
