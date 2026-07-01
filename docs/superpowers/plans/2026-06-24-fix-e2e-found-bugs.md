# Fix E2E-Found Bugs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all bugs surfaced by the E2E playability suite so that every currently-red spec can go green, without weakening any test assertion.

**Architecture:** Three independent fix areas executed sequentially in priority order: (1) backend scoring logic + test typo, (2) e2e infrastructure URL defaults, (3) five missing frontend modules that block the build. Each area is independently testable.

**Tech Stack:** Python 3.11 (Docker), FastAPI, pytest; TypeScript strict, Next.js 16 app router, Zod, clsx, tailwind-merge.

## Global Constraints

- NEVER weaken, skip, or relax any e2e or unit assertion. Fix the bug at its root cause.
- Backend: 100% type hints, mypy strict, async SQLAlchemy 2.0, custom exceptions. Ruff rule set E,W,F,I,C,B,UP,RUF,SIM,RET,PT, line-length 120.
- Frontend: TypeScript strict, existing patterns (no new dependencies).
- One logical fix per commit. Message footer: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`
- Run tests inside the Docker container: `docker exec whist_backend python -m pytest tests/ -v`
- Frontend type-check: `cd frontend && npm run type-check`

---

## Bug Inventory

| # | Layer | File | Description |
|---|---|---|---|
| 1 | Backend logic | `backend/app/services/scoring_service.py:135` | Under-game failed non-zero contract when tricks > bid returns wrong score (-20 instead of -50) |
| 2 | Backend test | `backend/tests/test_gameplay.py:100` | `test_round_with_zero_bid_under` — expected value 19 is a typo; bid=2,won=2 → 2²+10=14 |
| 3 | E2E infra | `e2e/globalSetup.ts:8-9` | Wrong default URLs (port 8000→8001, port 3000→3001) cause suite to connect to wrong server |
| 4 | Frontend build | `frontend/lib/utils/cn.ts` | File missing — blocks build for ~10 UI components |
| 5 | Frontend build | `frontend/lib/utils/score-calculator.ts` | File missing — blocks build for ScoreCell and RoundSummaryModal |
| 6 | Frontend build | `frontend/lib/validation/schemas.ts` | File missing — blocks build for LoginForm, RegisterForm, useAuth hook |
| 7 | Frontend build | `frontend/lib/api/auth.ts` | File missing — blocks build for auth-slice and useAuth hook |
| 8 | Frontend build | `frontend/lib/api/index.ts` | File missing — blocks build for CreateRoomPage, RoomLobbyPage, JoinRoomForm |

---

## Task 1: Fix Backend Scoring — Under-Game Penalty When Tricks Exceed Bid

**Files:**
- Modify: `backend/app/services/scoring_service.py:130-136`
- Modify: `backend/tests/test_gameplay.py:85-100` (fix typo — same commit)

**Context:**
The scoring table in AGENTS.md says: `Failed contract, bid ≥ 1 → -10 × |tricks − bid|`. However, Known Issue 4 and the unit tests establish that for an **under game** specifically, when `tricks > bid`, the correct formula is `-10 × tricks_won`. (Under-game example: bid=3, won=5 → -10×5 = -50, not -10×2 = -20.) The over-game formula is unchanged.

The `test_round_with_zero_bid_under` test also has a typo: contracts were changed from `[0,5,5,3]` to `[0,5,5,2]` but the expected score for player 3 was left at 19 (which was correct for bid=3). With bid=2,won=2 the correct score is 2²+10=14.

**Interfaces:**
- Consumes: `ScoringService.calculate_round_score(contract_bid, tricks_won, game_type) -> int`
- Produces: same signature, corrected return for under-game when `tricks_won > contract_bid`

- [ ] **Step 1: Run focused test to confirm current failure**

```bash
docker exec whist_backend python -m pytest tests/test_gameplay.py -v 2>&1 | tail -30
```

Expected: `test_full_round_under_game FAILED` and `test_round_with_zero_bid_under FAILED`.

- [ ] **Step 2: Fix `calculate_round_score()` in scoring_service.py**

In `backend/app/services/scoring_service.py`, replace lines 130–136 (the "Handle non-zero contract" section):

```python
        # Handle non-zero contract
        if tricks_won == contract_bid:
            # Made contract
            return (contract_bid * contract_bid) + 10
        # Failed contract
        if game_type == GameType.UNDER and tricks_won > contract_bid:
            # Under-game: taking more tricks than bid harms the team
            return tricks_won * -10
        deviation = abs(tricks_won - contract_bid)
        return deviation * -10
