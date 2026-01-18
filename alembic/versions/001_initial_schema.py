"""Initial schema creation.

Revision ID: 001_initial
Revises:
Create Date: 2026-01-15 10:00:00.000000

"""
from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "001_initial"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Create enum types first
    game_status = postgresql.ENUM(
        "waiting",
        "bidding_trump",
        "frisch",
        "bidding_contract",
        "playing",
        "round_complete",
        "finished",
        name="game_status",
    )
    game_status.create(op.get_bind())

    round_phase = postgresql.ENUM(
        "trump_bidding",
        "frisch",
        "contract_bidding",
        "playing",
        "complete",
        name="round_phase",
    )
    round_phase.create(op.get_bind())

    trump_suit = postgresql.ENUM(
        "clubs", "diamonds", "hearts", "spades", "no_trump", name="trump_suit"
    )
    trump_suit.create(op.get_bind())

    game_type = postgresql.ENUM("over", "under", name="game_type")
    game_type.create(op.get_bind())

    group_role = postgresql.ENUM("owner", "member", name="group_role")
    group_role.create(op.get_bind())

    # Create users table
    op.create_table(
        "users",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            nullable=False,
        ),
        sa.Column(
            "username",
            sa.String(32),
            nullable=False,
        ),
        sa.Column(
            "email",
            sa.String(255),
            nullable=False,
        ),
        sa.Column(
            "password_hash",
            sa.String(128),
            nullable=False,
        ),
        sa.Column(
            "display_name",
            sa.String(64),
            nullable=False,
        ),
        sa.Column(
            "avatar_url",
            sa.Text(),
            nullable=True,
        ),
        sa.Column(
            "is_active",
            sa.Boolean(),
            nullable=False,
            server_default="true",
        ),
        sa.Column(
            "last_active",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "preferences",
            postgresql.JSONB(),
            nullable=False,
            server_default="{}",
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.PrimaryKeyConstraint("id", name="pk_users"),
        sa.UniqueConstraint("email", name="uq_users_email"),
        sa.UniqueConstraint("username", name="uq_users_username"),
        comment="User accounts with authentication and profile data",
    )
    op.create_index("ix_users_email", "users", ["email"])
    op.create_index("ix_users_username", "users", ["username"])
    op.create_index("ix_users_email_active", "users", ["email", "is_active"])
    op.create_index(
        "ix_users_username_lower",
        "users",
        [sa.func.lower(sa.column("username"))],
        unique=True,
    )

    # Create groups table
    op.create_table(
        "groups",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            nullable=False,
        ),
        sa.Column(
            "name",
            sa.String(64),
            nullable=False,
        ),
        sa.Column(
            "description",
            sa.Text(),
            nullable=True,
        ),
        sa.Column(
            "created_by",
            postgresql.UUID(as_uuid=True),
            nullable=False,
        ),
        sa.Column(
            "total_games",
            sa.Integer(),
            nullable=False,
            server_default="0",
        ),
        sa.Column(
            "total_rounds",
            sa.Integer(),
            nullable=False,
            server_default="0",
        ),
        sa.Column(
            "last_played_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.ForeignKeyConstraint(
            ["created_by"],
            ["users.id"],
            name="fk_groups_created_by_users",
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_groups"),
        comment="Player groups for recurring game sessions",
    )
    op.create_index("ix_groups_created_by_created_at", "groups", ["created_by", "created_at"])

    # Create group_members table
    op.create_table(
        "group_members",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            nullable=False,
        ),
        sa.Column(
            "group_id",
            postgresql.UUID(as_uuid=True),
            nullable=False,
        ),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            nullable=False,
        ),
        sa.Column(
            "role",
            group_role,
            nullable=False,
            server_default="member",
        ),
        sa.Column(
            "joined_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.ForeignKeyConstraint(
            ["group_id"],
            ["groups.id"],
            name="fk_group_members_group_id_groups",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name="fk_group_members_user_id_users",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_group_members"),
        sa.UniqueConstraint("group_id", "user_id", name="uq_group_members_group_user"),
        comment="Junction table linking users to groups",
    )
    op.create_index("ix_group_members_user_id", "group_members", ["user_id"])
    op.create_index("ix_group_members_group_id", "group_members", ["group_id"])

    # Create games table
    op.create_table(
        "games",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            nullable=False,
        ),
        sa.Column(
            "room_code",
            sa.String(6),
            nullable=False,
        ),
        sa.Column(
            "admin_id",
            postgresql.UUID(as_uuid=True),
            nullable=False,
        ),
        sa.Column(
            "group_id",
            postgresql.UUID(as_uuid=True),
            nullable=True,
        ),
        sa.Column(
            "status",
            game_status,
            nullable=False,
            server_default="waiting",
        ),
        sa.Column(
            "current_round_number",
            sa.Integer(),
            nullable=False,
            server_default="0",
        ),
        sa.Column(
            "version",
            sa.Integer(),
            nullable=False,
            server_default="1",
        ),
        sa.Column(
            "ended_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
        sa.Column(
            "winner_id",
            postgresql.UUID(as_uuid=True),
            nullable=True,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.ForeignKeyConstraint(
            ["admin_id"],
            ["users.id"],
            name="fk_games_admin_id_users",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["group_id"],
            ["groups.id"],
            name="fk_games_group_id_groups",
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["winner_id"],
            ["users.id"],
            name="fk_games_winner_id_users",
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_games"),
        sa.UniqueConstraint("room_code", name="uq_games_room_code"),
        sa.CheckConstraint("room_code = UPPER(room_code)", name="room_code_uppercase"),
        sa.CheckConstraint(
            "current_round_number >= 0", name="round_number_non_negative"
        ),
        comment="Game sessions with room codes and state tracking",
    )
    op.create_index("ix_games_room_code", "games", ["room_code"])
    op.create_index("ix_games_admin_id", "games", ["admin_id"])
    op.create_index("ix_games_group_id", "games", ["group_id"])
    op.create_index("ix_games_status", "games", ["status"])
    op.create_index("ix_games_group_status", "games", ["group_id", "status"])
    op.create_index("ix_games_admin_created", "games", ["admin_id", "created_at"])

    # Create game_players table
    op.create_table(
        "game_players",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            nullable=False,
        ),
        sa.Column(
            "game_id",
            postgresql.UUID(as_uuid=True),
            nullable=False,
        ),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            nullable=False,
        ),
        sa.Column(
            "display_name",
            sa.String(64),
            nullable=False,
        ),
        sa.Column(
            "seat_position",
            sa.Integer(),
            nullable=False,
        ),
        sa.Column(
            "is_admin",
            sa.Boolean(),
            nullable=False,
            server_default="false",
        ),
        sa.Column(
            "is_connected",
            sa.Boolean(),
            nullable=False,
            server_default="true",
        ),
        sa.Column(
            "final_score",
            sa.Integer(),
            nullable=True,
        ),
        sa.Column(
            "is_winner",
            sa.Boolean(),
            nullable=False,
            server_default="false",
        ),
        sa.Column(
            "joined_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.ForeignKeyConstraint(
            ["game_id"],
            ["games.id"],
            name="fk_game_players_game_id_games",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name="fk_game_players_user_id_users",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_game_players"),
        sa.UniqueConstraint("game_id", "user_id", name="uq_game_players_game_user"),
        sa.UniqueConstraint("game_id", "seat_position", name="uq_game_players_game_seat"),
        sa.CheckConstraint(
            "seat_position >= 0 AND seat_position <= 3",
            name="seat_position_valid",
        ),
        comment="Players participating in games with seating and scores",
    )
    op.create_index("ix_game_players_game_id", "game_players", ["game_id"])
    op.create_index("ix_game_players_user_id", "game_players", ["user_id"])
    op.create_index("ix_game_players_game_user", "game_players", ["game_id", "user_id"])

    # Create rounds table
    op.create_table(
        "rounds",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            nullable=False,
        ),
        sa.Column(
            "game_id",
            postgresql.UUID(as_uuid=True),
            nullable=False,
        ),
        sa.Column(
            "round_number",
            sa.Integer(),
            nullable=False,
        ),
        sa.Column(
            "phase",
            round_phase,
            nullable=False,
            server_default="trump_bidding",
        ),
        sa.Column(
            "trump_suit",
            trump_suit,
            nullable=True,
        ),
        sa.Column(
            "trump_winner_id",
            postgresql.UUID(as_uuid=True),
            nullable=True,
        ),
        sa.Column(
            "trump_bid_amount",
            sa.Integer(),
            nullable=True,
        ),
        sa.Column(
            "frisch_count",
            sa.Integer(),
            nullable=False,
            server_default="0",
        ),
        sa.Column(
            "minimum_bid",
            sa.Integer(),
            nullable=False,
            server_default="5",
        ),
        sa.Column(
            "game_type",
            game_type,
            nullable=True,
        ),
        sa.Column(
            "total_contracts",
            sa.Integer(),
            nullable=True,
        ),
        sa.Column(
            "current_bidder_seat",
            sa.Integer(),
            nullable=True,
        ),
        sa.Column(
            "consecutive_passes",
            sa.Integer(),
            nullable=False,
            server_default="0",
        ),
        sa.Column(
            "total_tricks_played",
            sa.Integer(),
            nullable=False,
            server_default="0",
        ),
        sa.Column(
            "version",
            sa.Integer(),
            nullable=False,
            server_default="1",
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.ForeignKeyConstraint(
            ["game_id"],
            ["games.id"],
            name="fk_rounds_game_id_games",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["trump_winner_id"],
            ["users.id"],
            name="fk_rounds_trump_winner_id_users",
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_rounds"),
        sa.UniqueConstraint("game_id", "round_number", name="uq_rounds_game_round"),
        sa.CheckConstraint("round_number > 0", name="round_number_positive"),
        sa.CheckConstraint(
            "frisch_count >= 0 AND frisch_count <= 3",
            name="frisch_count_valid",
        ),
        sa.CheckConstraint(
            "minimum_bid >= 5 AND minimum_bid <= 8",
            name="minimum_bid_valid",
        ),
        sa.CheckConstraint(
            "total_tricks_played >= 0 AND total_tricks_played <= 13",
            name="tricks_valid",
        ),
        comment="Rounds within games with bidding and play state",
    )
    op.create_index("ix_rounds_game_number", "rounds", ["game_id", "round_number"])
    op.create_index("ix_rounds_trump_winner", "rounds", ["trump_winner_id"])

    # Create round_players table
    op.create_table(
        "round_players",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            nullable=False,
        ),
        sa.Column(
            "round_id",
            postgresql.UUID(as_uuid=True),
            nullable=False,
        ),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            nullable=False,
        ),
        sa.Column(
            "seat_position",
            sa.Integer(),
            nullable=False,
        ),
        sa.Column(
            "contract_bid",
            sa.Integer(),
            nullable=True,
        ),
        sa.Column(
            "bid_order",
            sa.Integer(),
            nullable=True,
        ),
        sa.Column(
            "tricks_won",
            sa.Integer(),
            nullable=False,
            server_default="0",
        ),
        sa.Column(
            "score",
            sa.Integer(),
            nullable=True,
        ),
        sa.Column(
            "made_contract",
            sa.Boolean(),
            nullable=True,
        ),
        sa.ForeignKeyConstraint(
            ["round_id"],
            ["rounds.id"],
            name="fk_round_players_round_id_rounds",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name="fk_round_players_user_id_users",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_round_players"),
        sa.UniqueConstraint("round_id", "user_id", name="uq_round_players_round_user"),
        sa.UniqueConstraint("round_id", "seat_position", name="uq_round_players_round_seat"),
        sa.CheckConstraint(
            "seat_position >= 0 AND seat_position <= 3",
            name="seat_position_valid",
        ),
        sa.CheckConstraint(
            "contract_bid IS NULL OR (contract_bid >= 0 AND contract_bid <= 13)",
            name="contract_bid_valid",
        ),
        sa.CheckConstraint(
            "tricks_won >= 0 AND tricks_won <= 13",
            name="tricks_won_valid",
        ),
        comment="Player state within rounds including contracts and tricks",
    )
    op.create_index("ix_round_players_round_id", "round_players", ["round_id"])
    op.create_index(
        "ix_round_players_round_user", "round_players", ["round_id", "user_id"]
    )

    # Create trump_bids table
    op.create_table(
        "trump_bids",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            nullable=False,
        ),
        sa.Column(
            "round_id",
            postgresql.UUID(as_uuid=True),
            nullable=False,
        ),
        sa.Column(
            "player_id",
            postgresql.UUID(as_uuid=True),
            nullable=False,
        ),
        sa.Column(
            "amount",
            sa.Integer(),
            nullable=False,
        ),
        sa.Column(
            "suit",
            trump_suit,
            nullable=True,
        ),
        sa.Column(
            "is_pass",
            sa.Boolean(),
            nullable=False,
            server_default="false",
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.ForeignKeyConstraint(
            ["round_id"],
            ["rounds.id"],
            name="fk_trump_bids_round_id_rounds",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["player_id"],
            ["users.id"],
            name="fk_trump_bids_player_id_users",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_trump_bids"),
        sa.CheckConstraint(
            "(is_pass = TRUE AND amount = 0 AND suit IS NULL) OR "
            "(is_pass = FALSE AND amount >= 5 AND amount <= 13 AND suit IS NOT NULL)",
            name="bid_valid",
        ),
        comment="Trump bid history during bidding phase",
    )
    op.create_index("ix_trump_bids_round_created", "trump_bids", ["round_id", "created_at"])
    op.create_index("ix_trump_bids_player", "trump_bids", ["player_id"])

    # Create player_stats table
    op.create_table(
        "player_stats",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            nullable=False,
        ),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            nullable=False,
        ),
        sa.Column(
            "total_games",
            sa.Integer(),
            nullable=False,
            server_default="0",
        ),
        sa.Column(
            "total_rounds",
            sa.Integer(),
            nullable=False,
            server_default="0",
        ),
        sa.Column(
            "total_wins",
            sa.Integer(),
            nullable=False,
            server_default="0",
        ),
        sa.Column(
            "total_points",
            sa.Integer(),
            nullable=False,
            server_default="0",
        ),
        sa.Column(
            "highest_score",
            sa.Integer(),
            nullable=False,
            server_default="0",
        ),
        sa.Column(
            "lowest_score",
            sa.Integer(),
            nullable=False,
            server_default="0",
        ),
        sa.Column(
            "highest_round_score",
            sa.Integer(),
            nullable=False,
            server_default="0",
        ),
        sa.Column(
            "contracts_attempted",
            sa.Integer(),
            nullable=False,
            server_default="0",
        ),
        sa.Column(
            "contracts_made",
            sa.Integer(),
            nullable=False,
            server_default="0",
        ),
        sa.Column(
            "zeros_attempted",
            sa.Integer(),
            nullable=False,
            server_default="0",
        ),
        sa.Column(
            "zeros_made",
            sa.Integer(),
            nullable=False,
            server_default="0",
        ),
        sa.Column(
            "trump_wins",
            sa.Integer(),
            nullable=False,
            server_default="0",
        ),
        sa.Column(
            "suit_wins",
            postgresql.JSONB(),
            nullable=False,
            server_default="{}",
        ),
        sa.Column(
            "recent_form",
            postgresql.JSONB(),
            nullable=False,
            server_default="[]",
        ),
        sa.Column(
            "current_streak",
            sa.Integer(),
            nullable=False,
            server_default="0",
        ),
        sa.Column(
            "best_streak",
            sa.Integer(),
            nullable=False,
            server_default="0",
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name="fk_player_stats_user_id_users",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_player_stats"),
        sa.UniqueConstraint("user_id", name="uq_player_stats_user_id"),
        comment="Aggregated player statistics updated after each game",
    )
    op.create_index("ix_player_stats_total_wins", "player_stats", ["total_wins"])
    op.create_index("ix_player_stats_total_points", "player_stats", ["total_points"])
    op.create_index("ix_player_stats_total_games", "player_stats", ["total_games"])


def downgrade() -> None:
    # Drop tables in reverse order (respect FK constraints)
    op.drop_table("player_stats")
    op.drop_table("trump_bids")
    op.drop_table("round_players")
    op.drop_table("rounds")
    op.drop_table("game_players")
    op.drop_table("games")
    op.drop_table("group_members")
    op.drop_table("groups")
    op.drop_table("users")

    # Drop enum types
    op.execute("DROP TYPE IF EXISTS game_status")
    op.execute("DROP TYPE IF EXISTS round_phase")
    op.execute("DROP TYPE IF EXISTS trump_suit")
    op.execute("DROP TYPE IF EXISTS game_type")
    op.execute("DROP TYPE IF EXISTS group_role")
