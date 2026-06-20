# 05 — Current State

> Facts only. Updated when implementation or release milestones land.

## Stage

- **Package:** `@goodtek/vibeops` **2.4.0** (local; ready to publish). **2.3.0** on npm.
- **CLI lifecycle:** `init` · `task add` · **`task del`** · **`task ship` (state-aware)** · `task reship` (deprecated alias) · `task merge` · `task sync` · **`pull`** · `task release` · `status` · `llm`.
- **TASK md status:** **In Progress** → **Shipped** only. Merge/sync/new-cycle follow-up do not rewrite Status (legacy Review/Done/Merged normalize when read).
- **`task ship` is state-aware:** detects PR/MR state (none/open/merged) and branches to first submit · update open PR · new PR cycle. `-m`, `--new-cycle`, `--no-commit` added; TASK-id-scoped commit messages.

## Implementation (this repo)

| Area | Path | Notes |
|------|------|--------|
| CLI commands | `src/commands/task-*.ts`, `src/cli.ts` | v4 lifecycle; `task done` removed |
| Ship state machine | `src/commands/task-ship.ts`, `src/lib/task-ship-state.ts` | first / update-open / new-cycle / mismatch |
| PR state source | `src/lib/task-effective-status.ts` (`resolveTaskMergeRequestLifecycle`) | single source for PR lifecycle + URL |
| Commit messages | `src/lib/task-commit-msg.ts`, `task-git-commit.ts` | `-m`/LLM/prompt, TASK-id-scoped |
| New PR cycle | `src/lib/task-new-cycle.ts`, `src/lib/task-reship.ts` | former reship body; reused by ship + reship alias |
| Reship (alias) | `src/commands/task-reship.ts` | deprecated → `ship --new-cycle` |
| Pull | `src/commands/pull.ts` | Fetch + integration branch ff-only pull |
| Del | `src/commands/task-del.ts`, `src/lib/task-del.ts` | Cancel TASK before merge; refuses if MR merged |
| Git Context | `src/lib/task.ts` | MR URL, Previous Merge Requests, reship metadata |
| Templates | `templates/core`, `templates/clients/*` | Shipped workflow, two statuses |
| Smoke | `scripts/smoke.mjs` | init → add → ship/merge/sync dry-run |

## Next

- npm publish `@goodtek/vibeops@2.4.0` (state-aware ship).
- Consumer projects: `npm i -g @goodtek/vibeops@2.4.0`.

## Progress rules

- One TASK at a time in consumer repos.
- Docs before ship: Result, Test Result, `05-current-state.md`, daily log.
- `task sync` does not edit TASK markdown.
