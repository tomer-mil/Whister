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
| Variable | Default | Purpose |
|---|---|---|
| `BASE_URL` | `http://localhost:3001` | Frontend URL |
| `API_URL` | `http://localhost:8001/api` | Backend REST base |
| `WS_URL` | `http://localhost:8001` | Backend WebSocket base |
| `HEALTH_PATH` | `/health/ready` | Backend health endpoint |
| `FRONTEND_PORT` | `3001` | Port for the auto-started frontend |

## Test suites
| File | What it tests | Expected result |
|---|---|---|
| `smoke.spec.ts` | One full 4-player round, UI-only | Should be **green** |
| `scoring.spec.ts` | 6 scoring cases (dual-source: DOM + backend) | Cases 1–2 **green**; cases 3–6 **intentionally red** (AGENTS.md Issue 4) |
| `bidding.spec.ts` | Trump auction, frisch, last-bidder rule | Should be **green** |
| `flow.spec.ts` | 2-round score accumulation | Should be **green** |
| `resilience.spec.ts` | Invalid bid rejection; disconnect/reconnect | Invalid-bid test **green**; reconnect test may be **red** (reconnect not confirmed implemented) |

## Failure artifacts
- HTML report: `npm run report` (reads `playwright-report/`)
- Traces/video/screenshots: `test-results/` (retained on failure)
- Machine-readable: `results.json`

## Philosophy
**A failing test is a real bug to fix, not a test to weaken.** The scoring cases for
under-game/zero-bid scoring and the disconnect/reconnect test are intentionally red until the
corresponding backend gaps are fixed (see AGENTS.md "Known Issues" — Issue 4).
