"""Base model configuration for all SQLAlchemy models."""
from datetime import datetime
from enum import Enum
from typing import ClassVar
from uuid import UUID, uuid4

from sqlalchemy import DateTime, MetaData, func
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

# Naming convention for constraints (required for Alembic autogenerate)
NAMING_CONVENTION: dict[str, str] = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}


class Base(DeclarativeBase):
    """Base class for all SQLAlchemy models."""

    metadata: ClassVar = MetaData(naming_convention=NAMING_CONVENTION)

    # Type annotation map for custom types
    type_annotation_map: ClassVar = {
        UUID: PG_UUID(as_uuid=True),
        datetime: DateTime(timezone=True),
    }


class TimestampMixin:
    """Mixin that adds created_at and updated_at columns."""

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )


class UUIDPrimaryKeyMixin:
    """Mixin that adds a UUID primary key."""

    id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        primary_key=True,
        default=uuid4,
        nullable=False,
    )


class GameStatus(str, Enum):
    """Game lifecycle states."""

    WAITING = "waiting"
    BIDDING_TRUMP = "bidding_trump"
    FRISCH = "frisch"
    BIDDING_CONTRACT = "bidding_contract"
    PLAYING = "playing"
    ROUND_COMPLETE = "round_complete"
    FINISHED = "finished"


class RoundPhase(str, Enum):
    """Round phase states."""

    TRUMP_BIDDING = "trump_bidding"
    FRISCH = "frisch"
    CONTRACT_BIDDING = "contract_bidding"
    PLAYING = "playing"
    COMPLETE = "complete"


class TrumpSuit(str, Enum):
    """Trump suit options."""

    CLUBS = "clubs"
    DIAMONDS = "diamonds"
    HEARTS = "hearts"
    SPADES = "spades"
    NO_TRUMP = "no_trump"


class GameType(str, Enum):
    """Game type based on contract sum."""

    OVER = "over"
    UNDER = "under"


class GroupRole(str, Enum):
    """Role within a group."""

    OWNER = "owner"
    MEMBER = "member"
