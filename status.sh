#!/usr/bin/env bash
# ============================================================
# Dark Velocity — status.sh
# Shows running processes and last log lines for both servers
# ============================================================
GREEN='\033[0;32m'; RED='\033[0;31m'; CYAN='\033[0;36m'; RESET='\033[0m'

check() {
  local LABEL=$1 PORT=$2 LOG=$3
  if nc -z 127.0.0.1 "$PORT" 2>/dev/null; then
    echo -e "${GREEN}[UP]${RESET}  $LABEL  →  http://localhost:$PORT"
  else
    echo -e "${RED}[DOWN]${RESET} $LABEL (port $PORT not responding)"
  fi
  if [[ -f "$LOG" ]]; then
    echo -e "${CYAN}  Last 5 lines of $LOG:${RESET}"
    tail -5 "$LOG" | sed 's/^/    /'
  fi
  echo ""
}

echo ""
check "Backend  (Socket.io)" 3001 "/tmp/dv-backend.log"
check "Frontend (Vite)      " 5173 "/tmp/dv-frontend.log"
