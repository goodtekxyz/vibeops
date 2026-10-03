# TASK-020 · task merge requires green checks

## Status

In Progress

## Goal

Make `vibeops task merge` (and `task release`) the CI enforcement point for hosts without enforceable branch protection: never merge a PR whose checks are red, unknown, pending, or missing.

## Scope

- Classify GitHub `statusCheckRollup` items from the documented enums: `CheckRun` by `status` + `conclusion`, `StatusContext` by `state`; missing / undocumented values fail closed
- Merge gate in `mergeMergeRequest`: failed → refuse immediately; pending → bounded wait (existing 15 min / 5 s) then refuse; missing `gh` fields → refuse; pin GitHub merge to the checked head SHA
- Optional `.vibeops.json` `merge.requiredChecks` / `merge.releaseRequiredChecks` (exact or `*` glob); required check absent after the wait → refuse ("never ran")
- GitLab: same gate on the head pipeline; `manual` / unknown pipeline statuses no longer count as mergeable
- Unit tests with a fake `gh` / `glab` on `PATH`; README, CHANGELOG, version 2.6.0

## Out of Scope

- `--force` override on `task merge` (decision D-005: none)
- GitLab per-job required checks
- npm publish

## Acceptance Criteria

1. A failed Actions check (`CheckRun` `conclusion: FAILURE`) refuses the merge with the check named and exit code 1 (previously merged as "success")
2. CheckRun SUCCESS + StatusContext SUCCESS merges; NEUTRAL / SKIPPED pass
3. Pending then success merges after waiting; pending past the timeout refuses
4. A configured required check that never appears refuses with `required check "X" never ran`
5. Missing / undocumented values (status, conclusion, state, `gh` JSON fields) fail closed
6. GitLab failed / manual pipeline refuses; running → success merges
7. `pnpm smoke` passes

## Test Plan

- `pnpm typecheck`
- `pnpm test` (includes `tests/merge-gate.test.mjs`)
- `pnpm smoke`
- Read-only `gh pr view <n> --json statusCheckRollup` on a real PR to confirm the item shape

## Result

- New `src/lib/check-rollup.ts`: `classifyRollupItem`, `evaluateCheckGate`, `checkNameMatches`, `formatCheckGateProblems`
- `src/lib/pr-create.ts`: `readMergeRequestDetails` (strict shape check, `MergeRequestShapeError`), `waitForMergeGate`, `MergeGateError`; `mergeMergeRequest` always gates (no bypass) and passes `--match-head-commit` to `gh pr merge`
- `src/lib/merge-request-readiness.ts`: `pipelineGateState`; GitLab `manual` / unknown → red, `scheduled` / `waiting_for_callback` / `canceling` → running
- `src/types/config.ts`, `src/lib/config.ts`: `merge.requiredChecks`, `merge.releaseRequiredChecks` (preserved on re-init)
- `task merge` / `task release` pass required checks and print a no-bypass hint on gate refusal
- Docs: README "Merge gate", CHANGELOG 2.6.0, D-005, `05-current-state.md`

## Test Result

- Real shape (goodtekxyz/zarvix.ai PR 286/288): `{"__typename":"CheckRun","name":"Migrations lint · vs develop","status":"COMPLETED","conclusion":"SUCCESS","workflowName":…}` — no `state` field
- `pnpm typecheck` OK
- `pnpm test` — 43 pass, 0 fail (24 new in `tests/merge-gate.test.mjs`)
- `pnpm smoke` OK
