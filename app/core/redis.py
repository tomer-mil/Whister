"""Redis connection pool management."""
from redis.asyncio import ConnectionPool, Redis  # type: ignore

from app.config import get_settings


class RedisManager:
    """Manages Redis connections."""

    def __init__(self) -> None:
        self._pool: ConnectionPool | None = None  # type: ignore
        self._client: Redis | None = None  # type: ignore

    async def initialize(self, redis_url: str) -> None:
        """Initialize the Redis connection pool."""
        settings = get_settings()
        self._pool = ConnectionPool.from_url(
            redis_url,
            max_connections=settings.redis_pool_size,
            decode_responses=True,
        )
        self._client = Redis(connection_pool=self._pool)

    @property
    def client(self) -> Redis:  # type: ignore
        """Get the Redis client."""
        if self._client is None:
            raise RuntimeError("Redis not initialized")
        return self._client

    async def close(self) -> None:
        """Close the Redis connection pool."""
        if self._client:
            await self._client.close()
        if self._pool:
            await self._pool.disconnect()


redis_manager = RedisManager()
