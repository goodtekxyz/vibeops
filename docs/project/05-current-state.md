# 05 — Current State

> Facts only. Updated when implementation or release milestones land.

## Stage

- **Package:** `@goodtek/vibeops` **2.1.1** (local; publish when ready). **2.1.0** already on npm.
- **CLI lifecycle:** `init` · `task add` · `task ship` · **`task reship`** · `task merge` · `task sync` · `task release` · `status` · `llm`.
- **TASK md status:** **In Progress** → **Shipped** only. Merge/sync/reship follow-up do not rewrite Status (legacy Review/Done/Merged normalize when read).

## Implementation (this repo)

| Area | Path | Notes |
|------|------|--------|
| CLI commands | `src/commands/task-*.ts`, `src/cli.ts` | v4 lifecycle; `task done` removed |
| Reship | `src/commands/task-reship.ts`, `src/lib/task-reship.ts` | Shipped follow-up, new MR, Git Context archive |
| Git Context | `src/lib/task.ts` | MR URL, Previous Merge Requests, reship metadata |
| Templates | `templates/core`, `templates/clients/*` | Shipped workflow, two statuses |
| Smoke | `scripts/smoke.mjs` | init → add → ship/merge/sync dry-run |

## Next

- npm publish `@goodtek/vibeops@2.1.1` (docs/templates delta over 2.1.0).
- Consumer projects (e.g. goodtek-web): `npm i -g @goodtek/vibeops@2.1.1` and align Cursor rules if needed.

## Progress rules

- One TASK at a time in consumer repos.
- Docs before ship: Result, Test Result, `05-current-state.md`, daily log.
- `task sync` does not edit TASK markdown.
