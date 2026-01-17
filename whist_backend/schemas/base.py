"""Base model configuration for all SQLAlchemy models.

This module provides the foundational classes and mixins used by all
database models in the application.
"""
from datetime import datetime
from typing import Any
from uuid import UUID, uuid4

from sqlalchemy import DateTime, MetaData, func
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

# Naming convention for constraints (required for Alembic autogenerate)
# This ensures consistent, predictable constraint names across all migrations
NAMING_CONVENTION: dict[str, str] = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}


class Base(DeclarativeBase):
    """Base class for all SQLAlchemy models.

    Provides common metadata configuration and type annotation mappings
    for PostgreSQL-specific types.
    """

    metadata = MetaData(naming_convention=NAMING_CONVENTION)

    # Type annotation map for custom types
    # This allows using Python types directly in Mapped[] annotations
    type_annotation_map: dict[type, Any] = {
        UUID: PG_UUID(as_uuid=True),
        datetime: DateTime(timezone=True),
    }


class TimestampMixin:
    """Mixin that adds created_at and updated_at columns.

    These columns are automatically managed:
    - created_at: Set to current timestamp on INSERT
    - updated_at: Set to current timestamp on INSERT and UPDATE
    """

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
    """Mixin that adds a UUID primary key.

    Uses PostgreSQL's native UUID type with Python's uuid4 for generation.
    UUIDs are preferred over auto-increment integers because they:
    - Prevent enumeration attacks
    - Enable distributed ID generation
    - Don't leak information about record counts
    """

    id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        primary_key=True,
        default=uuid4,
        nullable=False,
    )
