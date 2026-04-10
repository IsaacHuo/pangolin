# Pangolin

Pangolin 是一个面向 Multi-Agent 与 MCP 工具链的零信任安全网关与运维平台。当前仓库将三部分能力整合在一起：

- Python 安全防火墙引擎（FastAPI）
- TypeScript Gateway / CLI / 运行时工具链
- Nuxt 运维前端（apps/pangolin-frontend）

适用场景：MCP 工具调用审计、恶意指令拦截、LLM 越权防护、Agent 运维可视化、策略管理与对抗测试。

## 🎯 核心能力

### 1) 防火墙与策略引擎（Python）

- 双层分析：L1 (高危过滤) + L2 (语义分析)
- 支持 MCP/LLM 请求拦截、审计日志、Dashboard 推送

### 2) 网关与运行时（TypeScript）

- 网关会话与鉴权（token/password）
- 技能调用、工具注册、协议与命令行集成

### 3) 运维前端（Nuxt 3 + Vuetify）

- 实时控制台：Pangolin Firewall、策略页、规则页、请求追踪
- 位置：`apps/pangolin-frontend`
- 前后端协同，默认通过 runtimeConfig 连接 9090 后端

## 🛠️ 技术栈

**后端 (Backend)**

- Python 3.12+ (FastAPI, Uvicorn, ahocorasick-rs)

**前端 (Frontend)**

- Nuxt 3 (Vue 3, Vite, Nitro) + Vuetify
- 位置：`apps/pangolin-frontend`

## 📁 核心目录结构

```text
.
├── apps/
│   └── pangolin-frontend/        # 🌟 最新主前端（Nuxt 3）
├── frontend/                     # [已废弃] 过时的 Vue 3 实验前端
├── src/
│   ├── main.py                   # FastAPI 入口
│   ├── config.py                 # 环境配置（AF_*）
│   ├── engine/                   # L1/L2 分析引擎
│   ├── proxy/                    # 代理与会话层
│   ├── routes/                   # API 路由 (rules/config/dashboard 等)
│   └── dashboard/                # WS Dashboard 推送
├── scripts/
│   └── pangolin-dev-up.sh        # 一键拉起后端+网关+前端
└── package.json                  # Node 脚本与依赖
```

## 🚀 快速启动 (多终端运行)

### 1. 安装后端依赖并运行 (Port: 9090)

```bash
uv venv .venv
source .venv/bin/activate
uv sync
make dev
```

> 后端检查入口：http://127.0.0.1:9090/health

### 2. 启动最新 Nuxt 前端 (Port: 3000)

使用 `apps/pangolin-frontend`，此为项目核心 Dashboard 组件！

```bash
cd apps/pangolin-frontend
pnpm install
pnpm dev
```

> 前端检查入口：http://localhost:3000/

### 3. 一键启动后端 + 网关 + 前端（根目录）

在根目录下可一键调用打包好的脚本：

```bash
pnpm pangolin:dev:all
```

## 🐳 Docker 部署（推荐用于系统验证）

如果希望在隔离环境中验证：

```bash
docker compose up -d --build
```

启动后可通过以下指令监控日志：

```bash
docker compose ps
docker compose logs -f
```

## ⚠️ 关于 "Agent Firewall" 历史命名

本项目历史上也曾探索名为 `Agent Firewall` 并在 `frontend/` 开发了一套原生 Vue SPA 面板。目前系统已全线更名为 **Pangolin** 并将前端重心切流至 `apps/pangolin-frontend/`。

## 📄 License

MIT
