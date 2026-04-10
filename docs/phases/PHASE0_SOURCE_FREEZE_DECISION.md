# Phase 0 P0-3: 迁移源冻结与残留目录处置决议

## 背景

本文件对应 Phase 0 的 PR-P0-3，目标是明确迁移源目录的冻结策略与删除顺序。

涉及目录：

- ai-protector-main
- promptfoo-main
- pangolin

## 证据

1. 根工作区纳管范围不包含上述迁移源目录：
   - pnpm workspace 当前仅包含 `.`、`ui`、`extensions/*`（见 `pnpm-workspace.yaml`）。
2. 根构建与发布入口无直接引用：
   - `package.json` 的 `files` 与 `scripts` 未引用 `promptfoo-main`、`pangolin`。
3. 配置与脚本检索结果：
   - 对 `package.json`、`pnpm-workspace.yaml`、`tsconfig*.json`、`vitest*.config.ts`、`.github/**`、`scripts/**`、`docs/**` 的关键字检索未发现 `ai-protector-main|promptfoo-main|pangolin/` 的主动引用。
4. firewall-gateway 重复性核验：
   - `diff -qr --exclude node_modules --exclude .venv --exclude __pycache__ --exclude logs extensions/pangolin pangolin/apps/firewall-gateway` 无差异输出。
5. 跟踪状态核验：
   - `promptfoo-main` 跟踪文件数为 0。
   - `pangolin` 跟踪文件数为 0。
   - `ai-protector-main` 跟踪文件数为 0（原 12 个前端残留文件已在清理步骤中移除）。
6. 体量核验：
   - `ai-protector-main`: 477M
   - `promptfoo-main`: 225M
   - `pangolin`: 8.0K

## 三分清单

### 可直接删

1. promptfoo-main
   - 理由：未被跟踪、未被主链路引用、体量较大（225M）。
2. pangolin
   - 理由：未被跟踪、未被主链路引用、且其中 firewall-gateway 与现有 `extensions/pangolin` 在排除依赖产物后无差异。
3. ai-protector-main
   - 理由：已无跟踪文件阻塞，且处于迁移源冻结状态。

### 条件删

1. 无

### 暂不删

1. 无

## 删除顺序

1. 先删 `promptfoo-main`（直接清理，低风险高收益）。
2. 再删 `pangolin`（直接清理，重复残留）。
3. 最后删 `ai-protector-main`（当前已满足直接删除条件）。

## 回滚策略

1. 每个目录处置独立提交，不做混合提交。
2. 删除后若需恢复，使用对应提交的反向提交恢复。
3. 若误删本地未跟踪迁移源，可从上游仓库重新拉取或从本地备份恢复。

## 与 .gitignore 的关系

Phase 0 P0-2 已将迁移源目录加入临时冻结忽略规则，目的是避免误提交并降低工作区噪音；本文件定义的是删除决策和执行顺序，不替代最终删除动作。

## 执行状态

- 2026-03-17：已在当前工作区执行目录清理，`promptfoo-main`、`pangolin`、`ai-protector-main` 均已移除。
- 2026-03-17：`ai-protector-main` 跟踪文件数保持为 0，已无跟踪文件阻塞。

## OpenClaw 功能保留执行

- 目录清理不等于功能删除，核心能力仍保留在 `src/gateway`、`src/agents`、`src/channels`、`extensions/pangolin` 等主链路模块。
- 执行手册：`docs/refactor/openclaw-retention-playbook.md`
- 一键诊断命令：`bash scripts/openclaw-doctor.sh`
- 当前策略：已确认采用路径 A（Core-Only），不恢复移动端、UI 工作区和 Docker E2E 脚本。
