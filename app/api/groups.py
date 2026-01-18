"""API endpoints for group management."""
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_user, get_db
from app.schemas.group import (
    AddMemberRequest,
    AddMemberResponse,
    CreateGroupRequest,
    CreateGroupResponse,
    GroupDetails,
    GroupLeaderboardResponse,
    GroupResponse,
    HeadToHeadStats,
    ListGroupsResponse,
    PlayerStats,
    RemoveMemberResponse,
)
from app.services.analytics_service import AnalyticsService
from app.services.group_service import GroupService

router = APIRouter(prefix="/groups", tags=["groups"])


# ============================================================================
# GROUP MANAGEMENT ENDPOINTS
# ============================================================================


@router.post(
    "",
    response_model=CreateGroupResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new group",
)
async def create_group(
    request: CreateGroupRequest,
    current_user: Annotated[str, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> CreateGroupResponse:
    """Create a new group.

    The current user becomes the group owner.

    Args:
        request: Group creation request
        current_user: Current user ID
        db: Database session

    Returns:
        Group creation response

    Raises:
        HTTPException: If user not found or creation fails
    """
    from app.core.config import get_redis

    redis = await get_redis()
    service = GroupService(db, redis)

    try:
        user_uuid = UUID(current_user)
        group_id = await service.create_group(
            user_uuid,
            request.name,
            request.description,
        )
        return CreateGroupResponse(
            group_id=group_id,
            name=request.name,
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        ) from e


@router.get(
    "",
    response_model=ListGroupsResponse,
    summary="List user's groups",
)
async def list_user_groups(
    current_user: Annotated[str, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ListGroupsResponse:
    """List all groups the current user belongs to.

    Args:
        current_user: Current user ID
        db: Database session

    Returns:
        List of groups and total count
    """
    from app.core.config import get_redis

    redis = await get_redis()
    service = GroupService(db, redis)

    user_uuid = UUID(current_user)
    group_ids = await service.list_user_groups(user_uuid)

    groups = []
    for group_id in group_ids:
        group_details = await service.get_group(group_id)
        if group_details:
            groups.append(
                GroupResponse(
                    group_id=group_details.group_id,
                    name=group_details.name,
                    description=group_details.description,
                    member_count=group_details.member_count,
                    created_at=group_details.created_at,
                )
            )

    return ListGroupsResponse(
        groups=groups,
        total_count=len(groups),
    )


@router.get(
    "/{group_id}",
    response_model=GroupDetails,
    summary="Get group details",
)
async def get_group(
    group_id: UUID,
    current_user: Annotated[str, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> GroupDetails:
    """Get detailed information about a group.

    Args:
        group_id: ID of group to retrieve
        current_user: Current user ID (must be member)
        db: Database session

    Returns:
        Group details

    Raises:
        HTTPException: If group not found or user not member
    """
    from app.core.config import get_redis

    redis = await get_redis()
    service = GroupService(db, redis)

    user_uuid = UUID(current_user)

    # Verify user is member
    is_member = await service.is_group_member(group_id, user_uuid)
    if not is_member:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not a member of this group",
        )

    group = await service.get_group(group_id)
    if not group:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Group not found",
        )

    return group


# ============================================================================
# MEMBER MANAGEMENT ENDPOINTS
# ============================================================================


@router.post(
    "/{group_id}/members",
    response_model=AddMemberResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Add member to group",
)
async def add_member(
    group_id: UUID,
    request: AddMemberRequest,
    current_user: Annotated[str, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> AddMemberResponse:
    """Add a member to a group (owner only).

    Args:
        group_id: ID of group
        request: Member to add
        current_user: Current user ID (must be owner)
        db: Database session

    Returns:
        Member addition response

    Raises:
        HTTPException: If no permission or member already exists
    """
    from app.core.config import get_redis
    from app.models import User

    redis = await get_redis()
    service = GroupService(db, redis)

    requester_uuid = UUID(current_user)

    try:
        await service.add_member(group_id, request.user_id, requester_uuid)

        # Fetch added user info
        from sqlalchemy import select

        user_result = await db.execute(
            select(User).where(User.id == request.user_id)
        )
        user = user_result.scalar_one_or_none()

        return AddMemberResponse(
            group_id=group_id,
            user_id=request.user_id,
            display_name=user.display_name if user else "Unknown",
            role="member",  # type: ignore[assignment]
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        ) from e


@router.delete(
    "/{group_id}/members/{user_id}",
    response_model=RemoveMemberResponse,
    summary="Remove member from group",
)
async def remove_member(
    group_id: UUID,
    user_id: UUID,
    current_user: Annotated[str, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> RemoveMemberResponse:
    """Remove a member from a group.

    Only the group owner can remove other members.
    Members can remove themselves.

    Args:
        group_id: ID of group
        user_id: ID of user to remove
        current_user: Current user ID
        db: Database session

    Returns:
        Member removal response

    Raises:
        HTTPException: If no permission or member not found
    """
    from app.core.config import get_redis

    redis = await get_redis()
    service = GroupService(db, redis)

    requester_uuid = UUID(current_user)

    try:
        await service.remove_member(group_id, user_id, requester_uuid)
        return RemoveMemberResponse(
            group_id=group_id,
            user_id=user_id,
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        ) from e


# ============================================================================
# ANALYTICS ENDPOINTS
# ============================================================================


@router.get(
    "/analytics/player/{user_id}",
    response_model=PlayerStats,
    summary="Get player statistics",
)
async def get_player_stats(
    user_id: UUID,
    current_user: Annotated[str, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> PlayerStats:
    """Get comprehensive statistics for a player.

    Args:
        user_id: ID of player
        current_user: Current user ID (for permission check)
        db: Database session

    Returns:
        Player statistics

    Raises:
        HTTPException: If player not found
    """
    from app.core.config import get_redis

    redis = await get_redis()
    service = AnalyticsService(db, redis)

    try:
        return await service.get_player_stats(user_id)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e),
        ) from e


@router.get(
    "/{group_id}/leaderboard",
    response_model=GroupLeaderboardResponse,
    summary="Get group leaderboard",
)
async def get_group_leaderboard(
    group_id: UUID,
    current_user: Annotated[str, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> GroupLeaderboardResponse:
    """Get leaderboard for a group.

    Args:
        group_id: ID of group
        current_user: Current user ID (must be member)
        db: Database session

    Returns:
        Group leaderboard

    Raises:
        HTTPException: If group not found or user not member
    """
    from app.core.config import get_redis
    from app.models import Group

    redis = await get_redis()
    group_service = GroupService(db, redis)
    analytics_service = AnalyticsService(db, redis)

    user_uuid = UUID(current_user)

    # Verify user is member and group exists
    is_member = await group_service.is_group_member(group_id, user_uuid)
    if not is_member:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not a member of this group",
        )

    from sqlalchemy import select

    group_result = await db.execute(select(Group).where(Group.id == group_id))
    group = group_result.scalar_one_or_none()
    if not group:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Group not found",
        )

    leaderboard = await analytics_service.get_group_leaderboard(group_id)

    from datetime import datetime

    return GroupLeaderboardResponse(
        group_id=group_id,
        group_name=group.name,
        leaderboard=leaderboard,
        generated_at=datetime.utcnow(),
    )


@router.get(
    "/analytics/head-to-head",
    response_model=HeadToHeadStats,
    summary="Get head-to-head statistics",
)
async def get_head_to_head(
    player1_id: UUID,
    player2_id: UUID,
    current_user: Annotated[str, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> HeadToHeadStats:
    """Get head-to-head statistics between two players.

    Args:
        player1_id: First player ID (query param)
        player2_id: Second player ID (query param)
        current_user: Current user ID (for permission check)
        db: Database session

    Returns:
        Head-to-head statistics

    Raises:
        HTTPException: If players not found
    """
    from app.core.config import get_redis

    redis = await get_redis()
    service = AnalyticsService(db, redis)

    try:
        return await service.get_head_to_head_stats(player1_id, player2_id)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e),
        ) from e
