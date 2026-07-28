#!/usr/bin/env bash
#
# Put Whister behind one public HTTPS URL using a cloudflared quick tunnel.
#
# Quick-tunnel URLs are random and only known after cloudflared starts, but the
# frontend bakes NEXT_PUBLIC_WS_URL in at dev-server start and the backend reads
# CORS_ORIGINS at boot. So the order is forced: tunnel first, then write the
# config, then (re)start the two servers against it.
#
#   ./scripts/share.sh          start (or restart) sharing, print the URL
#   ./scripts/share.sh stop     tear down the tunnel and the dev server
#   ./scripts/share.sh url      print the current URL
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

EDGE_PORT="${EDGE_PORT:-8080}"
FRONTEND_PORT="${FRONTEND_PORT:-3001}"
CLOUDFLARED_BIN="${CLOUDFLARED_BIN:-cloudflared}"
STARTUP_TIMEOUT="${STARTUP_TIMEOUT:-60}"
READINESS_ATTEMPTS="${READINESS_ATTEMPTS:-60}"

RUN_DIR="$ROOT/.run"
TUNNEL_LOG="$RUN_DIR/cloudflared.log"
TUNNEL_PID="$RUN_DIR/cloudflared.pid"
FRONTEND_LOG="$RUN_DIR/frontend.log"
FRONTEND_PID="$RUN_DIR/frontend.pid"
URL_FILE="$RUN_DIR/public-url.txt"

mkdir -p "$RUN_DIR"

log() { printf '\033[1;36m==>\033[0m %s\n' "$*"; }
err() { printf '\033[1;31mERROR:\033[0m %s\n' "$*" >&2; }

# Dev servers spawn children (npm -> next), so track and signal the whole
# process group; killing the parent alone orphans the real listener.
stop_group() {
  local pidfile="$1" name="$2"
  [[ -f "$pidfile" ]] || return 0
  local pid
  pid="$(cat "$pidfile" 2>/dev/null || true)"
  rm -f "$pidfile"
  [[ -n "$pid" ]] || return 0
  kill -0 "$pid" 2>/dev/null || return 0

  # Only signal the group if this pid actually leads one. A stale or mistracked
  # pid can otherwise name a group belonging to something else entirely.
  local pgid
  pgid="$(ps -o pgid= -p "$pid" 2>/dev/null | tr -d ' ')"
  if [[ "$pgid" != "$pid" ]]; then
    err "$name pid $pid is not a group leader (pgid ${pgid:-unknown}); signalling it alone"
    kill -TERM "$pid" 2>/dev/null || true
    return 0
  fi

  log "stopping $name (pgid $pid)"
  kill -TERM -- "-$pid" 2>/dev/null || kill -TERM "$pid" 2>/dev/null || true
  for _ in $(seq 1 20); do
    kill -0 "$pid" 2>/dev/null || return 0
    sleep 0.5
  done
  kill -KILL -- "-$pid" 2>/dev/null || kill -KILL "$pid" 2>/dev/null || true
}

cmd_stop() {
  stop_group "$TUNNEL_PID" "cloudflared"
  stop_group "$FRONTEND_PID" "frontend"
  rm -f "$URL_FILE"
  log "sharing stopped (backend and edge left running)"
}

cmd_url() {
  if [[ -s "$URL_FILE" ]]; then
    cat "$URL_FILE"
  else
    err "no active tunnel; run '$0' first"
    exit 1
  fi
}

# Replace KEY=... in an env file, appending if absent. Values here contain URLs
# and JSON, so match on the key only and never interpret the value.
set_env_var() {
  local file="$1" key="$2" value="$3"
  touch "$file"
  if grep -q "^${key}=" "$file"; then
    local tmp
    tmp="$(mktemp)"
    grep -v "^${key}=" "$file" > "$tmp"
    printf '%s=%s\n' "$key" "$value" >> "$tmp"
    mv "$tmp" "$file"
  else
    printf '%s=%s\n' "$key" "$value" >> "$file"
  fi
}

