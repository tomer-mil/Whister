# Whister E2E Playability Suite — Design

**Date:** 2026-06-24
**Status:** Design approved (all 4 sections). Pending owner review of this written spec before
moving to an implementation plan.
**Topic:** Harden the existing Playwright e2e suite into a trustworthy, remote-runnable
suite that automatically verifies the game is playable end-to-end.

---

## Context & Goal

Whister is an AI-built Israeli Whist platform (see [/AGENTS.md](../../../AGENTS.md)). The
backend's core logic is well unit-tested (scoring/bidding/analytics at 100%), but **whether
the game is actually playable end-to-end is unverified**, and the frontend's functional
completeness is unknown. The owner develops mostly on a remote box and wants an e2e suite he
can *trust* to automatically prove playability and catch regressions.

**Key finding:** this is not a greenfield build. A capable Playwright harness already exists in
`e2e/` — 4-player auth (browser + API token), stack auto-bootstrap (docker + `next dev`), and
helpers that drive the full flow (room → seating → trump bid → contract bid → tricks → scores)
across multi-round specs. The work is to **harden it into something trustworthy**, because today
it cannot be trusted:

1. **Cannot catch the scoring bug.** Tests assert that suit symbols and the "New Round" button
   appear; they never assert actual **score numbers**. The real under-game scoring bug
   (AGENTS.md "Issue 4") would pass green.
2. **Playing phase bypasses the UI.** `playTricks` claims tricks via raw Socket.IO
   `round:claim_trick`, not the browser — the trick-playing screen's playability is untested.
3. **Sleep-driven timing.** `delay(700)` + polling everywhere → flaky, worse on a remote box;
   "red" won't reliably mean "broken."
4. **Committed real credentials.** Real Gmail addresses + passwords are hard-coded in
   `e2e/config/players.ts`, and the accounts must pre-exist in the DB.
5. **Unknown current pass state** — specs may be partly aspirational; nobody has confirmed
   they're green in this environment.

## Decisions Log

| # | Decision | Choice |
|---|----------|--------|
| Direction | What to prioritize for the project | Verify it's playable, via a trustworthy e2e suite |
| Trust priority | Which gap to close first | **All three, sequenced**: assert real outcomes → kill flakiness → drive everything via UI |
| Coverage scope | How many scenarios | **Full incl. resilience**: scoring matrix + flow edges (frisch, last-bidder, game-to-winner) + failure paths (invalid bid, disconnect/reconnect) |
| Run target | How it runs remotely | **Headless on the box**: one reproducible command + rich failure artifacts (traces/video/screenshots/HTML report) |
| Data strategy | Test accounts & data | **Seed throwaway users via API into the shared dev DB** (no reset, no real creds); assertions are per-game to stay stable despite accumulation |
| Approach | Architecture | **B + C**: Page Object Model + 4-player driver (B), with dual-source assertion UI + authoritative backend (C); evolve the existing `e2e/` foundation; add `data-testid` to the frontend |

## Approach (chosen: B + C)

- **B — Page Object Model + 4-player game driver.** Page objects own selectors and waits; a
  typed driver orchestrates the 4 browser contexts. Keeps the large scenario set readable; each
  scenario becomes a short declarative spec.
- **C — Dual-source assertion.** Assert outcomes both from the backend (API / WS `sync:state` =
  ground truth) **and** from the DOM. The authoritative read catches the backend scoring bug
  precisely; the DOM read proves the UI actually displays it (playability).
- Built as an **evolution** of the existing `e2e/` harness, not a rewrite.

---

## Section 1 — Architecture & Structure  *(approved)*

Three layers on top of the existing `e2e/` foundation.

### 1. Selector layer — `data-testid` in the frontend
The one frontend change: additive, stable `data-testid` attributes replacing brittle text
selectors (`button:has-text("Pass")`, `:text("♣")`). No behavior change.

Convention: `area-element[-qualifier]`. Examples:
`bidding-suit-hearts`, `bidding-bid`, `bidding-pass`, `bidding-counter-plus`,
`bidding-current-turn`, `bidding-running-sum`, `frisch-indicator`,
`playing-claim-trick`, `playing-undo-trick`, `playing-trick-count-p2`,
`scores-cell-r1-p2`, `scores-total-p2`, `scores-winner`, `scores-new-round`,
`connection-status`, `error-toast`.

