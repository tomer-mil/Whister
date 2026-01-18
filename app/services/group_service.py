"""Group service for managing groups and members."""
from typing import Any
from uuid import UUID

from redis.asyncio import Redis  # type: ignore[import-untyped]
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Group, GroupMember, User
from app.schemas.group import GroupDetails, GroupRole
from app.schemas.group import GroupMember as GroupMemberSchema


class GroupService:
    """Service for group management operations."""

    def __init__(self, db: AsyncSession, redis: Redis[Any]) -> None:
        """Initialize group service.

        Args:
            db: Database session
            redis: Redis connection
        """
        self.db = db
        self.redis = redis

    async def create_group(
        self,
        user_id: UUID,
        name: str,
        description: str | None = None,
    ) -> UUID:
        """Create a new group.

        Args:
            user_id: ID of user creating the group
            name: Group name
            description: Optional group description

        Returns:
            UUID of created group

        Raises:
            ValueError: If user not found
        """
        # Verify user exists
        user_result = await self.db.execute(select(User).where(User.id == user_id))
        user = user_result.scalar_one_or_none()
        if not user:
            raise ValueError(f"User {user_id} not found")

        # Create group
        group = Group(
            name=name,
            description=description,
            created_by=user_id,
            total_games=0,
            total_rounds=0,
        )
        self.db.add(group)
        await self.db.flush()

        # Add creator as owner
        owner_member = GroupMember(
            group_id=group.id,
            user_id=user_id,
            role=GroupRole.OWNER,
        )
        self.db.add(owner_member)
        await self.db.commit()

        # Cache group in Redis
        cache_key = f"group:{group.id}"
        await self.redis.setex(
            cache_key,
            86400,  # 24 hours
            f"{group.id}",
        )

        return group.id

    async def get_group(self, group_id: UUID) -> GroupDetails | None:
        """Get group details by ID.

        Args:
            group_id: ID of group to retrieve

        Returns:
            GroupDetails or None if not found
        """
        # Try cache first
        cache_key = f"group:{group_id}"
        cached = await self.redis.get(cache_key)
        if cached:
            # Cache hit, fetch full details from DB
            pass

        # Fetch from database
        group_result = await self.db.execute(
            select(Group).where(Group.id == group_id)
        )
        group = group_result.scalar_one_or_none()
        if not group:
            return None

        # Fetch creator info
        creator_result = await self.db.execute(
            select(User).where(User.id == group.created_by)
        )
        creator = creator_result.scalar_one_or_none()

        # Fetch members
        members_result = await self.db.execute(
            select(GroupMember, User).where(
                (GroupMember.group_id == group_id)
                & (GroupMember.user_id == User.id)
            )
        )
        members_data = members_result.all()
        members = [
            GroupMemberSchema(
                user_id=member.id,
                display_name=user.display_name,
                role=member.role,
                joined_at=member.joined_at,
            )
            for member, user in members_data
        ]

        return GroupDetails(
            group_id=group.id,
            name=group.name,
            description=group.description,
            created_by=group.created_by,
            created_by_name=creator.display_name if creator else "Unknown",
            total_games=group.total_games,
            total_rounds=group.total_rounds,
            member_count=len(members),
            members=members,
            created_at=group.created_at,
            updated_at=group.updated_at,
        )

    async def add_member(
        self,
        group_id: UUID,
        user_id: UUID,
        requester_id: UUID,
    ) -> None:
        """Add a member to a group.

        Args:
            group_id: ID of group
            user_id: ID of user to add
            requester_id: ID of user making request (must be owner)

        Raises:
            ValueError: If group/user not found, member already exists, or no permission
        """
        # Verify group exists and requester is owner
        group_result = await self.db.execute(
            select(Group).where(Group.id == group_id)
        )
        group = group_result.scalar_one_or_none()
        if not group:
            raise ValueError(f"Group {group_id} not found")

        if group.created_by != requester_id:
            raise ValueError("Only group owner can add members")

        # Verify user to add exists
        user_result = await self.db.execute(
            select(User).where(User.id == user_id)
        )
        user = user_result.scalar_one_or_none()
        if not user:
            raise ValueError(f"User {user_id} not found")

        # Check if already member
        existing = await self.db.execute(
            select(GroupMember).where(
                (GroupMember.group_id == group_id)
                & (GroupMember.user_id == user_id)
            )
        )
        if existing.scalar_one_or_none():
            raise ValueError(f"User {user_id} already member of group {group_id}")

        # Add member
        member = GroupMember(
            group_id=group_id,
            user_id=user_id,
            role=GroupRole.MEMBER,
        )
        self.db.add(member)
        await self.db.commit()

        # Invalidate group cache
        cache_key = f"group:{group_id}"
        await self.redis.delete(cache_key)

    async def remove_member(
        self,
        group_id: UUID,
        user_id: UUID,
        requester_id: UUID,
    ) -> None:
        """Remove a member from a group.

        Args:
            group_id: ID of group
            user_id: ID of user to remove
            requester_id: ID of user making request (must be owner or self)

        Raises:
            ValueError: If group/member not found or no permission
        """
        # Verify group exists
        group_result = await self.db.execute(
            select(Group).where(Group.id == group_id)
        )
        group = group_result.scalar_one_or_none()
        if not group:
            raise ValueError(f"Group {group_id} not found")

        # Check permissions (owner or removing self)
        if group.created_by != requester_id and user_id != requester_id:
            raise ValueError("Only group owner or member can remove")

        # Owner cannot remove themselves (group must have owner)
        if group.created_by == user_id:
            raise ValueError("Group owner cannot remove themselves")

        # Find and remove member
        member_result = await self.db.execute(
            select(GroupMember).where(
                (GroupMember.group_id == group_id)
                & (GroupMember.user_id == user_id)
            )
        )
        member = member_result.scalar_one_or_none()
        if not member:
            raise ValueError(f"User {user_id} not member of group {group_id}")

        await self.db.delete(member)
        await self.db.commit()

        # Invalidate group cache
        cache_key = f"group:{group_id}"
        await self.redis.delete(cache_key)

    async def list_user_groups(self, user_id: UUID) -> list[UUID]:
        """List all groups a user belongs to.

        Args:
            user_id: ID of user

        Returns:
            List of group IDs
        """
        result = await self.db.execute(
            select(GroupMember.group_id).where(GroupMember.user_id == user_id)
        )
        return list(result.scalars().all())

    async def get_group_members_count(self, group_id: UUID) -> int:
        """Get count of members in a group.

        Args:
            group_id: ID of group

        Returns:
            Number of members
        """
        result = await self.db.execute(
            select(GroupMember).where(GroupMember.group_id == group_id)
        )
        return len(result.all())

    async def is_group_member(self, group_id: UUID, user_id: UUID) -> bool:
        """Check if user is member of group.

        Args:
            group_id: ID of group
            user_id: ID of user

        Returns:
            True if user is member, False otherwise
        """
        result = await self.db.execute(
            select(GroupMember).where(
                (GroupMember.group_id == group_id)
                & (GroupMember.user_id == user_id)
            )
        )
        return result.scalar_one_or_none() is not None

    async def increment_group_stats(
        self,
        group_id: UUID,
        games: int = 0,
        rounds: int = 0,
    ) -> None:
        """Increment group statistics after a game.

        Args:
            group_id: ID of group
            games: Number of games to add
            rounds: Number of rounds to add
        """
        group_result = await self.db.execute(
            select(Group).where(Group.id == group_id)
        )
        group = group_result.scalar_one_or_none()
        if not group:
            raise ValueError(f"Group {group_id} not found")

        group.total_games += games
        group.total_rounds += rounds
        self.db.add(group)
        await self.db.commit()

        # Invalidate cache
        cache_key = f"group:{group_id}"
        await self.redis.delete(cache_key)
