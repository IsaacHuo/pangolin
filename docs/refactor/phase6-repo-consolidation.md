# Phase 6 Repo Consolidation

Phase 6 focuses on reducing repository sprawl without dropping production capabilities.

## Why not delete directly

Directories such as extensions/pangolin still have many live references in runtime docs and commands. Deleting first would break onboarding and local operations.

## Phase 6 approach

1. Build measurable cleanup gates.
2. Move or replace capabilities in mainline modules.
3. Remove legacy directories only after references reach zero.

## Cleanup Gate Command

Run this audit before deleting legacy directories:

```bash
pnpm phase6:audit:legacy
```

Use strict mode in CI or pre-merge checks:

```bash
pnpm phase6:audit:legacy:strict
```

## Current Gate Scope

The audit reports references to these legacy paths:

- extensions/pangolin
- ai-protector-main
- promptfoo-main
- pangolin/

## Definition of done for deletion

Delete a legacy directory only when all checks are true:

1. Equivalent capability exists in active runtime paths.
2. Audit command shows zero references to the directory path.
3. README and docs point only to retained paths.
4. Dev and test commands run without the legacy directory.
