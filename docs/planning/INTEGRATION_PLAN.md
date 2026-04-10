# 集成计划（Gateway-First，Phase 6 版）

## 目标

将安全网关、Agent 编排、渠道插件与前端运维能力统一到主线目录中，逐步解除对历史目录结构的耦合。

核心原则：

- 保留能力，不保留历史路径心智。
- 先可测，再迁移，再删除。
- 文档、脚本、命令入口必须与主线运行方式一致。

## 当前基线架构

### 运行时主线

- 网关与协议：`src/gateway/`
- Agent 与策略：`src/agents/`
- 渠道插件：`src/channels/` + `channel/`
- 安全审计：`src/security/`
- 技能目录：`skills/`

### 运维前端

- 应用目录：`apps/pangolin-frontend/`
- 防火墙页面：`app/pages/mcp-firewall.vue`
- 分诊主状态：`app/composables/useFirewallOpsConsole.ts`

## 阶段进展

- Phase 0-5：功能演进已完成（队列治理、SLA、统一流量、双向联动等）。
- Phase 6（进行中）：仓库收口与遗留路径去耦。

## Phase 6 执行清单

### 已完成

- 新增遗留路径审计脚本：`scripts/phase6-legacy-path-audit.mjs`
- 新增 npm 门禁命令：
  - `pnpm phase6:audit:legacy`
  - `pnpm phase6:audit:legacy:strict`
- 建立收口准则文档：`docs/refactor/phase6-repo-consolidation.md`

### 本批次目标

- 对 README 与关键文档做结构级重写，统一主线叙述。
- 将诊断脚本从“检查历史目录存在”迁移为“检查核心能力入口存在”。
- 清零历史目录字面路径在主文档与脚本中的引用。
- 完成 Pangolin 品牌与主题口径统一（以 `public/pangolin.svg` 为视觉锚点）。

### 完成标准（DoD）

1. 审计脚本报告 legacy path 引用为 0（或在允许清单外为 0）。
2. README 与集成文档仅描述主线入口，不再把历史目录作为默认运行路径。
3. `openclaw:doctor`（兼容命名）的 required 检查反映“能力入口”而非“历史目录”。
4. 关键开发链路可运行：
   - `pnpm gateway:dev`
   - `pnpm pangolin:frontend:dev`

- `pnpm openclaw:doctor`（兼容命令）

## 风险与应对

### 风险 1：文档已迁移但运行脚本仍耦合旧目录

- 应对：同步更新 doctor 与门禁脚本，确保“文档与诊断口径一致”。

### 风险 2：删除目录过早导致能力丢失

- 应对：必须先满足审计清零 + 能力等价 + 回归通过，再执行删除动作。

### 风险 3：团队使用旧命令习惯

- 应对：README 和集成文档统一给出根目录命令与环境变量方式。

## 下一步

1. 继续清理仓库内剩余 legacy path 引用。
2. 在 CI 中接入 strict 审计门禁。
3. 审计稳定后再评估历史目录删除窗口。