Coverage spans the mapped component sets: `room/`, `game/` (seating, playing, header),
`bidding/`, `scores/`, plus the connection indicator and error/toast.

### 2. Page Object Model — `e2e/pages/`
One object per screen, owning its selectors + deterministic waits, instantiated per context:
- `LobbyPage` — createRoom, joinRoom, waitForPlayers, startGame
- `SeatingPage` — waitLoaded, swap, confirm, getGameId
- `BiddingPage` — trump: `placeBid(amount, suit)` / `pass`; contract: `setContract(n)` /
  `confirm`; reads: highestBid, currentTurnPlayer, frischState, runningSum, isMyTurn
- `PlayingPage` — `claimTrick` **via UI button**, `undoTrick`, readTrickCounts, isMyLead
- `ScoresPage` — `readScoreTable()` → `{round, suit, perPlayerScores}`, readTotals, winner,
  newRound, continue
- `BasePage` — shared testid/wait helpers

### 3. Orchestration — `e2e/driver/`
- `GameDriver` — owns the 4 contexts + page objects, knows turn order, exposes declarative
  `playRound({ trump, trumpWinner, contracts[], tricks[] })` that drives each player's UI when
  it's their turn by **waiting on the turn indicator** (not sleeping). Returns observed outcomes.
- `BackendClient` — API + WS access for (a) seeding/login, (b) authoritative outcome reads
  (`GET /api/v1/games/{id}/score-table`, WS `sync:state`), (c) resilience actions
  (drop/reopen a socket).

### Resulting layout
```
e2e/
├── pages/        LobbyPage, SeatingPage, BiddingPage, PlayingPage, ScoresPage, BasePage
├── driver/       game-driver.ts, backend-client.ts
├── tests/        smoke, scoring, bidding, flow, resilience  (rewritten on POM)
├── config/       players.ts (seeded users, no real creds)
├── helpers/      services.ts (bootstrap), wait.ts (deterministic primitives)
└── globalSetup.ts / globalTeardown.ts
```

---

## Section 2 — Determinism & Data Strategy  *(approved)*

The "kill flakiness" half. The current `delay(700)` + `findActivePage` polling is replaced
wholesale.

### Deterministic waits
Every sync point waits on an observable *condition*, never a clock:
- Turn handoff → `expect.poll` on the turn-indicator testid showing the expected player.
- Cross-player WS propagation → assert the **receiving** page's DOM reflects the change (e.g.
  player 2's bid history shows player 1's bid) before proceeding.
- Phase transitions → wait on the next phase's anchor testid (e.g. `playing-claim-trick`
  appears for all four pages).
- Where DOM is ambiguous → use `BackendClient` to await the authoritative WS event
  (`bid:trump_set`, `round:complete`) as the sync point.
- `wait.ts` keeps only condition-based primitives; `delay()` is deleted.

### Execution model — serial
`workers: 1`, `retries: 0`. Each test drives 4 contexts against one shared backend + shared DB;
parallel specs would collide on turn timing and DB state. Serial is slower but deterministic.
`retries: 0` is deliberate — a retry would *hide* flake, the opposite of "trustworthy." A flaky
test is a bug to fix, not retry.

### Test data — seed throwaway users, shared DB
`globalSetup` registers 4 stable throwaway users via `POST /api/v1/auth/register` (idempotent:
register → ignore "already exists" → login), e.g. `e2e-p0@whister.test`. The committed real
Gmail credentials are removed. Because global `player_stats` accumulate in the shared DB, **all
assertions are per-game/per-round** (this game's score table, this game's winner) — naturally
isolated — and the suite never asserts on cumulative lifetime stats. Room codes are
server-generated, so no collision.

### Consequence to expect
Scenarios assert *correct* behavior, so specs exercising under-game/zero-bid scoring will be
**red until the backend scoring bug (Issue 4) is fixed.** Intended: the suite is the spec; a
failing test means a real bug to fix, not a test to weaken.

---

## Section 3 — Scenario Suite  *(approved)*

Five spec files, each built on `GameDriver` + dual-source assertion. Every outcome is checked
**twice** — authoritative value from `GET /games/{id}/score-table` (or WS `sync:state`) **and**
the DOM via `ScoresPage.readScoreTable()`.

