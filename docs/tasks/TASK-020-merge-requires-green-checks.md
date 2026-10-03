# TASK-020 · task merge requires green checks

## Status

In Progress

## Goal

Make `vibeops task merge` (and `task release`) the CI enforcement point for hosts without enforceable branch protection: never merge a PR whose checks are red, unknown, pending, or missing.

## Scope

- Classify GitHub `statusCheckRollup` items from the documented enums: `CheckRun` by `status` + `conclusion`, `StatusContext` by `state`; missing / undocumented values fail closed
- Merge gate in `mergeMergeRequest`: failed → refuse immediately; pending → bounded wait then refuse; untrusted host output (missing / null / empty fields) → refuse; no checks at all → refuse unless `merge.allowNoChecks`; merge pinned to the gated SHA (`gh --match-head-commit`, `glab --sha`)
- `.vibeops.json` `merge` block, strictly validated: `requiredChecks`, `releaseRequiredChecks` (exact or `*` glob; absent → "never ran"), `waitTimeoutSeconds`, `pollIntervalSeconds`, `emptyRollupGraceSeconds`, `allowNoChecks`
- GitLab: same gate on the head pipeline; `manual` / unknown no longer mergeable; 405 retry keeps `--auto-merge=false`
- `task release --dry-run` shows release required checks
- Unit + CLI tests with a fake `gh` / `glab` on `PATH`; README, CHANGELOG (incl. Behaviour changes), D-005, version 2.6.0

## Out of Scope

- `--force` override on `task merge` (decision D-005: none)
- GitLab per-job required checks
- npm publish

## Acceptance Criteria

1. A failed Actions check (`CheckRun` `conclusion: FAILURE`) refuses the merge with the check named and exit code 1 (previously merged as "success")
2. CheckRun SUCCESS + StatusContext SUCCESS merges pinned to the head SHA; NEUTRAL / SKIPPED pass; duplicate names — any failure fails
3. Pending then success merges after waiting; pending past the timeout refuses
4. A configured required check that never appears refuses with `required check "X" never ran`
5. Missing / undocumented values (status, conclusion, state) and missing / null / empty host fields (`headRefOid`, `mergeable`, `statusCheckRollup`, GitLab `sha`, …) fail closed; never merges unpinned
6. No checks at all refuses unless `merge.allowNoChecks: true` (then warns)
7. Malformed `merge` config (non-object, unknown key, wrong type, out-of-range) → `task merge` / `task release` exit 1 naming the key
8. GitLab failed / manual pipeline refuses; running → success merges with `--auto-merge=false --sha`; 405 re-gates and retries with the same flags
9. `task release --dry-run` lists `releaseRequiredChecks`
10. No consumer-repo-specific names in code, tests or README
11. `pnpm typecheck`, `pnpm test`, `pnpm smoke` pass

## Test Plan

- `pnpm typecheck`
- `pnpm test` (includes `tests/merge-gate.test.mjs`)
- `pnpm smoke`
- Read-only `gh pr view <n> --json statusCheckRollup` on a real PR to confirm the item shape; `gh` / `glab` help for `--match-head-commit` / `--sha`

## Result

- New `src/lib/check-rollup.ts`: `classifyRollupItem`, `evaluateCheckGate`, `checkNameMatches`, `formatCheckGateProblems`
- New `src/lib/merge-config.ts`: `parseMergeConfig` / `readMergeConfig` (strict validation, `MergeConfigError`), `MERGE_GATE_DEFAULTS`, `MERGE_GATE_LIMITS`, `mergeGateTiming`
- `src/lib/pr-create.ts`: `readMergeRequestDetails` (strict shape check → `MergeRequestShapeError`), `waitForMergeGate` (no-checks policy, configurable timing), `MergeGateError`; `mergeMergeRequest` always gates, refuses without a head SHA, pins `gh --match-head-commit` / `glab --auto-merge=false --sha`, GitLab 405 → re-gate + one retry with the same flags
- `src/lib/merge-request-readiness.ts`: `pipelineGateState`; GitLab `manual` / unknown → red
- `src/types/config.ts`, `src/lib/config.ts`: `VibeopsMergeConfig`; raw `merge` block preserved verbatim on re-init
- `task merge` / `task release`: validate config first (exit 1 on error), pass required checks + timing, no-bypass hint on refusal; `task release --dry-run` prints required checks
- Docs: README "Merge gate" (config table, host-is-final-authority note, gh ≥ 2.13.0), CHANGELOG 2.6.0 incl. Behaviour changes, D-005, `05-current-state.md`

## Test Result

- Real shape (a private GitHub repo using Actions, `gh pr view --json statusCheckRollup`): `{"__typename":"CheckRun","name":"…","status":"COMPLETED","conclusion":"SUCCESS","workflowName":…}` — no `state` field
- `gh pr merge --match-head-commit` introduced in gh v2.13.0 (cli/cli release notes); local gh 2.92.0; `glab mr merge --sha` present in local glab 1.106.0
- `pnpm typecheck` OK
- `pnpm test` — 60 pass, 0 fail (41 in `tests/merge-gate.test.mjs`)
- `pnpm smoke` OK
