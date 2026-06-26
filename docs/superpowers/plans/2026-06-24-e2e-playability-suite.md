# Whister E2E Playability Suite — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden the existing Playwright suite in `e2e/` into a trustworthy, headless,
remote-runnable suite that drives a full 4-player Israeli Whist game through the UI and asserts
real outcomes against both the DOM and the authoritative backend.

**Architecture:** Page Object Model (one object per screen) + a 4-player `GameDriver`, with
dual-source assertion (DOM + backend `score-table`/`sync:state`). Stable `data-testid` hooks
replace text selectors; all timing is condition-based (no sleeps); tests run serially against a
production frontend build with seeded throwaway users in the shared dev DB.

**Tech Stack:** Playwright `@playwright/test` ^1.41, socket.io-client ^4.7, TypeScript, Next.js
(frontend, production build), FastAPI + Socket.IO backend, docker compose (postgres/redis).

Full design rationale: [docs/superpowers/specs/2026-06-24-e2e-playability-suite-design.md](../specs/2026-06-24-e2e-playability-suite-design.md).

## Global Constraints

- Tests run **serially**: `workers: 1`, `retries: 0`. A flaky test is a bug to fix, never retried.
- **No `delay()`/sleep-based synchronization.** Every wait is on an observable condition.
- **No real credentials** anywhere in the repo. Test users are seeded via API with
  `@whister.test` emails.
- All outcome assertions are **per-game/per-round** (this game's score table / winner). Never
  assert on cumulative/lifetime `player_stats` (shared DB accumulates).
- Selectors use `data-testid`. Convention: `area-element[-qualifier]`
  (e.g. `bidding-suit-hearts`, `scores-cell-r1-p2`).
- WebSocket path is `/ws/socket.io`; JWT passed in the handshake `auth: { token }`.
- REST base is `/api/v1`. Login response shape: `{ tokens: { access_token, refresh_token } }`.
- Frontend served from a **production build** (`next build` + `next start`), not `next dev`.
- The suite is the spec: specs that exercise the known under-game/zero scoring bug (AGENTS.md
  "Issue 4") and disconnect/reconnect are expected **red** until those backend gaps are fixed.

---

## Task 0: Reconnaissance — verify open items, record findings

No code change. Resolve the design's open items so later tasks build on facts, not assumptions.
Produces `e2e/RECON.md` capturing answers; later tasks reference it.

**Files:**
- Create: `e2e/RECON.md`

**Interfaces:**
- Produces: documented answers to the 5 open items + the exact frontend files/elements that
  each `data-testid` in Task 5 will attach to.

- [ ] **Step 1: Bring up the stack and confirm the backend health route**

```bash
cd /home/tomer/workspace/Whister
docker compose up -d
# Discover the real health path (services.ts currently assumes /health/ready):
grep -rnE '"/health|/health/|health_check|add_api_route\(|@app.get\("/health' backend/app/main.py
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8000/health/ready
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8000/api/v1/health
```
Record which path returns 200 in `e2e/RECON.md` under "Health route".

- [ ] **Step 2: Confirm the playing-phase claim-trick UI (highest-risk item)**

Inspect the playing screen and its component for a per-player trick-claim control and how a
trick is attributed to the acting player:
```bash
grep -rnE "Claim Trick|claim_trick|claimTrick|round:claim" frontend/components/game frontend/app/room frontend/hooks
```
Record in `e2e/RECON.md`: does a clickable "Claim Trick" control render for the player whose
turn it is? Is there a visible "whose lead/turn" indicator? If the control is missing or not
per-player, note it — `smoke.spec` will legitimately fail later and that is a real finding.

- [ ] **Step 3: Confirm score-table API shape and game-end mechanism**

```bash
grep -rnE "score-table|score_table|/end|winner_id|def end_game|GameStatus" backend/app/api/games.py backend/app/services/room_service.py
```
Record the JSON shape of `GET /api/v1/games/{game_id}/score-table` (round rows, per-player
scores, totals, winner) and how a game ends / how `winner_id` is set.

- [ ] **Step 4: Confirm contract-bid UI supports any 0–13 value and locate testid targets**

```bash
ls frontend/components/bidding frontend/components/room frontend/components/scores frontend/components/game
grep -rnE 'has-text|placeholder=|"Pass"|"Bid"|"Confirm"|"New Round"|"Continue"|Start Game' frontend/components frontend/app
```
In `e2e/RECON.md`, build a table mapping each planned `data-testid` (see Task 5) → the file +
current element it attaches to.

- [ ] **Step 5: Run the existing suite to capture the starting baseline**

```bash
cd e2e && npm install && npx playwright install chromium
npx playwright test --reporter=list 2>&1 | tee /tmp/e2e-baseline.txt || true
```
Record pass/fail counts and notable failures in `e2e/RECON.md` under "Baseline". This is
informational; do not fix anything yet.

- [ ] **Step 6: Commit**

```bash
git add e2e/RECON.md
git commit -m "test(e2e): reconnaissance findings for playability suite"
```

---

## Task 1: Seed throwaway users; remove real credentials

Replace the committed real Gmail accounts with API-seeded `@whister.test` users.

**Files:**
- Modify: `e2e/config/players.ts`
- Create: `e2e/helpers/seed.ts`
- Modify: `e2e/globalSetup.ts`

**Interfaces:**
- Produces: `players: PlayerConfig[]` (4 entries, `@whister.test` emails); `loadToken(player)`
  unchanged; `seedUser(player): Promise<void>` in `seed.ts` that registers (idempotently) then
  no-ops if the user exists.
- Consumes: REST `POST /api/v1/auth/register` and `POST /api/v1/auth/login`.

- [ ] **Step 1: Replace credentials in `e2e/config/players.ts`**

Keep the `PlayerConfig` interface and `loadToken` exactly as they are. Replace only the
`players` array entries' `email`/`password`:

```typescript
export const players: PlayerConfig[] = [0, 1, 2, 3].map((index) => ({
  index,
  email: `e2e-p${index}@whister.test`,
  password: 'E2eTestPass123',
  storageStatePath: path.resolve(AUTH_DIR, `player${index}-storage.json`),
  tokenPath: path.resolve(AUTH_DIR, `player${index}-token.json`),
}));
```

- [ ] **Step 2: Write `e2e/helpers/seed.ts`**

```typescript
import { players, PlayerConfig } from '../config/players';

const API_URL = process.env.API_URL || 'http://localhost:8000/api';

/** Register a player if they don't already exist. Idempotent. */
export async function seedUser(player: PlayerConfig): Promise<void> {
  const res = await fetch(`${API_URL}/v1/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: player.email,
      password: player.password,
      username: `e2e_p${player.index}`,
      display_name: `E2E Player ${player.index + 1}`,
    }),
  });
  // 200/201 = created; 409 = already exists (both fine). Anything else is fatal.
  if (!res.ok && res.status !== 409) {
    throw new Error(`[e2e] seed failed for ${player.email} (${res.status}): ${await res.text()}`);
  }
}

