#!/bin/bash
lsof -ti :3000,9090,19001 | xargs -r kill -9
if ! command -v uv >/dev/null 2>&1; then
  export PATH="$HOME/.local/bin:$PATH"
fi
echo "Starting backend..."
uv run uvicorn src.main:app --host 127.0.0.1 --port 9090 &
# The backend will run on 9090
echo "Starting node gateway and frontend via pnpm..."
pnpm pangolin:dev:all --skip-install --skip-doctor &
wait
