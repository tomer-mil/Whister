"""Fixtures for integration tests."""
import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from datetime import timedelta
from uuid import uuid4
import socketio

from app.main import app
from app.core.security import create_access_token, create_refresh_token, hash_password
from app.core.database import get_async_session, AsyncSessionLocal
from app.models.user import User
from app.core.config import get_settings


@pytest_asyncio.fixture
async def db_session():
    """Get async database session."""
    async with AsyncSessionLocal() as session:
        yield session


@pytest_asyncio.fixture
async def client():
    """Async HTTP client for testing."""
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test"
    ) as client:
        yield client


@pytest_asyncio.fixture
async def test_user(db_session):
    """Create a test user."""
    user = User(
        id=uuid4(),
        username="testuser",
        email="test@example.com",
        password_hash=hash_password("TestPass123!"),
        display_name="Test User",
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user


@pytest.fixture
def access_token(test_user) -> str:
    """Generate a valid access token."""
    return create_access_token(subject=str(test_user.id))


@pytest.fixture
def refresh_token(test_user) -> str:
    """Generate a valid refresh token."""
    return create_refresh_token(subject=str(test_user.id))


@pytest.fixture
def expired_token(test_user) -> str:
    """Generate an expired access token."""
    return create_access_token(
        subject=str(test_user.id),
        expires_delta=timedelta(seconds=-1)
    )


@pytest.fixture
def auth_headers(access_token) -> dict:
    """Headers with valid auth token."""
    return {"Authorization": f"Bearer {access_token}"}


@pytest.fixture
def socketio_client():
    """Socket.IO client for testing WebSocket."""
    return socketio.AsyncClient()
