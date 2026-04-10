FROM node:22-bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
    build-essential \
    python3 \
    python3-dev \
    python3-venv \
    python3-pip \
    bash \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

RUN python3 -m pip install --no-cache-dir --break-system-packages uv

WORKDIR /app

COPY . .

RUN corepack enable \
    && pnpm install --frozen-lockfile

RUN uv venv .venv \
    && . .venv/bin/activate \
    && uv sync --frozen

RUN chmod +x scripts/docker/start-stack.sh

EXPOSE 3000 9090 19001

CMD ["bash", "scripts/docker/start-stack.sh"]