### `smoke.spec.ts` — the playability gate
One complete 4-player game runs UI-only through every phase (room → seating → trump → contract
→ **tricks via the UI** → scores). Asserts the round's scores match what the played
contracts/tricks imply. If this is red, the game isn't playable.

### `scoring.spec.ts` — the bug-catcher
Parametrized single rounds, each with fixed contracts + trick distribution, asserting each
player's exact score against the rules table. Over/under is forced by the contract sum
(>13 over, <13 under):

| Case | Setup | Expected score |
|---|---|---|
| Made contract | bid 3, win 3 | `3²+10 = +19` |
| Failed contract | bid 5, win 3 | `-10×2 = -20` |
| Zero made, **under** | bid 0, win 0, Σcontracts<13 | `+50` |
| Zero made, **over** | bid 0, win 0, Σcontracts>13 | `+25` |
| Failed zero, 1 trick | bid 0, win 1 | `-50` |
| Failed zero, 2+ tricks | bid 0, win 3 | `-50+10×2 = -30` |

The under-game / zero rows are exactly what Issue 4 breaks — this spec will be **red until the
backend scoring bug is fixed**, by design.

### `bidding.spec.ts` — auction correctness
Outbidding by higher number *and* the same-number-higher-suit tie-break; pass removes a player;
winner sets trump. **Frisch:** all four pass → frisch triggers, minimum bid increments (5→6),
redeal, auction restarts. **Last-bidder rule:** a contract bid that would make the sum equal 13
is rejected by the UI (error shown, state unchanged).

### `flow.spec.ts` — full game + accumulation
A multi-round game played to completion → a winner is determined; the score table accumulates
correctly across rounds; a seating swap before confirm takes effect.
*(Assumption to verify: game-end is admin-triggered via `POST /games/{id}/end` with
`winner_id` = highest cumulative score.)*

### `resilience.spec.ts` — failure paths
An invalid bid (below minimum / out of turn) is rejected by the UI; a player disconnects
mid-round (close context or drop socket via `BackendClient`) then reconnects and state is
restored via sync. *(If reconnect isn't implemented, this test surfaces the gap as a real
red — intended.)*

Serial execution means the full suite runs a few minutes; scenario specs use the driver's fast
"advance to round N" path rather than re-deriving setup.

---

## Section 4 — Runner, Reporting & Non-Goals  *(approved)*

### Runner
- **One command:** `cd e2e && npm test`. `globalSetup` bootstraps the stack (docker compose for
  postgres/redis/backend) and seeds the 4 users; `globalTeardown` stops only what it started.
- **Frontend served from a production build** (`next build && next start`), not `next dev` —
  HMR/compile races in dev are a flakiness source and the build is faster to drive.
  `services.ts` updated accordingly.

### Reporting (no browser to watch)
- Playwright trace `retain-on-failure`, video + screenshot on failure.
- HTML report at `e2e/playwright-report/`; raw results at `e2e/test-results/`.
- **JSON reporter** (`results.json`) + a one-line end-of-run summary so an agent reading logs
  sees pass/fail counts and failing test names without opening the HTML.
- An **`e2e/README.md`**: the single command, env vars (`BASE_URL`/`API_URL`/`WS_URL`), where
  artifacts land, how to read a failed trace, and the philosophy — *a failing test is a real
  bug to fix, not a test to weaken.*

### Non-goals
- Not fixing backend bugs here (the suite *reveals* them; the Issue 4 scoring fix is tracked
  separately, though it pairs naturally).
- No CI (runner is structured so CI can later wrap `npm test`).
- No parallel execution; no assertions on global/lifetime stats.
- The unwired Groups/analytics endpoints are out of scope for playability.

### Open items to confirm during planning
Each could expose a real gap rather than block the design:
1. **Highest risk — does the playing UI have a per-player claim-trick control?** The current
   suite bypasses it via raw socket, which *may* be because the affordance is incomplete. If
   missing, driving tricks through the UI surfaces it as a real red in `smoke.spec` (correct,
   but worth knowing early).
2. Backend health route used by bootstrap (`/health/ready` vs `/api/v1/health`).
3. Game-end mechanism and winner determination (assumed admin-triggered).
4. Whether reconnect-after-disconnect is actually implemented.
5. That the contract-bid UI can set any value 0–13.
