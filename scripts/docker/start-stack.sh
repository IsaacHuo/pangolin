#!/usr/bin/env bash
set -euo pipefail

cd /app

export NUXT_TELEMETRY_DISABLED="${NUXT_TELEMETRY_DISABLED:-1}"
export AF_LISTEN_HOST="${AF_LISTEN_HOST:-0.0.0.0}"
export AF_LISTEN_PORT="${AF_LISTEN_PORT:-9090}"
export OPENCLAW_GATEWAY_PORT="${OPENCLAW_GATEWAY_PORT:-19001}"
export OPENCLAW_GATEWAY_TOKEN="${OPENCLAW_GATEWAY_TOKEN:-docker-dev-token}"
export AF_UPSTREAM_HOST="${AF_UPSTREAM_HOST:-127.0.0.1}"
export AF_UPSTREAM_PORT="${AF_UPSTREAM_PORT:-${OPENCLAW_GATEWAY_PORT}}"
export AF_TRANSPORT_MODE="${AF_TRANSPORT_MODE:-websocket}"
export HOST="${HOST:-0.0.0.0}"
export PORT="${PORT:-3000}"
export NUXT_PUBLIC_API_BASE="${NUXT_PUBLIC_API_BASE:-http://localhost:${AF_LISTEN_PORT}}"
export NUXT_PUBLIC_AGENT_API_BASE="${NUXT_PUBLIC_AGENT_API_BASE:-http://localhost:${AF_LISTEN_PORT}}"

backend_cmd=(.venv/bin/uvicorn src.main:app --host "$AF_LISTEN_HOST" --port "$AF_LISTEN_PORT")
gateway_cmd=(pnpm gateway:dev)
frontend_cmd=(env NUXT_TELEMETRY_DISABLED="$NUXT_TELEMETRY_DISABLED" pnpm pangolin:frontend:dev)

echo "[start] ${backend_cmd[*]}"
"${backend_cmd[@]}" &
backend_pid=$!

echo "[start] ${gateway_cmd[*]}"
"${gateway_cmd[@]}" &
gateway_pid=$!

echo "[start] ${frontend_cmd[*]}"
"${frontend_cmd[@]}" &
frontend_pid=$!

cleanup() {
  trap - INT TERM EXIT
  echo "[stop] shutting down stack"
  kill "$frontend_pid" "$gateway_pid" "$backend_pid" >/dev/null 2>&1 || true
  wait "$frontend_pid" >/dev/null 2>&1 || true
  wait "$gateway_pid" >/dev/null 2>&1 || true
  wait "$backend_pid" >/dev/null 2>&1 || true
}

trap cleanup INT TERM EXIT

echo "[ready] frontend=http://0.0.0.0:${PORT} backend=http://0.0.0.0:${AF_LISTEN_PORT} gateway=ws://0.0.0.0:${OPENCLAW_GATEWAY_PORT}"

while true; do
  if ! kill -0 "$backend_pid" >/dev/null 2>&1; then
    wait "$backend_pid"
    exit $?
  fi

  if ! kill -0 "$gateway_pid" >/dev/null 2>&1; then
    wait "$gateway_pid"
    exit $?
  fi

  if ! kill -0 "$frontend_pid" >/dev/null 2>&1; then
    wait "$frontend_pid"
    exit $?
  fi

  sleep 1
done
