# Stabilization Triage — 2026-06-25

**Source:** `docs/reviews/2026-06-25-full-repo-review.md`  
**Approach:** Fix at root cause, test-first, one sub-group at a time.

## Baseline

| Gate | Before |
|---|---|
| e2e tests | **18/18** (all passing — confirmed on 2026-06-25) |
| Backend tests (9 test_*.py) | **74 passed, 1 failed, 63 errors** (errors = Issues 2/3/5/6) |
| mypy | **193 errors across 24 files** |
| ruff | **49 errors (36 auto-fixable)** |
| Frontend type-check | **74 errors in one stale test file** (app code clean) |

---

## Sub-groups (in execution order)

### SG-1: Correctness Blockers — Scoring & ErrorCode
**Severity: HIGH**  
**Files:** `backend/app/services/scoring_service.py`, `backend/app/schemas/errors.py`,
`backend/app/services/room_service.py`, `backend/tests/test_scoring.py`

Findings:
- **[C1]** Under-game overtrick scoring wrong: `tricks_won * -10` instead of `-10 * |tricks - bid|`
  - Fix: delete the 3-line special-case in `scoring_service.py:135-137`
  - Add test: `calculate_round_score(3, 5, GameType.UNDER) == -20`
  - **(Q3 folds in here)**
- **[C2]** `ErrorCode.INVALID_GAME_STATE` doesn't exist → `AttributeError` on next-round guard
  - Fix: replace with `ErrorCode.INVALID_GAME_PHASE` in `room_service.py:693`
  - Add test for "next round before complete" path

Independent of all other sub-groups. Parallel-safe: touches no shared files.

---

### SG-2: Config & Deployment Quick Wins
**Severity: MEDIUM (CD1, CD2), LOW (S4)**  
**Files:** `backend/Dockerfile`, `backend/app/config.py`, `docker-compose.yml`

Findings:
- **[CD1]** Docker HEALTHCHECK uses `requests` (not in deps) + wrong URL `/api/v1/health` (404)
  - Fix: use `urllib.request` + URL `/health/ready`
- **[CD2]** CORS/WS default origin `:3001` but frontend is `:3001` — ALREADY MATCHES. Verify only.
- **[S4]** No runtime guard against default JWT secret in production
  - Fix: add validation in `Settings` (or startup check in `main.py`) that rejects default in
    `ENVIRONMENT=production`

No shared file overlap; parallel-safe.

---

### SG-3: Security — WS Token Type & Room Authorization
**Severity: CRITICAL (S1), LOW (S5)**  
**Files:** `backend/app/websocket/server.py`, `backend/app/websocket/room_manager.py`

Findings:
- **[S5]** WS connect accepts refresh tokens (missing token-type check)
  - Fix: reject if `payload.get("type") != "access"` in `server.py:123-128`
- **[S1]** WS `room:join` performs no membership authorization
  - Fix: in `join_room`, query `GamePlayer` row for `(game_id, user_id)` before assigning seat
  - Add test verifying an unknown user is rejected

Sequential within this group (both touch `server.py`/`room_manager.py`). S5 first (trivial), then S1.

---

### SG-4: Test Infrastructure — Get Backend Tests Green (Q1)
**Severity: HIGH (28 failures block the quality gate)**  
**Files:** `backend/tests/conftest.py`, `backend/app/api/auth.py`, `backend/app/api/users.py`,
`backend/app/models/game.py`, `backend/app/models/round.py`

Findings mapped to Known Issues:
- **[Q1 / Issue 2]** `AsyncClient(app=app)` removed in modern httpx → use `ASGITransport`
- **[Q1 / Issue 1]** Public user profile/stats endpoints require auth → add optional-auth dependency
- **[Q1 / Issue 3]** ORM relations not eager-loaded → `selectinload` / `lazy="selectin"` on
  relationships that test responses read
- **[Q1 / Issue 5]** Test data isolation: duplicate-key violations → per-test transaction rollback
- **[Q1 / Issue 6]** WS fixtures: `RedisManager` missing attr → inject fakeredis into fixtures

All touch `conftest.py` — **single owner, must be sequential**.

---

### SG-5: Type Safety & Code Quality (T1, T2)
**Severity: MEDIUM**  
**Files:** 24 backend files with mypy errors; all ruff errors

Findings:
- **[T2]** `ruff check --fix` the 36 auto-fixable errors first; address remaining manually
- **[T1]** Reduce mypy noise:
  - Redis union: type-annotate redis client call results to break `Awaitable[T] | T` ambiguity
  - SQLAlchemy: add explicit type annotations on `select()` results where needed
  - Strip dead `type: ignore` comments flagged by `warn_unused_ignores`
  - C2 (ErrorCode bug) surfaces here once fixed in SG-1