```

- [ ] **Step 3: Fix test typo in test_round_with_zero_bid_under**

In `backend/tests/test_gameplay.py`, around line 99-100, change:

```python
        # Expected: [50, 35, 35, 19] → Total: 139
        assert scores[0] == 50  # Made zero in under
        assert scores[1] == 35  # Made 5
        assert scores[2] == 35  # Made 5
        assert scores[3] == 19  # Made 2
```

to:

```python
        # Expected: [50, 35, 35, 14] → Total: 134
        assert scores[0] == 50  # Made zero in under
        assert scores[1] == 35  # Made 5
        assert scores[2] == 35  # Made 5
        assert scores[3] == 14  # Made 2 (2²+10=14)
```

- [ ] **Step 4: Run focused tests to confirm green**

```bash
docker exec whist_backend python -m pytest tests/test_gameplay.py tests/test_scoring.py -v 2>&1 | tail -30
```

Expected: both `test_full_round_under_game` and `test_round_with_zero_bid_under` PASS. All 32 scoring tests pass.

- [ ] **Step 5: Run full backend test suite**

```bash
docker exec whist_backend python -m pytest tests/ -v 2>&1 | tail -20
```

Expected: No new failures compared to baseline (73 passing tests still pass; the 2 scoring failures now pass).

- [ ] **Step 6: Run mypy and ruff**

```bash
docker exec whist_backend sh -c "cd /app && mypy app/services/scoring_service.py && ruff check app/services/scoring_service.py"
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add backend/app/services/scoring_service.py backend/tests/test_gameplay.py
git commit -m "$(cat <<'EOF'
fix(scoring): apply under-game penalty for tricks > bid (-10 × tricks_won)

When a player bids ≥ 1 in an under game and wins more tricks than bid,
the correct penalty is -10 × tricks_won (not -10 × deviation). Fixes
AGENTS.md Known Issue 4.

Also corrects test_round_with_zero_bid_under expected value: contracts
were changed from [0,5,5,3] to [0,5,5,2] but expected score for player
3 was not updated (19 → 14 = 2²+10).

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Fix E2E globalSetup.ts Wrong URL Defaults

**Files:**
- Modify: `e2e/globalSetup.ts:8-9`

**Context:**
Whister runs on non-standard ports (8001/3001) to avoid conflict with other services on this machine. `e2e/helpers/services.ts` already uses the correct defaults. `e2e/globalSetup.ts` still has the old defaults (8000/3000) causing API login calls and browser navigation to hit the wrong server when env vars aren't set.

**Interfaces:**
- No interface change; the fix is purely default values.

- [ ] **Step 1: Edit globalSetup.ts**

In `e2e/globalSetup.ts`, change lines 8-9:

```typescript
const API_URL = process.env.API_URL || 'http://localhost:8001/api';
const BASE_URL = process.env.BASE_URL || 'http://localhost:3001';
```

- [ ] **Step 2: Verify the change is consistent with services.ts**

```bash
grep -n "localhost" /home/tomer/workspace/Whister/e2e/globalSetup.ts /home/tomer/workspace/Whister/e2e/helpers/services.ts /home/tomer/workspace/Whister/e2e/driver/backend-client.ts
```

Expected: all three files reference port 8001 for API and port 3001 for BASE_URL.

- [ ] **Step 3: Commit**

