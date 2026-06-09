# 05 — Current State

> Facts only. Updated when implementation or release milestones land.

## Stage

- **Package:** `@goodtek/vibeops` **2.2.0** (local; publish when ready). **2.1.3** on npm.
- **CLI lifecycle:** `init` · `task add` · `task ship` · **`task reship`** · `task merge` · `task sync` · **`pull`** · `task release` · `status` · `llm`.
- **TASK md status:** **In Progress** → **Shipped** only. Merge/sync/reship follow-up do not rewrite Status (legacy Review/Done/Merged normalize when read).

## Implementation (this repo)

| Area | Path | Notes |
|------|------|--------|
| CLI commands | `src/commands/task-*.ts`, `src/cli.ts` | v4 lifecycle; `task done` removed |
| Reship | `src/commands/task-reship.ts`, `src/lib/task-reship.ts` | Shipped follow-up, auto branch, dirty OK, new MR |
| Pull | `src/commands/pull.ts` | Fetch + integration branch ff-only pull |
| Git Context | `src/lib/task.ts` | MR URL, Previous Merge Requests, reship metadata |
| Templates | `templates/core`, `templates/clients/*` | Shipped workflow, two statuses |
| Smoke | `scripts/smoke.mjs` | init → add → ship/merge/sync dry-run |

## Next

- npm publish `@goodtek/vibeops@2.2.0` (pull + reship UX).
- Consumer projects: `npm i -g @goodtek/vibeops@2.2.0` and align Cursor rules if needed.

## Progress rules

- One TASK at a time in consumer repos.
- Docs before ship: Result, Test Result, `05-current-state.md`, daily log.
- `task sync` does not edit TASK markdown.
