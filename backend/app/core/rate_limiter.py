"""Redis-based rate limiting for API endpoints."""
import logging
from typing import Any

from redis.asyncio import Redis  # type: ignore[import-untyped]

from app.core.exceptions import RateLimitExceededError

logger = logging.getLogger(__name__)


class RateLimiter:
    """Redis-based rate limiter for API endpoints."""

    def __init__(self, redis: Redis) -> None:  # type: ignore[type-arg]
        """Initialize rate limiter.

        Args:
            redis: Redis connection
        """
        self.redis = redis
        # Default config: endpoint -> (requests, window_seconds)
        self.config: dict[str, tuple[int, int]] = {
            "/rooms": (10, 60),  # 10 requests per minute
            "/games": (20, 60),  # 20 requests per minute
            "/bid": (100, 60),  # 100 requests per minute (gameplay)
            "/health": (1000, 60),  # 1000 requests per minute (health check)
            "default": (100, 60),  # 100 requests per minute (default)
        }

    def get_endpoint_limit(self, path: str) -> tuple[int, int]:
        """Get rate limit config for endpoint.

        Args:
            path: Request path

        Returns:
            Tuple of (max_requests, window_seconds)
        """
        # Check for exact match first
        if path in self.config:
            return self.config[path]

        # Check for partial match
        for pattern, limit in self.config.items():
            if pattern != "default" and pattern in path:
                return limit

        # Return default
        return self.config["default"]

    async def is_allowed(
        self,
        identifier: str,
        path: str,
    ) -> bool:
        """Check if request is allowed by rate limit.

        Args:
            identifier: Unique identifier (user_id, IP, etc.)
            path: Request path

        Returns:
            True if allowed, False if rate limited
        """
        max_requests, window_seconds = self.get_endpoint_limit(path)
        key = f"rate_limit:{identifier}:{path}"

        try:
            current = await self.redis.incr(key)
            if current == 1:
                # First request in window, set expiration
                await self.redis.expire(key, window_seconds)

            return not current > max_requests
        except Exception as e:
            logger.error(
                "Rate limiter error",
                extra={"error": str(e), "identifier": identifier, "path": path},
            )
            # On error, allow the request (fail open)
            return True

    async def get_remaining(
        self,
        identifier: str,
        path: str,
    ) -> tuple[int, int, int]:
        """Get rate limit info for identifier.

        Args:
            identifier: Unique identifier
            path: Request path

        Returns:
            Tuple of (remaining, limit, reset_in_seconds)
        """
        max_requests, window_seconds = self.get_endpoint_limit(path)
        key = f"rate_limit:{identifier}:{path}"

        try:
            current = await self.redis.get(key)
            current_count = int(current) if current else 0
            remaining = max(0, max_requests - current_count)
            ttl = await self.redis.ttl(key)
            reset_in = max(0, ttl if ttl > 0 else window_seconds)

            return remaining, max_requests, reset_in
        except Exception as e:
            logger.error(
                "Failed to get rate limit info",
                extra={"error": str(e), "identifier": identifier, "path": path},
            )
            # Return defaults on error
            return max_requests, max_requests, window_seconds

    async def check_limit(
        self,
        identifier: str,
        path: str,
    ) -> None:
        """Check rate limit and raise if exceeded.

        Args:
            identifier: Unique identifier
            path: Request path

        Raises:
            RateLimitExceededError: If rate limit exceeded
        """
        allowed = await self.is_allowed(identifier, path)
        if not allowed:
            _, _, reset_in = await self.get_remaining(identifier, path)
            raise RateLimitExceededError(retry_after=reset_in)


class RateLimitMiddleware:
    """ASGI middleware for rate limiting."""

    def __init__(self, app: Any, redis: Redis) -> None:  # type: ignore[type-arg]
        """Initialize middleware.

        Args:
            app: ASGI app
            redis: Redis connection
        """
        self.app = app
        self.limiter = RateLimiter(redis)

    async def __call__(self, scope: dict[str, Any], receive: Any, send: Any) -> None:
        """Process request with rate limiting.

        Args:
            scope: ASGI scope
            receive: ASGI receive
            send: ASGI send
        """
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        # Get client identifier (IP address)
        client = scope.get("client")
        client_ip = client[0] if client else "unknown"

        # Get request path
        path = scope.get("path", "unknown")

        try:
            # Check rate limit
            await self.limiter.check_limit(client_ip, path)
        except RateLimitExceededError:
            # Send rate limit response
            await send({
                "type": "http.response.start",
                "status": 429,
                "headers": [
                    [b"content-type", b"application/json"],
                ],
            })
            await send({
                "type": "http.response.body",
                "body": b'{"error":"RATE_6001","message":"Rate limit exceeded"}',
            })
            return

        # Get rate limit info for response headers
        remaining, limit, reset_in = await self.limiter.get_remaining(client_ip, path)

        # Wrap send to add rate limit headers
        async def send_with_headers(message: dict[str, Any]) -> None:
            """Send with rate limit headers."""
            if message["type"] == "http.response.start":
                headers = list(message.get("headers", []))
                headers.extend([
                    [b"x-ratelimit-limit", str(limit).encode()],
                    [b"x-ratelimit-remaining", str(remaining).encode()],
                    [b"x-ratelimit-reset", str(reset_in).encode()],
                ])
                message["headers"] = headers
            await send(message)

        await self.app(scope, receive, send_with_headers)
