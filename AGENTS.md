# AGENTS.md — Whister

Authoritative onboarding for Claude Code agents. Read this first and only this before working.
For deep detail, follow the LLD links per section. Other root `.md` files (SESSION_SUMMARY,
BACKEND_STATUS, DOCUMENTATION_INDEX, TEST_RESULTS*) are **history, not truth** — this file
supersedes them where they disagree.

## Project Overview

Whister is a web platform for playing, score-keeping, and analyzing **Israeli Whist** — a
4-player trick-taking card game. It runs real-time multiplayer games (room/lobby → bidding →
play → scoring across rounds), persists results, and computes per-player and per-group
analytics (leaderboards, streaks, contract success rates). It is built entirely by AI agents;
the owner directs and reviews, and does not hand-write code.

Israeli Whist specifics that drive game logic: standard 52-card deck, 13 cards each, dealer
rotates clockwise. A round has a **trump-bidding auction** (bid a number+suit or pass; suit
order clubs < diamonds < hearts < spades < no-trump; minimum bid 5), an optional **Frisch**
(if all four pass, everyone passes 3 cards left and the minimum bid rises 5→6→7→8, max 3
rounds), a **contract-bidding** phase (each player commits to a trick count 0–13; the sum may
never equal 13, so a round is always **"over"** if contracts sum > 13 or **"under"** if < 13),
then **play** of 13 tricks. Scoring rewards making your exact contract and punishes missing it,
with special rules for zero bids that differ between over and under games (full formulas in
[Domain](#domain-israeli-whist-rules--scoring)). An agent writing or fixing game logic needs
those rules exact — they are reproduced in full below.

## Architecture

Monorepo. Three runtime services plus the apps:

```
                         ┌──────────────────────────┐
  Browser (Next.js) ───► │ frontend  :3000           │
        ▲   │            │  Next 16 app router, React │
        │   │ REST       └──────────┬────────────────┘
        │   │ /api/v1/*  proxied via app/api/v1/[...path]
   WS   │   ▼
 socket.io   ┌───────────────────────────────────────┐
 /ws/socket.io│ backend  :8000  FastAPI + python-socketio (ASGIApp) │
              └───────┬───────────────────────┬───────┘
                      │ asyncpg               │ redis-py (async)
                      ▼                       ▼
              ┌──────────────┐        ┌──────────────┐
              │ postgres :5432│        │ redis  :6379  │
              │ (PostgreSQL15)│        │ (Redis 7)     │
              └──────────────┘        └──────────────┘
```

- **backend** wraps the FastAPI app in a `socketio.ASGIApp` (see `backend/app/main.py`). REST
  is mounted under `/api/v1`; WebSocket (Socket.IO) is served at path `/ws/socket.io`.
- **redis** is both cache and the Socket.IO message broker — the server uses
  `socketio.AsyncRedisManager`, so the WS layer is horizontally scalable. Live room/round state
  (bid history, passed players, current bidder, contracts) lives in Redis keys
  `room:{code}:*`; durable records live in PostgreSQL.
- **postgres** is production DB; tests run against SQLite via `aiosqlite`.
- Exact service wiring, env vars, and healthchecks: `docker-compose.yml`. Env defaults there
  (POSTGRES_USER `whist`, DB `whist_db`, JWT secret placeholder) are dev-only.

Monorepo layout: `backend/` (FastAPI API + game logic + WS), `frontend/` (Next.js),
`e2e/` (Playwright), `docs/` (HLD + LLDs), root `*.md` (status history).

## Tech Stack

Versions are from `backend/pyproject.toml`, `frontend/package.json`, and `docker-compose.yml`.

| Layer | Technology | Version | Why |
|---|---|---|---|
| Backend framework | FastAPI | 0.109.0 | Async REST, DI, OpenAPI, Pydantic-native |
| Language (backend) | Python | ≥3.11 | Modern typing (`X \| None`), match, perf |
| ORM | SQLAlchemy (async) | 2.0.25 | 2.0 async style, typed `Mapped[]` models |
| DB driver | asyncpg / aiosqlite | 0.29.0 / 0.19.0 | asyncpg in prod, aiosqlite for tests |
| Migrations | Alembic | 1.13.1 | Schema versioning (`backend/alembic/`) |
| Validation | Pydantic (+ settings) | 2.5.2 / 2.1.0 | Request/response schemas, config |
| Cache + broker | Redis (redis-py) | 5.0.1 | Live game state + Socket.IO scaling |
| Real-time | python-socketio / engineio | 5.11.0 / 4.9.0 | Socket.IO server over ASGI |
| Auth | python-jose, passlib, bcrypt | 3.3.0 / 1.7.4 / 4.1.2 | JWT access/refresh, password hashing |
| Backend tests | pytest, pytest-asyncio, httpx, fakeredis | 7.4.4 / 0.23.2 / 0.25.2 / 2.21.0 | Async tests, ASGI client, fake Redis |
| Lint (backend) | ruff | 0.2.0 | Broad rule set (E,W,F,I,C,B,UP,RUF,SIM,RET,PT) |
| Types (backend) | mypy | 1.8.0 | `strict = true` (with per-module relaxations) |
| Frontend framework | Next.js | 16.1.1-canary.32 | App router, RSC, API proxy route |
| UI lib | React | 18.2 | — |
| Language (frontend) | TypeScript | 5.3 | `strict` mode (`tsconfig.json`) |
| State | Zustand | 4.4 | Slice-based store, persist + devtools middleware |
| Styling | Tailwind CSS | 3.4 | Utility CSS (downgraded from v4 for stability) |
| Components | Radix UI + CVA + tailwind-merge | various | Headless primitives, variant styling |
| Animation | framer-motion | 11 | Bid/phase transitions |
| Forms / schema | react-hook-form + zod | 7.48 / 3.22 | Typed forms + validation |
| Realtime client | socket.io-client | 4.7 | Matches server Socket.IO |
| E2E | Playwright | (see `e2e/`) | Multi-player browser tests |

## Project Status

Ground truth as of last session (2026-01-19). Older docs label the backend "✅ Production
Ready"; the test reality is **110/138 passing (80%)** and several endpoints are not yet wired
(see below). Treat the percentages and gaps here as authoritative, not the optimistic labels.

**Backend — core logic solid, integration layer incomplete.**
- Passing: scoring 32/32, bidding 12/12, analytics 16/16. Near-complete: gameplay (2 scoring
  edge cases fail), groups (1 isolation failure). The 138-test baseline is the nine
  `backend/tests/test_*.py` files; the `backend/tests/integration/` suite (auth_flow 19,
  bidding_flow 6) is additional and not part of the 110/138 figure.
- **28 failures, all infra/integration-setup, grouped by root cause** (not real logic bugs,
  except Issue 4 which is a genuine scoring rule bug): see [Known Issues](#known-issues--next-steps).
- **Not wired:** the Groups API router (`backend/app/api/groups.py`) is **not included** in
  `backend/app/api/router.py` — only auth, users, rooms, games are mounted. Group/analytics
  *services and schemas* exist and pass their service-level tests, but the HTTP endpoints are
  currently unreachable. Verify before assuming a `/api/v1/groups/...` route responds.

**Frontend — scaffolded, functional completeness unverified.**
- Present and substantial: app-router pages (auth, room create/join/lobby, game, scores,
  seating), component sets (`auth/ room/ bidding/ game/ scores/ shared/ ui/`), a Zustand store
  split into 8 slices, hooks for socket/room/bidding/game/auth, a socket manager, and a REST
  proxy route (`app/api/v1/[...path]`). Older docs call the frontend "✅ Complete."
- **Unknown:** no frontend unit/integration test results were available to read, so end-to-end
  functional completeness is **not verified by this document**. Do not assume a screen works
  because the file exists — check at runtime or via e2e.

**E2E — present, status unverified.** Playwright specs exist for auth, lobby, bidding, game,
seating, and multi-round flows (`e2e/tests/`), with multi-player helpers. No pass/fail record
was available; treat as unverified until run.

## Codebase Map

```
Whister/
├── AGENTS.md                      ← you are here (authoritative)
├── docker-compose.yml             ← service topology (postgres, redis, backend)
├── docs/                          ← HLD + LLDs (full specs; see per-section links)
│   ├── whist-platform-hld.md            high-level architecture
│   ├── backend-api-lld.md               full REST API spec
│   ├── frontend-lld.md                  frontend design
│   ├── database-schema-lld.md           full DDL + relationships
│   ├── websocket-events-lld.md          full WS event spec
│   ├── game-rules-reference.md          canonical rules (mirrored below)
│   ├── bidding-implementation.md        bidding flow (FE+BE+Redis keys)
│   ├── GROUP_MANAGEMENT_AND_ANALYTICS_SPECIFICATIONS.md
│   └── Israeli_whist.pdf                source rules PDF
├── backend/
│   ├── app/
│   │   ├── main.py                 ← FastAPI+Socket.IO ASGI app, lifespan, router mount
│   │   ├── config.py               ← pydantic-settings (env config)
│   │   ├── api/                    ← REST routers (one file per resource)
│   │   │   ├── router.py                aggregator — mounts auth, users, rooms, games ONLY
│   │   │   ├── auth.py  users.py  rooms.py  games.py  groups.py(unwired)
│   │   ├── services/               ← ★ business + game logic lives here
│   │   │   ├── scoring_service.py       ★ all scoring math
│   │   │   ├── bidding_service.py       ★ trump/contract bid validation, frisch
│   │   │   ├── room_service.py          room lifecycle, start_game
│   │   │   ├── room_code_generator.py   join codes
│   │   │   ├── group_service.py  analytics_service.py  auth_service.py  user_service.py
│   │   ├── websocket/              ← ★ real-time layer
│   │   │   ├── server.py                register_socketio_handlers
│   │   │   ├── game_events.py           bid:* handlers
│   │   │   ├── seating_events.py        seating handlers
│   │   │   ├── room_manager.py          live room/round state (Redis-backed)
│   │   │   ├── schemas.py               ★ ClientEvents / ServerEvents constants
│   │   │   └── connection_context.py
│   │   ├── models/                 ← ★ SQLAlchemy 2.0 ORM (typed Mapped[])
│   │   │   ├── base.py                  Base, UUIDPrimaryKeyMixin, TimestampMixin, ENUMS
│   │   │   ├── user.py game.py round.py group.py stats.py
│   │   ├── schemas/                ← Pydantic request/response models (auth, room, game,
│   │   │                             score, group, user, errors)
│   │   ├── dependencies/           ← FastAPI Depends providers (auth, database, redis, services)
│   │   ├── core/                   ← database engine, redis, security(JWT/bcrypt),
│   │   │                             exceptions, error_handlers, rate_limiter
│   │   └── middleware/logging.py
│   ├── tests/                      ← unit/service tests (the 138 baseline)
│   │   ├── conftest.py                  fixtures (test DB, fakeredis, services)
│   │   ├── test_scoring.py(32) test_bidding.py(12) test_analytics.py(16)
│   │   ├── test_gameplay.py(13) test_groups.py(14) test_users.py(16)
│   │   ├── test_auth.py(13) test_rooms.py(13) test_websocket.py(9)
│   │   └── integration/                ← extra flow tests (auth_flow, bidding_flow)
│   ├── alembic/  alembic.ini       ← migrations
│   ├── Dockerfile  pyproject.toml  README.md
├── frontend/
│   ├── app/                        ← Next app router
│   │   ├── (auth)/login (auth)/register
│   │   ├── room/create  room/join  room/[roomCode]  room/[roomCode]/game[/scores]
│   │   ├── game/[gameId]/scores  game/[gameId]/seating
│   │   └── api/v1/[...path]            REST proxy to backend
│   ├── components/                 ← auth/ room/ bidding/ game/ scores/ shared/ ui/
│   ├── stores/                     ← Zustand: slices/{auth,room,game,bidding,connection,
│   │   │                             scores,ui}-slice.ts; middleware/{persist,devtools}
│   │   └── selectors/
│   ├── hooks/                      ← use-socket, use-room, use-bidding, use-game, use-auth, …
│   ├── lib/socket/manager.ts       ← socket.io-client manager
│   ├── lib/validation/rules.ts     ← client-side bid validation (mirror of backend rules)
│   ├── middleware.ts  next.config.js  tailwind.config.ts  tsconfig.json
├── e2e/                            ← Playwright (tests/, helpers/, config/players.ts)
└── .claude/settings.local.json     ← see below
```

**`.claude/` directory:** contains only `settings.local.json` — a Bash/MCP permission
allowlist plus `additionalDirectories`. It has **no CLAUDE.md, no custom agents, no skills, no
project memory.** Caveats: its paths reference an old macOS checkout
(`/Users/tomer.mildworth/personal/Whister`) and a `frontend-app/` directory that does **not**
exist here (the real dir is `frontend/`). Use it only as a hint to which commands are
pre-approved; do not treat its paths as current. This `AGENTS.md` is the project's primary
agent instruction source.

## Domain: Israeli Whist Rules & Scoring

Complete enough to implement/fix scoring without opening the reference. Canonical source:
`docs/game-rules-reference.md` (and `Israeli_whist.pdf`).

**Setup.** 4 players, 52 cards, 13 each. Dealer rotates clockwise. Card rank high→low:
A K Q J 10 9 8 7 6 5 4 3 2.

**Suit order (low→high), used for trump-bid tie-breaks:**
`clubs(0) < diamonds(1) < hearts(2) < spades(3) < no_trump(4)`.

**Phase 1 — Trump bidding (auction).** Player left of dealer starts; in rotation each player
either bids `(amount, suit)` or passes (pass = out permanently). Minimum bid 5. To outbid:
higher amount, OR equal amount with higher suit. Auction ends when 3 players have passed; the
remaining bid sets the trump suit and the bidder's `trump_bid_amount`.

```python
SUIT_ORDER = {"clubs": 0, "diamonds": 1, "hearts": 2, "spades": 3, "no_trump": 4}
def is_valid_trump_bid(new, current_highest, minimum_bid):
    if new.amount < minimum_bid: return False
    if current_highest is None: return True
    if new.amount > current_highest.amount: return True
    if new.amount == current_highest.amount:
        return SUIT_ORDER[new.suit] > SUIT_ORDER[current_highest.suit]
    return False
```

**Phase 2 — Frisch (only if all 4 pass with no bid).** Each player passes 3 cards to the left
(face-down; pick up only after passing yours). Minimum bid increments 5→6→7→8. Max 3 Frisch
rounds; if still no bid, reshuffle and redeal.

**Phase 3 — Contract bidding.** Trump winner bids first and must bid **≥ their trump-bid
amount**. Continue clockwise; each player commits a contract 0–13. **Last-bidder rule:** the
final bidder may not pick a number making the total of all contracts equal 13. Therefore the
total is never 13 → the round is **"over"** if total > 13, else **"under"**.

```python
def is_valid_contract_bid(amount, current_sum, is_last_bidder):
    if not 0 <= amount <= 13: return False
    if is_last_bidder and current_sum + amount == 13: return False
    return True
def get_game_type(contracts): return "over" if sum(contracts) > 13 else "under"
```

**Phase 4 — Play.** Trump winner leads first trick. Follow suit if able; otherwise play any
card (may trump). Trick taken by highest trump, else highest card of led suit. Winner leads
next. 13 tricks total.

**Scoring (per player, per round).** `bid` = contract, `tricks` = tricks won.

| Outcome | Score |
|---|---|
| Made contract, bid ≥ 1 (tricks == bid) | `bid² + 10` |
| Failed contract, bid ≥ 1 (tricks ≠ bid) | `-10 × \|tricks − bid\|` |
| Made zero, **under** game | `+50` |
| Made zero, **over** game | `+25` |
| Failed zero, won exactly 1 | `-50` |
| Failed zero, won 2+ | `-50 + 10 × (tricks − 1)` |

Examples: bid 3 won 3 → `3²+10 = +19`; bid 5 won 3 → `-10×2 = -20`; bid 0 won 0 under → `+50`;
bid 0 won 0 over → `+25`; bid 0 won 1 → `-50`; bid 0 won 3 → `-50+20 = -30`.

> The above table is the **source of truth**. Known Issue 4 is that the code's under-game path
> disagrees with it — fix the code to match this table, not the other way around.

**State machine:**
`WAITING → TRUMP_BIDDING → [FRISCH]*(≤3) → CONTRACT_BIDDING → PLAYING → ROUND_COMPLETE`.
`RoundPhase` enum values in code: `waiting, seating, bidding_trump, bidding_contract, frisch,
playing, round_complete, finished`.

**Edge cases:** all-pass ×3 → reshuffle; player disconnect → reconnect grace period; admin undo
trick → decrement trick count; reject any bid that would make contract sum = 13; trump winner
must bid ≥ trump bid in contract phase.

## API Surface

REST under `/api/v1`. JWT bearer auth (access + refresh) unless noted. Full spec:
[docs/backend-api-lld.md](docs/backend-api-lld.md). Paths below are router-relative
(prefix shown in the group header).

| Group (`prefix`) | Method + path | Auth | Purpose |
|---|---|---|---|
| **Auth** `/auth` | POST `/register` | public | Create account |
| | POST `/login` | public | Get access+refresh tokens |
| | POST `/refresh` | refresh tok | Rotate access token |
| | POST `/logout` | yes | Invalidate session |
| | GET `/me` | yes | Current user |
| **Users** `/users` | GET `/{user_id}` | see note | Public profile |
| | PUT `/{user_id}` | owner | Update profile |
| | GET `/{user_id}/stats` | see note | Player stats |
| | GET `/{user_id}/history` | owner | Game history |
| **Rooms** `/rooms` | POST `/` | yes | Create room (→ join code) |
| | GET `/{room_code}` | yes | Room state + players |
| | POST `/{room_code}/join` | yes | Join room |
| | POST `/{room_code}/leave` | yes | Leave room |
| | POST `/{room_code}/start` | admin | Start game (begins trump bidding) |
| | PUT `/{room_code}/seating` | admin | Set/swap seating |
| | POST `/{room_code}/next-round` | admin | Advance round |
| **Games** `/games` | GET `/{game_id}/score-table` | yes | Cumulative score table |
| | POST `/{game_id}/end` | admin | End game |
| **Groups** `/groups` ⚠️ | POST `/`, GET/members/leaderboard, analytics/* | yes | **Defined but NOT mounted** in `router.py` — currently unreachable over HTTP |

Notes: GET user profile/stats are *documented* as public but currently require auth (Known
Issue 1). The `/groups` router exists in code but is not included by `api/router.py`.

## WebSocket Events

Socket.IO at path `/ws/socket.io`. Event-name constants are the source of truth:
`backend/app/websocket/schemas.py` (`ClientEvents`, `ServerEvents`). Full payloads:
[docs/websocket-events-lld.md](docs/websocket-events-lld.md). Live state is stored in Redis
under `room:{code}:*` (`bid_history`, `passed_players`, `round`, `contracts`).

**Client → server** (`ClientEvents`): `room:join`, `room:leave`, `sync:request`, `bid:trump`,
`bid:pass`, `bid:contract`, `game:seating_swap`, `game:seating_confirmed`,
`round:claim_trick`, `round:undo_trick`.

**Server → client** (`ServerEvents`):
- Room: `room:joined`, `room:left`, `room:player_joined`, `room:player_left`,
  `room:player_disconnected`, `room:player_reconnected`.
- Game/seating: `room:game_starting`, `game:started`, `game:seating_updated`, `game:seating_set`.
- Bidding: `bid:your_turn` (to one player), `bid:placed`, `bid:passed`, `bid:trump_set`,
  `bid:frisch_started`, `bid:contracts_set`.
- Round/trick: `round:trick_won`, `round:trick_undone`, `round:complete`.
- Sync/error: `sync:state`, `error`.

Typical payload fields seen across events: `room_code`, `player_id`, `player_name`, `game_id`,
`game_type`. See LLD for exact per-event shapes.

## Database Schema

9 tables (SQLAlchemy 2.0 typed models in `backend/app/models/`; UUID PKs, timestamp mixins).
Full DDL + constraints: [docs/database-schema-lld.md](docs/database-schema-lld.md). Entity graph:

```
users ──┬──< game_players >──┬── games ──< rounds ──┬──< round_players
        │                    │   (admin_id,         │     (contract_bid, bid_order,
        │   (seat_position,  │    group_id?,        │      tricks_won, score,
        │    final_score,    │    status, winner_id)│      made_contract)
        │    is_admin)       │                      └──< trump_bids
        │                    │                            (amount, suit, is_pass)
        ├──< group_members >── groups (created_by, total_games/rounds)
        └──1:1 player_stats (totals, contracts_made, zeros_made, trump_wins,
                             streaks, recent_form, suit_wins)
```

- **users**: username, email, password_hash, display_name, avatar_url?, is_active,
  last_active, preferences(JSON).
- **games**: room_code, admin_id→users, group_id?→groups, status(`GameStatus`),
  current_round_number, version(optimistic lock), winner_id?, ended_at?.
- **game_players**: game_id, user_id, display_name, seat_position, is_admin, is_connected,
  final_score?, is_winner.
- **rounds**: game_id, round_number, phase(`RoundPhase`), trump_suit?, trump_winner_id?,
  trump_bid_amount?, frisch_count, minimum_bid, game_type?(`GameType`), total_contracts?,
  current_bidder_seat?, consecutive_passes, total_tricks_played, version.
- **round_players**: round_id, user_id, seat_position, contract_bid?, bid_order?, tricks_won,
  score?, made_contract?.
- **trump_bids**: round_id, player_id, amount, suit?, is_pass, created_at (auction log).
- **groups**: name, description?, created_by, total_games, total_rounds, last_played_at?.
- **group_members**: group_id, user_id, role(`GroupRole`), joined_at.
- **player_stats** (1:1 user): total_games/rounds/wins/points, highest/lowest_score,
  highest_round_score, contracts_attempted/made, zeros_attempted/made, trump_wins,
  suit_wins(JSON), recent_form(list), current_streak, best_streak.

Enums (`models/base.py`): `GameStatus`, `RoundPhase`, `TrumpSuit`, `GameType`, `GroupRole`.

## Known Issues & Next Steps

28 failing backend tests, all in test infra/integration setup **except Issue 4** (a real
scoring bug). Categories and estimates from `REMAINING_FIXES_GUIDE.md`:

| # | Category | Tests | Effort | Root cause / fix |
|---|---|---|---|---|
| 1 | Public-endpoint auth | 6 | 30m | `GET /users/{id}` + `/stats` require auth but are meant public → add optional-auth dependency |
| 2 | AsyncClient DB context | 12 | 1–2h | Test client app uses a different DB session than the test → override `get_db_session` via `app.dependency_overrides` in `conftest` |
| 3 | ORM relations not eager-loaded | 7 | 45m | Room/player lists come back empty → `selectinload`/`lazy="selectin"` on relationships or queries |
| 4 | **Under-game scoring bug** | 2 | 30m | Code returns -20 where rules require -50 → fix `scoring_service` to match the [scoring table](#domain-israeli-whist-rules--scoring) |
| 5 | Test data isolation | 3 | 30m | Duplicate-key violations between tests → per-test transaction rollback fixture |
| 6 | WebSocket fixtures | 3 | 1h | `RedisManager` missing attr → add `room_manager`/WS fixtures injecting fakeredis |

**Prioritized fix sequence** (≈4–5h total to 100%):
1. Tier 1 (high impact, low effort): Issue 1 (auth) + Issue 4 (scoring) → ~88%.
2. Tier 2: Issue 2 (DB context) + Issue 3 (eager loading) → ~98%.
3. Tier 3: Issue 5 (isolation) + Issue 6 (WS fixtures) → 100%.

**Separately tracked (not in the 28):** wire the Groups router into `api/router.py` so group
and analytics endpoints are reachable; verify frontend functional completeness; run and triage
the e2e suite.

**"Done" for this phase** = 138/138 backend tests green with `mypy app/` and `ruff check app/`
clean; groups endpoints mounted and covered; frontend flows verified via e2e.

## Coding Standards & Conventions

- **Type hints: mandatory.** mypy runs `strict = true` (`pyproject.toml`). Use modern syntax
  (`X | None`, `list[...]`, `Mapped[...]`). Some modules have relaxations in
  `[[tool.mypy.overrides]]` — do not widen those; aim to satisfy strict where you touch code.
- **Async SQLAlchemy 2.0 style.** Typed `Mapped[...]` + `mapped_column`; `select()` +
  `await session.execute(...)`; use `selectinload`/`lazy="selectin"` for relationships you read
  (this is exactly Issue 3). Get sessions via the DI provider, not by constructing engines.
- **Dependency injection everywhere.** FastAPI `Depends` for sessions, redis, current user, and
  services (`app/dependencies/`). `Depends` is in ruff's `extend-immutable-calls`; follow the
  existing typed-alias pattern (e.g. `CurrentUser`, `UserServiceDep`).
- **Errors: custom exceptions + error codes.** Raise the typed exceptions in
  `app/core/exceptions.py` (`AppException` subclasses carrying an `ErrorCode` from
  `app/schemas/errors.py` and an HTTP status); they are translated by `core/error_handlers.py`.
  Do not raise bare `HTTPException` for domain errors. Logging uses `error_message` (not
  `message`) to avoid the LogRecord field clash.
- **Game/business logic goes in `services/`.** Keep routers and WS handlers thin; put scoring,
  bidding, room lifecycle, analytics there so they stay unit-testable (that's why scoring/
  bidding are at 100%).
- **Tooling must pass clean:** `ruff check app/` and `mypy app/`. Ruff rule set:
  E,W,F,I,C,B,UP,RUF,SIM,RET,PT; line-length 120; isort first-party = `app`.
- **Test isolation:** prefer per-test transaction rollback (Issue 5) over manual table
  cleanup; override DB/redis deps in the client fixture (Issue 2). Tests run on SQLite +
  fakeredis, so avoid Postgres-only constructs in code paths exercised by tests (e.g. use
  `func.now()` not string defaults — a prior fix).
- **WS event names** come from the `ClientEvents`/`ServerEvents` constants, never string
  literals. Live state goes through Redis `room:{code}:*` keys.
- **Frontend:** TypeScript strict; Zustand slices in `stores/slices/` (compose via store index,
  use `selectors/` for reads); Tailwind utility classes (v3); Radix primitives + CVA for
  variants; socket access through `lib/socket/manager.ts` and the `use-socket*` hooks; mirror
  backend bid validation in `lib/validation/rules.ts`. Next 16 app-router route params are
  async — `await` them (a prior fix).

## Agent Workflow

- **Read order:** this `AGENTS.md` first, then the specific LLD for the component you touch
  (API → `backend-api-lld.md`, WS → `websocket-events-lld.md`, DB → `database-schema-lld.md`,
  frontend → `frontend-lld.md`, rules → the [Domain](#domain-israeli-whist-rules--scoring)
  section above).
- **Test before and after** any backend change:
  ```bash
  cd backend && pytest tests/ -v          # or: .venv/bin/python -m pytest tests/ -v
  ```
  Run the focused file first (e.g. `pytest tests/test_scoring.py -v`), then the full suite.
- **Verify before claiming done:** `cd backend && mypy app/ && ruff check app/`; frontend
  `cd frontend && npm run type-check`. Quote real output — don't assert success unseen.
- **Stay in scope.** Do not refactor code outside the assigned task. If a fix touches a *test
  file*, fix only the test-infrastructure issue (fixtures, DI overrides, isolation) — do not
  rewrite the test's assertions/logic; the test encodes intended behavior (the one exception is
  Issue 4, where the bug is in app code, not the test).
- **Commit granularity:** one logical fix per commit, descriptive message. Sign-off footer:
  `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- **Parallel vs sequential work** (this repo is worked both ways):
  - *Safe to parallelize* — the six fix categories above are largely independent **by issue**.
    Good splits: Issue 1 (auth dep) ‖ Issue 4 (scoring) ‖ Issue 6 (WS fixtures) ‖ frontend
    work ‖ docs. Different `services/` files are independent.
  - *Serialize / single-owner* — anything touching shared fixtures (`tests/conftest.py`:
    Issues 2, 3, 5 overlap there), DB models/migrations (schema changes ripple across
    models + schemas + services + tests), the Zustand store root, and `api/router.py`. Schema
    changes are **not** safe to parallelize.
  - When two tasks would edit the same file, make them sequential or assign one owner.
- **Before adding a feature/behavior, brainstorm scope first** (use the brainstorming skill);
  before debugging a failure, reproduce it rather than guessing.