- Frontend: delete stale `frontend/__tests__/integration/auth-flow.test.ts` to fix `npm run type-check`

Note: The review identifies that many mypy errors are false positives (redis union noise, SQLA
inference). The real bug (C2) is already fixed in SG-1. The goal here is a clean gate so future
real errors surface — not fixing every single false positive. Per-module relaxations in
`pyproject.toml` may need to be used where the fix is impossible without external type stubs.

---

### SG-6: Real-time Stability (D1, D3, D4, D5, C3, C4)
**Severity: HIGH (D1, D3, D4, D5) / MEDIUM (C3, C4)**  
**Files:** `backend/app/websocket/game_events.py`, `backend/app/websocket/room_manager.py`

Findings (must be sequential — all touch the same files):
- **[D5]** `complete_round` not idempotent: atomically CAS phase before scoring
- **[C3]** Trick claims non-idempotent: key by trick index; use `HINCRBY`; restrict to admin/trick-winner
- **[D1]** No per-room lock: add `room:{code}:turn_lock` Redis lock wrapping hot-path mutations
- **[C4]** Auction uses `active_bidders == 1` instead of `len(passed_players) == 3`
- **[D3]** `sync:request` handler missing: implement to rebuild + emit `sync:state`
- **[D4]** Disconnect stalls auction: on disconnect, if current bidder, auto-pass after grace period

Order: D5 → C3/D1 → C4 → D3 → D4 (each builds on the previous).

---

### SG-7: Game State Durability (D2)
**Severity: HIGH**  
**Files:** `backend/app/websocket/game_events.py`, `backend/app/models/round.py`,
`backend/app/models/game.py`, `backend/alembic/`

Decision (documented here to avoid owner approval): Rather than redesign the system to make Redis
authoritative (which would mean removing DB columns and changing the schema contract), the
**recommended approach is incremental durability**: write `TrumpBid` rows on each bid, and write
`Round`/`RoundPlayer` checkpoints at phase transitions using the existing `version` column as an
optimistic lock. This matches the schema intent and is safer for a trusted-group card app. Full
event sourcing is not warranted.

Note: This is the largest and highest-risk item. **Deferred to after SG-6 is complete** so that
D1 (locking) is in place first — the optimistic lock is only useful if you already have per-room
turn serialization.

---

### SG-8: Frontend & Rate Limiter
**Severity: MEDIUM (FE1-FE4, S2, S3)**  
**Files:** `frontend/hooks/use-socket-event.ts`, `frontend/hooks/use-bidding.ts`,
`frontend/hooks/use-game.ts`, `frontend/stores/slices/scores-slice.ts`,
`frontend/stores/slices/auth-slice.ts`, `frontend/lib/validation/rules.ts`,
`backend/app/core/rate_limiter.py`, `backend/app/main.py`

Findings:
- **[FE1]** useSocketEvent 100ms polling: clear interval once socket found
- **[FE2]** socket.off removes all handlers: use named refs
- **[FE3]** Scores not reset on new game: call `resetGame()` / add `resetScores()`
- **[FE4]** Client trump validation missing suit tie-break
- **[S2]** Tokens in non-HttpOnly cookies + localStorage
- **[S3]** Rate limiter not wired → wire on auth endpoints or remove

---

### SG-9: Architecture & Coverage
**Severity: MEDIUM (A1) / LOW (A2, A3, Q2, Q4)**  
**Files:** `backend/app/api/router.py`, `backend/app/services/bidding_service.py`,
`backend/tests/test_games.py` (new)

Findings:
- **[A1]** Groups router unwired: mount in `router.py` + add API-level tests
- **[A3]** Contract validation not in service: call `validate_contract_bid` inside `place_contract_bid`
- **[Q2]** No `test_games.py`: add score-table + end-game endpoint tests
- **[Q4]** Integration suite largely red: address after SG-4 fixes `conftest.py`
- **[A2]** WS module complexity: deferred — refactoring a 1100-line file safely requires a dedicated pass after real-time stability is solid. Out of scope for this stabilization pass.

---

## Deferred (with rationale)

| Item | Rationale |
|---|---|
| D2 full durability | Largest item; requires SG-6 (locking) first; deferred to after SG-7 order listed above |
| A2 WS refactor | Safe refactor requires stability first; out of scope for stabilization pass |
| Q4 integration suite | Will improve after SG-4 (conftest fixes); remaining gaps documented |

---

## Execution Order

```
SG-1 (scoring) → SG-2 (config/deploy) → SG-3 (security WS) → SG-4 (test infra)
→ SG-5 (type safety) → SG-6 (real-time) → SG-7 (durability) → SG-8 (frontend)
→ SG-9 (architecture)
```

SG-1 through SG-3 can be parallelized (no shared files). SG-4 and SG-5 can begin after SG-1.
SG-6 through SG-9 are sequential or have limited overlap.