```bash
git add e2e/globalSetup.ts
git commit -m "$(cat <<'EOF'
fix(e2e): correct globalSetup default URLs to port 8001/3001

Whister runs on non-standard ports to avoid conflicts with other
services on this machine. globalSetup.ts still had the old defaults
(8000/3000) — aligns with services.ts and backend-client.ts.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Create Missing Frontend Modules

**Files:**
- Create: `frontend/lib/utils/cn.ts`
- Create: `frontend/lib/utils/score-calculator.ts`
- Create: `frontend/lib/validation/schemas.ts`
- Create: `frontend/lib/api/auth.ts`
- Create: `frontend/lib/api/index.ts`

**Context:**
The frontend has 19 build errors all caused by 5 missing module families. These files are imported by existing code throughout the codebase and do not exist anywhere in git history — they were scaffolded as imports but never created. All dependencies needed (clsx, tailwind-merge, zod) are already in package.json.

**Interfaces:**
- `cn(inputs: ClassValue[]): string` — used by 10+ UI components
- `formatScore(score: number): string` — used by RoundSummaryModal; returns "+19", "-20", "0"
- `getScoreColor(score: number): 'positive' | 'negative' | 'zero'` — used by ScoreCell and RoundSummaryModal
- `loginSchema` — Zod object with `email: string().email()`, `password: string().min(8)`
- `registerSchema` — Zod object with `username`, `displayName`, `email`, `password`, `confirmPassword` with `.refine()` password match
- `LoginFormData` — `z.infer<typeof loginSchema>`
- `RegisterFormData` — `z.infer<typeof registerSchema>`
- `authApi.login({ email, password }) → Promise<LoginResponse>`
- `authApi.register({ username, email, password, display_name }) → Promise<RegisterResponse>`
- `authApi.refreshToken(token: string) → Promise<TokenResponse>`
- `authApi.logout() → Promise<void>`
- `roomsApi.createRoom() → Promise<CreateRoomResponse>`
- `roomsApi.joinRoom(code: string, body: { display_name: string }) → Promise<void>`
- `roomsApi.startGame(code: string) → Promise<void>`

**API response types** (from AGENTS.md and auth-slice.ts inspection):
- `LoginResponse`: `{ user: { id, username, email, display_name, avatar_url? }, tokens: { access_token, refresh_token, token_type, expires_in } }`
- `RegisterResponse`: `{ id, username, email, display_name, tokens: { access_token, refresh_token, token_type, expires_in } }`
- `TokenResponse` (from refreshToken): `{ access_token, refresh_token?, token_type, expires_in }`
- `CreateRoomResponse`: `{ room_code: string, game_id: string, admin_id: string, status: string, ws_endpoint: string }`

- [ ] **Step 1: Create `frontend/lib/utils/cn.ts`**

```typescript
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
```

- [ ] **Step 2: Create `frontend/lib/utils/score-calculator.ts`**

```typescript
export function formatScore(score: number): string {
  if (score > 0) return `+${score}`;
  return String(score);
}

export function getScoreColor(score: number): 'positive' | 'negative' | 'zero' {
  if (score > 0) return 'positive';
  if (score < 0) return 'negative';
  return 'zero';
}
```

- [ ] **Step 3: Create `frontend/lib/validation/schemas.ts`**

```typescript
import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

