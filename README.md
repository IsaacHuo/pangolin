# Pangolin (Pangolin)

**Pangolin** 是一个面向 AI Agent 与工具链通信的零信任安全网关。作为 MITM（中间人）代理，它通过双层分析引擎（L1 静态规则 + L2 语义判定），全面拦截并审计 Agent 与 Tool Servers 之间的 MCP (Model Context Protocol) JSON-RPC 流量。

适用场景：MCP 工具调用审计、恶意指令拦截、LLM 越权防护、Agent 运维可视化管理。

## 🎯 核心特性

- **🚀 双层防护引擎**
  - **L1 静态分析引擎**：基于 Rust `ahocorasick-rs` 与高危正则表达式的高性能语法过滤。
  - **L2 语义分析引擎**：基于 LLM（大语言模型）的意图识别拦截，判断隐藏在复杂指令中的越权行为。
- **🔌 灵活的协议支持**
  - 完全兼容 MCP (Model Context Protocol) JSON-RPC 规范。
  - 支持多种传输层接入：SSE (Server-Sent Events)、WebSocket 以及原生的 stdio MITM 代理。
- **📊 实时全景看板**
  - 提供现代化的响应式 Web 仪表盘 (Vue 3 + Vite)。
  - 支持流量实时监控、WebSocket 广播、审计日志在线查阅、以及 HITL（Human-in-the-loop）人工审核。
- **🛡️ 审计与合规**
  - 高性能异步 JSONL 审计日志记录。
  - 完善的 RBAC 规则管理与细粒度的策略（Policy）配置。

## 🛠️ 技术栈

**后端 (Backend)**

- Python 3.12+ (FastAPI, Uvicorn, Pydantic v2, ahocorasick-rs, orjson)

**前端 (Frontend)**

- Vue 3 (Composition API) + TypeScript 5.7
- Vite 6 + Native WebSocket

## 📁 核心目录结构

```text
.
├── src/                          # Python 后端源码
│   ├── main.py                   # FastAPI 应用入口文件
│   ├── config.py                 # 全局环境变量配置
│   ├── engine/                   # 双层分析引擎 (L1 静态 + L2 语义)
│   ├── proxy/                    # 传输层适配器 (SSE, WebSocket, stdio, OpenAI)
│   ├── routes/                   # API 路由控制器 (rules/config/dashboard 等)
│   ├── audit/                    # 异步 JSONL 审计日志系统
│   └── dashboard/                # WebSocket 实时广播中心
├── frontend/                     # Vue 3 前端控制台 (独立 SPA)
│   └── src/
│       ├── components/           # 页面级组件 (流量、规则、引擎、测试等)
│       └── composables/          # 全局响应式状态与逻辑抽象
├── tests/                        # Pytest 测试用例
│   └── red_team/                 # 红蓝对抗 (Red Team) 攻击模拟用例
├── docs/                         # 补充文档与框架资料
├── Makefile                      # 开发与运行核心指令
└── pyproject.toml                # Python 依赖与版本清单
```

## 🚀 快速启动

项目中后端使用 `uv`，前端使用 `npm` (或 `pnpm`) 组织，建议采用双终端本地开发。

### 1. 环境准备

```bash
# 激活 Python 虚拟环境与安装依赖
uv venv .venv
source .venv/bin/activate
uv sync

# 安装前端依赖
cd frontend
npm install
cd ..
```

### 2. 启动服务

**终端 A：启动后端网关 (Port: 9090)**

```bash
source .venv/bin/activate
make dev
```

**终端 B：启动前端开发服务器 (Port: 9091)**

```bash
cd frontend
npx vite --port 9091 --host
```

成功拉起后，访问入口：

- **前端控制台**：[http://127.0.0.1:9091](http://127.0.0.1:9091)
- **后端 API**：[http://127.0.0.1:9090](http://127.0.0.1:9090)

## 🐳 Docker 部署（推荐用于系统验证）

如果您希望在沙盒环境中全量预览或进行部署验证，可一键拉起：

```bash
docker compose up -d --build
```

启动后可通过以下指令监控日志：

```bash
docker compose ps
docker compose logs -f
```

## ⚙️ 环境变量与配置

系统遵循 12-Factor 理念，所有核心配置均通过环境变量注入（参见 `.env`）。
关键配置项参考：

- `AF_LISTEN_PORT` (默认: 9090) — 防火墙服务监听端口。
- `AF_UPSTREAM_HOST` / `AF_UPSTREAM_PORT` — 防火墙保护的下游目标 MCP Server 地址。
- `AF_L1_ENABLED` / `AF_L2_ENABLED` — L1 静态拦截与 L2 语义分析层总开关。
- `AF_L2_MODEL_ENDPOINT` / `AF_L2_API_KEY` — 驱动 L2 语义分析层的 LLM 接口信息。
- `AF_AUDIT_LOG` — 审计归档日志文件路径 (默认: `./audit/firewall.jsonl`)。

## 🧪 测试与安全检查

```bash
# 运行单元测试集
make test

# 执行 Red Team (红队) 攻击模拟
make attack

# 运行代码规范检测与自动格式化
make lint
make fmt
```

## 📄 License

本项目采用 [MIT License](./LICENSE) 开源协议。