export async function seedAllUsers(): Promise<void> {
  for (const p of players) await seedUser(p);
}
```

> If RECON Step 4 shows `register` requires different fields (e.g. no `username`), adjust the
> body to match the real `RegisterRequest` schema recorded in `e2e/RECON.md`.

- [ ] **Step 3: Call seeding before login in `globalSetup.ts`**

In `e2e/globalSetup.ts`, after `await ensureServicesRunning();` add:
```typescript
import { seedAllUsers } from './helpers/seed';
// ...
await ensureServicesRunning();
await seedAllUsers();
```

- [ ] **Step 4: Verify seeding + login works end to end**

```bash
cd e2e && npx playwright test --grep @nonexistent 2>&1 | tee /tmp/seed.txt || true
```
Expected: globalSetup logs "All 4 players authenticated." with no login/seed errors (0 tests
selected is fine — we are validating setup only).

- [ ] **Step 5: Commit**

```bash
git add e2e/config/players.ts e2e/helpers/seed.ts e2e/globalSetup.ts
git commit -m "test(e2e): seed throwaway users via API, remove real credentials"
```

---

## Task 2: Deterministic wait primitives

Provide condition-based helpers and delete the sleep helper.

**Files:**
- Modify: `e2e/helpers/wait.ts`

**Interfaces:**
- Produces:
  - `waitForPathname(page, pattern, timeoutMs?)` — keep existing.
  - `waitForTestId(page, testId, timeoutMs?): Promise<void>` — visible.
  - `waitForText(page, testId, expected, timeoutMs?): Promise<void>` — testid's text equals `expected`.
  - `firstPageWith(pages, testId, timeoutMs?): Promise<number>` — index of first page where
    `testId` is visible, condition-polled via `expect.poll`; throws on timeout (no silent -1).

- [ ] **Step 1: Replace `e2e/helpers/wait.ts` body**

```typescript
import { Page, expect } from '@playwright/test';

export async function waitForPathname(page: Page, pattern: string, timeoutMs = 15_000) {
  await expect.poll(() => page.url(), { timeout: timeoutMs }).toMatch(new RegExp(pattern));
}

export async function waitForTestId(page: Page, testId: string, timeoutMs = 15_000) {
  await expect(page.getByTestId(testId)).toBeVisible({ timeout: timeoutMs });
}

export async function waitForText(page: Page, testId: string, expected: string, timeoutMs = 15_000) {
  await expect(page.getByTestId(testId)).toHaveText(expected, { timeout: timeoutMs });
}

/** Resolve to the index of the first page where `testId` is visible. Throws on timeout. */
export async function firstPageWith(pages: Page[], testId: string, timeoutMs = 15_000): Promise<number> {
  let found = -1;
  await expect
    .poll(
      async () => {
        for (let i = 0; i < pages.length; i++) {
          if (await pages[i].getByTestId(testId).isVisible()) { found = i; return true; }
        }
        return false;
      },
      { timeout: timeoutMs },
    )
    .toBe(true);
  return found;
}
```

- [ ] **Step 2: Verify it compiles**

```bash
cd e2e && npx tsc --noEmit
```
Expected: no errors from `helpers/wait.ts`. (Other files still referencing `delay` will be
fixed when they are rewritten in later tasks; if `tsc` flags them now, that is expected and
resolved by Task 8 deleting the old helpers/specs.)

- [ ] **Step 3: Commit**

```bash
git add e2e/helpers/wait.ts
git commit -m "test(e2e): add condition-based wait primitives"
```

---

## Task 3: Playwright config — serial, artifacts, reporters

**Files:**
- Modify: `e2e/playwright.config.ts`

**Interfaces:**
- Produces: config with `workers: 1`, `retries: 0`, `trace: 'retain-on-failure'`, and `html` +
  `list` + `json` reporters (json → `e2e/results.json`).

- [ ] **Step 1: Replace `e2e/playwright.config.ts`**

```typescript
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 90 * 1000,
  workers: 1,
  retries: 0,
  fullyParallel: false,
  reporter: [
    ['list'],
    ['html', { open: 'never' }],
    ['json', { outputFile: 'results.json' }],
  ],
  globalSetup: './globalSetup.ts',
  globalTeardown: './globalTeardown.ts',
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:3000',
    actionTimeout: 15 * 1000,
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'retain-on-failure',
  },
});
```

- [ ] **Step 2: Verify config loads**

```bash
cd e2e && npx playwright test --list 2>&1 | tail -5
```
Expected: lists current tests with no config error (test list content will change in later tasks).

- [ ] **Step 3: Commit**

```bash
git add e2e/playwright.config.ts
git commit -m "test(e2e): serial config with trace + json reporting"
```

---

## Task 4: Production-build frontend in service bootstrap

**Files:**
- Modify: `e2e/helpers/services.ts`

**Interfaces:**
- Produces: `ensureServicesRunning()` that, when the frontend is unreachable, runs
  `next build` then `next start`, and uses the health route confirmed in RECON.

- [ ] **Step 1: Update the health URL and frontend startup in `services.ts`**

Set `HEALTH_URL` from RECON Step 1 (use the path that returned 200). Replace the backend and
frontend blocks:
```typescript
const HEALTH_URL = `${API_URL}${process.env.HEALTH_PATH || '/api/v1/health'}`; // confirm via RECON

// Backend block:
if (!(await isReachable(HEALTH_URL))) {
  console.log('[e2e] Backend not healthy – docker compose up -d ...');
  execSync('docker compose up -d', { cwd: ROOT_DIR, stdio: 'pipe' });
  state.startedDocker = true;
  await waitFor(HEALTH_URL, 120_000);
}

