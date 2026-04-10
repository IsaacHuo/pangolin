#!/usr/bin/env bash
set -euo pipefail

skip_install=0
skip_doctor=0
reset_gateway=0

usage() {
  cat <<'USAGE'
Usage: pnpm pangolin:dev:all [--skip-install] [--skip-doctor] [--reset]

Options:
  --skip-install  Skip auto-install when node_modules is missing.
  --skip-doctor   Skip running the capability doctor before startup.
  --reset         Start gateway with runtime reset.
  -h, --help      Show this help.
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --skip-install)
      skip_install=1
      ;;
    --skip-doctor)
      skip_doctor=1
      ;;
    --reset)
      reset_gateway=1
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
  shift
done

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

if ! command -v pnpm >/dev/null 2>&1; then
  echo "[error] pnpm is required but not found in PATH." >&2
  exit 1
fi

if [[ -f ".env.local" ]]; then
  set -a
  # shellcheck disable=SC1091
  source ".env.local"
  set +a
fi

if [[ "$skip_install" -eq 0 && ! -d "node_modules" ]]; then
  echo "[setup] node_modules not found, running pnpm install..."
  pnpm install
fi

if [[ "$skip_doctor" -eq 0 ]]; then
  echo "[check] running capability doctor..."
  pnpm openclaw:doctor
fi

gateway_cmd=(pnpm gateway:dev)
if [[ "$reset_gateway" -eq 1 ]]; then
  gateway_cmd=(pnpm gateway:dev:reset)
fi

# Disable Nuxt telemetry prompt for non-interactive environments.
frontend_cmd=(env NUXT_TELEMETRY_DISABLED=1 pnpm pangolin:frontend:dev)
if ! command -v uv >/dev/null 2>&1; then
  export PATH="$HOME/.local/bin:$PATH"
fi
if ! command -v uv >/dev/null 2>&1; then
  echo "[error] uv is required but not found in PATH." >&2
  exit 1
fi

if [[ ! -x ".venv/bin/python" ]]; then
  echo "[setup] creating local virtual environment at .venv..."
  uv venv .venv
fi

if [[ ! -x ".venv/bin/uvicorn" ]]; then
  echo "[setup] uvicorn not found in .venv yet; dependencies will be synced."
fi

backend_cmd=(".venv/bin/uvicorn" "src.main:app" "--host" "127.0.0.1" "--port" "9090")

echo "[setup] syncing backend dependencies with uv..."
source .venv/bin/activate
uv sync

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
  echo
  echo "[stop] shutting down local services..."
  if kill -0 "$frontend_pid" >/dev/null 2>&1; then
    kill "$frontend_pid" >/dev/null 2>&1 || true
  fi
  if kill -0 "$gateway_pid" >/dev/null 2>&1; then
    kill "$gateway_pid" >/dev/null 2>&1 || true
  fi
  if kill -0 "$backend_pid" >/dev/null 2>&1; then
    kill "$backend_pid" >/dev/null 2>&1 || true
  fi
  wait "$frontend_pid" 2>/dev/null || true
  wait "$gateway_pid" 2>/dev/null || true
  wait "$backend_pid" 2>/dev/null || true
}

trap cleanup INT TERM EXIT

echo "[ready] Pangolin local stack is starting."
echo "[ready] Frontend: http://localhost:3000"
echo "[ready] Backend:  http://localhost:9090"
echo "[ready] Gateway:  ws://127.0.0.1:19001"
if [[ -n "${OPENROUTER_API_KEY:-}" ]]; then
  echo "[ready] OPENROUTER_API_KEY detected."
else
  echo "[warn] OPENROUTER_API_KEY is not set. OpenRouter calls may fail auth."
fi

stopped_service=""
exit_code=0

while true; do
  if ! kill -0 "$backend_pid" >/dev/null 2>&1; then
    stopped_service="backend"
    if wait "$backend_pid"; then
      exit_code=0
    else
      exit_code=$?
    fi
    break
  fi

  if ! kill -0 "$gateway_pid" >/dev/null 2>&1; then
    stopped_service="gateway"
    if wait "$gateway_pid"; then
      exit_code=0
    else
      exit_code=$?
    fi
    break
  fi

  if ! kill -0 "$frontend_pid" >/dev/null 2>&1; then
    stopped_service="frontend"
    if wait "$frontend_pid"; then
      exit_code=0
    else
      exit_code=$?
    fi
    break
  fi

  sleep 1
done

if [[ "$exit_code" -eq 0 ]]; then
  echo "[exit] ${stopped_service} exited normally."
else
  echo "[exit] ${stopped_service} exited with status ${exit_code}."
fi

exit "$exit_code"
