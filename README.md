# Pangolin

Pangolin 是一个面向 Multi-Agent 与 MCP 工具链的零信任安全网关与运维平台。当前仓库将三部分能力整合在一起：

- Python 安全防火墙引擎（FastAPI）
- TypeScript Gateway / CLI / 运行时工具链
- Nuxt 运维前端（apps/pangolin-frontend）

适用场景：MCP 工具调用审计、LLM 请求防护、Agent 运维可视化、策略管理与对抗测试。

## 核心能力

### 1) 防火墙与策略引擎（Python）

- 双层分析：L1 静态规则 + L2 语义判定
- 支持 MCP/LLM 请求拦截、审计日志、Dashboard 推送
- 内置策略、规则、数据集、追踪、场景与 Agent Studio 路由
- 支持 JSONL 存储（可通过环境变量切换后端）

### 2) 网关与运行时（TypeScript）

- 网关会话与鉴权（token/password）
- 技能调用、工具注册、协议与命令行集成
- 多脚本编排（dev/build/test/doctor/audit）

### 3) 运维前端（Nuxt + Vuetify）

- 实时控制台：MCP Firewall、策略页、规则页、请求追踪
- 前后端分离，默认通过 runtimeConfig 连接 9090 后端

## 仓库结构（核心目录）

```text
.
├── apps/
│   └── pangolin-frontend/        # 主前端（Nuxt）
├── src/
│   ├── main.py                   # FastAPI 入口
│   ├── config.py                 # 环境配置（AF_*）
│   ├── engine/                   # L1/L2 分析引擎
│   ├── proxy/                    # 代理与会话层
│   ├── routes/                   # models/policies/rules/scenarios 等 API
│   └── dashboard/                # WS Dashboard 推送
├── scripts/
│   └── pangolin-dev-up.sh        # 一键拉起后端+网关+前端
├── package.json                  # Node 脚本与依赖
├── pyproject.toml                # Python 依赖（uv）
├── start-all.sh                  # 便捷启动脚本（可选）
└── Makefile                      # Python 侧常用命令
```

说明：ai-protector-main 目录主要用于上游参考与历史对照，当前主运行入口是本仓库根目录 + apps/pangolin-frontend。

## 环境要求

- Node.js >= 22.12
- pnpm >= 10
- Python >= 3.10（推荐 3.12）
- uv

## 本地启动（推荐开发）

本地启动适合日常开发调试，启动更快，日志更直接。

### 1. 安装依赖

```bash
pnpm install
uv venv .venv
source .venv/bin/activate
uv sync
```

### 2. 一键启动后端 + 网关 + 前端

```bash
pnpm pangolin:dev:all
```

默认服务地址：

- 前端：http://127.0.0.1:3000（若占用会自动回退到 3001）
- 后端：http://127.0.0.1:9090
- Gateway：ws://127.0.0.1:19001

### 3. 验证启动是否成功

```bash
curl -sS http://127.0.0.1:9090/health
curl -sSI http://127.0.0.1:3000 | head -n 1
nc -zv 127.0.0.1 19001
```

### 4. 按模块分开启动（可选）

终端 A（后端）：

```bash
source .venv/bin/activate
uv run uvicorn src.main:app --host 127.0.0.1 --port 9090
```

终端 B（网关）：

```bash
pnpm gateway:dev
```

终端 C（前端）：

```bash
pnpm pangolin:frontend:dev
```

## Docker 启动（推荐部署验证）

Docker 启动适合部署前验收、环境一致性验证，以及服务器运行。

### 1. 一键构建并启动

```bash
docker compose up -d --build
```

默认服务地址：

- 前端：http://localhost:3000
- 后端：http://localhost:9090
- Gateway：ws://localhost:19001

### 2. 验证启动是否成功

```bash
docker compose ps
docker compose logs --tail=120
curl -sS http://127.0.0.1:9090/health
```

### 3. 常用运维命令

```bash
docker compose logs -f
docker compose restart
docker compose down
```

### 4. 可选环境变量（建议放到 `.env`）

- OPENROUTER_API_KEY：上游模型访问密钥
- AF_L2_API_KEY：L2 语义模型密钥（可与 OPENROUTER_API_KEY 相同）
- OPENCLAW_GATEWAY_TOKEN：网关 token（默认 docker-dev-token）