// Frontend block — production build then start:
if (!(await isReachable(BASE_URL))) {
  console.log('[e2e] Frontend not reachable – building & starting (production) ...');
  execSync('npm run build', { cwd: path.resolve(ROOT_DIR, 'frontend'), stdio: 'pipe' });
  const proc = spawn('npm', ['run', 'start', '--', '--port', '3000'], {
    cwd: path.resolve(ROOT_DIR, 'frontend'),
    detached: true,
    stdio: 'ignore',
  });
  proc.unref();
  state.startedFrontend = true;
  state.frontendPid = proc.pid;
  await waitFor(BASE_URL, 60_000);
}
```

- [ ] **Step 2: Verify bootstrap brings the stack up cleanly**

```bash
cd e2e && (docker compose -f ../docker-compose.yml down >/dev/null 2>&1 || true)
npx playwright test --grep @nonexistent 2>&1 | tee /tmp/bootstrap.txt || true
```
Expected: logs show backend healthy + frontend reachable; no timeout errors.

- [ ] **Step 3: Commit**

```bash
git add e2e/helpers/services.ts
git commit -m "test(e2e): bootstrap frontend from production build, fix health route"
```

---

## Task 5: Add `data-testid` hooks to the frontend

The one frontend change. Additive only — no behavior change. Use the RECON Step 4 mapping to
locate each element. Attach these testids:

| testid | Where (current anchor) |
|---|---|
| `lobby-start-game` | Lobby "Start Game" button |
| `lobby-player-card-{seat}` | each player card in lobby |
| `room-code` | room code display |
| `seating-confirm` | seating "Confirm" button |
| `seating-seat-{n}` | each seat slot |
| `bidding-current-turn` | element naming whose turn it is |
| `bidding-suit-clubs\|diamonds\|hearts\|spades\|notrump` | the 5 suit buttons |
| `bidding-counter-plus` / `bidding-counter-minus` / `bidding-counter-value` | bid counter |
| `bidding-bid` | trump "Bid" button |
| `bidding-pass` | "Pass" button |
| `bidding-confirm` | contract "Confirm" button |
| `bidding-running-sum` | contract running-sum display |
| `frisch-indicator` | frisch indicator |
| `playing-claim-trick` | "Claim Trick" control |
| `playing-undo-trick` | admin undo control (if present) |
| `playing-trick-count-{seat}` | per-player trick count |
| `game-trump-suit` | trump suit in game header |
| `scores-row-r{round}` | each round row in score table |
| `scores-cell-r{round}-p{seat}` | per-round per-player score cell |
| `scores-total-p{seat}` | per-player total |
| `scores-winner` | winner highlight (when game ends) |
| `scores-new-round` | "New Round" button |
| `scores-continue` | round-summary "Continue" button |
| `connection-status` | connection indicator |
| `error-toast` | error/toast message container |

**Files:**
- Modify: frontend components under `frontend/components/{room,game,bidding,scores,shared}` and
  relevant `frontend/app/...` pages, per the RECON mapping.

**Interfaces:**
- Produces: stable `data-testid` attributes consumed by every page object in Tasks 6–7.

- [ ] **Step 1: Add the testids**

For each row in the table above, add `data-testid="<id>"` to the identified element. Example for
the suit buttons (exact file from RECON, e.g. `components/bidding/suit-selector.tsx`):
```tsx
<button data-testid="bidding-suit-hearts" onClick={() => onSelect('hearts')}>♥</button>
```
For list/grid elements, interpolate the index:
```tsx
{players.map((p, seat) => (
  <PlayerCard key={p.id} data-testid={`lobby-player-card-${seat}`} ... />
))}
```
Score cells:
```tsx
<td data-testid={`scores-cell-r${round}-p${seat}`}>{score}</td>
```

- [ ] **Step 2: Verify the frontend still builds and type-checks**

```bash
cd frontend && npm run type-check && npm run build
```
Expected: both succeed.

- [ ] **Step 3: Commit**

```bash
git add frontend/components frontend/app
git commit -m "feat(frontend): add data-testid hooks for e2e selectors"
```

---

## Task 6: Page objects (BasePage + 5 screens)

**Files:**
- Create: `e2e/pages/base-page.ts`, `lobby-page.ts`, `seating-page.ts`, `bidding-page.ts`,
  `playing-page.ts`, `scores-page.ts`, `index.ts`

**Interfaces:**
- Produces (consumed by Task 7 driver + Task 8–11 specs):
  - `LobbyPage(page)`: `createRoom(): Promise<string>`, `joinRoom(code): Promise<void>`,
    `waitForPlayers(n): Promise<void>`, `startGame(): Promise<void>`
  - `SeatingPage(page)`: `waitLoaded()`, `confirm()`, `getGameId(): Promise<string>`
  - `BiddingPage(page)`: `isMyTurn(): Promise<boolean>`, `placeTrumpBid(amount, suit)`,
    `pass()`, `setContract(n)`, `confirmContract()`, `runningSum(): Promise<number>`,
    `frischActive(): Promise<boolean>`
  - `PlayingPage(page)`: `canClaim(): Promise<boolean>`, `claimTrick()`, `trickCount(seat): Promise<number>`
  - `ScoresPage(page)`: `waitLoaded()`, `roundScore(round, seat): Promise<number>`,
    `total(seat): Promise<number>`, `winnerSeat(): Promise<number | null>`, `newRound()`,
    `continueSummary()`
  - `TrumpSuit = 'clubs'|'diamonds'|'hearts'|'spades'|'notrump'`

- [ ] **Step 1: Write `e2e/pages/base-page.ts`**

```typescript
import { Page, Locator, expect } from '@playwright/test';

export type TrumpSuit = 'clubs' | 'diamonds' | 'hearts' | 'spades' | 'notrump';

export class BasePage {
  constructor(protected readonly page: Page) {}
  protected tid(id: string): Locator { return this.page.getByTestId(id); }
  protected async visible(id: string): Promise<boolean> { return this.tid(id).isVisible(); }
  protected async clickTid(id: string): Promise<void> {
    await expect(this.tid(id)).toBeEnabled({ timeout: 15_000 });
    await this.tid(id).click();
  }
  protected async numberText(id: string): Promise<number> {
    const t = (await this.tid(id).innerText()).replace(/[^0-9-]/g, '');
    return parseInt(t, 10);
  }
}
```

- [ ] **Step 2: Write `e2e/pages/lobby-page.ts`**

```typescript
import { BasePage } from './base-page';
import { waitForPathname, waitForTestId } from '../helpers/wait';

const ROOM_RE = '^.*/room/(?!create$|join$)[A-Za-z0-9]+$';

