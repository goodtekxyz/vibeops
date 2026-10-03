# 05 — Current State

> Facts only. Updated when implementation or release milestones land.

## Stage

- **Package:** `@goodtek/vibeops` **3.1.0** (worktree-safe lifecycle + collision-free TASK ids).
- **CLI lifecycle:** `init` · `task add` · `task del` · **`task ship` (state-aware)** · `task merge` · `task sync` · `pull` · `task release` · **`status` (Now/Next)** · `llm`.
- **Breaking (2.5.0):** `task reship` removed — use `task ship` / `--new-cycle`.
- **2.5.1:** `task add` preflight + sync diagnosis + incomplete resume.
- **2.5.2:** `.vibeops.json` / governance dirt soft-pass on integration sync.
- **3.0.0 (breaking):** merge gate — CheckRun/StatusContext classification fix, fail-closed (incl. no checks unless `merge.allowNoChecks`), strict `merge` config, SHA-pinned merges; requires gh ≥ 2.13.0 (TASK-020).
- **3.1.0:** worktree-safe `task add` / `task sync` / `task del` / new-cycle (no integration checkout), global TASK id allocation (TASK-021).

## Implementation (this repo)

| Area | Path | Notes |
|------|------|--------|
| Integration sync UX | `src/lib/git-integration-sync.ts`, `task-add.ts`, `git.ts` | Preflight; governance-only dirty OK |
| npm publish | `scripts/npm-publish.sh`, `scripts/infisical-run.sh` | Infisical / `.env` → temp npmrc |
| Init remote UX | `src/lib/git-remote.ts`, `src/lib/git-host-cli.ts` | Ask host → create/connect |
| Status Now/Next | `src/commands/status.ts` | Human layout |
| Worktrees / TASK ids | `src/lib/git-worktree.ts`, `src/lib/task-id-allocation.ts` | D-006 |
| Merge gate | `src/lib/check-rollup.ts`, `src/lib/merge-config.ts`, `src/lib/pr-create.ts` (`waitForMergeGate`) | Fail closed; `.vibeops.json` `merge` block |

## Next

- Consumers: `npm i -g @goodtek/vibeops@3.1.0` (or `volta install @goodtek/vibeops@3.1.0`) once published. Repos without CI: `"merge": {"allowNoChecks": true}`.
- Maintainers: `pnpm publish:npm` (Infisical `NPM_TOKEN` or `.env`).

## Progress rules

- One TASK at a time in consumer repos.
- Docs before ship: Result, Test Result, `05-current-state.md`, daily log.
- `task sync` does not edit TASK markdown.
