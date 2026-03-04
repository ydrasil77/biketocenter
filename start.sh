#!/usr/bin/env bash
# ============================================================
# Dark Velocity — start.sh
# Starts the Socket.io backend + Vite frontend
# Logs go to /tmp/dv-backend.log and /tmp/dv-frontend.log
# Usage: bash start.sh
# ============================================================

set -e
ROOT="$(cd "$(dirname "$0")" && pwd)"
BACKEND_LOG="/tmp/dv-backend.log"
FRONTEND_LOG="/tmp/dv-frontend.log"
BACKEND_PID_FILE="/tmp/dv-backend.pid"
FRONTEND_PID_FILE="/tmp/dv-frontend.pid"

# ── Colours ──────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

log()  { echo -e "${CYAN}[DV]${RESET} $*"; }
ok()   { echo -e "${GREEN}[OK]${RESET} $*"; }
warn() { echo -e "${YELLOW}[!!]${RESET} $*"; }
fail() { echo -e "${RED}[ERR]${RESET} $*"; }

# ── Kill old processes ────────────────────────────────────
stop_old() {
  for PID_FILE in "$BACKEND_PID_FILE" "$FRONTEND_PID_FILE"; do
    if [[ -f "$PID_FILE" ]]; then
      OLD=$(cat "$PID_FILE")
      if kill -0 "$OLD" 2>/dev/null; then
        kill "$OLD" 2>/dev/null && warn "Stopped old process $OLD"
      fi
      rm -f "$PID_FILE"
    fi
  done
  # Belt + braces
  pkill -f "node.*server/index.js" 2>/dev/null || true
  pkill -f "vite"                  2>/dev/null || true
  sleep 0.5
}

# ── Wait for port ─────────────────────────────────────────
wait_for_port() {
  local PORT=$1 LABEL=$2 TIMEOUT=20 i=0
  while ! nc -z 127.0.0.1 "$PORT" 2>/dev/null; do
    sleep 0.5
    ((i++))
    if (( i >= TIMEOUT * 2 )); then
      fail "$LABEL did NOT start on :$PORT after ${TIMEOUT}s"
      fail "Last log lines:"
      tail -20 "$3" 2>/dev/null || true
      return 1
    fi
  done
  ok "$LABEL is up on :$PORT"
}

# ── Main ─────────────────────────────────────────────────
echo ""
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo -e "${BOLD}  DARK VELOCITY — DEV LAUNCHER${RESET}"
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo ""

stop_old

# ── Start backend ─────────────────────────────────────────
log "Starting Socket.io backend on :3001 …"
> "$BACKEND_LOG"
node "$ROOT/server/index.js" >> "$BACKEND_LOG" 2>&1 &
BACKEND_PID=$!
echo $BACKEND_PID > "$BACKEND_PID_FILE"
log "Backend PID: $BACKEND_PID  (log: $BACKEND_LOG)"

wait_for_port 3001 "Backend" "$BACKEND_LOG" || exit 1

# ── Start frontend ────────────────────────────────────────
log "Starting Vite frontend on :5173 …"
> "$FRONTEND_LOG"
cd "$ROOT" && npx vite --port 5173 --host >> "$FRONTEND_LOG" 2>&1 &
FRONTEND_PID=$!
echo $FRONTEND_PID > "$FRONTEND_PID_FILE"
log "Frontend PID: $FRONTEND_PID  (log: $FRONTEND_LOG)"

wait_for_port 5173 "Frontend" "$FRONTEND_LOG" || exit 1

# ── Summary ───────────────────────────────────────────────
echo ""
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
ok "All services running"
echo -e "  ${GREEN}▸ Rider/Instructor UI :${RESET}  http://localhost:5173"
echo -e "  ${GREEN}▸ Socket.io backend   :${RESET}  http://localhost:3001"
echo -e "  ${CYAN}▸ Backend log         :${RESET}  $BACKEND_LOG"
echo -e "  ${CYAN}▸ Frontend log        :${RESET}  $FRONTEND_LOG"
echo -e "  ${YELLOW}▸ Stop everything     :${RESET}  bash stop.sh"
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo ""