export class LobbyPage extends BasePage {
  async createRoom(): Promise<string> {
    await this.page.goto('/room/create');
    await this.page.getByRole('button', { name: /create/i }).click();
    await waitForPathname(this.page, ROOM_RE);
    return this.page.url().split('/room/')[1];
  }
  async joinRoom(code: string): Promise<void> {
    await this.page.goto('/room/join');
    await this.page.getByPlaceholder('Room Code').fill(code);
    await this.page.getByPlaceholder('Your Name').fill('Player');
    await this.page.getByRole('button', { name: /join/i }).click();
    await waitForPathname(this.page, ROOM_RE);
  }
  async waitForPlayers(_n: number): Promise<void> {
    await waitForTestId(this.page, 'lobby-start-game');
  }
  async startGame(): Promise<void> {
    await this.clickTid('lobby-start-game');
  }
}
```

- [ ] **Step 3: Write `e2e/pages/seating-page.ts`**

```typescript
import { BasePage } from './base-page';
import { waitForPathname, waitForTestId } from '../helpers/wait';

export class SeatingPage extends BasePage {
  async waitLoaded(): Promise<void> {
    await waitForPathname(this.page, '/game/[^/]+/seating');
    await waitForTestId(this.page, 'seating-confirm');
  }
  async confirm(): Promise<void> { await this.clickTid('seating-confirm'); }
  async getGameId(): Promise<string> {
    const m = this.page.url().match(/\/game\/([^/]+)\//);
    if (!m) throw new Error(`No gameId in URL: ${this.page.url()}`);
    return m[1];
  }
}
```

- [ ] **Step 4: Write `e2e/pages/bidding-page.ts`**

```typescript
import { BasePage, TrumpSuit } from './base-page';

export class BiddingPage extends BasePage {
  async isMyTurnTrump(): Promise<boolean> { return this.visible('bidding-pass'); }
  async isMyTurnContract(): Promise<boolean> { return this.visible('bidding-confirm'); }
  async placeTrumpBid(amount: number, suit: TrumpSuit): Promise<void> {
    await this.setCounter(amount);
    await this.clickTid(`bidding-suit-${suit}`);
    await this.clickTid('bidding-bid');
  }
  async pass(): Promise<void> { await this.clickTid('bidding-pass'); }
  async setContract(n: number): Promise<void> {
    await this.setCounter(n);
    await this.clickTid('bidding-confirm');
  }
  async runningSum(): Promise<number> { return this.numberText('bidding-running-sum'); }
  async frischActive(): Promise<boolean> { return this.visible('frisch-indicator'); }

  private async setCounter(target: number): Promise<void> {
    // Counter starts at its minimum; press + until value === target.
    for (let i = 0; i < 20; i++) {
      const cur = await this.numberText('bidding-counter-value');
      if (cur === target) return;
      await this.clickTid(cur < target ? 'bidding-counter-plus' : 'bidding-counter-minus');
    }
    throw new Error(`Could not set counter to ${target}`);
  }
}
```

- [ ] **Step 5: Write `e2e/pages/playing-page.ts`**

```typescript
import { BasePage } from './base-page';

export class PlayingPage extends BasePage {
  async canClaim(): Promise<boolean> {
    return (await this.visible('playing-claim-trick'))
      && (await this.tid('playing-claim-trick').isEnabled());
  }
  async claimTrick(): Promise<void> { await this.clickTid('playing-claim-trick'); }
  async trickCount(seat: number): Promise<number> {
    return this.numberText(`playing-trick-count-${seat}`);
  }
}
```

- [ ] **Step 6: Write `e2e/pages/scores-page.ts`**

```typescript
import { BasePage } from './base-page';
import { waitForTestId } from '../helpers/wait';

export class ScoresPage extends BasePage {
  async waitLoaded(): Promise<void> { await waitForTestId(this.page, 'scores-new-round'); }
  async roundScore(round: number, seat: number): Promise<number> {
    return this.numberText(`scores-cell-r${round}-p${seat}`);
  }
  async total(seat: number): Promise<number> { return this.numberText(`scores-total-p${seat}`); }
  async winnerSeat(): Promise<number | null> {
    if (!(await this.visible('scores-winner'))) return null;
    const attr = await this.tid('scores-winner').getAttribute('data-seat');
    return attr ? parseInt(attr, 10) : null;
  }
  async newRound(): Promise<void> { await this.clickTid('scores-new-round'); }
  async continueSummary(): Promise<void> { await this.clickTid('scores-continue'); }
}
```

> `winnerSeat()` reads a `data-seat` attribute on `scores-winner`. Add that attribute in Task 5
> if not already present, or adjust this reader to whatever RECON recorded.

- [ ] **Step 7: Write `e2e/pages/index.ts`**

```typescript
export * from './base-page';
export * from './lobby-page';
export * from './seating-page';
export * from './bidding-page';
export * from './playing-page';
export * from './scores-page';
```

- [ ] **Step 8: Verify compilation**

```bash
cd e2e && npx tsc --noEmit
```
Expected: no errors in `pages/`.

- [ ] **Step 9: Commit**

```bash
git add e2e/pages
git commit -m "test(e2e): page objects for all screens"
```

---

## Task 7: Backend client + GameDriver

**Files:**
- Create: `e2e/driver/backend-client.ts`, `e2e/driver/game-driver.ts`, `e2e/driver/index.ts`

**Interfaces:**
- Produces:
  - `BackendClient`: `scoreTable(gameId, token): Promise<ScoreTable>`,
    `openSocket(token): Promise<Socket>`, `waitForEvent(socket, event, timeoutMs?)`.
  - `ScoreTable = { rounds: { round: number; suit: string; scores: number[] }[]; totals: number[]; winnerSeat: number | null }`
    (shape confirmed in RECON Step 3 — adjust the parser there if it differs).
  - `GameDriver`: `setup(): Promise<void>`, `createGame(): Promise<{ roomCode, gameId }>`,
    `confirmSeating()`, `playRound(spec: RoundSpec): Promise<void>`,
    `nextRound()`, `scores(): ScoresPage` (player 0's), `backendScores(gameId): Promise<ScoreTable>`,
    `close()`.
  - `RoundSpec = { trump: TrumpSuit; trumpWinner: number; contracts: [number,number,number,number]; tricks: [number,number,number,number] }`
- Consumes: page objects (Task 6), `players`/`loadToken` (config), waits (Task 2).

- [ ] **Step 1: Write `e2e/driver/backend-client.ts`**

```typescript
import { io, Socket } from 'socket.io-client';

const API_URL = process.env.API_URL || 'http://localhost:8000/api';
const WS_URL = process.env.WS_URL || 'http://localhost:8000';

export interface ScoreTable {
  rounds: { round: number; suit: string; scores: number[] }[];
  totals: number[];
  winnerSeat: number | null;
}

export class BackendClient {
  async scoreTable(gameId: string, token: string): Promise<ScoreTable> {
    const res = await fetch(`${API_URL}/v1/games/${gameId}/score-table`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`score-table ${res.status}: ${await res.text()}`);
    return this.parse(await res.json());
  }
  // Map the real payload (RECON Step 3) into ScoreTable. Update keys to match.
  private parse(raw: any): ScoreTable {
    return {
      rounds: (raw.rounds ?? []).map((r: any) => ({
        round: r.round_number, suit: r.trump_suit, scores: r.scores,
      })),
      totals: raw.totals ?? [],
      winnerSeat: raw.winner_seat ?? null,
    };
  }
  openSocket(token: string): Promise<Socket> {
    return new Promise((resolve, reject) => {
      const s = io(WS_URL, { path: '/ws/socket.io', auth: { token },
        transports: ['websocket', 'polling'], timeout: 10_000 });
      s.on('connect', () => resolve(s));
      s.on('connect_error', reject);
    });
  }
  waitForEvent<T>(socket: Socket, event: string, timeoutMs = 15_000): Promise<T> {
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error(`timeout waiting for ${event}`)), timeoutMs);
      socket.once(event, (d: T) => { clearTimeout(t); resolve(d); });
    });
  }
}
```

- [ ] **Step 2: Write `e2e/driver/game-driver.ts`**

```typescript
import { Browser, BrowserContext, Page } from '@playwright/test';
import { players, loadToken } from '../config/players';
import {
  LobbyPage, SeatingPage, BiddingPage, PlayingPage, ScoresPage, TrumpSuit,
} from '../pages';
import { firstPageWith } from '../helpers/wait';
import { BackendClient, ScoreTable } from './backend-client';

