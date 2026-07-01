# Whister mobile readiness

This is the single source of truth for whether Whister is ready to play on a phone. A row is
green only when a deterministic, passing automated mobile e2e test proves it. Partial and gap
rows link to the exact limitation or app defect; they are not release claims.

## Run the evidence

```bash
cd e2e
npm ci
npx playwright install chromium
npm test
npx tsc --noEmit
```

The suite is fixed at `workers: 1`, `retries: 0`. Its bootstrap refuses non-local or wrong-port
targets and verifies both service identities before testing. Whister uses Postgres `5433`, backend
`8001`, frontend `3001`, and its own Redis. It never starts, stops, or reconfigures Cookoo.

Playwright Chromium device emulation is evidence for browser-visible behavior, not a substitute
for final iOS Safari/Android Chrome physical-device acceptance. The distinction is explicit below.

## Readiness matrix

| Criterion | Why it matters on mobile | Emulation mechanism | Verifying test (path::name) | Status (✅ verified / ⚠️ partial / ❌ gap) | Evidence/notes |
|---|---|---|---|---|---|
| Whister-only test target | A green run against another app is meaningless and could mutate a live service. | Pure URL guards plus `/api/v1` and manifest identity checks. | `e2e/tests/bootstrap.spec.ts::bootstrap accepts only Whister host ports`; `::bootstrap recognizes Whister backend identity and rejects another app`; `::bootstrap recognizes Whister frontend manifest and rejects another app` | ✅ verified | Rejects backend `8000`, frontend `3000`, remote hosts, and non-Whister identity before startup. |
| Tap input | Primary phone interaction must drive real game actions. | `hasTouch`/`isMobile` context and `page.tap()`. | `e2e/tests/mobile/touch.spec.ts::T1: trump bid placed via tap (not mouse click)` | ✅ verified | T1 passes: trump bid placed via tap; suit tap now uses a visibility/enabled wait before registering; turn advances to next bidder. Full-suite run: 44 passed / 44 total. |
| Long-press input | Accidental holds must not submit or repeat an action. | CDP touch-start/hold/touch-end sequence. | `e2e/tests/mobile/touch.spec.ts::T5: long-press changes the bid counter once without submitting a bid` | ✅ verified | Counter changes once; bidder/turn remains unchanged until explicit submit. |
| Swipe input | Phone users must be able to scroll without corrupting game state. | CDP touch-start/move/end on a keyboard-height score viewport. | `e2e/tests/mobile/touch.spec.ts::T6: touch swipe scrolls scores without changing authoritative scores` | ✅ verified | Scroll position changes and DOM score remains equal to backend score. |
| Tap-target size | Small controls cause mis-taps during bidding. | Bounding boxes under both phone descriptors, 44×44 CSS-pixel threshold. | `e2e/tests/mobile/touch.spec.ts::T2a: bidding controls meet 44×44px touch-target guideline on iPhone SE`; `::T2b: bidding controls meet 44×44px touch-target guideline on iPhone 14` | ✅ verified | Bidding suit, counter, bid, and pass controls meet the threshold. |
| No hover dependency | Phones cannot reveal hover-only controls. | Full touch-context round with no hover call. | `e2e/tests/mobile/touch.spec.ts::T3: full round completes on touch context with zero hover interactions` | ✅ verified | Complete round reaches backend-verified scores. |
| Rapid repeated action | Mobile double-taps must not duplicate a move. | Two immediate taps on Claim Trick. | `e2e/tests/mobile/touch.spec.ts::T4: two rapid taps on claim-trick count as one trick claim` | ✅ verified | 2-second Redis NX key drops the duplicate tap; backend confirms count=1 after two immediate taps. |
| Small and large phone playability | The dominant phone sizes must support a complete round. | Playwright iPhone SE and iPhone 14 descriptors. | `e2e/tests/mobile/viewport.spec.ts::V1: smoke round completes on iPhone SE (375×667, DPR 2)`; `::V2: smoke round completes on iPhone 14 (390×664, DPR 3)` | ✅ verified | Both paths assert DOM score equals backend score. |
| Mobile flags and DPR | CSS and event behavior depend on touch/mobile/DPR values, not viewport alone. | Built-in descriptors; inspect touch points, coarse pointer, width, DPR. | `e2e/tests/mobile/viewport.spec.ts::V5: phone contexts expose touch input, mobile width, and expected DPR` | ✅ verified | SE reports 375/DPR2; iPhone 14 reports 390/DPR3; touch/coarse pointer are active. |
| Small-screen scrolling and clipping | Score history and bidding controls cannot fall outside the viewport. | Two-round SE score page plus bounding-box checks on both profiles. | `e2e/tests/mobile/viewport.spec.ts::V3: score table rows reachable after 2 rounds on small viewport`; `::V4: bidding controls are not clipped below viewport on both phone profiles` | ✅ verified | Rows scroll into view and critical bid controls remain within viewport bounds. |
| Safe-area/notch handling | Home indicators and notches can cover controls. | iPhone 14 descriptor, viewport-meta inspection, gameplay safe-padding selector. | `e2e/tests/mobile/viewport.spec.ts::V6: gameplay wires viewport-fit cover and bottom safe-area padding` | ⚠️ partial | Emitted meta now includes `viewport-fit=cover` and gameplay uses `pb-safe-bottom`; physical inset and notch layout require devices. See [ML-01](#ml-01-browser-emulation-boundaries). |
| Accidental zoom prevention | Double-tap/pinch zoom can move controls off-screen mid-action. | Inspect emitted viewport meta in a mobile context. | `e2e/tests/mobile/touch.spec.ts::X1: viewport meta prevents pinch/double-tap zoom during gameplay` | ✅ verified | Emitted meta contains `maximum-scale=1` and `user-scalable=no` after moving viewport to a dedicated Next.js export. |
| Orientation change mid-game | Rotation must preserve state and reachable controls. | Runtime viewport swap portrait↔landscape. | `e2e/tests/mobile/orientation.spec.ts::O1: portrait→landscape rotation mid-bidding; state preserved, bidding continues`; `::O3: landscape→portrait rotation during playing phase; claim-trick button visible`; `::O4: smoke round completes when game starts in landscape (844×375)` | ⚠️ partial | Browser-visible layout passes; sensor/orientation-lock and iOS Safari behavior require devices. See [ML-01](#ml-01-browser-emulation-boundaries). |
| Background during another turn | A returning observer must not see stale bidding state. | Synthetic `visibilitychange`/`pagehide` around other players' bids. | `e2e/tests/mobile/lifecycle.spec.ts::B1: short background during another player bid; foreground reflects new state`; `::B2: multiple turns pass while observer is backgrounded; foreground reflects current state`; `::S3: foreground requests authoritative state synchronization` | ✅ verified | Socket events update state during short background; foreground emits `sync:request` and the server responds with `sync:state`. S3, B1, and B2 pass. |
| App switch during own bid | A brief switch must preserve the player's pending turn. | Background/foreground the current bidder. | `e2e/tests/mobile/lifecycle.spec.ts::B4: background while it is your trump bid turn; turn remains on foreground` | ✅ verified | Brief synthetic switch retains the active bid controls. Long suspension is covered separately. |
| App switch mid-trick | Trick totals must catch up while an observer is away. | Background observer while three other pages claim tricks. | `e2e/tests/mobile/lifecycle.spec.ts::S1: app-switch away during trick claiming; trick counts update on return` | ✅ verified | S1 passes: trick counts update on the observer's page after returning from background; sync:request + sync:state deliver the playing phase with correct trick totals. Full-suite run: 44 passed / 44 total. |
| All tabs briefly backgrounded | A short OS/app switch must not destroy the room. | Background then foreground all four pages. | `e2e/tests/mobile/lifecycle.spec.ts::S2: all 4 players background briefly then foreground; state consistent` | ✅ verified | All pages remain usable and the auction retains one active bidder. |
| Screen lock / long background | Real phones suspend JS and often drop the socket. | Synthetic hidden state plus offline/online heartbeat loss. | `e2e/tests/mobile/lifecycle.spec.ts::B3: offline+background simulating long background; socket reconnects on return`; `::S3: foreground requests authoritative state synchronization` | ⚠️ partial | Socket recovers and foreground emits `sync:request`; real OS timer suspension and bfcache behavior differ per device. See [ML-01](#ml-01-browser-emulation-boundaries). |
| Offline↔online and backoff | Flaky radio transitions are normal during a game. | `context.setOffline`, heartbeat disconnect, Socket.IO reconnect polling. | `e2e/tests/mobile/network.spec.ts::N1: socket reconnects and connection indicator recovers after offline→online`; `::N5: network-level drop; socket.io reconnects automatically` | ✅ verified | Actual socket reconnects within the configured backoff window. There is no proactive `online` listener, so recovery is not instant. |
| Mid-action connectivity loss | A move sent at disconnect must be neither lost nor duplicated. | Disconnect active bidder, tap Pass while disconnected, restore network, then continue auction. | `e2e/tests/mobile/network.spec.ts::N2: mid-action connectivity loss neither drops nor duplicates a pass` | ✅ verified | Exactly one pass advances to the next bidder; the following valid bid advances again. |
| REST timeout/error handling | A failed score fetch must not silently show stale/empty data. | Abort score-table route during round completion. | `e2e/tests/mobile/network.spec.ts::N3: score-table fetch blocked mid-request; UI shows error (not silent failure)` | ✅ verified | N3 passes: aborting the score-table route now surfaces a visible error state (not silent failure). Full-suite run: 44 passed / 44 total. |
| Full round on slow 3G | Latency and low bandwidth must not break game progression. | CDP 250 kbps down/50 kbps up/300 ms RTT. | `e2e/tests/mobile/network.spec.ts::N4: full round completes under 3G throttle (250kbps, 300ms RTT)` | ✅ verified | N4 passes: full round completes under 3G throttle (250 kbps down / 50 kbps up / 300 ms RTT) in 46 s. Full-suite run: 44 passed / 44 total. |
| Reload/reconnect on slow 3G | Mobile browsers reload evicted tabs on weak networks. | CDP 3G throttle during page reload and socket/state polling. | `e2e/tests/mobile/pwa.spec.ts::Th2: socket reconnects after a page reload under 3G throttle` | ✅ verified | After reload under 3G, the socket reconnects and `sync:state` restores the bidding DOM. Th2 passes. |
| Packet-loss behavior | Cellular links lose packets, not only bandwidth. | No faithful packet-loss primitive in this Chromium harness. | `e2e/tests/mobile/network.spec.ts::N1: socket reconnects and connection indicator recovers after offline→online`; `::N4: full round completes under 3G throttle (250kbps, 300ms RTT)` | ⚠️ partial | Offline and throughput/latency are covered; stochastic loss needs a proxy/device lab. See [ML-01](#ml-01-browser-emulation-boundaries). |
| Tab close and reopen | Accidental tab closure should allow room recovery and presence restoration. | Close page, open a new page in the same authenticated context. | `e2e/tests/mobile/recovery.spec.ts::R1: tab close mid-bidding; reopen sees live game state` | ⚠️ partial | Game UI returns, but the test does not yet prove other clients saw exact disconnect/reconnect presence events. See [ML-02](#ml-02-presence-event-proof-is-incomplete). |
| Active-bidder tab close | One interrupted player must not deadlock three others. | Close whichever page currently owns `bidding-pass`; poll other players. | `e2e/tests/mobile/recovery.spec.ts::R2: tab close on own bid turn auto-advances without deadlocking the table` | ✅ verified | Server auto-passes the disconnected bidder; other players receive bid:your_turn within the same disconnect event. |
| Browser kill / relaunch state | OS process eviction must restore auth, room, phase, and turn. | Close context, create a fresh context from live storage state, navigate to room. | `e2e/tests/mobile/pwa.spec.ts::P1: JWT auth token persists across context close + reopen`; `e2e/tests/mobile/recovery.spec.ts::R3: context close + new context; JWT from storage state re-authenticates automatically` | ✅ verified | Both R3 and P1 pass: JWT re-authenticates from storage state, bidding phase restores and controls are visible within 10 s. Full-suite run: 44 passed / 44 total. |
| Virtual keyboard focus/resize | The keyboard halves usable height and can cover form actions. | Focus inputs and shrink viewport to 375×350, then restore it. | `e2e/tests/mobile/touch.spec.ts::K1: room join form accessible with simulated keyboard-open viewport (375×350)`; `::K2: display name input value retained after blur` | ⚠️ partial | Focus, value retention, and scroll-reachable submit pass; native VisualViewport/IME behavior needs devices. See [ML-01](#ml-01-browser-emulation-boundaries). |
| Room-code keyboard attributes | Autocorrect can silently mutate shared room codes. | Inspect input attributes in mobile context. | `e2e/tests/mobile/touch.spec.ts::K3: room-code input does not have autocorrect enabled` | ✅ verified | Input now carries `autoCorrect="off"`, `autoCapitalize="characters"`, `autoComplete="off"`, and `spellCheck={false}`. |
| Browser back/forward interruption | In-browser navigation must not strand an active player. | `goBack()` then `goForward()` during bidding. | `e2e/tests/mobile/touch.spec.ts::G1: browser back then forward recovers the active mobile game` | ✅ verified | G1 passes: back/forward navigation now restores the active game; bid controls are reachable after returning forward. Full-suite run: 44 passed / 44 total. |
| Room-code paste/share sheet | Players commonly paste codes from messaging apps. | `fill()` paste-equivalent in touch context. | `e2e/tests/mobile/touch.spec.ts::X3: room code paste (fill) correctly joins the room` | ✅ verified | Pasted code joins the intended room. |
| PWA manifest/install metadata | Standalone launch needs valid metadata and resolvable icons. | Fetch manifest and every declared icon. | `e2e/tests/mobile/pwa.spec.ts::P2: /manifest.json is served with required PWA fields` | ✅ verified | P2 passes: manifest is served with all required PWA fields and declared icons resolve with 2xx responses. Full-suite run: 44 passed / 44 total. |
| Standalone/offline relaunch | An installed game should recover after browser eviction or radio loss. | Inspect service-worker registrations/controller. | `e2e/tests/mobile/pwa.spec.ts::P3: installed scope has an active service worker for offline relaunch` | ✅ verified | P3 passes: an active service worker registration and controller are now present in the installed scope. Full-suite run: 44 passed / 44 total. |
| Session/token persistence | Relaunch must not force login in the middle of a game. | Live `storageState` transferred into a new mobile context. | `e2e/tests/mobile/recovery.spec.ts::R3: context close + new context; JWT from storage state re-authenticates automatically`; `e2e/tests/mobile/pwa.spec.ts::P1: JWT auth token persists across context close + reopen` | ✅ verified | Both R3 and P1 pass: JWT persists and bidding phase restores after context reopen. Full-suite run: 44 passed / 44 total. |
| CPU throttling | Low-end phones must not lose rapid input updates. | CDP 4× CPU slowdown. | `e2e/tests/mobile/pwa.spec.ts::Th1: bid counter remains exact under 4x CPU throttle` | ✅ verified | Five taps produce exactly +5 under throttle. |
| Connection indicator accuracy | Players need to know whether an action can reach the server. | Compare recovery UI with actual socket behavior after reload/navigation. | `e2e/tests/mobile/touch.spec.ts::G1: browser back then forward recovers the active mobile game`; `e2e/tests/mobile/pwa.spec.ts::Th2: socket reconnects after a page reload under 3G throttle` | ✅ verified | G1 passes: back/forward navigation no longer leaves the indicator Disconnected; bid controls are reachable on return. Th2 also passes. Full-suite run: 44 passed / 44 total. |

## Emulation limitations

### ML-01 Browser emulation boundaries

Desktop Chromium cannot faithfully emulate iOS Safari timer suspension, native incoming-call overlays,
real screen lock/process eviction, notch inset values, native IME/VisualViewport behavior, orientation
sensors/locks, or stochastic cellular packet loss. The suite covers browser-observable proxies; these
items require a physical-device/network-proxy acceptance pass before release.

### ML-02 Presence-event proof is incomplete

`R1` proves that the closed player can reopen the live game, but it does not yet assert the exact
`room:player_disconnected` and `room:player_reconnected` events on another client's UI. Presence recovery
therefore remains partial even though re-entry works.

## How this file is kept honest

- Every ✅ row names a deterministic test that must pass with `workers: 1` and `retries: 0`.
- Every ⚠️ or ❌ row links to an `MR-*` defect or `ML-*` emulation limitation above.
- A known-defect test remains red; it is never skipped, softened, caught, or relabeled green.
- Game-state claims use both UI and backend assertions where a durable backend representation exists.
- No arbitrary sleeps are used for state convergence. Polling waits on DOM, socket, backend, or browser
  lifecycle state. The only timed interval is the deliberate duration of the synthetic long-press gesture.
- Update statuses only from a fresh complete `npm test` result. Preserve the exact pass/fail/skip/flaky
  summary in the change report; do not infer success from source inspection.
