"""SQLAlchemy ORM models for the Whist Score Keeper platform.

This package contains all database models organized by domain:
- user: User accounts and authentication
- group: Player groups for recurring games
- game: Game sessions and player participation
- round: Round state, bidding, and tricks
- stats: Aggregated player statistics

All models inherit from the Base class defined in base.py, which provides:
- Consistent naming conventions for constraints
- UUID primary keys
- Timestamp mixins (created_at, updated_at)

Usage:
    from app.models import User, Game, Round, ...

    # Or import all models for Alembic
    from app.models import Base
"""
from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin
from app.models.enums import GameStatus, GameType, GroupRole, RoundPhase, TrumpSuit
from app.models.game import Game, GamePlayer
from app.models.group import Group, GroupMember
from app.models.round import Round, RoundPlayer, TrumpBid
from app.models.stats import PlayerStats
from app.models.user import User

__all__ = [
    # Base classes
    "Base",
    "TimestampMixin",
    "UUIDPrimaryKeyMixin",
    # Enums
    "GameStatus",
    "GameType",
    "GroupRole",
    "RoundPhase",
    "TrumpSuit",
    # Models
    "User",
    "Group",
    "GroupMember",
    "Game",
    "GamePlayer",
    "Round",
    "RoundPlayer",
    "TrumpBid",
    "PlayerStats",
]