export interface RoundSpec {
  trump: TrumpSuit;
  trumpWinner: number;
  contracts: [number, number, number, number];
  tricks: [number, number, number, number];
}

export class GameDriver {
  contexts: BrowserContext[] = [];
  pages: Page[] = [];
  readonly backend = new BackendClient();

  constructor(private readonly browser: Browser) {}

  async setup(): Promise<void> {
    this.contexts = await Promise.all(
      players.map((p) => this.browser.newContext({ storageState: p.storageStatePath })),
    );
    this.pages = await Promise.all(this.contexts.map((c) => c.newPage()));
  }

  lobby(i: number) { return new LobbyPage(this.pages[i]); }
  bidding(i: number) { return new BiddingPage(this.pages[i]); }
  playing(i: number) { return new PlayingPage(this.pages[i]); }
  scores(i = 0) { return new ScoresPage(this.pages[i]); }

  async createGame(): Promise<{ roomCode: string; gameId: string }> {
    const roomCode = await this.lobby(0).createRoom();
    for (let i = 1; i < 4; i++) await this.lobby(i).joinRoom(roomCode);
    await this.lobby(0).waitForPlayers(4);
    await this.lobby(0).startGame();
    const seating = new SeatingPage(this.pages[0]);
    await seating.waitLoaded();
    const gameId = await seating.getGameId();
    return { roomCode, gameId };
  }

  async confirmSeating(): Promise<void> {
    const seating = new SeatingPage(this.pages[0]);
    await seating.waitLoaded();
    await seating.confirm();
    await firstPageWith(this.pages, 'bidding-pass'); // trump bidding has started
  }

  async playRound(spec: RoundSpec): Promise<void> {
    await this.runTrumpAuction(spec.trump, spec.trumpWinner);
    await this.runContractBidding(spec.contracts);
    await this.claimAllTricks(spec.tricks);
    await this.scores(0).waitLoaded();
  }

  private async runTrumpAuction(trump: TrumpSuit, winner: number): Promise<void> {
    // Designated winner bids minimum on their turn; everyone else passes.
    for (let guard = 0; guard < 12; guard++) {
      const active = await firstPageWith(this.pages, 'bidding-pass', 20_000).catch(() => -1);
      if (active === -1) break;
      const b = this.bidding(active);
      if (active === winner && !(await this.trumpAlreadyWon())) {
        await b.placeTrumpBid(5, trump);
      } else {
        await b.pass();
      }
      if (await this.trumpAlreadyWon()) break;
    }
  }
  private async trumpAlreadyWon(): Promise<boolean> {
    // Contract phase reached when any page shows the contract confirm control.
    for (const p of this.pages) if (await p.getByTestId('bidding-confirm').isVisible()) return true;
    return false;
  }

  private async runContractBidding(contracts: [number, number, number, number]): Promise<void> {
    for (let guard = 0; guard < 8; guard++) {
      const active = await firstPageWith(this.pages, 'bidding-confirm', 20_000).catch(() => -1);
      if (active === -1) break;
      await this.bidding(active).setContract(contracts[active]);
      // Playing phase begins when claim-trick appears.
      let started = false;
      for (const p of this.pages) if (await p.getByTestId('playing-claim-trick').isVisible()) started = true;
      if (started) break;
    }
  }

  private async claimAllTricks(tricks: [number, number, number, number]): Promise<void> {
    let remaining = [...tricks];
    for (let guard = 0; guard < 30; guard++) {
      if (remaining.every((t) => t === 0)) break;
      const active = await firstPageWith(this.pages, 'playing-claim-trick', 20_000).catch(() => -1);
      if (active === -1) break;
      if (remaining[active] > 0) {
        await this.playing(active).claimTrick();
        remaining[active] -= 1;
      } else {
        // Whoever currently leads owes 0 more tricks; we must hand the lead on.
        // The trick winner leads next, so claim with a player that still owes.
        const next = remaining.findIndex((t) => t > 0);
        await this.playing(active).claimTrick(); // current leader claims, then re-balance
        remaining[active] = Math.max(0, remaining[active]); // no-op guard
        if (next >= 0) remaining[next] += 0;
      }
    }
  }

  async nextRound(): Promise<void> {
    await this.scores(0).newRound();
    await firstPageWith(this.pages, 'bidding-pass', 20_000);
  }

  async backendScores(gameId: string): Promise<ScoreTable> {
    return this.backend.scoreTable(gameId, loadToken(players[0]));
  }

