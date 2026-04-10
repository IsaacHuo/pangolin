# Pangolin 功能保留执行手册（Phase 6）

## 目标

在仓库收口过程中保留 Pangolin 的核心可运行能力，并避免“删目录即丢能力”的风险。

关键原则：

- 保留能力入口，不保留历史目录依赖。
- 先通过诊断与审计，再做结构删除。
- Core-Only 可运行优先于 legacy 面完整性。

## 核心能力定义

当前阶段要求以下能力入口存在：

- 启动入口：`scripts/run-node.mjs`
- 网关模块：`src/gateway`
- Agent 模块：`src/agents`
- 渠道模块：`src/channels`
- 防火墙运维前端入口：`apps/pangolin-frontend/app/pages/mcp-firewall.vue`
- 防火墙分诊状态中枢：`apps/pangolin-frontend/app/composables/useFirewallOpsConsole.ts`
- 技能目录：`skills`

## 先跑诊断

在仓库根目录执行：

```bash
pnpm openclaw:doctor
```

说明：命令前缀 `openclaw:*` 为兼容保留，语义上对应 Pangolin 运行时能力诊断。

严格模式（有 warning 也失败）：

```bash
pnpm openclaw:doctor:strict
```

结果说明：

- `CORE BROKEN`：核心能力缺失，禁止继续收口。
- `CORE-ONLY MODE`：核心可用，允许继续收口。
- `FULL MODE`：核心与可选面齐全。

## 再跑遗留路径审计

```bash
pnpm phase6:audit:legacy
pnpm phase6:audit:legacy:strict
```

当目标路径引用数不为 0 时，不执行目录删除。

## 推荐执行路径

### 路径 A：Core-Only（默认）

适用于当前仓库收口阶段。

1. 使用主线命令进行开发与验证：
   - `pnpm gateway:dev`
   - `pnpm pangolin:frontend:dev`
   - `pnpm test:fast`
2. 对与核心链路无关的 legacy 面保持可选状态。
3. 文档与脚本持续去耦历史路径。

### 路径 B：恢复 legacy 面

仅当确有业务需要时执行。

1. 按目录分批恢复（移动端、UI、Docker E2E 等）。
2. 每批恢复单独 PR，避免混改。
3. 每批恢复后重新运行 doctor 与 legacy audit。

## 与 Phase 6 的关系

- 本手册是 Phase 6 的执行细则之一。
- 目录删除动作必须满足“能力入口完整 + 审计清零 + 回归通过”。
- 若任一条件不满足，继续迁移，不做删除。
