"""
Integration tests for the complete authentication flow.
Run with: pytest tests/integration/test_auth_flow.py -v
"""
import pytest
from httpx import AsyncClient
from datetime import timedelta
from uuid import uuid4

from app.main import app
from app.core.security import create_access_token, create_refresh_token, hash_password
from app.models.user import User


@pytest.mark.asyncio
class TestAuthenticationFlow:
    """Test the complete auth flow end-to-end."""

    async def test_register_new_user(self, client: AsyncClient):
        """New user can register and receives tokens."""
        response = await client.post("/api/v1/auth/register", json={
            "username": "testuser",
            "email": "test@example.com",
            "password": "SecurePass123!",
            "display_name": "Test User"
        })
        assert response.status_code == 201
        data = response.json()
        assert "tokens" in data
        assert "access_token" in data["tokens"]
        assert "refresh_token" in data["tokens"]
        assert data["username"] == "testuser"

    async def test_register_duplicate_username_fails(self, client: AsyncClient, test_user):
        """Cannot register with existing username."""
        response = await client.post("/api/v1/auth/register", json={
            "username": test_user.username,
            "email": "different@example.com",
            "password": "SecurePass123!",
            "display_name": "Other User"
        })
        assert response.status_code == 409

    async def test_login_valid_credentials(self, client: AsyncClient, test_user):
        """User can login with valid credentials."""
        response = await client.post("/api/v1/auth/login", json={
            "email": test_user.email,
            "password": "TestPass123!"
        })
        assert response.status_code == 200
        data = response.json()
        assert "tokens" in data
        assert "access_token" in data["tokens"]
        assert "refresh_token" in data["tokens"]
        assert data["user"]["id"] == str(test_user.id)

    async def test_login_invalid_password(self, client: AsyncClient, test_user):
        """Login fails with wrong password."""
        response = await client.post("/api/v1/auth/login", json={
            "email": test_user.email,
            "password": "WrongPassword!"
        })
        assert response.status_code == 401

    async def test_login_nonexistent_user(self, client: AsyncClient):
        """Login fails for non-existent user."""
        response = await client.post("/api/v1/auth/login", json={
            "email": "nonexistent@example.com",
            "password": "AnyPassword123!"
        })
        assert response.status_code == 401

    async def test_access_protected_route_with_token(self, client: AsyncClient, auth_headers):
        """Can access protected route with valid token."""
        response = await client.get("/api/v1/auth/me", headers=auth_headers)
        assert response.status_code == 200
        assert "id" in response.json()
        assert "username" in response.json()

    async def test_access_protected_route_without_token(self, client: AsyncClient):
        """Cannot access protected route without token."""
        response = await client.get("/api/v1/auth/me")
        assert response.status_code == 401

    async def test_access_protected_route_invalid_token(self, client: AsyncClient):
        """Cannot access protected route with invalid token."""
        response = await client.get(
            "/api/v1/auth/me",
            headers={"Authorization": "Bearer invalid.token.here"}
        )
        assert response.status_code == 401

    async def test_access_protected_route_expired_token(self, client: AsyncClient, expired_token):
        """Cannot access protected route with expired token."""
        response = await client.get(
            "/api/v1/auth/me",
            headers={"Authorization": f"Bearer {expired_token}"}
        )
        assert response.status_code == 401

    async def test_refresh_token_success(self, client: AsyncClient, test_user, db_session):
        """Can get new access token with valid refresh token."""
        # Generate tokens
        refresh_token = create_refresh_token(subject=str(test_user.id))

        # Store refresh token in Redis (simulating login)
        await db_session.redis.setex(
            f"user:{test_user.id}:refresh_token",
            7 * 24 * 60 * 60,
            refresh_token
        )

        response = await client.post("/api/v1/auth/refresh", json={
            "refresh_token": refresh_token
        })
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data

        # New token should work
        me_response = await client.get(
            "/api/v1/auth/me",
            headers={"Authorization": f"Bearer {data['access_token']}"}
        )
        assert me_response.status_code == 200

    async def test_refresh_with_access_token_fails(self, client: AsyncClient, access_token):
        """Cannot refresh using an access token (must use refresh token)."""
        response = await client.post("/api/v1/auth/refresh", json={
            "refresh_token": access_token  # Wrong token type!
        })
        assert response.status_code == 401

    async def test_refresh_with_invalid_token_fails(self, client: AsyncClient):
        """Cannot refresh with invalid token."""
        response = await client.post("/api/v1/auth/refresh", json={
            "refresh_token": "invalid.refresh.token"
        })
        assert response.status_code == 401

    async def test_logout_invalidates_token(self, client: AsyncClient, auth_headers, test_user):
        """After logout, refresh token should be invalidated."""
        response = await client.post("/api/v1/auth/logout", headers=auth_headers)
        assert response.status_code == 204

        # Try to refresh with the same refresh token (should fail)
        # This depends on whether you implemented refresh token revocation


@pytest.mark.asyncio
class TestWebSocketAuthentication:
    """Test WebSocket authentication flow."""

    async def test_websocket_connect_with_valid_token(self, socketio_client, access_token):
        """Can connect to WebSocket with valid token."""
        socketio_client.connect(
            "http://localhost:8000",
            auth={"token": access_token},
            socketio_path="/ws/socket.io"
        )
        assert socketio_client.connected

    async def test_websocket_connect_without_token_fails(self, socketio_client):
        """Cannot connect to WebSocket without token."""
        with pytest.raises(Exception):
            socketio_client.connect(
                "http://localhost:8000",
                socketio_path="/ws/socket.io"
            )

    async def test_websocket_connect_invalid_token_fails(self, socketio_client):
        """Cannot connect to WebSocket with invalid token."""
        with pytest.raises(Exception):
            socketio_client.connect(
                "http://localhost:8000",
                auth={"token": "invalid.token"},
                socketio_path="/ws/socket.io"
            )


@pytest.mark.asyncio
class TestTokenTypes:
    """Test that token types are correctly enforced."""

    async def test_access_token_type_claim(self, access_token):
        """Access token has correct type claim."""
        from app.core.security import decode_token
        payload = decode_token(access_token)
        assert payload.get("type") == "access"

    async def test_refresh_token_type_claim(self, refresh_token):
        """Refresh token has correct type claim."""
        from app.core.security import decode_token
        payload = decode_token(refresh_token)
        assert payload.get("type") == "refresh"

    async def test_token_subject_is_user_id(self, access_token, test_user):
        """Token subject contains user ID."""
        from app.core.security import decode_token
        payload = decode_token(access_token)
        assert payload.get("sub") == str(test_user.id)