  async close(): Promise<void> {
    await Promise.all(this.contexts.map((c) => c.close()));
  }
}
```

> **Trick-claim attribution caveat:** the real trick winner depends on cards played, which the
> UI controls. RECON Step 2 determines how `playing-claim-trick` attributes a trick. If the UI
> only lets the *current leader* claim (no free choice of recipient), `claimAllTricks` cannot
> hit an arbitrary distribution through the UI alone. In that case, implement `claimAllTricks`
> to assert *total* tricks = 13 and per-player counts via `playing-trick-count-{seat}`, and use
> contract/trick specs the UI can actually produce. Record the chosen approach in RECON and
> simplify this method accordingly — do not keep dead re-balance code.

- [ ] **Step 3: Write `e2e/driver/index.ts`**

```typescript
export * from './backend-client';
export * from './game-driver';
```

- [ ] **Step 4: Verify compilation**

```bash
cd e2e && npx tsc --noEmit
```
Expected: no errors in `driver/`.

- [ ] **Step 5: Commit**

```bash
git add e2e/driver
git commit -m "test(e2e): backend client and 4-player game driver"
```

---

## Task 8: Smoke spec + retire legacy helpers/specs

**Files:**
- Create: `e2e/tests/smoke.spec.ts`
- Delete: `e2e/tests/game.spec.ts`, `e2e/tests/multi-round.spec.ts`, `e2e/tests/seating.spec.ts`,
  `e2e/tests/lobby.spec.ts`, `e2e/tests/bidding.spec.ts` (legacy versions, replaced in later
  tasks), `e2e/helpers/game-setup.ts`, `e2e/helpers/socket.ts`
- Keep: `e2e/tests/auth.spec.ts` (review separately; leave if green)

**Interfaces:**
- Consumes: `GameDriver`, `players`/`loadToken`.

- [ ] **Step 1: Delete legacy files that referenced `delay`/socket trick-claiming**

```bash
cd e2e
git rm tests/game.spec.ts tests/multi-round.spec.ts tests/seating.spec.ts \
       tests/lobby.spec.ts tests/bidding.spec.ts helpers/game-setup.ts helpers/socket.ts
```

- [ ] **Step 2: Write `e2e/tests/smoke.spec.ts`**

```typescript
import { test, expect } from '@playwright/test';
import { GameDriver } from '../driver';

test('playability: one full UI-driven round produces correct scores', async ({ browser }) => {
  const driver = new GameDriver(browser);
  await driver.setup();
  try {
    const { gameId } = await driver.createGame();
    await driver.confirmSeating();

    // Over game: contracts sum to 14 (>13). Winner bids 5 and makes it.
    await driver.playRound({
      trump: 'clubs',
      trumpWinner: 0,
      contracts: [5, 3, 3, 3],
      tricks: [5, 3, 3, 2],
    });

    // DOM assertion: player 0 made 5 → 5² + 10 = 35.
    const ui = await driver.scores(0).roundScore(1, 0);
    expect(ui).toBe(35);

    // Backend (authoritative) assertion agrees with the DOM.
    const bt = await driver.backendScores(gameId);
    expect(bt.rounds[0].scores[0]).toBe(35);
    expect(ui).toBe(bt.rounds[0].scores[0]);
  } finally {
    await driver.close();
  }
});
```

- [ ] **Step 3: Run the smoke test**

```bash
cd e2e && npx playwright test smoke --reporter=list
```
Expected: PASS. If it fails on `playing-claim-trick` not existing or wrong attribution, that is
the RECON Step 2 risk materializing — fix per the Task 7 caveat (adjust `claimAllTricks` and the
trick spec) and re-run. A scoring mismatch here would indicate a real backend bug — record it.

- [ ] **Step 4: Commit**

```bash
git add e2e/tests/smoke.spec.ts e2e/helpers e2e/tests
git commit -m "test(e2e): UI-driven smoke test; retire legacy helpers"
```

---

## Task 9: Scoring matrix spec (the bug-catcher)

**Files:**
- Create: `e2e/tests/scoring.spec.ts`

**Interfaces:**
- Consumes: `GameDriver`, `RoundSpec`.

- [ ] **Step 1: Write `e2e/tests/scoring.spec.ts`**

```typescript
import { test, expect } from '@playwright/test';
import { GameDriver } from '../driver';
import type { RoundSpec } from '../driver';

interface Case {
  name: string;
  round: RoundSpec;
  seat: number;       // player under assertion
  expected: number;   // expected score for that seat
}

// Σcontracts > 13 → over game; < 13 → under game.
const cases: Case[] = [
  { name: 'made contract (bid 3, win 3)', seat: 1, expected: 19,
    round: { trump: 'clubs', trumpWinner: 0, contracts: [5, 3, 3, 3], tricks: [4, 3, 3, 3] } },
  { name: 'failed contract (bid 5, win 3)', seat: 0, expected: -20,
    round: { trump: 'clubs', trumpWinner: 0, contracts: [5, 3, 3, 3], tricks: [3, 4, 3, 3] } },
  { name: 'zero made, under (+50)', seat: 3, expected: 50,
    round: { trump: 'clubs', trumpWinner: 0, contracts: [5, 3, 2, 0], tricks: [6, 4, 3, 0] } },
  { name: 'zero made, over (+10)', seat: 3, expected: 10,
    round: { trump: 'clubs', trumpWinner: 0, contracts: [6, 5, 3, 0], tricks: [5, 5, 3, 0] } },
  { name: 'failed zero, 1 trick (-50)', seat: 3, expected: -50,
    round: { trump: 'clubs', trumpWinner: 0, contracts: [5, 4, 3, 0], tricks: [4, 4, 4, 1] } },
  { name: 'failed zero, 3 tricks (-30)', seat: 3, expected: -30,
    round: { trump: 'clubs', trumpWinner: 0, contracts: [5, 3, 2, 0], tricks: [4, 3, 3, 3] } },
];

