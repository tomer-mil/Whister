"""Game-related API endpoints."""
import logging
from uuid import UUID

from fastapi import APIRouter, status
from sqlalchemy import select

from app.dependencies.auth import CurrentUser, DBSession
from app.models.game import Game, GamePlayer
from app.models.round import Round, RoundPlayer
from app.schemas.errors import ErrorResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/games", tags=["games"])
