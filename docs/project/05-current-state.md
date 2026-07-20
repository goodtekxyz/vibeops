# 05 — Current State

> Facts only. Updated when implementation or release milestones land.

## Stage

- **Package:** `@goodtek/vibeops` **2.5.1** (TASK-019 integration sync UX; publish target).
- **CLI lifecycle:** `init` · `task add` · `task del` · **`task ship` (state-aware)** · `task merge` · `task sync` · `pull` · `task release` · **`status` (Now/Next)** · `llm`.
- **Breaking (2.5.0):** `task reship` removed — use `task ship` / `--new-cycle`.
- **2.5.1:** `task add` preflight + sync diagnosis + incomplete resume.

## Implementation (this repo)

| Area | Path | Notes |
|------|------|--------|
| Integration sync UX | `src/lib/git-integration-sync.ts`, `task-add.ts`, `task-start.ts`, `pull.ts` | Diagnose + preflight + resume |
| Init remote UX | `src/lib/git-remote.ts`, `src/lib/git-host-cli.ts` | Ask host → create/connect |
| Status Now/Next | `src/commands/status.ts` | Human layout |

## Next

- Publish `@goodtek/vibeops@2.5.1` to npm; merge TASK-019.
- Consumers: `npm i -g @goodtek/vibeops@2.5.1`.

## Progress rules

- One TASK at a time in consumer repos.
- Docs before ship: Result, Test Result, `05-current-state.md`, daily log.
- `task sync` does not edit TASK markdown.
