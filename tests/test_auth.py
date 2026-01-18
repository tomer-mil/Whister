"""Authentication tests."""
import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_register_success(client: AsyncClient) -> None:
    """Test successful user registration."""
    response = await client.post(
        "/api/v1/auth/register",
        json={
            "username": "testuser",
            "email": "test@example.com",
            "password": "TestPass123",
            "display_name": "Test User",
        },
    )
    assert response.status_code == 201
    data = response.json()
    assert data["username"] == "testuser"
    assert data["email"] == "test@example.com"
    assert data["display_name"] == "Test User"
    assert "tokens" in data
    assert "access_token" in data["tokens"]
    assert "refresh_token" in data["tokens"]


@pytest.mark.asyncio
async def test_register_duplicate_username(client: AsyncClient) -> None:
    """Test registration fails with duplicate username."""
    # Register first user
    await client.post(
        "/api/v1/auth/register",
        json={
            "username": "testuser",
            "email": "test1@example.com",
            "password": "TestPass123",
            "display_name": "Test User 1",
        },
    )

    # Try to register with same username
    response = await client.post(
        "/api/v1/auth/register",
        json={
            "username": "testuser",
            "email": "test2@example.com",
            "password": "TestPass123",
            "display_name": "Test User 2",
        },
    )
    assert response.status_code == 409
    data = response.json()
    assert data["error"] == "USER_ALREADY_EXISTS"


@pytest.mark.asyncio
async def test_register_duplicate_email(client: AsyncClient) -> None:
    """Test registration fails with duplicate email."""
    # Register first user
    await client.post(
        "/api/v1/auth/register",
        json={
            "username": "user1",
            "email": "test@example.com",
            "password": "TestPass123",
            "display_name": "Test User 1",
        },
    )

    # Try to register with same email
    response = await client.post(
        "/api/v1/auth/register",
        json={
            "username": "user2",
            "email": "test@example.com",
            "password": "TestPass123",
            "display_name": "Test User 2",
        },
    )
    assert response.status_code == 409
    data = response.json()
    assert data["error"] == "EMAIL_ALREADY_EXISTS"


@pytest.mark.asyncio
async def test_register_weak_password(client: AsyncClient) -> None:
    """Test registration fails with weak password."""
    response = await client.post(
        "/api/v1/auth/register",
        json={
            "username": "testuser",
            "email": "test@example.com",
            "password": "weak",  # Too short and weak
            "display_name": "Test User",
        },
    )
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_login_success(client: AsyncClient) -> None:
    """Test successful login."""
    # Register user
    await client.post(
        "/api/v1/auth/register",
        json={
            "username": "testuser",
            "email": "test@example.com",
            "password": "TestPass123",
            "display_name": "Test User",
        },
    )

    # Login
    response = await client.post(
        "/api/v1/auth/login",
        json={
            "email": "test@example.com",
            "password": "TestPass123",
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert data["user"]["email"] == "test@example.com"
    assert "tokens" in data
    assert "access_token" in data["tokens"]
    assert "refresh_token" in data["tokens"]


@pytest.mark.asyncio
async def test_login_invalid_email(client: AsyncClient) -> None:
    """Test login fails with non-existent email."""
    response = await client.post(
        "/api/v1/auth/login",
        json={
            "email": "nonexistent@example.com",
            "password": "TestPass123",
        },
    )
    assert response.status_code == 401
    data = response.json()
    assert data["error"] == "INVALID_CREDENTIALS"


@pytest.mark.asyncio
async def test_login_invalid_password(client: AsyncClient) -> None:
    """Test login fails with invalid password."""
    # Register user
    await client.post(
        "/api/v1/auth/register",
        json={
            "username": "testuser",
            "email": "test@example.com",
            "password": "TestPass123",
            "display_name": "Test User",
        },
    )

    # Try login with wrong password
    response = await client.post(
        "/api/v1/auth/login",
        json={
            "email": "test@example.com",
            "password": "WrongPass123",
        },
    )
    assert response.status_code == 401
    data = response.json()
    assert data["error"] == "INVALID_CREDENTIALS"


@pytest.mark.asyncio
async def test_get_me_success(client: AsyncClient) -> None:
    """Test getting current user profile."""
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
    access_token = reg_response.json()["tokens"]["access_token"]

    # Get current user
    response = await client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {access_token}"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["username"] == "testuser"
    assert data["email"] == "test@example.com"
    assert data["display_name"] == "Test User"


@pytest.mark.asyncio
async def test_get_me_unauthorized(client: AsyncClient) -> None:
    """Test getting current user without authorization."""
    response = await client.get("/api/v1/auth/me")
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_get_me_invalid_token(client: AsyncClient) -> None:
    """Test getting current user with invalid token."""
    response = await client.get(
        "/api/v1/auth/me",
        headers={"Authorization": "Bearer invalid.token.here"},
    )
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_logout_success(client: AsyncClient) -> None:
    """Test successful logout."""
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
    access_token = reg_response.json()["tokens"]["access_token"]

    # Logout
    response = await client.post(
        "/api/v1/auth/logout",
        headers={"Authorization": f"Bearer {access_token}"},
    )
    assert response.status_code == 204


@pytest.mark.asyncio
async def test_refresh_token_success(client: AsyncClient) -> None:
    """Test token refresh."""
    # Register and get tokens
    reg_response = await client.post(
        "/api/v1/auth/register",
        json={
            "username": "testuser",
            "email": "test@example.com",
            "password": "TestPass123",
            "display_name": "Test User",
        },
    )
    refresh_token = reg_response.json()["tokens"]["refresh_token"]

    # Refresh tokens
    response = await client.post(
        "/api/v1/auth/refresh",
        json={"refresh_token": refresh_token},
    )
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert "refresh_token" in data


@pytest.mark.asyncio
async def test_refresh_token_invalid(client: AsyncClient) -> None:
    """Test refresh with invalid token."""
    response = await client.post(
        "/api/v1/auth/refresh",
        json={"refresh_token": "invalid.token.here"},
    )
    assert response.status_code == 401
    data = response.json()
    assert data["error"] == "INVALID_CREDENTIALS"
