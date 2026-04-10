# Agent Firewall 项目总结 (Project Summary)

## 一、 项目概述

**Agent Firewall** 是一个针对 AI Agent 通信的 **零信任安全网关 (Zero-Trust Security Gateway)**。
它作为一个中心化的中间人 (MITM) 代理工作，核心目的是拦截、检查并管控 AI Agent 与各种工具服务器 (Tool Servers) 之间基于 MCP (Model Context Protocol) 的 JSON-RPC 流量。通过强大的双层安全防御机制（L1 静态分析 + L2 语义判定），它能有效防止恶意提示词注入 (Prompt Injection) 和越权危险操作。

## 二、 技术栈架构 (Tech Stack)

项目采用了现代化的前后端分离架构：

### 1. 后端 (Backend)

- **语言 & 框架:** Python 3.12+ / FastAPI + Uvicorn (异步 HTTP / WebSocket 服务器)
- **核心库:**
  - `Pydantic v2` (严格的数据结构验证)
  - `ahocorasick-rs` (基于 Rust 的底层 Aho-Corasick 自动机模式匹配，保障极致性能)
  - `orjson` (高性能 JSON 序列化)
  - `httpx` (异步 HTTP 客户端，用于 LLM 网关请求)

### 2. 前端 (Frontend)

- **框架:** Vue 3 (Composition API)
- **脚手架 & 语言:** Vite 6 / TypeScript 5.7
- **通信:** 原生 WebSocket + Fetch API (实现实时 Dashboard 监控面板)

## 三、 核心模块与功能

### 1. 双层分析引擎 (Dual-Layer Analysis Engine)

位于 `src/engine/`，是防火墙的安全基石：

- **L1 静态分析 (Static Analyzer):** 利用 Aho-Corasick 算法进行超高并发的字符串匹配和正则拦截，针对已知特征（如高危内核命令 `rm -rf`, 核心凭据读取等）进行阻断。
- **L2 语义分析 (Semantic Analyzer):** 采用 LLM 裁判 (Classifier) 在语境层面智能捕获未知攻击，评估请求意图的危险等级。

### 2. 协议转换与代理 (Transport Adapters)

位于 `src/proxy/`，无缝桥接不同的 Agent 通信形式：

- 支持 **SSE (Server-Sent Events)**、**WebSocket** 以及本地命令行 **stdio** 适配代理。
- `openai_adapter` 提供对通用模型接口的兼容。

### 3. 多重 Agent 配置体系

根据 `AGENTS.md`：

- **身份隔离:** 不同角色 (如主控 main, 编码助理 coder) 具有独立的身份信息及路由控制。
- **沙箱隔离 (Sandboxing):** 要求有文件系统或 Shell 权限的 Agent 必须运行于隔离沙箱 (如 Docker 容器) 中。
- **技能管控 (Skills):** 精确限定每个 Agent 可触发的 Tool 范围，白名单与黑名单并存。

### 4. 实时仪表盘与基准监控 (Dashboard & Benchmark)

- 提供丰富的 UI：监控流量 (Traffic)、引擎设置与管控规则合并的配置页 (设置页)、速率限制状态以及审计日志追踪 (Audit Logging，异步 JSONL 归档)。
- 内置基准测试 (Benchmark) 能力，可自动生成大量对抗测试用例并支持 HTTP 429 容错重试。

## 四、 核心代码目录结构

```text
./
├── src/                          # FastAPI 核心业务逻辑
│   ├── main.py                   # 服务入口、路由与生命周期管理
│   ├── config.py                 # 环境变量驱动的防护规则与配置模块
│   ├── engine/                   # 【安全大脑】L1静态分析、L2语义分析引擎
│   ├── proxy/                    # 【通信代理】不同协议的代理网关(SSE, WS等)
│   ├── audit/                    # 【日志审计】高性能 JSONL 持久化
│   └── dashboard/                # 【管理后端】为 Vue UI 提供数据流
├── frontend/                     # Vue 3 监控与管理系统代码
│   └── src/components/           # 控制台面板 (包含最近重构合并的“设置页”)
└── tests/                        # 单元测试及 Red Team 模拟攻击脚本库
```

## 五、 项目愿景

为广泛接入大模型的 Agent 生态提供一道透明、低延迟且高度可控的“防火墙”，在享受大模型赋能自动化的同时，构建“代码驱动”的安全控制层，确保所有与执行环境的物理/虚拟交互均在安全约束下进行。