for (const c of cases) {
  test(`scoring: ${c.name}`, async ({ browser }) => {
    const driver = new GameDriver(browser);
    await driver.setup();
    try {
      const { gameId } = await driver.createGame();
      await driver.confirmSeating();
      await driver.playRound(c.round);

      const ui = await driver.scores(0).roundScore(1, c.seat);
      const bt = await driver.backendScores(gameId);
      expect(bt.rounds[0].scores[c.seat]).toBe(c.expected); // authoritative
      expect(ui).toBe(c.expected);                          // displayed
    } finally {
      await driver.close();
    }
  });
}
```

> The trick distributions assume `claimAllTricks` can realize them. If RECON Step 2 forces a
> leader-only claim model, adjust each case's `tricks` to a distribution the UI can produce
> while preserving the targeted outcome for `seat` (the key invariants: that seat's
> made/failed/zero status and the over/under game type via Σcontracts).

- [ ] **Step 2: Run the scoring spec**

```bash
cd e2e && npx playwright test scoring --reporter=list
```
Expected: made/failed cases PASS. The under/zero cases will FAIL if AGENTS.md Issue 4 is
unfixed — that is the intended bug-catch. Record results; do not weaken the assertions.

- [ ] **Step 3: Commit**

```bash
git add e2e/tests/scoring.spec.ts
git commit -m "test(e2e): scoring matrix with dual-source assertions"
```

---

## Task 10: Bidding spec (auction, frisch, last-bidder)

**Files:**
- Create: `e2e/tests/bidding.spec.ts`

- [ ] **Step 1: Write `e2e/tests/bidding.spec.ts`**

```typescript
import { test, expect } from '@playwright/test';
import { GameDriver } from '../driver';
import { firstPageWith } from '../helpers/wait';

test('trump auction: outbid then others pass sets trump', async ({ browser }) => {
  const driver = new GameDriver(browser);
  await driver.setup();
  try {
    await driver.createGame();
    await driver.confirmSeating();
    // First active player bids 5 clubs; next active raises to 6 clubs; rest pass.
    const a = await firstPageWith(driver.pages, 'bidding-pass');
    await driver.bidding(a).placeTrumpBid(5, 'clubs');
    const b = await firstPageWith(driver.pages, 'bidding-pass');
    await driver.bidding(b).placeTrumpBid(6, 'clubs');
    for (let g = 0; g < 6; g++) {
      const x = await firstPageWith(driver.pages, 'bidding-pass', 10_000).catch(() => -1);
      if (x === -1) break;
      await driver.bidding(x).pass();
      let contract = false;
      for (const p of driver.pages) if (await p.getByTestId('bidding-confirm').isVisible()) contract = true;
      if (contract) break;
    }
    // Contract phase reached → auction resolved.
    expect(await firstPageWith(driver.pages, 'bidding-confirm')).toBeGreaterThanOrEqual(0);
  } finally { await driver.close(); }
});

test('frisch: all pass raises minimum bid and restarts auction', async ({ browser }) => {
  const driver = new GameDriver(browser);
  await driver.setup();
  try {
    await driver.createGame();
    await driver.confirmSeating();
    for (let g = 0; g < 4; g++) {
      const x = await firstPageWith(driver.pages, 'bidding-pass');
      await driver.bidding(x).pass();
    }
    // Frisch indicator appears and auction is active again.
    const idx = await firstPageWith(driver.pages, 'frisch-indicator', 15_000);
    expect(idx).toBeGreaterThanOrEqual(0);
    expect(await firstPageWith(driver.pages, 'bidding-pass')).toBeGreaterThanOrEqual(0);
  } finally { await driver.close(); }
});

test('last-bidder rule: a bid making the sum 13 is rejected', async ({ browser }) => {
  const driver = new GameDriver(browser);
  await driver.setup();
  try {
    await driver.createGame();
    await driver.confirmSeating();
    // Resolve trump: first active bids 5 clubs, others pass.
    const w = await firstPageWith(driver.pages, 'bidding-pass');
    await driver.bidding(w).placeTrumpBid(5, 'clubs');
    for (let g = 0; g < 4; g++) {
      const x = await firstPageWith(driver.pages, 'bidding-pass', 8_000).catch(() => -1);
      if (x === -1) break;
      await driver.bidding(x).pass();
      let c = false; for (const p of driver.pages) if (await p.getByTestId('bidding-confirm').isVisible()) c = true;
      if (c) break;
    }
    // Three players contract 5,4,0 → sum 9; the last bidder choosing 4 (→13) must be blocked.
    const order: number[] = [];
    for (let g = 0; g < 3; g++) {
      const x = await firstPageWith(driver.pages, 'bidding-confirm');
      order.push(x);
      await driver.bidding(x).setContract([5, 4, 0][g]);
    }
    const last = await firstPageWith(driver.pages, 'bidding-confirm');
    await driver.bidding(last).setContract(4); // would make sum 13
    // Rejected: still last player's turn, error shown, no transition to playing.
    await expect(driver.pages[last].getByTestId('error-toast')).toBeVisible({ timeout: 10_000 });
    expect(await driver.pages[last].getByTestId('bidding-confirm').isVisible()).toBe(true);
  } finally { await driver.close(); }
});
```

> If `setContract` clamps the value client-side so 13-making bids are unselectable, assert that
> instead: the counter cannot reach the forbidden value and no `error-toast` is needed. Record
> the UI's actual behavior (RECON) and keep whichever assertion matches.

- [ ] **Step 2: Run the bidding spec**

```bash
cd e2e && npx playwright test bidding --reporter=list
```
Expected: auction + frisch PASS. Last-bidder PASS if the rule is enforced; a real red here means
the rule isn't enforced in the UI — record it.

- [ ] **Step 3: Commit**

```bash
git add e2e/tests/bidding.spec.ts
git commit -m "test(e2e): trump auction, frisch, and last-bidder rule"
```

---

## Task 11: Flow + resilience specs

**Files:**
- Create: `e2e/tests/flow.spec.ts`, `e2e/tests/resilience.spec.ts`

- [ ] **Step 1: Write `e2e/tests/flow.spec.ts`**

```typescript
import { test, expect } from '@playwright/test';
import { GameDriver } from '../driver';

test('multi-round: scores accumulate across two rounds', async ({ browser }) => {
  test.setTimeout(150_000);
  const driver = new GameDriver(browser);
  await driver.setup();
  try {
    const { gameId } = await driver.createGame();
    await driver.confirmSeating();

    await driver.playRound({ trump: 'clubs', trumpWinner: 0, contracts: [5, 3, 3, 3], tricks: [5, 3, 3, 2] });
    const afterR1 = await driver.backendScores(gameId);

    await driver.nextRound();
    await driver.playRound({ trump: 'diamonds', trumpWinner: 0, contracts: [5, 3, 3, 3], tricks: [5, 3, 3, 2] });
    const afterR2 = await driver.backendScores(gameId);

    expect(afterR2.rounds.length).toBe(2);
    // Totals are cumulative: round1 + round2 per seat.
    for (let s = 0; s < 4; s++) {
      expect(afterR2.totals[s]).toBe(afterR1.rounds[0].scores[s] + afterR2.rounds[1].scores[s]);
      // DOM total matches backend total.
      expect(await driver.scores(0).total(s)).toBe(afterR2.totals[s]);
    }
  } finally { await driver.close(); }
});
```

> Whether a game auto-ends with a winner depends on RECON Step 3. If game-end is admin-triggered,
> add a follow-up step that ends the game via the UI/admin control and asserts `scores-winner`
> equals the highest-total seat. If there is no end condition yet, keep this multi-round
> accumulation test and note the winner gap in RECON.

- [ ] **Step 2: Write `e2e/tests/resilience.spec.ts`**

```typescript
import { test, expect } from '@playwright/test';
import { GameDriver } from '../driver';
import { firstPageWith } from '../helpers/wait';

