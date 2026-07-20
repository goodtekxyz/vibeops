# 05 — Current State

> Facts only. Updated when implementation or release milestones land.

## Stage

- **Package:** `@goodtek/vibeops` **2.5.0** on npm; **TASK-019** in progress (task-add integration sync UX) on `task/task-019-task-add-integration-sync-ux`.
- **CLI lifecycle:** `init` · `task add` · `task del` · **`task ship` (state-aware)** · `task merge` · `task sync` · `pull` · `task release` · **`status` (Now/Next)** · `llm`.
- **Breaking (2.5.0):** `task reship` removed — use `task ship` / `--new-cycle`.

## Implementation (this repo)

| Area | Path | Notes |
|------|------|--------|
| Integration sync UX | `src/lib/git-integration-sync.ts`, `task-add.ts`, `task-start.ts`, `pull.ts` | Diagnose + preflight + resume |
| Init remote UX | `src/lib/git-remote.ts`, `src/lib/git-host-cli.ts` | Ask host → create/connect |
| Status Now/Next | `src/commands/status.ts` | Human layout |

## Next

- Finish TASK-019 (ship / merge / publish patch if needed).
- Consumers on 2.5.0: upgrade after patch for clearer `task add` sync errors.

## Progress rules

- One TASK at a time in consumer repos.
- Docs before ship: Result, Test Result, `05-current-state.md`, daily log.
- `task sync` does not edit TASK markdown.
