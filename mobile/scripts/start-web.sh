#!/usr/bin/env bash
# Starts the local web version of DraftGem: the CORS proxy (:8787) and the Expo web dev server (:8081).
# Open http://localhost:8081 in the browser. Ctrl+C stops both.
export NVM_DIR="$HOME/.nvm"
. "$NVM_DIR/nvm.sh"
nvm use 24 >/dev/null

cd "$(dirname "$0")/.."

# A previous run (or a forgotten window) may still hold the ports: free them so the page is always on :8081.
for port in 8081 8787; do
  pids=$(ss -ltnp 2>/dev/null | grep ":$port " | grep -o 'pid=[0-9]*' | cut -d= -f2 | sort -u)
  [ -n "$pids" ] && kill $pids 2>/dev/null
done
sleep 1

node scripts/web-dev-proxy.js &
PROXY_PID=$!
trap 'kill $PROXY_PID 2>/dev/null' EXIT

EXPO_PUBLIC_WORKER_URL=http://localhost:8787 BROWSER=none npx expo start --web --port 8081
