# Database Schema Low-Level Design
## Whist Score Keeper Platform

**Version:** 1.0  
**Date:** January 2026  
**Status:** Draft  

---

## Table of Contents

1. [Overview](#1-overview)
2. [Design Principles](#2-design-principles)
3. [Base Model Configuration](#3-base-model-configuration)
4. [User Domain](#4-user-domain)
5. [Group Domain](#5-group-domain)
6. [Game Domain](#6-game-domain)
7. [Round Domain](#7-round-domain)
8. [Statistics Domain](#8-statistics-domain)
9. [Database Indexes](#9-database-indexes)
10. [Redis Data Structures](#10-redis-data-structures)
11. [Alembic Migration Strategy](#11-alembic-migration-strategy)
12. [Query Patterns](#12-query-patterns)

---

## 1. Overview

### 1.1 Purpose

This document specifies the complete database schema for the Whist Score Keeper platform, including:
- SQLAlchemy 2.0 ORM model definitions
- PostgreSQL-specific optimizations
- Redis data structures for real-time state
- Migration strategies

### 1.2 Technology Stack

```
PostgreSQL 15+          Primary relational database
SQLAlchemy 2.0+         Async ORM with type annotations
Alembic 1.13+           Database migrations
Redis 7+                Real-time state and caching
asyncpg                 Async PostgreSQL driver
```

### 1.3 Schema Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        DATABASE SCHEMA                               │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────┐      ┌─────────────┐      ┌─────────────┐         │
│  │    users    │──────│   groups    │──────│group_members│         │
│  └──────┬──────┘      └─────────────┘      └─────────────┘         │
│         │                                                           │
│         │ 1:N                                                       │
│         ▼                                                           │
│  ┌─────────────┐      ┌─────────────┐      ┌─────────────┐         │
│  │    games    │──────│   rounds    │──────│round_players│         │
│  └──────┬──────┘      └─────────────┘      └─────────────┘         │
│         │                                                           │
│         │ 1:N                                                       │
│         ▼                                                           │
│  ┌─────────────┐      ┌─────────────┐      ┌─────────────┐         │
│  │game_players │      │player_stats │      │ trump_bids  │         │
│  └─────────────┘      └─────────────┘      └─────────────┘         │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 2. Design Principles

### 2.1 Naming Conventions

| Element | Convention | Example |
|---------|------------|---------|
| Tables | lowercase, plural, snake_case | `game_players` |
| Columns | lowercase, snake_case | `created_at` |
| Primary Keys | `id` (UUID) | `id` |
| Foreign Keys | `{related_table_singular}_id` | `user_id`, `game_id` |
| Indexes | `ix_{table}_{columns}` | `ix_games_room_code` |
| Unique Constraints | `uq_{table}_{columns}` | `uq_users_email` |
| Check Constraints | `ck_{table}_{description}` | `ck_round_players_seat_position` |

### 2.2 Common Patterns

- **UUIDs** for all primary keys (prevents enumeration attacks, enables distributed ID generation)
- **Timestamps** with timezone (`TIMESTAMP WITH TIME ZONE`) for all date/time fields
- **Soft deletes** not used (data integrity is critical for game history)
- **Audit columns** (`created_at`, `updated_at`) on all tables
- **Optimistic locking** via `version` column on frequently updated tables

### 2.3 Data Integrity Rules

1. **Referential Integrity**: All foreign keys enforced at database level
2. **Check Constraints**: Business rules enforced where possible (e.g., seat_position 0-3)
3. **Unique Constraints**: Prevent duplicate data (e.g., one user per seat per game)
4. **Not Null**: Explicit nullability on all columns

---

## 3. Base Model Configuration

### 3.1 Base Model Class

```python
"""Base model configuration for all SQLAlchemy models."""
from datetime import datetime
from typing import Any
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
    
    metadata = MetaData(naming_convention=NAMING_CONVENTION)
    
    # Type annotation map for custom types
    type_annotation_map = {
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
```

### 3.2 Enum Definitions

```python
"""Enum definitions for database columns."""
from enum import Enum


class GameStatus(str, Enum):
    """Game lifecycle states."""
    WAITING = "waiting"                    # In lobby, waiting for players
    BIDDING_TRUMP = "bidding_trump"        # Trump suit bidding phase
    FRISCH = "frisch"                      # Frisch (card exchange) phase
    BIDDING_CONTRACT = "bidding_contract"  # Contract bidding phase
    PLAYING = "playing"                    # Round in progress
    ROUND_COMPLETE = "round_complete"      # Between rounds, viewing scores
    FINISHED = "finished"                  # Game ended


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
    OVER = "over"    # Sum of contracts > 13
    UNDER = "under"  # Sum of contracts < 13


class GroupRole(str, Enum):
    """Role within a group."""
    OWNER = "owner"
    MEMBER = "member"
```

---

## 4. User Domain

### 4.1 Users Table

**Purpose:** Stores registered user accounts with authentication credentials and profile information.

**Expected Query Patterns:**
- Login: Find user by email
- Profile lookup: Find user by ID or username
- Display name resolution: Find user by ID (very frequent during games)

```python
"""User model definition."""
from datetime import datetime
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import Boolean, Index, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.models.game import Game, GamePlayer
    from app.models.group import Group, GroupMember
    from app.models.stats import PlayerStats


class User(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """
    User account model.
    
    Stores authentication credentials, profile information, and preferences.
    Users can create/join games, belong to groups, and accumulate statistics.
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
    preferences: Mapped[dict] = mapped_column(
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
    
    # Indexes defined in __table_args__
    __table_args__ = (
        # Composite index for login queries (email is most common)
        Index("ix_users_email_active", "email", "is_active"),
        # Index for username lookups
        Index("ix_users_username_lower", func.lower(username), unique=True),
        {
            "comment": "User accounts with authentication and profile data"
        },
    )
    
    def __repr__(self) -> str:
        return f"<User(id={self.id}, username={self.username!r})>"
```

**Field Justifications:**

| Field | Type | Why It Exists |
|-------|------|---------------|
| `id` | UUID | Primary key, prevents enumeration |
| `username` | VARCHAR(32) | Unique identifier for profile URLs, display |
| `email` | VARCHAR(255) | Login credential, password recovery |
| `password_hash` | VARCHAR(128) | Bcrypt hash (60 chars, but allow headroom) |
| `display_name` | VARCHAR(64) | Shown in games, can differ from username |
| `avatar_url` | TEXT | Profile picture URL (can be long) |
| `is_active` | BOOLEAN | Soft-disable accounts without deletion |
| `last_active` | TIMESTAMP | Presence tracking, cleanup of inactive |
| `preferences` | JSONB | Flexible user settings (theme, language) |
| `created_at` | TIMESTAMP | Audit trail |
| `updated_at` | TIMESTAMP | Audit trail, cache invalidation |

**Index Justifications:**

| Index | Columns | Purpose |
|-------|---------|---------|
| `ix_users_email` | `email` | Login queries (PRIMARY use case) |
| `ix_users_username` | `username` | Profile lookup by username |
| `ix_users_email_active` | `email, is_active` | Login + active check in one scan |
| `ix_users_username_lower` | `lower(username)` | Case-insensitive username lookup |

---

## 5. Group Domain

### 5.1 Groups Table

**Purpose:** Stores recurring player groups (e.g., "Friday Night Whist") for aggregated statistics and easy game setup.

**Expected Query Patterns:**
- List groups for a user (via group_members)
- Get group by ID for details
- Get group stats for leaderboards

```python
"""Group model definition."""
from datetime import datetime
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import ForeignKey, Index, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin

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
```

### 5.2 Group Members Table

**Purpose:** Junction table linking users to groups with their role.

**Expected Query Patterns:**
- Get all members of a group
- Get all groups for a user
- Check if user is in group (authorization)

```python
"""Group member model definition."""
from datetime import datetime
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import Enum, ForeignKey, Index, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, UUIDPrimaryKeyMixin
from app.models.enums import GroupRole

if TYPE_CHECKING:
    from app.models.group import Group
    from app.models.user import User


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
        Enum(GroupRole, name="group_role", native_enum=True),
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
        UniqueConstraint("group_id", "user_id", name="uq_group_members_group_user"),
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
```

---

## 6. Game Domain

### 6.1 Games Table

**Purpose:** Stores game sessions with their current status and metadata.

**Expected Query Patterns:**
- Find game by room code (join flow)
- List games for a group
- List active games for a user
- Get game state by ID

```python
"""Game model definition."""
from datetime import datetime
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import CheckConstraint, Enum, ForeignKey, Index, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin
from app.models.enums import GameStatus

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
```

### 6.2 Game Players Table

**Purpose:** Links users to games with their seat position and final score.

**Expected Query Patterns:**
- Get all players in a game (very frequent)
- Get player by user_id in game
- Get all games for a user

```python
"""Game player model definition."""
from datetime import datetime
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    ForeignKey,
    Index,
    Integer,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.models.game import Game
    from app.models.user import User


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
        Boolean,
        default=False,
        nullable=False,
        comment="Whether this player is the room admin",
    )
    is_connected: Mapped[bool] = mapped_column(
        Boolean,
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
        Boolean,
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
        UniqueConstraint("game_id", "user_id", name="uq_game_players_game_user"),
        # Each seat can only have one player
        UniqueConstraint("game_id", "seat_position", name="uq_game_players_game_seat"),
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
```

---

## 7. Round Domain

### 7.1 Rounds Table

**Purpose:** Stores individual rounds within a game, including trump suit and bidding state.

**Expected Query Patterns:**
- Get current round for a game
- Get all rounds for a game (score table)
- Get round by ID

```python
"""Round model definition."""
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
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin
from app.models.enums import GameType, RoundPhase, TrumpSuit

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
        Enum(RoundPhase, name="round_phase", native_enum=True),
        default=RoundPhase.TRUMP_BIDDING,
        nullable=False,
        comment="Current phase of the round",
    )
    
    # Trump bidding results
    trump_suit: Mapped[TrumpSuit | None] = mapped_column(
        Enum(TrumpSuit, name="trump_suit", native_enum=True),
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
        Enum(GameType, name="game_type", native_enum=True),
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
        UniqueConstraint("game_id", "round_number", name="uq_rounds_game_round"),
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
```

### 7.2 Round Players Table

**Purpose:** Stores each player's state within a round (contract, tricks, score).

**Expected Query Patterns:**
- Get all players in a round
- Get specific player in round
- Update trick count for player

```python
"""Round player model definition."""
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    ForeignKey,
    Index,
    Integer,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.models.round import Round
    from app.models.user import User


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
        UniqueConstraint("round_id", "user_id", name="uq_round_players_round_user"),
        # Each seat can only have one player per round
        UniqueConstraint("round_id", "seat_position", name="uq_round_players_round_seat"),
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
```

### 7.3 Trump Bids Table

**Purpose:** Records the history of trump bids during the bidding phase.

**Expected Query Patterns:**
- Get all bids for a round (bidding history display)
- Get highest bid for a round
- Get bids by a specific player

```python
"""Trump bid model definition."""
from datetime import datetime
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import CheckConstraint, Enum, ForeignKey, Index, Integer
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, UUIDPrimaryKeyMixin
from app.models.enums import TrumpSuit

if TYPE_CHECKING:
    from app.models.round import Round
    from app.models.user import User


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
        Enum(TrumpSuit, name="trump_suit", native_enum=True, create_constraint=False),
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
```

---

## 8. Statistics Domain

### 8.1 Player Stats Table

**Purpose:** Aggregated statistics for each player, updated after each game.

**Expected Query Patterns:**
- Get stats for a user (profile page)
- Leaderboard queries (top players by various metrics)

```python
"""Player statistics model definition."""
from datetime import datetime
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import ForeignKey, Index, Integer, Numeric
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
    suit_wins: Mapped[dict] = mapped_column(
        JSONB,
        default=dict,
        nullable=False,
        server_default="{}",
        comment="Trump wins by suit",
    )
    
    # Recent form (last N games) for trend display
    # Format: ["W", "L", "W", "W", "L", ...] (max 10)
    recent_form: Mapped[list] = mapped_column(
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
```

---

## 9. Database Indexes

### 9.1 Index Summary

| Table | Index Name | Columns | Type | Purpose |
|-------|------------|---------|------|---------|
| **users** | `pk_users` | `id` | PK | Primary key lookup |
| | `ix_users_email` | `email` | Unique | Login by email |
| | `ix_users_username` | `username` | Unique | Profile by username |
| | `ix_users_email_active` | `email, is_active` | Composite | Login with active check |
| | `ix_users_username_lower` | `lower(username)` | Unique Func | Case-insensitive username |
| **groups** | `pk_groups` | `id` | PK | Primary key lookup |
| | `ix_groups_created_by_created_at` | `created_by, created_at` | Composite | User's groups by date |
| **group_members** | `pk_group_members` | `id` | PK | Primary key lookup |
| | `uq_group_members_group_user` | `group_id, user_id` | Unique | One membership per user/group |
| | `ix_group_members_user_id` | `user_id` | B-tree | User's group list |
| | `ix_group_members_group_id` | `group_id` | B-tree | Group's member list |
| **games** | `pk_games` | `id` | PK | Primary key lookup |
| | `ix_games_room_code` | `room_code` | Unique | Join by room code |
| | `ix_games_admin_created` | `admin_id, created_at` | Composite | Admin's game list |
| | `ix_games_group_status` | `group_id, status` | Composite | Group's active games |
| | `ix_games_active_room_code` | `room_code` | Partial | Active games only |
| **game_players** | `pk_game_players` | `id` | PK | Primary key lookup |
| | `uq_game_players_game_user` | `game_id, user_id` | Unique | One seat per user |
| | `uq_game_players_game_seat` | `game_id, seat_position` | Unique | One user per seat |
| | `ix_game_players_game_id` | `game_id` | B-tree | Get game's players |
| | `ix_game_players_user_id` | `user_id` | B-tree | User's game history |
| **rounds** | `pk_rounds` | `id` | PK | Primary key lookup |
| | `uq_rounds_game_round` | `game_id, round_number` | Unique | One round per number |
| | `ix_rounds_game_number` | `game_id, round_number` | Composite | Get specific round |
| | `ix_rounds_trump_winner` | `trump_winner_id` | B-tree | Trump winner stats |
| **round_players** | `pk_round_players` | `id` | PK | Primary key lookup |
| | `uq_round_players_round_user` | `round_id, user_id` | Unique | One record per player |
| | `uq_round_players_round_seat` | `round_id, seat_position` | Unique | One player per seat |
| | `ix_round_players_round_id` | `round_id` | B-tree | Get round's players |
| | `ix_round_players_round_user` | `round_id, user_id` | Composite | Lookup specific player |
| **trump_bids** | `pk_trump_bids` | `id` | PK | Primary key lookup |
| | `ix_trump_bids_round_created` | `round_id, created_at` | Composite | Bid history in order |
| | `ix_trump_bids_player` | `player_id` | B-tree | Player's bid history |
| **player_stats** | `pk_player_stats` | `id` | PK | Primary key lookup |
| | `uq_player_stats_user_id` | `user_id` | Unique | One stats record per user |
| | `ix_player_stats_total_wins` | `total_wins` | B-tree | Leaderboard by wins |
| | `ix_player_stats_total_points` | `total_points` | B-tree | Leaderboard by points |

### 9.2 Partial Index for Active Games

```sql
-- Only index active games for room code lookup
CREATE INDEX ix_games_active_room_code ON games (room_code) 
WHERE status != 'finished';
```

This partial index dramatically reduces index size since most games are finished, and join queries only need active games.

---

## 10. Redis Data Structures

### 10.1 Overview

Redis is used for:
1. **Session management** - JWT blacklisting, refresh tokens
2. **Real-time room state** - Fast access to current game state
3. **WebSocket connection tracking** - Map socket IDs to users
4. **Rate limiting** - Track request counts
5. **Pub/Sub** - Cross-node message broadcasting

### 10.2 Key Schemas

#### Session Keys

```
# Active refresh token (stores user_id)
refresh_token:{token_hash} -> user_id
TTL: 7 days

# JWT blacklist (revoked tokens)
blacklist:jwt:{token_jti} -> "1"
TTL: Remaining token lifetime

# User session info
session:{user_id} -> {
    "last_active": "2026-01-15T10:30:00Z",
    "current_room": "ABC123",  // or null
    "socket_id": "sock_123"
}
TTL: 24 hours (refreshed on activity)
```

#### Room State Keys

```
# Room state (hash)
room:{room_code} -> {
    "game_id": "uuid",
    "admin_id": "uuid",
    "status": "waiting|bidding_trump|...",
    "phase": "trump_bidding|contract_bidding|...",
    "created_at": "2026-01-15T10:00:00Z",
    "last_activity": "2026-01-15T10:30:00Z"
}
TTL: 24 hours (refreshed on activity)

# Room players (sorted set by seat position)
room:{room_code}:players -> {
    "0": json({user_id, display_name, is_admin, is_connected}),
    "1": json({user_id, display_name, is_admin, is_connected}),
    "2": json({user_id, display_name, is_admin, is_connected}),
    "3": json({user_id, display_name, is_admin, is_connected})
}
TTL: Same as room

# Current round state (for fast real-time access)
room:{room_code}:round -> {
    "round_number": 1,
    "trump_suit": "hearts",
    "trump_winner_id": "uuid",
    "game_type": "over",
    "current_bidder_seat": 2,
    "consecutive_passes": 0,
    "players": [
        {"seat": 0, "user_id": "...", "contract_bid": 5, "tricks_won": 2},
        {"seat": 1, "user_id": "...", "contract_bid": 3, "tricks_won": 1},
        ...
    ]
}
TTL: Same as room

# Bidding state
room:{room_code}:bidding -> {
    "highest_bid": {"amount": 6, "suit": "hearts", "player_id": "uuid"},
    "minimum_bid": 5,
    "bids": [
        {"player_id": "uuid", "amount": 5, "suit": "clubs", "time": "..."},
        {"player_id": "uuid", "is_pass": true, "time": "..."},
        ...
    ]
}
TTL: Same as room
```

#### WebSocket Connection Tracking

```
# Socket to user mapping
ws:socket:{socket_id} -> {
    "user_id": "uuid",
    "room_code": "ABC123",
    "connected_at": "2026-01-15T10:30:00Z"
}
TTL: 10 minutes (refreshed by heartbeat)

# User to socket mapping (for targeting specific user)
ws:user:{user_id} -> socket_id
TTL: 10 minutes

# Room connections (set of socket IDs)
ws:room:{room_code} -> Set<socket_id>
TTL: Same as room
```

#### Reconnection Grace Period

```
# Store room code for reconnecting user
reconnect:{user_id} -> {
    "room_code": "ABC123",
    "seat_position": 2,
    "disconnected_at": "2026-01-15T10:30:00Z"
}
TTL: 60 seconds
```

#### Rate Limiting

```
# Sliding window rate limit
ratelimit:{key_prefix}:{identifier}:{window} -> count
TTL: Window duration

# Example: Login attempts by IP
ratelimit:auth_login:192.168.1.1:2026011510 -> 3
TTL: 15 minutes
```

#### Pub/Sub Channels

```
# Room events (all players subscribe)
channel: room:{room_code}

# User-specific events (e.g., your turn notification)  
channel: user:{user_id}

# Admin broadcast (system messages)
channel: admin:broadcast
```

### 10.3 Redis Data Type Summary

| Key Pattern | Redis Type | TTL | Purpose |
|-------------|------------|-----|---------|
| `refresh_token:*` | String | 7 days | Refresh token validation |
| `blacklist:jwt:*` | String | Token lifetime | Revoked JWT tracking |
| `session:*` | Hash | 24 hours | User session info |
| `room:*` | Hash | 24 hours | Room state |
| `room:*:players` | Hash | 24 hours | Room player list |
| `room:*:round` | Hash | 24 hours | Current round state |
| `room:*:bidding` | Hash | 24 hours | Bidding phase state |
| `ws:socket:*` | Hash | 10 min | Socket connection info |
| `ws:user:*` | String | 10 min | User's socket ID |
| `ws:room:*` | Set | 24 hours | Room's socket connections |
| `reconnect:*` | Hash | 60 sec | Reconnection grace period |
| `ratelimit:*` | String | Varies | Rate limit counters |

### 10.4 Redis Operations Examples

```python
"""Example Redis operations for room management."""
from datetime import datetime, timedelta
import json
from redis.asyncio import Redis


class RoomCacheManager:
    """Manages room state in Redis."""
    
    ROOM_TTL = timedelta(hours=24)
    
    def __init__(self, redis: Redis) -> None:
        self.redis = redis
    
    async def create_room(
        self,
        room_code: str,
        game_id: str,
        admin_id: str,
    ) -> None:
        """Initialize room in Redis."""
        now = datetime.utcnow().isoformat()
        
        pipe = self.redis.pipeline()
        
        # Set room state
        pipe.hset(
            f"room:{room_code}",
            mapping={
                "game_id": game_id,
                "admin_id": admin_id,
                "status": "waiting",
                "phase": "",
                "created_at": now,
                "last_activity": now,
            },
        )
        pipe.expire(f"room:{room_code}", int(self.ROOM_TTL.total_seconds()))
        
        # Initialize empty players hash
        pipe.delete(f"room:{room_code}:players")
        
        await pipe.execute()
    
    async def add_player(
        self,
        room_code: str,
        seat: int,
        player_data: dict,
    ) -> None:
        """Add player to room."""
        await self.redis.hset(
            f"room:{room_code}:players",
            str(seat),
            json.dumps(player_data),
        )
        await self._refresh_ttl(room_code)
    
    async def get_room_state(self, room_code: str) -> dict | None:
        """Get complete room state."""
        pipe = self.redis.pipeline()
        pipe.hgetall(f"room:{room_code}")
        pipe.hgetall(f"room:{room_code}:players")
        pipe.hgetall(f"room:{room_code}:round")
        
        results = await pipe.execute()
        
        if not results[0]:
            return None
        
        return {
            "room": results[0],
            "players": {
                int(k): json.loads(v) for k, v in results[1].items()
            } if results[1] else {},
            "round": results[2] or None,
        }
    
    async def update_game_status(
        self,
        room_code: str,
        status: str,
        phase: str | None = None,
    ) -> None:
        """Update game status."""
        update = {"status": status, "last_activity": datetime.utcnow().isoformat()}
        if phase:
            update["phase"] = phase
        
        await self.redis.hset(f"room:{room_code}", mapping=update)
        await self._refresh_ttl(room_code)
    
    async def _refresh_ttl(self, room_code: str) -> None:
        """Refresh TTL on all room keys."""
        ttl_seconds = int(self.ROOM_TTL.total_seconds())
        pipe = self.redis.pipeline()
        pipe.expire(f"room:{room_code}", ttl_seconds)
        pipe.expire(f"room:{room_code}:players", ttl_seconds)
        pipe.expire(f"room:{room_code}:round", ttl_seconds)
        pipe.expire(f"room:{room_code}:bidding", ttl_seconds)
        await pipe.execute()
    
    async def delete_room(self, room_code: str) -> None:
        """Remove all room data from Redis."""
        await self.redis.delete(
            f"room:{room_code}",
            f"room:{room_code}:players",
            f"room:{room_code}:round",
            f"room:{room_code}:bidding",
            f"ws:room:{room_code}",
        )
```

---

## 11. Alembic Migration Strategy

### 11.1 Initial Setup

```python
# alembic/env.py
"""Alembic migration environment configuration."""
import asyncio
from logging.config import fileConfig

from sqlalchemy import pool
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import async_engine_from_config

from alembic import context

from app.config import get_settings
from app.models.base import Base

# Import all models so they're registered with Base.metadata
from app.models import user, group, game, round, stats  # noqa: F401

config = context.config
settings = get_settings()

# Set database URL from settings
config.set_main_option("sqlalchemy.url", str(settings.database_url))

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode."""
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
        compare_server_default=True,
    )

    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection: Connection) -> None:
    """Run migrations in online mode with connection."""
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        compare_type=True,
        compare_server_default=True,
    )

    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    """Run migrations in async mode."""
    connectable = async_engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)

    await connectable.dispose()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode."""
    asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
```

### 11.2 Initial Migration

```python
"""Initial schema creation.

Revision ID: 001_initial
Revises: 
Create Date: 2026-01-15 10:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic
revision: str = '001_initial'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create enum types first
    game_status = postgresql.ENUM(
        'waiting', 'bidding_trump', 'frisch', 'bidding_contract',
        'playing', 'round_complete', 'finished',
        name='game_status'
    )
    game_status.create(op.get_bind())
    
    round_phase = postgresql.ENUM(
        'trump_bidding', 'frisch', 'contract_bidding', 'playing', 'complete',
        name='round_phase'
    )
    round_phase.create(op.get_bind())
    
    trump_suit = postgresql.ENUM(
        'clubs', 'diamonds', 'hearts', 'spades', 'no_trump',
        name='trump_suit'
    )
    trump_suit.create(op.get_bind())
    
    game_type = postgresql.ENUM('over', 'under', name='game_type')
    game_type.create(op.get_bind())
    
    group_role = postgresql.ENUM('owner', 'member', name='group_role')
    group_role.create(op.get_bind())
    
    # Create users table
    op.create_table(
        'users',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('username', sa.String(32), nullable=False),
        sa.Column('email', sa.String(255), nullable=False),
        sa.Column('password_hash', sa.String(128), nullable=False),
        sa.Column('display_name', sa.String(64), nullable=False),
        sa.Column('avatar_url', sa.Text(), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('last_active', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column('preferences', postgresql.JSONB(), nullable=False, server_default='{}'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.PrimaryKeyConstraint('id', name='pk_users'),
        sa.UniqueConstraint('email', name='uq_users_email'),
        sa.UniqueConstraint('username', name='uq_users_username'),
        comment='User accounts with authentication and profile data'
    )
    op.create_index('ix_users_email', 'users', ['email'])
    op.create_index('ix_users_username', 'users', ['username'])
    op.create_index('ix_users_email_active', 'users', ['email', 'is_active'])
    op.create_index('ix_users_username_lower', 'users', [sa.func.lower(sa.column('username'))], unique=True)
    
    # Create remaining tables...
    # (Similar CREATE TABLE statements for all other tables)
    # (Omitted for brevity - follow same pattern)


def downgrade() -> None:
    # Drop tables in reverse order (respect FK constraints)
    op.drop_table('trump_bids')
    op.drop_table('round_players')
    op.drop_table('rounds')
    op.drop_table('game_players')
    op.drop_table('games')
    op.drop_table('player_stats')
    op.drop_table('group_members')
    op.drop_table('groups')
    op.drop_table('users')
    
    # Drop enum types
    op.execute('DROP TYPE IF EXISTS game_status')
    op.execute('DROP TYPE IF EXISTS round_phase')
    op.execute('DROP TYPE IF EXISTS trump_suit')
    op.execute('DROP TYPE IF EXISTS game_type')
    op.execute('DROP TYPE IF EXISTS group_role')
```

### 11.3 Migration Best Practices

#### Adding New Columns

```python
"""Add user_timezone column.

Revision ID: 002_add_timezone
Revises: 001_initial
"""
def upgrade() -> None:
    # Add nullable first, then backfill, then make non-null if needed
    op.add_column(
        'users',
        sa.Column('timezone', sa.String(50), nullable=True, server_default='UTC')
    )
    # Backfill existing rows
    op.execute("UPDATE users SET timezone = 'UTC' WHERE timezone IS NULL")


def downgrade() -> None:
    op.drop_column('users', 'timezone')
```

#### Adding Indexes (Online-Safe)

```python
"""Add index for game history queries.

Revision ID: 003_add_game_history_index
"""
def upgrade() -> None:
    # Use CONCURRENTLY for production (doesn't lock table)
    op.execute(
        "CREATE INDEX CONCURRENTLY IF NOT EXISTS "
        "ix_games_ended_at ON games (ended_at) "
        "WHERE ended_at IS NOT NULL"
    )


def downgrade() -> None:
    op.execute("DROP INDEX CONCURRENTLY IF EXISTS ix_games_ended_at")
```

#### Changing Column Types

```python
"""Change avatar_url from TEXT to VARCHAR(500).

Revision ID: 004_avatar_url_type
"""
def upgrade() -> None:
    # Check for oversized data first
    op.execute("""
        DO $$
        BEGIN
            IF EXISTS (SELECT 1 FROM users WHERE LENGTH(avatar_url) > 500) THEN
                RAISE EXCEPTION 'Data too long for new column size';
            END IF;
        END $$;
    """)
    op.alter_column(
        'users',
        'avatar_url',
        type_=sa.String(500),
        existing_type=sa.Text(),
    )


def downgrade() -> None:
    op.alter_column(
        'users',
        'avatar_url',
        type_=sa.Text(),
        existing_type=sa.String(500),
    )
```

### 11.4 Migration Commands

```bash
# Create new migration (autogenerate from model changes)
alembic revision --autogenerate -m "description"

# Apply all pending migrations
alembic upgrade head

# Apply specific migration
alembic upgrade 001_initial

# Rollback one migration
alembic downgrade -1

# Rollback to specific revision
alembic downgrade 001_initial

# Show current revision
alembic current

# Show migration history
alembic history

# Show SQL without executing (offline mode)
alembic upgrade head --sql
```

---

## 12. Query Patterns

### 12.1 Common Queries with Indexes

#### Login Query

```python
# Query: Find active user by email
# Index used: ix_users_email_active
stmt = (
    select(User)
    .where(User.email == email)
    .where(User.is_active == True)
)
```

#### Join Room Query

```python
# Query: Find active room by code
# Index used: ix_games_active_room_code (partial)
stmt = (
    select(Game)
    .where(Game.room_code == room_code.upper())
    .where(Game.status != GameStatus.FINISHED)
)
```

#### Get Game Players

```python
# Query: Get all players in a game ordered by seat
# Index used: ix_game_players_game_id
stmt = (
    select(GamePlayer)
    .where(GamePlayer.game_id == game_id)
    .order_by(GamePlayer.seat_position)
)
```

#### Get Round State

```python
# Query: Get current round with players
# Index used: ix_rounds_game_number
stmt = (
    select(Round)
    .options(selectinload(Round.players))
    .where(Round.game_id == game_id)
    .where(Round.round_number == round_number)
)
```

#### User Game History

```python
# Query: Get user's recent games with pagination
# Index used: ix_game_players_user_id
stmt = (
    select(GamePlayer)
    .join(Game)
    .where(GamePlayer.user_id == user_id)
    .where(Game.status == GameStatus.FINISHED)
    .order_by(Game.ended_at.desc())
    .offset(offset)
    .limit(limit)
)
```

#### Leaderboard Query

```python
# Query: Top players by wins
# Index used: ix_player_stats_total_wins
stmt = (
    select(PlayerStats)
    .join(User)
    .where(User.is_active == True)
    .order_by(PlayerStats.total_wins.desc())
    .limit(10)
)
```

### 12.2 Performance Considerations

1. **Always use parameterized queries** - Prevents SQL injection and enables query plan caching

2. **Use `selectinload` for relationships** - Avoids N+1 queries
   ```python
   select(Game).options(selectinload(Game.players))
   ```

3. **Pagination with offset is inefficient for large datasets** - Consider cursor-based pagination for game history

4. **Batch updates for statistics** - Update player_stats in a single transaction after game ends

5. **Use Redis for hot data** - Room state, current round, connection tracking should hit Redis first, database second

---

## Document History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | January 2026 | Tech Lead | Initial Database Schema LLD |

---

*This document specifies the complete database schema for the Whist Score Keeper platform. All models are designed for SQLAlchemy 2.0 with async support and must pass mypy strict mode validation.*