### 5. 常见问题

- `docker compose up -d --build` 失败：先看 `docker compose logs --tail=200`，再确认本机 Docker 可用。
- 前端能开但请求失败：确认后端健康检查 `http://127.0.0.1:9090/health` 返回 `ok`。
- 端口冲突：释放 3000/9090/19001 端口后重试。

## 常用命令

### Node / 前端 / 网关

```bash
pnpm pangolin:dev:all        # 一键开发模式
pnpm gateway:dev             # 仅网关
pnpm pangolin:frontend:dev   # 仅前端
pnpm check                   # format + tsgo + lint
pnpm tsgo                    # TS 类型检查
pnpm lint                    # Oxlint
pnpm test                    # Vitest（并行脚本）
pnpm build                   # 构建
pnpm openclaw:doctor         # 能力自检
pnpm phase6:audit:legacy     # 结构审计
```

### Python / 防火墙

```bash
make dev                     # 后端热更新（9090）
make test                    # pytest
make attack                  # red team 对抗模拟
make lint                    # ruff check
make fmt                     # ruff format
```

## 关键环境变量

可参考：.env.example、.env.agent-firewall.example。

常用项如下：

- OPENCLAW_GATEWAY_TOKEN：网关鉴权 token
- OPENROUTER_API_KEY：OpenRouter 密钥（L2/聊天场景常用）
- AF_LISTEN_HOST / AF_LISTEN_PORT：防火墙监听地址（默认 127.0.0.1:9090）
- AF_UPSTREAM_HOST / AF_UPSTREAM_PORT：上游目标（本项目常见为 127.0.0.1:19001）
- AF_L1_ENABLED / AF_L2_ENABLED：开关静态/语义层
- AF_L2_MODEL_ENDPOINT / AF_L2_API_KEY / AF_L2_MODEL：L2 模型配置
- AF_AUDIT_LOG：审计日志路径（默认 ./audit/firewall.jsonl）
- AF_STORAGE_BACKEND / AF_STORAGE_PATH：存储后端与路径（默认 jsonl + ./data）

## API 与页面入口

- 后端健康检查：/health
- OpenAPI：/openapi.json
- 典型业务路由：/v1/models、/v1/policies、/v1/rules、/v1/scenarios、/api/v1/dataset、/api/v1/trace、/api/agent-studio/\*
- Dashboard WS：/ws/dashboard
- 前端主页面：/
- 防火墙页面：/mcp-firewall

## 常见问题

### 为什么有时是 3000，有时是 3001？

Nuxt 默认端口是 3000；当 3000 被占用时会自动回退到 3001。通常只会有一个前端进程，属于端口回退行为，不是两套前端同时必然运行。

### 为什么策略页看起来没有保存？

先确认后端进程是否为最新代码，再检查 /v1/policies 返回内容；必要时重启 9090 后端并刷新前端页面。

## 开发建议

- 提交前运行 pnpm check 与 make test（或对应子集）
- 避免将 `audit/*.jsonl`、`data/*.jsonl` 运行时数据直接提交到功能 PR
- 文档更新建议与代码改动同次提交，保持使用说明与实现一致

## CI/CD

仓库已提供 GitHub Actions：

- CI: `.github/workflows/ci.yml`
  - 触发：PR、push 到 main
  - 执行：`pnpm check`、`pnpm test:fast`、`make test`、构建 CLI/前端、`docker build`
- CD: `.github/workflows/cd-image.yml`
  - 触发：push 到 main、`v*` tag、手动触发
  - 执行：自动构建并推送镜像到 `ghcr.io/<owner>/<repo>/pangolin`

如果需要在服务器自动发布，可在部署机执行：

```bash
docker pull ghcr.io/<owner>/<repo>/pangolin:latest
docker stop pangolin || true
docker rm pangolin || true
docker run -d --name pangolin \
	-p 3000:3000 -p 9090:9090 -p 19001:19001 \
	-e OPENROUTER_API_KEY=... \
	-e AF_L2_API_KEY=... \
	ghcr.io/<owner>/<repo>/pangolin:latest
```

## License

MIT
