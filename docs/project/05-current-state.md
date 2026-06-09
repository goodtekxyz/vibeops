# 05 — Current State

> Facts only. Updated when implementation or release milestones land.

## Stage

- **Package:** `@goodtek/vibeops` **2.3.0** (local; publish when ready). **2.2.1** on npm.
- **CLI lifecycle:** `init` · `task add` · **`task del`** · `task ship` · **`task reship`** · `task merge` · `task sync` · **`pull`** · `task release` · `status` · `llm`.
- **TASK md status:** **In Progress** → **Shipped** only. Merge/sync/reship follow-up do not rewrite Status (legacy Review/Done/Merged normalize when read).

## Implementation (this repo)

| Area | Path | Notes |
|------|------|--------|
| CLI commands | `src/commands/task-*.ts`, `src/cli.ts` | v4 lifecycle; `task done` removed |
| Reship | `src/commands/task-reship.ts`, `src/lib/task-reship.ts` | Shipped follow-up, auto branch, dirty OK, new MR |
| Pull | `src/commands/pull.ts` | Fetch + integration branch ff-only pull |
| Del | `src/commands/task-del.ts`, `src/lib/task-del.ts` | Cancel TASK before merge; refuses if MR merged |
| Git Context | `src/lib/task.ts` | MR URL, Previous Merge Requests, reship metadata |
| Templates | `templates/core`, `templates/clients/*` | Shipped workflow, two statuses |
| Smoke | `scripts/smoke.mjs` | init → add → ship/merge/sync dry-run |

## Next

- npm publish `@goodtek/vibeops@2.3.0` (task del).
- Consumer projects: `npm i -g @goodtek/vibeops@2.3.0`.

## Progress rules

- One TASK at a time in consumer repos.
- Docs before ship: Result, Test Result, `05-current-state.md`, daily log.
- `task sync` does not edit TASK markdown.