test('invalid trump bid below minimum is rejected', async ({ browser }) => {
  const driver = new GameDriver(browser);
  await driver.setup();
  try {
    await driver.createGame();
    await driver.confirmSeating();
    const a = await firstPageWith(driver.pages, 'bidding-pass');
    // Minimum trump bid is 5; attempt 4.
    await driver.bidding(a).placeTrumpBid(4, 'clubs');
    await expect(driver.pages[a].getByTestId('error-toast')).toBeVisible({ timeout: 10_000 });
    // Still this player's turn (bid not accepted).
    expect(await driver.pages[a].getByTestId('bidding-pass').isVisible()).toBe(true);
  } finally { await driver.close(); }
});

test('player disconnect mid-round then reconnect restores state', async ({ browser }) => {
  const driver = new GameDriver(browser);
  await driver.setup();
  try {
    const { roomCode } = await driver.createGame();
    await driver.confirmSeating();
    // Player 3 disconnects (close page) during trump bidding.
    await driver.pages[3].close();
    // Reconnect: open a fresh page in the same context and navigate back to the room.
    driver.pages[3] = await driver.contexts[3].newPage();
    await driver.pages[3].goto(`/room/${roomCode}`);
    // State restored: player sees the live game (bidding UI or game view), not an error.
    await expect(driver.pages[3].getByTestId('connection-status')).toBeVisible({ timeout: 15_000 });
  } finally { await driver.close(); }
});
```

> If reconnect-after-disconnect isn't implemented, the second test fails as a real finding —
> record it; do not weaken it.

- [ ] **Step 3: Run flow + resilience**

```bash
cd e2e && npx playwright test flow resilience --reporter=list
```
Expected: flow PASS; resilience PASS where the features exist, real red where they don't —
record findings.

- [ ] **Step 4: Commit**

```bash
git add e2e/tests/flow.spec.ts e2e/tests/resilience.spec.ts
git commit -m "test(e2e): multi-round flow and resilience scenarios"
```

---

## Task 12: Runner docs, summary, full-suite run

**Files:**
- Create: `e2e/README.md`
- Modify: `e2e/package.json` (add a `report` script)

- [ ] **Step 1: Add a report script to `e2e/package.json`**

```json
"scripts": {
  "setup": "npx playwright install chromium",
  "test": "npx playwright test",
  "test:headed": "npx playwright test --headed",
  "test:ui": "npx playwright test --ui",
  "report": "npx playwright show-report"
}
```

- [ ] **Step 2: Write `e2e/README.md`**

````markdown
# Whister E2E Suite

Drives a full 4-player Israeli Whist game through the UI and asserts outcomes against both the
DOM and the backend. Trustworthy by design: serial, zero retries, no sleeps.

## Run (headless, one command)
```bash
cd e2e
npm install && npm run setup    # first time only
npm test
```
`globalSetup` brings up docker (postgres/redis/backend), builds + serves the frontend, and seeds
4 throwaway `@whister.test` users. `globalTeardown` stops only what it started.

## Env vars
- `BASE_URL` (default `http://localhost:3000`)
- `API_URL`  (default `http://localhost:8000/api`)
- `WS_URL`   (default `http://localhost:8000`)
- `HEALTH_PATH` (default per RECON; the backend health route)

## Failure artifacts
- HTML report: `npm run report` (reads `playwright-report/`)
- Traces/video/screenshots: `test-results/` (retained on failure)
- Machine-readable: `results.json`

## Philosophy
A failing test is a real bug to fix, not a test to weaken. Specs that exercise the known
under-game/zero scoring bug and disconnect/reconnect are expected red until those backend gaps
are fixed (see /AGENTS.md "Known Issues").
````

- [ ] **Step 3: Full-suite run and capture results**

```bash
cd e2e && npm test 2>&1 | tee /tmp/e2e-final.txt
```
Expected: green except the intentionally-red specs documented in RECON/AGENTS Issue 4. Confirm
`results.json` and `playwright-report/` are generated.

- [ ] **Step 4: Commit**

```bash
git add e2e/README.md e2e/package.json
git commit -m "test(e2e): runner docs and report script"
```

---

## Self-Review

**Spec coverage:**
- Section 1 (architecture): selector layer → Task 5; page objects → Task 6; driver + backend
  client → Task 7. ✓
- Section 2 (determinism/data): waits → Task 2; serial config → Task 3; seeding → Task 1;
  per-game assertions → enforced in Tasks 8–11. ✓
- Section 3 (scenarios): smoke → Task 8; scoring matrix → Task 9; bidding/frisch/last-bidder →
  Task 10; flow + resilience → Task 11. ✓
- Section 4 (runner/reporting/non-goals): config artifacts → Task 3; prod build → Task 4;
  README + summary → Task 12. ✓
- Open items → Task 0 (RECON) gates the risky assumptions. ✓

**Placeholder scan:** No "TBD"/"implement later". The RECON-dependent notes (claim-trick model,
score-table shape, register fields, game-end) are explicit conditional instructions with the
adjustment specified, not deferred work.

**Type consistency:** `GameDriver` exposes `pages`, `contexts`, `bidding(i)`, `playing(i)`,
`scores(i)`, `createGame`, `confirmSeating`, `playRound`, `nextRound`, `backendScores`, `close`
— all used consistently by Tasks 8–11. `RoundSpec` fields (`trump`, `trumpWinner`, `contracts`,
`tricks`) match every call site. `ScoreTable` (`rounds[].scores`, `totals`, `winnerSeat`) matches
all readers. `TrumpSuit` union matches `placeTrumpBid` and `bidding-suit-{suit}` testids.

**Known soft spot (called out, not hidden):** arbitrary trick distribution through the UI
depends on the claim-trick attribution model (RECON Step 2). Tasks 7/9 carry explicit
instructions to adapt if the UI only supports leader-claim.
