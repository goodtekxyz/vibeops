# 05 — Current State

> Facts only. Updated when implementation or release milestones land.

## Stage

- **Package:** `@goodtek/vibeops` **2.5.0** published on npm ([npmjs.com/package/@goodtek/vibeops](https://www.npmjs.com/package/@goodtek/vibeops)).
- **CLI lifecycle:** `init` · `task add` · `task del` · **`task ship` (state-aware)** · `task merge` · `task sync` · `pull` · `task release` · **`status` (Now/Next)** · `llm`.
- **Breaking (2.5.0):** `task reship` removed — use `task ship` / `--new-cycle`.
- **TASK md status:** **In Progress** → **Shipped** only. Merge/sync/new-cycle follow-up do not rewrite Status.

## Implementation (this repo)

| Area | Path | Notes |
|------|------|--------|
| Init remote UX | `src/lib/git-remote.ts`, `src/lib/git-host-cli.ts` | Ask host → create/connect; soft-gate CLI |
| Status Now/Next | `src/commands/status.ts`, `src/lib/task-context.ts` | Human layout + ship-only hints |
| Ship state machine | `src/commands/task-ship.ts`, `src/lib/task-ship-state.ts` | first / update-open / new-cycle |
| New PR cycle | `src/lib/task-new-cycle.ts`, `src/lib/task-reship.ts` | lib kept; CLI `reship` removed |
| Docs | `README.md`, `AGENTS.md`, templates, Cursor rules | ship-only + install notes |

## Branch

- Feature branch: `task/task-018-cli-ux-init-host-status` (not yet merged to `main`).
- npm 2.5.0 was published from this work; merge to integration/main still pending.

## Next

- Push branch + open/merge PR for TASK-018 into `main`.
- Consumers: `npm i -g @goodtek/vibeops@2.5.0` (watch for shell aliases / Volta shadowing old binaries).

## Progress rules

- One TASK at a time in consumer repos.
- Docs before ship: Result, Test Result, `05-current-state.md`, daily log.
- `task sync` does not edit TASK markdown.
