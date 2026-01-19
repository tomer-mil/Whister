"""Redis dependency."""
from redis.asyncio import Redis  # type: ignore

from app.core.redis import redis_manager


async def get_redis() -> Redis:  # type: ignore
    """FastAPI dependency that provides a Redis client."""
    return redis_manager.client
