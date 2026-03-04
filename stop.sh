#!/usr/bin/env bash
# ============================================================
# Dark Velocity — stop.sh
# Stops backend + frontend dev servers
# ============================================================
pkill -f "node.*server/index.js" 2>/dev/null && echo "[OK] Backend stopped"   || echo "[--] Backend was not running"
pkill -f "vite"                  2>/dev/null && echo "[OK] Frontend stopped"   || echo "[--] Frontend was not running"
rm -f /tmp/dv-backend.pid /tmp/dv-frontend.pid
echo "Done."
