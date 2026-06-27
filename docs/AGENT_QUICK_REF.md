# Whister — Agent Quick Reference

Fast refresh for agents already onboarded. Full detail: [../AGENTS.md](../AGENTS.md).

## Status (2026-01-19)
- **Backend:** core logic solid; **110/138 tests (80%)**; 28 failures = infra/setup (+1 real scoring bug).
- **Frontend:** Next 16 app-router scaffolded (pages, components, Zustand, hooks); functional completeness **unverified**.
- **E2E:** Playwright specs exist; pass/fail **unverified**.
- **Gotcha:** Groups API router exists but is **NOT mounted** in `backend/app/api/router.py` (auth/users/rooms/games only).

## Common commands
```bash
docker-compose up                                   # full stack (pg:5432, redis:6379, api:8000)
cd backend && pytest tests/ -v                      # backend tests (110/138)
cd backend && pytest tests/test_scoring.py -v       # focused
cd backend && mypy app/ && ruff check app/          # types + lint (mypy strict)
cd frontend && npm run dev                           # frontend :3000
cd frontend && npm run type-check                    # tsc --noEmit (TS strict)
```

## 28 known failures
| # | Category | Tests | Effort |
|---|---|---|---|
| 1 | Public-endpoint auth (`/users/{id}`, `/stats`) → optional-auth dep | 6 | 30m |
| 2 | AsyncClient DB context → override `get_db_session` in conftest | 12 | 1–2h |
| 3 | ORM relations not eager-loaded → `selectinload` | 7 | 45m |
| 4 | **Under-game scoring bug** (got -20, want -50) → fix `scoring_service` | 2 | 30m |
| 5 | Test data isolation → per-test transaction rollback | 3 | 30m |
| 6 | WebSocket fixtures (RedisManager attr) → add WS/fakeredis fixtures | 3 | 1h |

Sequence: Tier 1 = #1+#4 (→88%); Tier 2 = #2+#3 (→98%); Tier 3 = #5+#6 (→100%). ~4–5h total.
Parallel-safe by issue; serialize anything in `tests/conftest.py` (#2/#3/#5), models/migrations, `api/router.py`.

## Key files
- `backend/app/services/scoring_service.py` — all scoring math (Issue 4 lives here)
- `backend/app/services/bidding_service.py` — trump/contract validation, frisch
- `backend/app/websocket/schemas.py` — `ClientEvents`/`ServerEvents` constants
- `backend/app/models/` — SQLAlchemy 2.0 models (9 tables); enums in `base.py`
- `backend/app/api/router.py` — REST mount point (groups missing)
- `backend/tests/conftest.py` — fixtures (Issues 2/3/5/6 land here)
- `frontend/stores/slices/` — Zustand state; `frontend/lib/socket/manager.ts` — socket client

## Scoring cheat (source of truth — fix code to match)
Made (bid≥1, tricks==bid): `bid²+10` · Failed: `-10×|tricks−bid|`. Zero bid OVER game = normal contract
(`bid²+10`/`-10×|tricks−bid|`, so made `+10`, failed 1 trick `-10`). Zero bid UNDER game (special): made `+50`,
failed 1 trick `-50`, 2+ tricks `-50+10×(tricks−1)`. Suit order: clubs<diamonds<hearts<spades<NT.
Contract sum never 13 → over if >13 else under.

## Deeper reference (AGENTS.md sections)
Rules → [Domain](../AGENTS.md#domain-israeli-whist-rules--scoring) · REST → [API Surface](../AGENTS.md#api-surface)
· WS → [WebSocket Events](../AGENTS.md#websocket-events) · DB → [Database Schema](../AGENTS.md#database-schema)
· Conventions → [Coding Standards](../AGENTS.md#coding-standards--conventions) · Workflow → [Agent Workflow](../AGENTS.md#agent-workflow)
