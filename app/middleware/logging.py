"""Request/response logging middleware."""
import logging
import time
import uuid
from typing import Any

from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response

logger = logging.getLogger(__name__)


class LoggingMiddleware(BaseHTTPMiddleware):
    """Middleware for logging HTTP requests and responses."""

    async def dispatch(self, request: Request, call_next: Any) -> Response:
        """Process request and log details.

        Args:
            request: HTTP request
            call_next: Next middleware/handler

        Returns:
            HTTP response
        """
        # Generate correlation ID
        correlation_id = str(uuid.uuid4())
        request.state.correlation_id = correlation_id

        # Get request info
        client_ip = request.client[0] if request.client else "unknown"
        method = request.method
        path = request.url.path
        query_string = request.url.query

        # Log request
        logger.info(
            "Request started",
            extra={
                "correlation_id": correlation_id,
                "method": method,
                "path": path,
                "query_string": query_string,
                "client_ip": client_ip,
            },
        )

        # Time the request
        start_time = time.time()

        try:
            # Process request
            response = await call_next(request)

            # Calculate elapsed time
            elapsed = time.time() - start_time

            # Log response
            logger.info(
                "Request completed",
                extra={
                    "correlation_id": correlation_id,
                    "method": method,
                    "path": path,
                    "status_code": response.status_code,
                    "elapsed_ms": int(elapsed * 1000),
                    "client_ip": client_ip,
                },
            )

            # Add correlation ID to response headers
            response.headers["x-correlation-id"] = correlation_id

            return response

        except Exception as e:
            # Calculate elapsed time on error
            elapsed = time.time() - start_time

            # Log error
            logger.error(
                "Request failed",
                exc_info=e,
                extra={
                    "correlation_id": correlation_id,
                    "method": method,
                    "path": path,
                    "elapsed_ms": int(elapsed * 1000),
                    "client_ip": client_ip,
                    "exception_type": type(e).__name__,
                },
            )

            raise