export const registerSchema = z.object({
  username: z
    .string()
    .min(3, 'Username must be at least 3 characters')
    .max(30, 'Username must be less than 30 characters')
    .regex(/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores'),
  displayName: z
    .string()
    .min(2, 'Display name must be at least 2 characters')
    .max(50, 'Display name must be less than 50 characters'),
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  confirmPassword: z.string().min(8, 'Password must be at least 8 characters'),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
});

export type LoginFormData = z.infer<typeof loginSchema>;
export type RegisterFormData = z.infer<typeof registerSchema>;
```

- [ ] **Step 4: Create `frontend/lib/api/auth.ts`**

The auth-slice.ts uses: `authApi.login({ email, password })`, `authApi.register({ username, email, password, display_name })`, `authApi.refreshToken(token)`, `authApi.logout()`. All calls go through the Next.js proxy at `/api/v1/auth/*`.

```typescript
interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
}

interface UserBrief {
  id: string;
  username: string;
  email: string;
  display_name: string;
  avatar_url?: string;
}

interface LoginResponse {
  user: UserBrief;
  tokens: TokenResponse;
}

interface RegisterResponse {
  id: string;
  username: string;
  email: string;
  display_name: string;
  tokens: TokenResponse;
}

interface RefreshResponse {
  access_token: string;
  refresh_token?: string;
  token_type: string;
  expires_in: number;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/v1${path}`, {
    ...init,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  if (!res.ok) {
    const body = await res.text();
    let message = `Request failed: ${res.status}`;
    try {
      const json = JSON.parse(body);
      message = json.detail || json.message || json.error || message;
    } catch {
      // use default message
    }
    throw new Error(message);
  }
  return res.json() as Promise<T>;
}

export const authApi = {
  login(credentials: { email: string; password: string }): Promise<LoginResponse> {
    return request('/auth/login', {
      method: 'POST',
      body: JSON.stringify(credentials),
    });
  },

  register(data: {
    username: string;
    email: string;
    password: string;
    display_name: string;
  }): Promise<RegisterResponse> {
    return request('/auth/register', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  refreshToken(token: string): Promise<RefreshResponse> {
    return request('/auth/refresh', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ refresh_token: token }),
    });
  },

  logout(): Promise<void> {
    return request('/auth/logout', { method: 'POST' });
  },
};
```

- [ ] **Step 5: Create `frontend/lib/api/index.ts`**

The pages use: `roomsApi.createRoom()`, `roomsApi.joinRoom(code, { display_name })`, `roomsApi.startGame(code)`.

```typescript
interface CreateRoomResponse {
  room_code: string;
  game_id: string;
  admin_id: string;
  status: string;
  ws_endpoint: string;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/v1${path}`, {
    ...init,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  if (!res.ok) {
    const body = await res.text();
    let message = `Request failed: ${res.status}`;
    try {
      const json = JSON.parse(body);
      message = json.detail || json.message || json.error || message;
    } catch {
      // use default message
    }
    throw new Error(message);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const roomsApi = {
  createRoom(): Promise<CreateRoomResponse> {
    return request('/rooms', { method: 'POST', body: '{}' });
  },

  joinRoom(roomCode: string, body: { display_name: string }): Promise<void> {
    return request(`/rooms/${roomCode}/join`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },

  startGame(roomCode: string): Promise<void> {
    return request(`/rooms/${roomCode}/start`, { method: 'POST', body: '{}' });
  },
};
```

- [ ] **Step 6: Run type-check to confirm zero errors**

```bash
cd /home/tomer/workspace/Whister/frontend && npm run type-check 2>&1 | tail -20
```

Expected: 0 errors.

- [ ] **Step 7: Run build to confirm clean compile**

```bash
cd /home/tomer/workspace/Whister/frontend && npm run build 2>&1 | tail -20
```

Expected: build completes successfully with no errors.

- [ ] **Step 8: Commit**

```bash
git add frontend/lib/utils/cn.ts frontend/lib/utils/score-calculator.ts \
        frontend/lib/validation/schemas.ts frontend/lib/api/auth.ts frontend/lib/api/index.ts
git commit -m "$(cat <<'EOF'
fix(frontend): create missing lib modules that blocked the build

Five module families were imported throughout the codebase but never
created: lib/utils/cn, lib/utils/score-calculator, lib/validation/schemas,
lib/api/auth, lib/api/index. Resolves all 19 TypeScript build errors.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Verify E2E Suite

This task does not commit anything — it collects evidence that the fixes produced the expected results.

**Files:** none

- [ ] **Step 1: Confirm Docker services are running**

```bash
docker ps --filter "name=whist" --format "table {{.Names}}\t{{.Status}}"
```

Expected: `whist_backend`, `whist_db`, `whist_redis` all Up.

- [ ] **Step 2: Confirm frontend is running (or build+start it)**

```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:3001
```

If not 200: start it with `cd /home/tomer/workspace/Whister/frontend && npm run build && npm run start -- --port 3001 &` then wait ~30s.

- [ ] **Step 3: Run the full e2e suite**

```bash
cd /home/tomer/workspace/Whister/e2e && npm test 2>&1 | tee /tmp/e2e-results.txt | tail -30
```

- [ ] **Step 4: Quote real output**

Copy the summary block (pass/fail counts by spec file) from the output. For the scoring spec specifically, confirm:
- Cases 1–2: PASS (these were green before, must stay green)
- Cases 3–6: PASS (these were red due to the scoring bug and build failure — they should now be green)

- [ ] **Step 5: Run backend test suite one final time**

```bash
docker exec whist_backend python -m pytest tests/ -v 2>&1 | tail -20
```

Expected: 75 passing tests (73 prior + 2 scoring tests fixed), no new failures.

---

## Self-Review

**Spec coverage check:**
- Bug 1 (scoring service) → Task 1 ✓
- Bug 2 (test typo) → Task 1 ✓ (same commit — they go together)
- Bug 3 (globalSetup URLs) → Task 2 ✓
- Bug 4-8 (missing frontend modules) → Task 3 ✓
- Verification → Task 4 ✓

**Placeholder scan:** No TBDs. All code blocks are complete and exact.

**Type consistency:**
- `formatScore` / `getScoreColor` — defined in Task 3 Step 2, consumed by ScoreCell and RoundSummaryModal (existing files). `getScoreColor` returns `'positive' | 'negative' | 'zero'` which matches how ScoreCell uses it (line 27: `scoreColor === 'positive'`, `scoreColor === 'negative'`).
- `authApi.login()` returns `LoginResponse` with `response.user.display_name` and `response.tokens.access_token` — matches auth-slice.ts usage exactly.
- `authApi.register()` returns `RegisterResponse` with `response.id`, `response.username`, etc. — matches auth-slice.ts usage exactly.
- `authApi.refreshToken()` returns `RefreshResponse` with `response.access_token`, `response.refresh_token?` — matches auth-slice.ts usage exactly.
- `roomsApi.createRoom()` returns `CreateRoomResponse` with `response.room_code` — matches create/page.tsx usage exactly.
- `roomsApi.joinRoom()` and `roomsApi.startGame()` return `void` — matches how they're called (no return value used).
