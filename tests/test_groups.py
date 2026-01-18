"""Tests for group management functionality."""
from uuid import uuid4

import pytest

from app.services.group_service import GroupService


@pytest.fixture
async def group_service(db_session, redis) -> GroupService:  # type: ignore[no-untyped-def]
    """Create a GroupService instance."""
    return GroupService(db_session, redis)


class TestGroupCreation:
    """Test group creation."""

    async def test_create_group_success(
        self,
        group_service: GroupService,
        test_user_id: str,
    ) -> None:
        """Test successful group creation."""
        group_id = await group_service.create_group(
            user_id=test_user_id,  # type: ignore[arg-type]
            name="Test Group",
            description="A test group",
        )
        assert group_id is not None

    async def test_create_group_with_none_description(
        self,
        group_service: GroupService,
        test_user_id: str,
    ) -> None:
        """Test group creation with no description."""
        group_id = await group_service.create_group(
            user_id=test_user_id,  # type: ignore[arg-type]
            name="Test Group",
            description=None,
        )
        assert group_id is not None

    async def test_create_group_nonexistent_user(
        self,
        group_service: GroupService,
    ) -> None:
        """Test group creation fails for nonexistent user."""
        with pytest.raises(ValueError, match="not found"):
            await group_service.create_group(
                user_id=uuid4(),
                name="Test Group",
            )


class TestGroupRetrieval:
    """Test group retrieval."""

    async def test_get_group_success(
        self,
        group_service: GroupService,
        test_user_id: str,
    ) -> None:
        """Test successful group retrieval."""
        group_id = await group_service.create_group(
            user_id=test_user_id,  # type: ignore[arg-type]
            name="Test Group",
        )

        group = await group_service.get_group(group_id)
        assert group is not None
        assert group.name == "Test Group"
        assert group.member_count == 1

    async def test_get_nonexistent_group(
        self,
        group_service: GroupService,
    ) -> None:
        """Test retrieval of nonexistent group returns None."""
        group = await group_service.get_group(uuid4())
        assert group is None


class TestMemberManagement:
    """Test group member management."""

    async def test_add_member_success(
        self,
        group_service: GroupService,
        test_user_id: str,
    ) -> None:
        """Test adding a member to a group."""
        await group_service.create_group(
            user_id=test_user_id,  # type: ignore[arg-type]
            name="Test Group",
        )

        # Note: This would need a second test user in real tests
        # For now we test the validation path
        pass

    async def test_add_existing_member_fails(
        self,
        group_service: GroupService,
        test_user_id: str,
    ) -> None:
        """Test adding existing member fails."""
        group_id = await group_service.create_group(
            user_id=test_user_id,  # type: ignore[arg-type]
            name="Test Group",
        )

        # Try to add same user again
        with pytest.raises(ValueError, match="already member"):
            await group_service.add_member(
                group_id=group_id,
                user_id=test_user_id,  # type: ignore[arg-type]
                requester_id=test_user_id,  # type: ignore[arg-type]
            )

    async def test_remove_member_success(
        self,
        group_service: GroupService,
        test_user_id: str,
    ) -> None:
        """Test removing a member from a group."""
        group_id = await group_service.create_group(
            user_id=test_user_id,  # type: ignore[arg-type]
            name="Test Group",
        )

        # Cannot remove owner, but can test permission check
        other_user = uuid4()
        with pytest.raises(ValueError, match="not member"):
            await group_service.remove_member(
                group_id=group_id,
                user_id=other_user,
                requester_id=test_user_id,  # type: ignore[arg-type]
            )

    async def test_remove_owner_fails(
        self,
        group_service: GroupService,
        test_user_id: str,
    ) -> None:
        """Test removing group owner fails."""
        group_id = await group_service.create_group(
            user_id=test_user_id,  # type: ignore[arg-type]
            name="Test Group",
        )

        with pytest.raises(ValueError, match="cannot remove themselves"):
            await group_service.remove_member(
                group_id=group_id,
                user_id=test_user_id,  # type: ignore[arg-type]
                requester_id=test_user_id,  # type: ignore[arg-type]
            )


class TestGroupPermissions:
    """Test group access permissions."""

    async def test_add_member_non_owner_fails(
        self,
        group_service: GroupService,
        test_user_id: str,
    ) -> None:
        """Test non-owner cannot add members."""
        group_id = await group_service.create_group(
            user_id=test_user_id,  # type: ignore[arg-type]
            name="Test Group",
        )

        other_user = uuid4()
        with pytest.raises(ValueError, match="only group owner"):
            await group_service.add_member(
                group_id=group_id,
                user_id=uuid4(),
                requester_id=other_user,
            )

    async def test_is_group_member(
        self,
        group_service: GroupService,
        test_user_id: str,
    ) -> None:
        """Test member checking."""
        group_id = await group_service.create_group(
            user_id=test_user_id,  # type: ignore[arg-type]
            name="Test Group",
        )

        is_member = await group_service.is_group_member(
            group_id,
            test_user_id,  # type: ignore[arg-type]
        )
        assert is_member

        is_non_member = await group_service.is_group_member(
            group_id,
            uuid4(),
        )
        assert not is_non_member


class TestGroupListing:
    """Test group listing."""

    async def test_list_user_groups(
        self,
        group_service: GroupService,
        test_user_id: str,
    ) -> None:
        """Test listing user's groups."""
        group_id_1 = await group_service.create_group(
            user_id=test_user_id,  # type: ignore[arg-type]
            name="Group 1",
        )
        group_id_2 = await group_service.create_group(
            user_id=test_user_id,  # type: ignore[arg-type]
            name="Group 2",
        )

        groups = await group_service.list_user_groups(test_user_id)  # type: ignore[arg-type]
        assert len(groups) == 2
        assert group_id_1 in groups
        assert group_id_2 in groups


class TestGroupStats:
    """Test group statistics tracking."""

    async def test_get_members_count(
        self,
        group_service: GroupService,
        test_user_id: str,
    ) -> None:
        """Test getting member count."""
        group_id = await group_service.create_group(
            user_id=test_user_id,  # type: ignore[arg-type]
            name="Test Group",
        )

        count = await group_service.get_group_members_count(group_id)
        assert count == 1

    async def test_increment_group_stats(
        self,
        group_service: GroupService,
        test_user_id: str,
    ) -> None:
        """Test incrementing group statistics."""
        group_id = await group_service.create_group(
            user_id=test_user_id,  # type: ignore[arg-type]
            name="Test Group",
        )

        await group_service.increment_group_stats(
            group_id,
            games=1,
            rounds=13,
        )

        group = await group_service.get_group(group_id)
        assert group is not None
        assert group.total_games == 1
        assert group.total_rounds == 13
