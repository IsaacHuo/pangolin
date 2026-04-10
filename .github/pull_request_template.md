## Summary

Describe the problem and fix in 2–5 bullets:

- Problem:
- Why it matters:
- What changed:
- What did NOT change (scope boundary):

## Migration Gate (required for refactor/migration PRs)

- [ ] Branch name follows phase pattern (example: phase0/pr-p0-1-topic)
- [ ] I attached branch/status snapshots before and after changes
- [ ] This PR scope is single-phase and does not mix unrelated changes
- [ ] If directories were added/removed/moved, .gitignore was updated in the same PR with a reason
- [ ] I marked whether user review intervention is required for next phase

### User Review Checkpoint

- Requires user intervention before next phase? (`Yes/No`)
- If yes, what decision is needed:

## Change Type (select all)

- [ ] Bug fix
- [ ] Feature
- [ ] Refactor
- [ ] Docs
- [ ] Security hardening
- [ ] Chore/infra

## Scope (select all touched areas)

- [ ] Gateway / orchestration
- [ ] Skills / tool execution
- [ ] Auth / tokens
- [ ] Memory / storage
- [ ] Integrations
- [ ] API / contracts
- [ ] UI / DX
- [ ] CI/CD / infra

## Linked Issue/PR

- Closes #
- Related #

## User-visible / Behavior Changes

List user-visible changes (including defaults/config).  
If none, write `None`.

## Security Impact (required)

- New permissions/capabilities? (`Yes/No`)
- Secrets/tokens handling changed? (`Yes/No`)
- New/changed network calls? (`Yes/No`)
- Command/tool execution surface changed? (`Yes/No`)
- Data access scope changed? (`Yes/No`)
- If any `Yes`, explain risk + mitigation:

## Repro + Verification

### Environment

- OS:
- Runtime/container:
- Model/provider:
- Integration/channel (if any):
- Relevant config (redacted):

### Steps

1.
2.
3.

### Expected

-

### Actual

-

## Evidence

Attach at least one:

- [ ] Failing test/log before + passing after
- [ ] Trace/log snippets
- [ ] Screenshot/recording
- [ ] Perf numbers (if relevant)

## Human Verification (required)

What you personally verified (not just CI), and how:

- Verified scenarios:
- Edge cases checked:
- What you did **not** verify:

## Compatibility / Migration

- Backward compatible? (`Yes/No`)
- Config/env changes? (`Yes/No`)
- Migration needed? (`Yes/No`)
- If yes, exact upgrade steps:

## Failure Recovery (if this breaks)

- How to disable/revert this change quickly:
- Files/config to restore:
- Known bad symptoms reviewers should watch for:

## Risks and Mitigations

List only real risks for this PR. Add/remove entries as needed. If none, write `None`.

- Risk:
  - Mitigation:
