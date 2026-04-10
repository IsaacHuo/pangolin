# Phase 0 实施指南（Pangolin 重构）

## 目标

Phase 0 只做治理和门禁，不做功能迁移。目标是确保后续每个阶段都可审计、可回滚、可评审。

当前确认的执行规则：

- 每个阶段一个 PR。
- 需要用户介入的评审点必须及时提醒。
- 每个步骤完成后立即提交，保持零新增脏改动。
- 涉及目录增删时，必须同步更新 .gitignore 并记录原因。

## Phase 0 拆分

### PR-P0-1：分支与门禁基线（本 PR）

交付物：

- 本指南更新为治理执行版。
- PR 模板增加重构门禁检查项。
- 形成固定评审介入节奏。

范围边界：

- 允许：文档、模板、流程规则。
- 禁止：功能代码迁移、目录大规模移动、协议改写。

### PR-P0-2：.gitignore 基线修正

交付物：

- 收窄高风险泛忽略规则，避免误伤新 pangolin 结构。
- 去除重复忽略项并补充迁移注释。

最小修正集：

- 收窄 apps/、scripts/、.github/workflows/ 到历史目录前缀。
- 去重重复项（如重复 node_modules、重复 vendor）。
- 保留运行时和本地开发缓存忽略规则。

### PR-P0-3：迁移源冻结与残留目录处置

交付物：

- 冻结 ai-protector-main、promptfoo-main、pangolin 为迁移源。
- 输出三分清单：可直接删、条件删、暂不删。
- 给出删除顺序与回滚策略。
- 形成决议文档：`PHASE0_SOURCE_FREEZE_DECISION.md`。

## 分支与 PR 规范

### 分支命名

统一格式：

- phase0/pr-p0-1-<topic>
- phase0/pr-p0-2-<topic>
- phase0/pr-p0-3-<topic>

示例：phase0/pr-p0-1-governance-gates

### 提交流程

每个步骤按以下节奏执行：

1. 变更前记录分支状态。
2. 完成单一步骤后立即提交。
3. 提交前检查是否混入无关文件。
4. 推送并发起阶段 PR。
5. 提醒用户介入评审后再进入下一步骤。

## 用户介入检查点

必须在以下时刻提醒用户：

1. PR-P0-1 完成，确认门禁规则可执行。
2. PR-P0-2 完成，确认 .gitignore 规则变更可接受。
3. PR-P0-3 完成，确认残留目录删除策略。

## 验收标准

Phase 0 完成需同时满足：

1. 三个子 PR 都完成并通过评审。
2. 每个子 PR 都有明确的验证记录。
3. 每个子 PR 的改动都可独立回滚。
4. .gitignore 与目录迁移策略一致。

## 建议命令清单

开始前：

- git status --short --branch
- git --no-pager log -1 --oneline

提交前：

- git status --short
- git diff --name-only

PR 前：

- git diff --name-only origin/<base-branch>...HEAD

## 风险提示

当前仓库存在历史改动与多个并存目录。Phase 0 期间需严格控制范围，避免将历史残留改动混入治理 PR。