cmd_start() {
  command -v "$CLOUDFLARED_BIN" >/dev/null 2>&1 || {
    err "$CLOUDFLARED_BIN not found on PATH"
    exit 1
  }

  # Clear out any previous run before rewiring config underneath it.
  stop_group "$TUNNEL_PID" "cloudflared"
  stop_group "$FRONTEND_PID" "frontend"

  log "starting edge proxy and backend"
  docker compose up -d edge backend >/dev/null

  log "opening cloudflared quick tunnel to :$EDGE_PORT"
  : > "$TUNNEL_LOG"
  setsid "$CLOUDFLARED_BIN" tunnel --url "http://localhost:${EDGE_PORT}" \
    >>"$TUNNEL_LOG" 2>&1 &
  echo $! > "$TUNNEL_PID"

  local public_url="" waited=0
  while (( waited < STARTUP_TIMEOUT )); do
    public_url="$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$TUNNEL_LOG" | head -1 || true)"
    [[ -n "$public_url" ]] && break
    kill -0 "$(cat "$TUNNEL_PID")" 2>/dev/null || {
      err "cloudflared exited before printing a URL; see $TUNNEL_LOG"
      exit 1
    }
    sleep 1
    (( waited++ )) || true
  done

  if [[ -z "$public_url" ]]; then
    err "timed out after ${STARTUP_TIMEOUT}s waiting for a tunnel URL; see $TUNNEL_LOG"
    cmd_stop
    exit 1
  fi
  log "tunnel URL: $public_url"
  printf '%s\n' "$public_url" > "$URL_FILE"

  # Same origin for page and socket, so the socket URL is just the tunnel and
  # CORS only has to admit that one origin. The API proxy runs server-side and
  # keeps talking to the backend over localhost.
  log "wiring frontend and backend config"
  set_env_var "$ROOT/frontend/.env.local" NEXT_PUBLIC_API_URL "http://localhost:8001"
  set_env_var "$ROOT/frontend/.env.local" NEXT_PUBLIC_WS_URL "$public_url"
  set_env_var "$ROOT/.env" CORS_ORIGINS \
    "[\"http://localhost:${FRONTEND_PORT}\",\"${public_url}\"]"

  log "restarting backend with the new allowed origin"
  docker compose up -d backend >/dev/null

  log "starting frontend dev server on :$FRONTEND_PORT"
  : > "$FRONTEND_LOG"
  # `exec` matters: without it $! is the wrapping subshell, whose process group
  # is the script's own -- signalling it on stop would hit unrelated processes
  # and leave the dev server orphaned on the port. exec replaces the subshell
  # with setsid, so $! is the new session leader and PID == PGID.
  ( cd "$ROOT/frontend" && exec setsid npm run dev -- -p "$FRONTEND_PORT" \
      >>"$FRONTEND_LOG" 2>&1 ) &
  echo $! > "$FRONTEND_PID"

  # Only the public URL proves the whole chain: tunnel -> nginx -> Next.
  # Keep per-attempt timeouts short and report progress: a cold edge can stall a
  # single request for its full timeout, which is indistinguishable from a hang.
  log "waiting for the public URL to serve the app"
  local ok=0 attempt=0 code
  for attempt in $(seq 1 "$READINESS_ATTEMPTS"); do
    code="$(curl -s -o /dev/null -m 5 -w '%{http_code}' "${public_url}/login" || true)"
    if [[ "$code" == "200" ]]; then
      ok=1
      log "app reachable after ${attempt} attempt(s)"
      break
    fi
    (( attempt % 5 == 0 )) && log "  still waiting (attempt ${attempt}/${READINESS_ATTEMPTS}, last status ${code:-none})"
    sleep 2
  done

  if (( ! ok )); then
    err "tunnel is up but ${public_url}/login never returned 200"
    err "check $FRONTEND_LOG and $TUNNEL_LOG"
    exit 1
  fi

  # The socket handshake is the part most likely to be misconfigured, and it
  # fails silently in the UI, so assert it here rather than at the table.
  local handshake
  handshake="$(curl -s -o /dev/null -m 15 -w '%{http_code}' \
    -H "Origin: ${public_url}" \
    "${public_url}/ws/socket.io/?EIO=4&transport=polling" || true)"
  if [[ "$handshake" != "200" ]]; then
    err "socket.io handshake through the tunnel returned $handshake (want 200)"
    exit 1
  fi

  printf '\n\033[1;32m  Whister is live at: %s\033[0m\n\n' "$public_url"
  printf '  socket handshake: ok    stop with: %s stop\n\n' "$0"
}

case "${1:-start}" in
  start) cmd_start ;;
  stop)  cmd_stop ;;
  url)   cmd_url ;;
  *)     err "usage: $0 [start|stop|url]"; exit 1 ;;
esac
