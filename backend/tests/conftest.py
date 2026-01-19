"""Pytest configuration and fixtures."""
import asyncio
import os
from collections.abc import AsyncGenerator

import pytest
from httpx import AsyncClient
from redis.asyncio import Redis
from sqlalchemy import JSON, TypeDecorator
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.pool import StaticPool

# Monkey-patch PostgreSQL-specific types for SQLite before importing models
# This allows tests to use SQLite without PostgreSQL
import sqlalchemy.dialects.postgresql
from sqlalchemy import String, Uuid


class JSONBCompat(TypeDecorator):  # type: ignore[name-defined]
    """JSONB type that works with SQLite."""

    impl = JSON
    cache_ok = True


# Check if we're using SQLite for testing
use_postgres = os.getenv("POSTGRES_TEST_URL") is not None
if not use_postgres:
    # Patch PostgreSQL-specific types for SQLite
    sqlalchemy.dialects.postgresql.JSONB = JSONBCompat  # type: ignore[attr-defined]
    # UUID is rendered as TEXT in SQLite
    sqlalchemy.dialects.postgresql.UUID = Uuid  # type: ignore[attr-defined]

from app.core.database import db_manager
from app.main import create_app
from app.models import Base


@pytest.fixture(scope="session")
def event_loop() -> asyncio.AbstractEventLoop:
    """Create an event loop for the test session."""
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()


@pytest.fixture
async def redis() -> AsyncGenerator[Redis, None]:  # type: ignore[type-arg]
    """Create a mock Redis instance for testing."""
    # Use fakeredis for testing if available
    try:
        from fakeredis.aioredis import FakeRedis

        redis_instance: Redis = FakeRedis(decode_responses=False)  # type: ignore[type-arg]
        yield redis_instance
    except (ImportError, AttributeError):
        # If fakeredis not available, create a real Redis connection for testing
        # In CI/CD this would connect to test Redis container
        redis_instance: Redis = Redis.from_url("redis://localhost:6379/1")  # type: ignore[type-arg]
        try:
            await redis_instance.ping()
            yield redis_instance
        finally:
            await redis_instance.aclose()


@pytest.fixture
async def test_db() -> AsyncGenerator[AsyncSession, None]:
    """Create a test database for testing."""
    # Use PostgreSQL test database if configured, otherwise SQLite
    test_db_url = os.getenv(
        "POSTGRES_TEST_URL", "sqlite+aiosqlite:///:memory:"
    )

    if "sqlite" in test_db_url:
        engine = create_async_engine(
            test_db_url,
            poolclass=StaticPool,
            echo=False,
        )
    else:
        engine = create_async_engine(
            test_db_url,
            echo=False,
        )

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)

    db_manager._session_factory = __import__("sqlalchemy").ext.asyncio.async_sessionmaker(
        bind=engine,
        class_=AsyncSession,
        expire_on_commit=False,
        autocommit=False,
        autoflush=False,
    )

    try:
        async with db_manager._session_factory() as session:
            yield session
    finally:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.drop_all)
        await engine.dispose()


@pytest.fixture
async def db_session(test_db: AsyncSession) -> AsyncSession:
    """Alias for test_db for backward compatibility."""
    return test_db


@pytest.fixture
async def test_user_id(test_db: AsyncSession):  # type: ignore[no-untyped-def]
    """Create a test user and return their ID."""
    from uuid import uuid4

    from app.models import User

    user_id = uuid4()
    user = User(
        id=user_id,
        username="testuser",
        email="test@example.com",
        display_name="Test User",
        password_hash="hashed_password",
    )
    test_db.add(user)
    await test_db.commit()
    yield user_id


@pytest.fixture
async def client(test_db: AsyncSession, redis: Redis) -> AsyncGenerator[AsyncClient, None]:  # type: ignore[type-arg]
    """Create a test client."""
    # Import after models are patched
    from app.core.redis import redis_manager

    # Set the redis client in redis_manager for the app
    redis_manager._client = redis  # type: ignore[attr-defined]

    app = create_app()
    async with AsyncClient(app=app, base_url="http://test") as ac:
        yield ac
