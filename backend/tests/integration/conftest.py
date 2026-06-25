"""Fixtures for integration tests."""
import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from datetime import timedelta
from uuid import uuid4
from collections.abc import AsyncGenerator
import socketio

from app.core.security import create_access_token, create_refresh_token, hash_password
from app.core.database import db_manager
from app.main import create_app
from app.config import get_settings
from sqlalchemy.ext.asyncio import AsyncSession


@pytest_asyncio.fixture
async def client(test_db: AsyncSession, redis) -> AsyncGenerator[AsyncClient, None]:  # type: ignore[no-untyped-def]
    """HTTP client that shares the test SQLite DB and fakeredis with unit tests."""
    from app.core.redis import redis_manager
    from app.dependencies.database import get_db_session

    redis_manager._client = redis  # type: ignore[attr-defined]

    test_session_factory = db_manager._session_factory

    app = create_app()

    async def override_get_db_session() -> AsyncGenerator[AsyncSession, None]:
        session = test_session_factory()  # type: ignore[misc]
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()

    app.dependency_overrides[get_db_session] = override_get_db_session

    async with AsyncClient(
        transport=ASGITransport(app=app),  # type: ignore[arg-type]
        base_url="http://test",
    ) as ac:
        yield ac

    app.dependency_overrides.clear()


@pytest_asyncio.fixture
async def db_session(test_db: AsyncSession) -> AsyncSession:
    """Alias for the shared test DB session."""
    return test_db


@pytest_asyncio.fixture
async def test_user(db_session: AsyncSession):  # type: ignore[no-untyped-def]
    """Create a test user."""
    from app.models.user import User

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
def access_token(test_user) -> str:  # type: ignore[no-untyped-def]
    """Generate a valid access token."""
    return create_access_token(subject=str(test_user.id))


@pytest.fixture
def refresh_token(test_user) -> str:  # type: ignore[no-untyped-def]
    """Generate a valid refresh token."""
    return create_refresh_token(subject=str(test_user.id))


@pytest.fixture
def expired_token(test_user) -> str:  # type: ignore[no-untyped-def]
    """Generate an expired access token."""
    return create_access_token(
        subject=str(test_user.id),
        expires_delta=timedelta(seconds=-1),
    )


@pytest.fixture
def auth_headers(access_token: str) -> dict:  # type: ignore[type-arg]
    """Headers with valid auth token."""
    return {"Authorization": f"Bearer {access_token}"}


@pytest.fixture
def socketio_client():  # type: ignore[no-untyped-def]
    """Socket.IO client for testing WebSocket."""
    return socketio.AsyncClient()
