# Group Management and Analytics Specifications
## Whist Score Keeper Platform

**Document Date:** January 2026
**Version:** 1.0
**Status:** Complete Extraction from LLD Documents

---

## Table of Contents

1. [Database Schema - Groups Domain](#1-database-schema---groups-domain)
2. [Analytics Database Schema](#2-analytics-database-schema)
3. [API Specifications - Groups (Planned)](#3-api-specifications---groups-planned)
4. [Service Layer Specifications](#4-service-layer-specifications)
5. [Analytics Calculations](#5-analytics-calculations)
6. [Query Optimization Strategy](#6-query-optimization-strategy)
7. [Redis Caching Strategy](#7-redis-caching-strategy)

---

## 1. Database Schema - Groups Domain

### 1.1 Groups Table

**Table Name:** `groups`
**Purpose:** Store recurring player groups for aggregated statistics and easy game setup.

#### Complete Schema Definition

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

    # Basic Information
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

    # Denormalized Statistics (updated after each game)
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

    # Timestamp Fields (from TimestampMixin)
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

    # Primary Key (from UUIDPrimaryKeyMixin)
    id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        primary_key=True,
        default=uuid4,
        nullable=False,
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

    # Indexes
    __table_args__ = (
        Index("ix_groups_created_by_created_at", "created_by", "created_at"),
        {
            "comment": "Player groups for recurring game sessions"
        },
    )

    def __repr__(self) -> str:
        return f"<Group(id={self.id}, name={self.name!r})>"
```

#### Field Specifications

| Field | Type | Constraints | Purpose |
|-------|------|-------------|---------|
| `id` | UUID | PK, not null | Primary key |
| `name` | VARCHAR(64) | not null | Group display name |
| `description` | TEXT | nullable | Optional description |
| `created_by` | UUID | FK(users.id), not null, indexed | Creator user ID |
| `total_games` | INTEGER | not null, default=0 | Denormalized game count |
| `total_rounds` | INTEGER | not null, default=0 | Denormalized round count |
| `last_played_at` | TIMESTAMP TZ | nullable | Latest game timestamp |
| `created_at` | TIMESTAMP TZ | not null, server_default=now() | Creation timestamp |
| `updated_at` | TIMESTAMP TZ | not null, server_default=now() | Last update timestamp |

#### Indexes

| Index Name | Columns | Type | Purpose |
|------------|---------|------|---------|
| `pk_groups` | `id` | Primary Key | Primary key lookup |
| `ix_groups_created_by_created_at` | `created_by, created_at` | Composite | User's groups ordered by date |

---

### 1.2 Group Members Table

**Table Name:** `group_members`
**Purpose:** Junction table linking users to groups with their role and membership information.

#### Complete Schema Definition

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

    # Foreign Keys
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

    # Role Information
    role: Mapped[GroupRole] = mapped_column(
        Enum(GroupRole, name="group_role", native_enum=True),
        default=GroupRole.MEMBER,
        nullable=False,
        comment="Role within the group (owner can manage members)",
    )

    # Timestamp
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

    # Constraints
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

#### Field Specifications

| Field | Type | Constraints | Purpose |
|-------|------|-------------|---------|
| `id` | UUID | PK, not null | Primary key |
| `group_id` | UUID | FK(groups.id), not null, indexed | Group reference |
| `user_id` | UUID | FK(users.id), not null, indexed | User reference |
| `role` | ENUM | not null, default=MEMBER | User role in group |
| `joined_at` | TIMESTAMP TZ | not null, server_default=now() | Join timestamp |

#### Constraints

| Constraint | Type | Purpose |
|-----------|------|---------|
| `uq_group_members_group_user` | Unique | One user can only belong to group once |
| `ix_group_members_user_id` | Index | Find all groups for a user |
| `ix_group_members_group_id` | Index | Find all members of a group |

#### GroupRole Enum

```python
class GroupRole(str, Enum):
    """Role within a group."""
    OWNER = "owner"      # Can manage group, add/remove members
    MEMBER = "member"    # Can view group, play games
```

---

## 2. Analytics Database Schema

### 2.1 Player Stats Table

**Table Name:** `player_stats`
**Purpose:** Aggregated statistics for each player, updated after each game ends.

#### Complete Schema Definition

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

    # User Reference
    user_id: Mapped[UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
        comment="The user these stats belong to",
    )

    # ===== GAME COUNTS =====
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

    # ===== SCORING STATISTICS =====
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

    # ===== CONTRACT STATISTICS =====
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

    # ===== ZERO BID STATISTICS =====
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

    # ===== TRUMP STATISTICS =====
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

    # ===== RECENT FORM & STREAKS =====
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

    # Timestamps (from TimestampMixin)
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

    # Relationships
    user: Mapped["User"] = relationship(
        "User",
        back_populates="stats",
    )

    # Indexes
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

    # ===== CALCULATED PROPERTIES =====
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

#### Field Specifications

| Field | Type | Constraints | Purpose |
|-------|------|-------------|---------|
| `id` | UUID | PK, not null | Primary key |
| `user_id` | UUID | FK(users.id), unique, not null | User reference |
| `total_games` | INTEGER | not null, default=0 | Lifetime game count |
| `total_rounds` | INTEGER | not null, default=0 | Lifetime round count |
| `total_wins` | INTEGER | not null, default=0 | Games won |
| `total_points` | INTEGER | not null, default=0 | Total score across all games |
| `highest_score` | INTEGER | not null, default=0 | Best single-game score |
| `lowest_score` | INTEGER | not null, default=0 | Worst single-game score |
| `highest_round_score` | INTEGER | not null, default=0 | Best single-round score |
| `contracts_attempted` | INTEGER | not null, default=0 | Non-zero contracts bid |
| `contracts_made` | INTEGER | not null, default=0 | Successful contracts |
| `zeros_attempted` | INTEGER | not null, default=0 | Zero bids made |
| `zeros_made` | INTEGER | not null, default=0 | Successful zero bids |
| `trump_wins` | INTEGER | not null, default=0 | Trump bids won |
| `suit_wins` | JSONB | not null, default={} | Wins by trump suit |
| `recent_form` | JSONB | not null, default=[] | Last 10 game results |
| `current_streak` | INTEGER | not null, default=0 | Current win/loss streak |
| `best_streak` | INTEGER | not null, default=0 | Best streak ever |
| `created_at` | TIMESTAMP TZ | not null, server_default=now() | Creation timestamp |
| `updated_at` | TIMESTAMP TZ | not null, server_default=now() | Last update timestamp |

#### Indexes

| Index Name | Columns | Type | Purpose |
|------------|---------|------|---------|
| `pk_player_stats` | `id` | Primary Key | Primary key lookup |
| `uq_player_stats_user_id` | `user_id` | Unique | One stats record per user |
| `ix_player_stats_total_wins` | `total_wins` | B-tree | Leaderboard ranking by wins |
| `ix_player_stats_total_points` | `total_points` | B-tree | Leaderboard ranking by points |
| `ix_player_stats_total_games` | `total_games` | B-tree | Leaderboard ranking by games |

---

## 3. API Specifications - Groups (Planned)

### 3.1 Group API Routes

**Router Prefix:** `/api/v1/groups`
**Authentication:** Required for all endpoints unless specified

#### Create Group

```
POST /api/v1/groups
```

**Request:**
```python
class CreateGroupRequest(BaseModel):
    """Group creation request."""
    name: str = Field(min_length=1, max_length=64)
    description: str | None = Field(default=None, max_length=500)
```

**Response (201 Created):**
```python
class CreateGroupResponse(BaseModel):
    """Group creation response."""
    id: UUID
    name: str
    description: str | None
    created_by: UUID
    total_games: int = 0
    total_rounds: int = 0
    last_played_at: datetime | None = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
```

**Errors:**
- `400 BAD_REQUEST` - Invalid request body
- `401 UNAUTHORIZED` - Not authenticated
- `422 UNPROCESSABLE_ENTITY` - Validation error

---

#### Get Group

```
GET /api/v1/groups/{group_id}
```

**Response (200 OK):**
```python
class GroupDetailResponse(BaseModel):
    """Full group detail with members."""
    id: UUID
    name: str
    description: str | None
    created_by: UUID
    creator: UserBrief
    members: list[GroupMemberDetail]
    total_games: int
    total_rounds: int
    last_played_at: datetime | None
    created_at: datetime
    updated_at: datetime


class GroupMemberDetail(BaseModel):
    """Group member with details."""
    user_id: UUID
    user: UserBrief
    role: str  # "owner" or "member"
    joined_at: datetime
```

**Errors:**
- `401 UNAUTHORIZED` - Not authenticated
- `403 FORBIDDEN` - Not a group member
- `404 NOT_FOUND` - Group not found

---

#### List User's Groups

```
GET /api/v1/groups
```

**Query Parameters:**
```python
page: int = Query(default=1, ge=1)
page_size: int = Query(default=20, ge=1, le=100)
```

**Response (200 OK):**
```python
class GroupListResponse(BaseModel):
    """Paginated list of user's groups."""
    groups: list[GroupDetailResponse]
    total: int
    page: int
    page_size: int
    has_more: bool
```

---

#### Update Group

```
PUT /api/v1/groups/{group_id}
```

**Request:**
```python
class UpdateGroupRequest(BaseModel):
    """Update group details (owner only)."""
    name: str | None = Field(default=None, min_length=1, max_length=64)
    description: str | None = Field(default=None, max_length=500)
```

**Response (200 OK):**
```python
class UpdateGroupResponse(BaseModel):
    """Updated group response."""
    id: UUID
    name: str
    description: str | None
    updated_at: datetime
    # ... other fields
```

**Errors:**
- `401 UNAUTHORIZED` - Not authenticated
- `403 FORBIDDEN` - Not group owner
- `404 NOT_FOUND` - Group not found
- `422 UNPROCESSABLE_ENTITY` - Validation error

---

#### Delete Group

```
DELETE /api/v1/groups/{group_id}
```

**Response (204 NO CONTENT)**

**Errors:**
- `401 UNAUTHORIZED` - Not authenticated
- `403 FORBIDDEN` - Not group owner
- `404 NOT_FOUND` - Group not found

---

### 3.2 Group Member Management

#### Add Member to Group

```
POST /api/v1/groups/{group_id}/members
```

**Request:**
```python
class AddGroupMemberRequest(BaseModel):
    """Add member to group."""
    user_id: UUID
```

**Response (201 CREATED):**
```python
class GroupMemberResponse(BaseModel):
    """Group member response."""
    user_id: UUID
    user: UserBrief
    role: str
    joined_at: datetime
```

**Errors:**
- `401 UNAUTHORIZED` - Not authenticated
- `403 FORBIDDEN` - Not group owner
- `404 NOT_FOUND` - Group or user not found
- `409 CONFLICT` - User already in group / Group full (max 4 members)

---

#### Remove Member from Group

```
DELETE /api/v1/groups/{group_id}/members/{user_id}
```

**Response (204 NO CONTENT)**

**Errors:**
- `401 UNAUTHORIZED` - Not authenticated
- `403 FORBIDDEN` - Not group owner or cannot remove self
- `404 NOT_FOUND` - Group or member not found

---

#### Update Member Role

```
PATCH /api/v1/groups/{group_id}/members/{user_id}
```

**Request:**
```python
class UpdateMemberRoleRequest(BaseModel):
    """Update group member role."""
    role: str  # "owner" or "member"
```

**Response (200 OK):**
```python
class GroupMemberResponse(BaseModel):
    """Updated member response."""
    user_id: UUID
    role: str
    joined_at: datetime
```

**Errors:**
- `401 UNAUTHORIZED` - Not authenticated
- `403 FORBIDDEN` - Not group owner
- `404 NOT_FOUND` - Group or member not found
- `422 UNPROCESSABLE_ENTITY` - Invalid role

---

## 4. Service Layer Specifications

### 4.1 Group Service Interface

```python
"""Group service interface and implementation."""
from typing import Optional
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from redis.asyncio import Redis

from app.models.group import Group, GroupMember
from app.models.user import User
from app.schemas.group import (
    CreateGroupRequest, UpdateGroupRequest, AddGroupMemberRequest,
    GroupDetailResponse, GroupListResponse,
)
from app.core.exceptions import (
    NotFoundError, AuthorizationError, ConflictError,
)


class GroupService:
    """Service for group management operations."""

    def __init__(self, db: AsyncSession, redis: Redis) -> None:
        """Initialize group service."""
        self.db = db
        self.redis = redis

    # ===== GROUP CRUD =====

    async def create_group(
        self,
        creator_id: UUID,
        request: CreateGroupRequest,
    ) -> Group:
        """
        Create a new group.

        Args:
            creator_id: User creating the group
            request: Group creation data

        Returns:
            Created Group object

        Raises:
            ValidationError: If data invalid
        """
        group = Group(
            name=request.name,
            description=request.description,
            created_by=creator_id,
            total_games=0,
            total_rounds=0,
        )
        self.db.add(group)
        await self.db.flush()

        # Add creator as owner member
        member = GroupMember(
            group_id=group.id,
            user_id=creator_id,
            role=GroupRole.OWNER,
        )
        self.db.add(member)
        await self.db.commit()
        await self.db.refresh(group)
        return group

    async def get_group(self, group_id: UUID) -> Group:
        """
        Get group by ID.

        Args:
            group_id: Group UUID

        Returns:
            Group object

        Raises:
            NotFoundError: If group doesn't exist
        """
        stmt = select(Group).where(Group.id == group_id)
        result = await self.db.execute(stmt)
        group = result.scalar_one_or_none()

        if not group:
            raise NotFoundError(
                message=f"Group '{group_id}' not found",
                error_code=ErrorCode.GROUP_NOT_FOUND,
            )
        return group

    async def list_user_groups(
        self,
        user_id: UUID,
        page: int = 1,
        page_size: int = 20,
    ) -> tuple[list[Group], int]:
        """
        List all groups for a user.

        Args:
            user_id: User UUID
            page: Page number (1-indexed)
            page_size: Results per page

        Returns:
            Tuple of (groups, total_count)
        """
        # Count total
        count_stmt = (
            select(func.count(Group.id))
            .join(GroupMember)
            .where(GroupMember.user_id == user_id)
        )
        count_result = await self.db.execute(count_stmt)
        total = count_result.scalar() or 0

        # Get paginated results
        stmt = (
            select(Group)
            .join(GroupMember)
            .where(GroupMember.user_id == user_id)
            .order_by(Group.created_at.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
        result = await self.db.execute(stmt)
        groups = result.scalars().all()

        return groups, total

    async def update_group(
        self,
        group_id: UUID,
        current_user_id: UUID,
        request: UpdateGroupRequest,
    ) -> Group:
        """
        Update group details (owner only).

        Args:
            group_id: Group UUID
            current_user_id: Requesting user ID
            request: Update data

        Returns:
            Updated Group object

        Raises:
            NotFoundError: If group doesn't exist
            AuthorizationError: If not group owner
        """
        group = await self.get_group(group_id)

        # Check authorization
        is_owner = await self._is_group_owner(group_id, current_user_id)
        if not is_owner:
            raise AuthorizationError(
                message="Only group owner can update group",
                error_code=ErrorCode.NOT_GROUP_OWNER,
            )

        # Update fields
        if request.name is not None:
            group.name = request.name
        if request.description is not None:
            group.description = request.description

        await self.db.commit()
        await self.db.refresh(group)
        return group

    async def delete_group(
        self,
        group_id: UUID,
        current_user_id: UUID,
    ) -> None:
        """
        Delete a group (owner only).

        Args:
            group_id: Group UUID
            current_user_id: Requesting user ID

        Raises:
            NotFoundError: If group doesn't exist
            AuthorizationError: If not group owner
        """
        group = await self.get_group(group_id)

        # Check authorization
        is_owner = await self._is_group_owner(group_id, current_user_id)
        if not is_owner:
            raise AuthorizationError(
                message="Only group owner can delete group",
                error_code=ErrorCode.NOT_GROUP_OWNER,
            )

        await self.db.delete(group)
        await self.db.commit()

        # Clear cache
        await self._clear_group_cache(group_id)

    # ===== GROUP MEMBER MANAGEMENT =====

    async def add_member(
        self,
        group_id: UUID,
        user_id: UUID,
        current_user_id: UUID,
    ) -> GroupMember:
        """
        Add member to group (owner only).

        Args:
            group_id: Group UUID
            user_id: User to add
            current_user_id: Requesting user ID

        Returns:
            Created GroupMember object

        Raises:
            NotFoundError: If group or user doesn't exist
            AuthorizationError: If not group owner
            ConflictError: If user already in group or group full
        """
        group = await self.get_group(group_id)

        # Check authorization
        is_owner = await self._is_group_owner(group_id, current_user_id)
        if not is_owner:
            raise AuthorizationError(
                message="Only group owner can add members",
                error_code=ErrorCode.NOT_GROUP_OWNER,
            )

        # Check user exists
        user = await self._get_user(user_id)
        if not user:
            raise NotFoundError(
                message=f"User '{user_id}' not found",
                error_code=ErrorCode.USER_NOT_FOUND,
            )

        # Check if already member
        existing = await self._get_group_member(group_id, user_id)
        if existing:
            raise ConflictError(
                message="User is already a member of this group",
                error_code=ErrorCode.USER_ALREADY_IN_GROUP,
            )

        # Check group not full (max 4 members)
        member_count = await self._get_group_member_count(group_id)
        if member_count >= 4:
            raise ConflictError(
                message="Group is full (maximum 4 members)",
                error_code=ErrorCode.GROUP_FULL,
            )

        # Add member
        member = GroupMember(
            group_id=group_id,
            user_id=user_id,
            role=GroupRole.MEMBER,
        )
        self.db.add(member)
        await self.db.commit()
        await self.db.refresh(member)

        # Clear cache
        await self._clear_group_cache(group_id)

        return member

    async def remove_member(
        self,
        group_id: UUID,
        user_id: UUID,
        current_user_id: UUID,
    ) -> None:
        """
        Remove member from group (owner only, cannot remove self).

        Args:
            group_id: Group UUID
            user_id: User to remove
            current_user_id: Requesting user ID

        Raises:
            NotFoundError: If group or member doesn't exist
            AuthorizationError: If not group owner
        """
        group = await self.get_group(group_id)

        # Check authorization
        is_owner = await self._is_group_owner(group_id, current_user_id)
        if not is_owner:
            raise AuthorizationError(
                message="Only group owner can remove members",
                error_code=ErrorCode.NOT_GROUP_OWNER,
            )

        # Check member exists
        member = await self._get_group_member(group_id, user_id)
        if not member:
            raise NotFoundError(
                message="Member not found in group",
                error_code=ErrorCode.MEMBER_NOT_FOUND,
            )

        # Delete member
        await self.db.delete(member)
        await self.db.commit()

        # Clear cache
        await self._clear_group_cache(group_id)

    async def update_member_role(
        self,
        group_id: UUID,
        user_id: UUID,
        new_role: str,
        current_user_id: UUID,
    ) -> GroupMember:
        """
        Update group member role (owner only).

        Args:
            group_id: Group UUID
            user_id: Member user ID
            new_role: "owner" or "member"
            current_user_id: Requesting user ID

        Returns:
            Updated GroupMember object

        Raises:
            NotFoundError: If group or member doesn't exist
            AuthorizationError: If not group owner
            ValidationError: If invalid role
        """
        group = await self.get_group(group_id)

        # Validate role
        if new_role not in ["owner", "member"]:
            raise ValidationError(
                message="Invalid role. Must be 'owner' or 'member'",
                error_code=ErrorCode.INVALID_ROLE,
            )

        # Check authorization
        is_owner = await self._is_group_owner(group_id, current_user_id)
        if not is_owner:
            raise AuthorizationError(
                message="Only group owner can update roles",
                error_code=ErrorCode.NOT_GROUP_OWNER,
            )

        # Get and update member
        member = await self._get_group_member(group_id, user_id)
        if not member:
            raise NotFoundError(
                message="Member not found in group",
                error_code=ErrorCode.MEMBER_NOT_FOUND,
            )

        member.role = GroupRole(new_role)
        await self.db.commit()
        await self.db.refresh(member)

        # Clear cache
        await self._clear_group_cache(group_id)

        return member

    # ===== HELPER METHODS =====

    async def _is_group_owner(
        self,
        group_id: UUID,
        user_id: UUID,
    ) -> bool:
        """Check if user is group owner."""
        stmt = (
            select(GroupMember)
            .where(GroupMember.group_id == group_id)
            .where(GroupMember.user_id == user_id)
            .where(GroupMember.role == GroupRole.OWNER)
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none() is not None

    async def _is_group_member(
        self,
        group_id: UUID,
        user_id: UUID,
    ) -> bool:
        """Check if user is group member."""
        stmt = (
            select(GroupMember)
            .where(GroupMember.group_id == group_id)
            .where(GroupMember.user_id == user_id)
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none() is not None

    async def _get_user(self, user_id: UUID) -> User | None:
        """Get user by ID."""
        stmt = select(User).where(User.id == user_id)
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def _get_group_member(
        self,
        group_id: UUID,
        user_id: UUID,
    ) -> GroupMember | None:
        """Get specific group member."""
        stmt = (
            select(GroupMember)
            .where(GroupMember.group_id == group_id)
            .where(GroupMember.user_id == user_id)
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def _get_group_member_count(self, group_id: UUID) -> int:
        """Get number of members in group."""
        stmt = (
            select(func.count(GroupMember.id))
            .where(GroupMember.group_id == group_id)
        )
        result = await self.db.execute(stmt)
        return result.scalar() or 0

    async def _clear_group_cache(self, group_id: UUID) -> None:
        """Clear Redis cache for group."""
        await self.redis.delete(f"group:{group_id}")
        await self.redis.delete(f"group:{group_id}:stats")
```

---

## 5. Analytics Calculations

### 5.1 Player Statistics Formulas

#### Win Rate

```
win_rate = (total_wins / total_games) * 100

Example: 5 wins / 10 games = 50%
```

#### Average Score Per Game

```
average_score = total_points / total_games

Example: 250 total points / 10 games = 25 points/game
```

#### Contract Success Rate

```
contract_success_rate = (contracts_made / contracts_attempted) * 100

Example: 8 made / 12 attempted = 66.7%
```

#### Zero Bid Success Rate

```
zero_success_rate = (zeros_made / zeros_attempted) * 100

Example: 3 made / 5 attempted = 60%
```

#### Current Streak

```
# After each game, update streak:
- If won: increment streak (or set to 1 if was losing)
- If lost: decrement streak (or set to -1 if was winning)
- Track best positive streak separately
```

#### Recent Form

```
# Maintain rolling array of last 10 games
recent_form = ["W", "L", "W", "W", "L", "W", "W", "W", "L", "W"]
# Insert new result at beginning, remove last if length > 10
```

### 5.2 Round Scoring Formulas

#### Standard Contract (Non-Zero)

```python
if tricks_won == contract_bid:
    score = (contract_bid ** 2) + 10
else:
    deviation = abs(tricks_won - contract_bid)
    score = deviation * -10

Example 1: Bid 5, won 5 -> 5² + 10 = 35 points
Example 2: Bid 5, won 3 -> 2 deviation * -10 = -20 points
```

#### Zero Bid

```python
if tricks_won == 0:
    if game_type == "over":
        score = 25
    else:  # under
        score = 50
else:
    if tricks_won == 1:
        score = -50
    else:  # 2 or more tricks
        score = -50 + (tricks_won - 1) * 10

Example 1: Zero bid, 0 tricks, over game -> 25 points
Example 2: Zero bid, 0 tricks, under game -> 50 points
Example 3: Zero bid, 1 trick -> -50 points
Example 4: Zero bid, 3 tricks -> -50 + (3-1)*10 = -30 points
```

#### Game Type Determination

```python
total_contracts = sum([bid1, bid2, bid3, bid4])

if total_contracts > 13:
    game_type = "over"
else:
    game_type = "under"
```

### 5.3 Group Leaderboard Calculations

#### By Win Count

```sql
SELECT
    u.id,
    u.display_name,
    ps.total_wins,
    ps.total_games,
    ps.win_rate,
    ROW_NUMBER() OVER (ORDER BY ps.total_wins DESC) as rank
FROM player_stats ps
JOIN users u ON ps.user_id = u.id
ORDER BY ps.total_wins DESC
LIMIT 10;
```

#### By Points

```sql
SELECT
    u.id,
    u.display_name,
    ps.total_points,
    ps.average_score,
    ROW_NUMBER() OVER (ORDER BY ps.total_points DESC) as rank
FROM player_stats ps
JOIN users u ON ps.user_id = u.id
ORDER BY ps.total_points DESC
LIMIT 10;
```

#### By Games Played

```sql
SELECT
    u.id,
    u.display_name,
    ps.total_games,
    ps.total_wins,
    ps.win_rate,
    ROW_NUMBER() OVER (ORDER BY ps.total_games DESC) as rank
FROM player_stats ps
JOIN users u ON ps.user_id = u.id
ORDER BY ps.total_games DESC
LIMIT 10;
```

### 5.4 Head-to-Head Statistics

#### Query Pattern

```python
async def get_head_to_head_stats(
    user_id_1: UUID,
    user_id_2: UUID,
) -> dict:
    """
    Get statistics between two players in group games.

    Returns:
        {
            "player_1": {
                "id": UUID,
                "display_name": str,
                "wins": int,
                "games": int,
                "win_rate": float,
                "total_points": int,
                "avg_points_per_game": float,
            },
            "player_2": { ... same structure ... },
            "games": [
                {
                    "game_id": UUID,
                    "date": datetime,
                    "winner_id": UUID,
                    "player_1_score": int,
                    "player_2_score": int,
                    "group_id": UUID | None,
                }
            ]
        }
    """
    # Implementation
```

---

## 6. Query Optimization Strategy

### 6.1 Critical Queries with Indexes

#### 1. Get Group with All Members

**Query:**
```python
stmt = (
    select(Group)
    .options(selectinload(Group.members).selectinload(GroupMember.user))
    .where(Group.id == group_id)
)
```

**Index Used:** `pk_groups`
**Additional Loads:** Uses relationship eager loading to avoid N+1

---

#### 2. List User's Groups (Pagination)

**Query:**
```python
stmt = (
    select(Group)
    .join(GroupMember)
    .where(GroupMember.user_id == user_id)
    .order_by(Group.created_at.desc())
    .offset((page - 1) * page_size)
    .limit(page_size)
)
```

**Index Used:** `ix_group_members_user_id`

---

#### 3. Group Leaderboard

**Query:**
```python
stmt = (
    select(PlayerStats)
    .join(User)
    .join(GamePlayer)
    .join(Game)
    .join(Group)
    .where(Group.id == group_id)
    .order_by(PlayerStats.total_wins.desc())
    .limit(10)
)
```

**Indexes Used:**
- `ix_player_stats_total_wins`
- `ix_group_members_group_id` (for group membership verification)

---

#### 4. Game History for Group

**Query:**
```python
stmt = (
    select(Game)
    .options(selectinload(Game.players).selectinload(GamePlayer.user))
    .where(Game.group_id == group_id)
    .where(Game.status == GameStatus.FINISHED)
    .order_by(Game.ended_at.desc())
    .offset((page - 1) * page_size)
    .limit(page_size)
)
```

**Index Used:** `ix_games_group_status`

---

### 6.2 Query Optimization Tips

1. **Always use eager loading for relationships:**
   ```python
   .options(selectinload(Group.members).selectinload(GroupMember.user))
   ```

2. **Use composite indexes for multi-column WHERE clauses:**
   ```
   ix_group_members_group_id, user_id (composite when needed)
   ```

3. **Filter by indexed columns early:**
   ```python
   .where(Group.id == group_id)  # Use PK index first
   .where(GroupMember.role == GroupRole.OWNER)  # Then filter
   ```

4. **Use partial indexes for status-based queries:**
   ```
   WHERE status IN ('waiting', 'playing') filters automatically
   ```

---

## 7. Redis Caching Strategy

### 7.1 Group Cache Keys

#### Group State Cache

```
Key Pattern: group:{group_id}

Structure (Hash):
{
    "id": "{group_id}",
    "name": "Friday Night Whist",
    "description": "Weekly game session",
    "created_by": "{creator_user_id}",
    "total_games": 15,
    "total_rounds": 120,
    "last_played_at": "2026-01-15T21:30:00Z",
    "created_at": "2026-01-01T10:00:00Z",
    "updated_at": "2026-01-15T21:30:00Z",
}

TTL: 24 hours
Invalidation: On group update, member add/remove
```

#### Group Members Cache

```
Key Pattern: group:{group_id}:members

Structure (JSON Array):
[
    {
        "user_id": "{uuid}",
        "display_name": "Alice",
        "role": "owner",
        "joined_at": "2026-01-01T10:00:00Z",
    },
    {
        "user_id": "{uuid}",
        "display_name": "Bob",
        "role": "member",
        "joined_at": "2026-01-02T10:00:00Z",
    },
    ...
]

TTL: 24 hours
Invalidation: On member add/remove/role change
```

#### Group Leaderboard Cache

```
Key Pattern: group:{group_id}:leaderboard:{metric}

Metrics: "wins", "points", "games"

Structure (JSON Array):
[
    {
        "rank": 1,
        "user_id": "{uuid}",
        "display_name": "Alice",
        "total_wins": 10,
        "total_games": 15,
        "win_rate": 66.7,
        "total_points": 250,
        "average_score": 16.7,
    },
    {
        "rank": 2,
        "user_id": "{uuid}",
        "display_name": "Bob",
        "total_wins": 4,
        "total_games": 15,
        "win_rate": 26.7,
        "total_points": 180,
        "average_score": 12.0,
    },
    ...
]

TTL: 12 hours (recalculated less frequently than group data)
Invalidation: After game completion, or cache expiry
```

### 7.2 Cache Invalidation Strategy

```python
"""Cache invalidation implementation."""
from redis.asyncio import Redis
from uuid import UUID


class GroupCacheManager:
    """Manages group-related cache operations."""

    def __init__(self, redis: Redis) -> None:
        self.redis = redis

    async def invalidate_group(self, group_id: UUID) -> None:
        """Invalidate all caches for a group."""
        await self.redis.delete(
            f"group:{group_id}",
            f"group:{group_id}:members",
            f"group:{group_id}:leaderboard:wins",
            f"group:{group_id}:leaderboard:points",
            f"group:{group_id}:leaderboard:games",
            f"group:{group_id}:stats",
        )

    async def invalidate_member_caches(self, user_id: UUID) -> None:
        """Invalidate caches for all groups a user belongs to."""
        # Get all group IDs for user (may need separate index)
        group_ids = await self.redis.smembers(f"user:{user_id}:groups")
        for group_id in group_ids:
            await self.invalidate_group(UUID(group_id))

    async def invalidate_leaderboard(
        self,
        group_id: UUID,
        metrics: list[str] = None,
    ) -> None:
        """Invalidate leaderboard caches for specific metrics."""
        if metrics is None:
            metrics = ["wins", "points", "games"]

        for metric in metrics:
            await self.redis.delete(f"group:{group_id}:leaderboard:{metric}")

    async def get_or_compute_leaderboard(
        self,
        group_id: UUID,
        metric: str = "wins",
        limit: int = 10,
    ) -> list[dict]:
        """
        Get cached leaderboard or compute it.

        Args:
            group_id: Group UUID
            metric: "wins", "points", or "games"
            limit: Number of top players

        Returns:
            List of player stats
        """
        cache_key = f"group:{group_id}:leaderboard:{metric}"

        # Try cache first
        cached = await self.redis.get(cache_key)
        if cached:
            return json.loads(cached)

        # Compute from database
        leaderboard = await self._compute_leaderboard(
            group_id, metric, limit
        )

        # Cache for 12 hours
        await self.redis.setex(
            cache_key,
            12 * 3600,
            json.dumps(leaderboard),
        )

        return leaderboard

    async def _compute_leaderboard(
        self,
        group_id: UUID,
        metric: str,
        limit: int,
    ) -> list[dict]:
        """Compute leaderboard from database."""
        # Implementation depends on metric
        # Sort by total_wins, total_points, or total_games
        pass
```

### 7.3 Cache Warming Strategy

```python
"""Pre-warm caches for frequently accessed data."""
async def warm_group_cache(
    group_id: UUID,
    db: AsyncSession,
    redis: Redis,
) -> None:
    """Warm all caches for a group."""
    # Get group data
    group = await get_group_by_id(db, group_id)
    if not group:
        return

    # Cache group
    await redis.hset(
        f"group:{group_id}",
        mapping={
            "id": str(group.id),
            "name": group.name,
            "description": group.description or "",
            "total_games": group.total_games,
            "total_rounds": group.total_rounds,
            "last_played_at": group.last_played_at.isoformat() if group.last_played_at else "",
        },
    )

    # Cache members
    members = await get_group_members(db, group_id)
    await redis.set(
        f"group:{group_id}:members",
        json.dumps([serialize_member(m) for m in members]),
    )

    # Cache leaderboards
    for metric in ["wins", "points", "games"]:
        leaderboard = await compute_leaderboard(db, group_id, metric)
        await redis.setex(
            f"group:{group_id}:leaderboard:{metric}",
            12 * 3600,
            json.dumps(leaderboard),
        )
```

---

## 8. Appendix - Complete Error Codes

### Group-Related Error Codes

```python
class ErrorCode(str, Enum):
    """Group management error codes."""

    # Group errors (7xxx)
    GROUP_NOT_FOUND = "GROUP_7001"
    GROUP_FULL = "GROUP_7002"
    USER_ALREADY_IN_GROUP = "GROUP_7003"
    NOT_GROUP_OWNER = "GROUP_7004"
    NOT_GROUP_MEMBER = "GROUP_7005"
    INVALID_ROLE = "GROUP_7006"
    MEMBER_NOT_FOUND = "GROUP_7007"
    CANNOT_REMOVE_SELF = "GROUP_7008"
```

---

## Document Summary

This comprehensive specification document includes:

✓ **Database Schema**
- Complete Groups table definition with all fields and constraints
- GroupMembers junction table with role management
- PlayerStats table with all analytics fields
- Index strategies for optimal query performance

✓ **API Specifications**
- RESTful endpoints for group CRUD operations
- Member management (add, remove, update role)
- Request/response schemas with Pydantic models
- Error handling and HTTP status codes

✓ **Service Layer**
- Complete GroupService implementation
- Authorization checks (owner-only operations)
- Member validation and conflict handling
- Cache management helpers

✓ **Analytics Calculations**
- Win rate, average score, and contract success rate formulas
- Round scoring with standard and zero bid calculations
- Game type determination logic
- Leaderboard query patterns

✓ **Query Optimization**
- Index usage for all critical queries
- Eager loading strategies to prevent N+1 problems
- Composite indexes for multi-column filters
- Query optimization best practices

✓ **Redis Caching**
- Cache key patterns for groups, members, and leaderboards
- TTL strategies and invalidation logic
- Cache warming for performance
- Concurrent access patterns

---

*Document generated from backend-api-lld.md and database-schema-lld.md*
*All specifications follow Python 3.11+, FastAPI, SQLAlchemy 2.0, and PostgreSQL 15+ standards*
