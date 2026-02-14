"""Add seating value to game_status enum.

Revision ID: 002
Revises: 001
Create Date: 2026-02-14
"""
from alembic import op

# revision identifiers
revision = "002_add_seating"
down_revision = "001_initial"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TYPE game_status ADD VALUE IF NOT EXISTS 'seating' AFTER 'waiting'")


def downgrade() -> None:
    # PostgreSQL doesn't support removing values from enums directly.
    # To downgrade, you'd need to recreate the enum type without 'seating'.
    # This is left as a no-op since removing enum values is destructive.
    pass
