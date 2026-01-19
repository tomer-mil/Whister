"""Main API router aggregator."""
from fastapi import APIRouter

from app.api import auth, rooms, users

# Create main API router
router = APIRouter(prefix="/api/v1")

# Include auth routes
router.include_router(auth.router)

# Include user routes
router.include_router(users.router)

# Include room routes
router.include_router(rooms.router)

__all__ = ["router"]
