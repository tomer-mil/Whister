"""User service tests."""

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio  # type: ignore
async def test_get_user_success(client: AsyncClient) -> None:
    """Test getting a user profile."""
    # Register a user
    reg_response = await client.post(
        "/api/v1/auth/register",
        json={
            "username": "testuser",
            "email": "test@example.com",
            "password": "TestPass123",
            "display_name": "Test User",
        },
    )
    assert reg_response.status_code == 201
    user_id = reg_response.json()["id"]

    # Get user profile
    response = await client.get(f"/api/v1/users/{user_id}")
    assert response.status_code == 200
    data = response.json()
    assert data["id"] == user_id
    assert data["username"] == "testuser"
    assert data["email"] == "test@example.com"
    assert data["display_name"] == "Test User"
    assert data["is_active"] is True


@pytest.mark.asyncio  # type: ignore
async def test_get_user_not_found(client: AsyncClient) -> None:
    """Test getting a non-existent user."""
    non_existent_id = "00000000-0000-0000-0000-000000000000"
    response = await client.get(f"/api/v1/users/{non_existent_id}")
    assert response.status_code == 404
    data = response.json()
    assert data["error"] == "NOT_FOUND"


@pytest.mark.asyncio  # type: ignore
async def test_update_user_success(client: AsyncClient) -> None:
    """Test updating user profile."""
    # Register and login
    reg_response = await client.post(
        "/api/v1/auth/register",
        json={
            "username": "testuser",
            "email": "test@example.com",
            "password": "TestPass123",
            "display_name": "Test User",
        },
    )
    user_id = reg_response.json()["id"]
    access_token = reg_response.json()["tokens"]["access_token"]

    # Update user
    response = await client.put(
        f"/api/v1/users/{user_id}",
        headers={"Authorization": f"Bearer {access_token}"},
        json={"display_name": "Updated User"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["display_name"] == "Updated User"
    assert data["username"] == "testuser"  # Should not change


@pytest.mark.asyncio  # type: ignore
async def test_update_user_with_avatar(client: AsyncClient) -> None:
    """Test updating user avatar URL."""
    # Register and login
    reg_response = await client.post(
        "/api/v1/auth/register",
        json={
            "username": "testuser",
            "email": "test@example.com",
            "password": "TestPass123",
            "display_name": "Test User",
        },
    )
    user_id = reg_response.json()["id"]
    access_token = reg_response.json()["tokens"]["access_token"]

    # Update user with avatar
    response = await client.put(
        f"/api/v1/users/{user_id}",
        headers={"Authorization": f"Bearer {access_token}"},
        json={
            "display_name": "Updated User",
            "avatar_url": "https://example.com/avatar.jpg",
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert data["display_name"] == "Updated User"
    assert data["avatar_url"] == "https://example.com/avatar.jpg"


@pytest.mark.asyncio  # type: ignore
async def test_update_user_unauthorized(client: AsyncClient) -> None:
    """Test updating user without authentication."""
    non_existent_id = "00000000-0000-0000-0000-000000000000"
    response = await client.put(
        f"/api/v1/users/{non_existent_id}",
        json={"display_name": "Updated User"},
    )
    assert response.status_code == 403


@pytest.mark.asyncio  # type: ignore
async def test_update_other_user_forbidden(client: AsyncClient) -> None:
    """Test that users cannot update other users' profiles."""
    # Register two users
    user1_response = await client.post(
        "/api/v1/auth/register",
        json={
            "username": "user1",
            "email": "user1@example.com",
            "password": "TestPass123",
            "display_name": "User 1",
        },
    )
    user1_token = user1_response.json()["tokens"]["access_token"]

    user2_response = await client.post(
        "/api/v1/auth/register",
        json={
            "username": "user2",
            "email": "user2@example.com",
            "password": "TestPass123",
            "display_name": "User 2",
        },
    )
    user2_id = user2_response.json()["id"]

    # Try to update user2's profile using user1's token
    response = await client.put(
        f"/api/v1/users/{user2_id}",
        headers={"Authorization": f"Bearer {user1_token}"},
        json={"display_name": "Hacked"},
    )
    assert response.status_code == 403
    data = response.json()
    assert data["error"] == "FORBIDDEN"


@pytest.mark.asyncio  # type: ignore
async def test_get_user_stats_success(client: AsyncClient) -> None:
    """Test getting user statistics."""
    # Register a user
    reg_response = await client.post(
        "/api/v1/auth/register",
        json={
            "username": "testuser",
            "email": "test@example.com",
            "password": "TestPass123",
            "display_name": "Test User",
        },
    )
    user_id = reg_response.json()["id"]

    # Get stats (should return empty stats initially)
    response = await client.get(f"/api/v1/users/{user_id}/stats")
    assert response.status_code == 200
    data = response.json()
    assert data["total_games"] == 0
    assert data["total_rounds"] == 0
    assert data["total_wins"] == 0
    assert data["win_rate"] == 0.0
    assert data["average_score"] == 0.0
    assert data["contract_success_rate"] == 0.0
    assert data["zero_success_rate"] == 0.0


@pytest.mark.asyncio  # type: ignore
async def test_get_user_stats_not_found(client: AsyncClient) -> None:
    """Test getting stats for non-existent user."""
    non_existent_id = "00000000-0000-0000-0000-000000000000"
    response = await client.get(f"/api/v1/users/{non_existent_id}/stats")
    assert response.status_code == 404
    data = response.json()
    assert data["error"] == "NOT_FOUND"


@pytest.mark.asyncio  # type: ignore
async def test_get_user_history_success(client: AsyncClient) -> None:
    """Test getting user game history."""
    # Register and login
    reg_response = await client.post(
        "/api/v1/auth/register",
        json={
            "username": "testuser",
            "email": "test@example.com",
            "password": "TestPass123",
            "display_name": "Test User",
        },
    )
    user_id = reg_response.json()["id"]
    access_token = reg_response.json()["tokens"]["access_token"]

    # Get history (should be empty initially)
    response = await client.get(
        f"/api/v1/users/{user_id}/history",
        headers={"Authorization": f"Bearer {access_token}"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["games"] == []
    assert data["total"] == 0
    assert data["page"] == 1
    assert data["page_size"] == 20
    assert data["has_more"] is False


@pytest.mark.asyncio  # type: ignore
async def test_get_user_history_pagination(client: AsyncClient) -> None:
    """Test user history pagination parameters."""
    # Register and login
    reg_response = await client.post(
        "/api/v1/auth/register",
        json={
            "username": "testuser",
            "email": "test@example.com",
            "password": "TestPass123",
            "display_name": "Test User",
        },
    )
    user_id = reg_response.json()["id"]
    access_token = reg_response.json()["tokens"]["access_token"]

    # Get history with custom page size
    response = await client.get(
        f"/api/v1/users/{user_id}/history?page=1&page_size=10",
        headers={"Authorization": f"Bearer {access_token}"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["page"] == 1
    assert data["page_size"] == 10


@pytest.mark.asyncio  # type: ignore
async def test_get_user_history_unauthorized(client: AsyncClient) -> None:
    """Test getting history without authentication."""
    user_id = "00000000-0000-0000-0000-000000000000"
    response = await client.get(f"/api/v1/users/{user_id}/history")
    assert response.status_code == 403


@pytest.mark.asyncio  # type: ignore
async def test_get_user_history_forbidden(client: AsyncClient) -> None:
    """Test that users cannot view other users' history."""
    # Register two users
    user1_response = await client.post(
        "/api/v1/auth/register",
        json={
            "username": "user1",
            "email": "user1@example.com",
            "password": "TestPass123",
            "display_name": "User 1",
        },
    )
    user1_token = user1_response.json()["tokens"]["access_token"]

    user2_response = await client.post(
        "/api/v1/auth/register",
        json={
            "username": "user2",
            "email": "user2@example.com",
            "password": "TestPass123",
            "display_name": "User 2",
        },
    )
    user2_id = user2_response.json()["id"]

    # Try to get user2's history using user1's token
    response = await client.get(
        f"/api/v1/users/{user2_id}/history",
        headers={"Authorization": f"Bearer {user1_token}"},
    )
    assert response.status_code == 403
    data = response.json()
    assert data["error"] == "FORBIDDEN"


@pytest.mark.asyncio  # type: ignore
async def test_get_user_history_not_found(client: AsyncClient) -> None:
    """Test getting history for non-existent user."""
    # Try to get history with invalid token (will fail auth first)
    # This tests the auth check happens before the user lookup
    response = await client.get(
        "/api/v1/users/00000000-0000-0000-0000-000000000000/history"
    )
    assert response.status_code == 403  # Auth required


@pytest.mark.asyncio  # type: ignore
async def test_update_user_partial(client: AsyncClient) -> None:
    """Test partial update of user profile."""
    # Register and login
    reg_response = await client.post(
        "/api/v1/auth/register",
        json={
            "username": "testuser",
            "email": "test@example.com",
            "password": "TestPass123",
            "display_name": "Test User",
        },
    )
    user_id = reg_response.json()["id"]
    access_token = reg_response.json()["tokens"]["access_token"]

    # Update only display_name (avatar_url stays null)
    response = await client.put(
        f"/api/v1/users/{user_id}",
        headers={"Authorization": f"Bearer {access_token}"},
        json={"display_name": "New Name"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["display_name"] == "New Name"
    assert data["avatar_url"] is None


@pytest.mark.asyncio  # type: ignore
async def test_get_user_stats_public(client: AsyncClient) -> None:
    """Test that stats are publicly accessible."""
    # Register a user
    reg_response = await client.post(
        "/api/v1/auth/register",
        json={
            "username": "testuser",
            "email": "test@example.com",
            "password": "TestPass123",
            "display_name": "Test User",
        },
    )
    user_id = reg_response.json()["id"]

    # Get stats without authentication
    response = await client.get(f"/api/v1/users/{user_id}/stats")
    assert response.status_code == 200
    data = response.json()
    assert "total_games" in data


@pytest.mark.asyncio  # type: ignore
async def test_get_user_public(client: AsyncClient) -> None:
    """Test that user profiles are publicly accessible."""
    # Register a user
    reg_response = await client.post(
        "/api/v1/auth/register",
        json={
            "username": "testuser",
            "email": "test@example.com",
            "password": "TestPass123",
            "display_name": "Test User",
        },
    )
    user_id = reg_response.json()["id"]

    # Get user without authentication
    response = await client.get(f"/api/v1/users/{user_id}")
    assert response.status_code == 200
    data = response.json()
    assert data["username"] == "testuser"
