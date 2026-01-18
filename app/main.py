"""FastAPI application factory and configuration."""
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from typing import Any

import socketio  # type: ignore
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.api.router import router
from app.config import get_settings
from app.core.database import db_manager
from app.core.error_handlers import register_exception_handlers
from app.core.redis import redis_manager
from app.middleware.logging import LoggingMiddleware
from app.websocket.room_manager import RoomManager
from app.websocket.server import (
    create_socketio_app,
    create_socketio_server,
    register_socketio_handlers,
)

# Global Socket.IO and room manager instances
sio: socketio.AsyncServer | None = None  # type: ignore
room_manager: RoomManager | None = None


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Manage application lifecycle: startup and shutdown."""
    global sio, room_manager
    settings = get_settings()

    # Startup
    db_manager.initialize(str(settings.database_url))
    await redis_manager.initialize(str(settings.redis_url))

    # Initialize WebSocket
    sio = create_socketio_server(redis_manager.redis)  # type: ignore
    room_manager = RoomManager(
        redis_manager.redis,  # type: ignore
        db_manager._session_factory,
    )
    register_socketio_handlers(sio, room_manager)

    yield

    # Shutdown
    await redis_manager.close()
    await db_manager.close()


def create_app() -> FastAPI:
    """Create and configure FastAPI application."""
    settings = get_settings()

    app = FastAPI(
        title=settings.app_name,
        version=settings.app_version,
        description="Whist Score Keeper - A real-time scoring application for Whist card game",
        debug=settings.debug,
        lifespan=lifespan,
        docs_url="/docs",
        openapi_url="/openapi.json",
    )

    # Register exception handlers
    register_exception_handlers(app)

    # Add middleware (order matters - first added is outermost)
    app.add_middleware(LoggingMiddleware)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Health check endpoint
    @app.get("/health", tags=["Health"], summary="Basic health check")  # type: ignore
    async def health_check() -> dict[str, str]:
        """Basic health check endpoint.

        Returns:
            Status and version information
        """
        return {"status": "ok", "version": settings.app_version}

    # Detailed readiness check endpoint
    @app.get("/health/ready", tags=["Health"], summary="Readiness check with connectivity")  # type: ignore
    async def health_ready() -> dict[str, Any]:
        """Detailed readiness check endpoint.

        Verifies database and Redis connectivity.

        Returns:
            Status with service connectivity details
        """
        services_ok = True
        details: dict[str, Any] = {"version": settings.app_version}

        # Check database
        try:
            async with db_manager.session() as session:
                await session.execute(text("SELECT 1"))
                details["database"] = "ok"
        except Exception as e:
            services_ok = False
            details["database"] = f"error: {e!s}"

        # Check Redis
        try:
            await redis_manager.client.ping()
            details["redis"] = "ok"
        except Exception as e:
            services_ok = False
            details["redis"] = f"error: {e!s}"

        status = "ready" if services_ok else "not_ready"
        details["status"] = status

        return details

    # API information endpoint
    @app.get("/api/v1", tags=["Info"], summary="API information")  # type: ignore
    async def api_info() -> dict[str, str]:
        """API information and status.

        Returns:
            API name, version, and current status
        """
        return {
            "name": settings.app_name,
            "version": settings.app_version,
            "status": "ready",
        }

    # Include API routes
    app.include_router(router)

    return app


# Create FastAPI app
_app = create_app()

# Create ASGI app wrapping FastAPI with Socket.IO
# This will be mounted by the server (uvicorn/gunicorn)
# Usage: uvicorn app.main:asgi_app --host 0.0.0.0 --port 8000
async def get_asgi_app() -> Any:
    """Get the ASGI app (called after startup)."""
    global sio
    if sio is None:
        raise RuntimeError("Socket.IO not initialized")
    return create_socketio_app(sio, _app)


# For direct access
app = _app
