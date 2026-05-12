# 05 — Backlog

TASK order and definition of done. Proceed top to bottom. Do not start the next TASK before the current one finishes.

## MVP 1 · Project Bootstrapper

| ID       | Title                                                      | Status  |
| -------- | ---------------------------------------------------------- | ------- |
| TASK-001 | CLI bootstrap (`vibeops --version`, `vibeops --help`)      | planned |
| TASK-002 | `init` command — install VibeOps project system            | planned |
| TASK-003 | Templates — rules, agents, prompts, workflows, docs        | planned |
| TASK-004 | `status` command                                           | planned |
| TASK-005 | Agent commands — `agent list / show / prompt`              | planned |

**MVP 1 definition of done**

- Running `vibeops init` in a fresh empty directory produces `AGENTS.md`, `.cursor/rules/*`, `docs/project/*`, `docs/tasks/` (one example), `.vibeops/agents/*`, `.vibeops/prompts/*`, `.vibeops/workflows/*`, `.vibeops.json`, `.vibeops.env.example`.
- `vibeops status` reports installation state and TASK counts.
- `vibeops agent list/show/prompt` works.
- Every mutating command supports `--dry-run`.

## MVP 2 · Project Planner

| ID       | Title                               | Status  |
| -------- | ----------------------------------- | ------- |
| TASK-006 | `plan` command                      | planned |
| TASK-007 | `task generate` command             | planned |

**MVP 2 definition of done**

- `vibeops plan` collects a project idea and prints a Cursor paste prompt that fills `docs/project/00-overview·02-tech-stack·05-backlog`. With `--apply`, it updates docs skeletons.
- `vibeops task generate` creates TASK files from the backlog or emits a generation prompt.

## MVP 3 · Git Task Lifecycle

| ID       | Title                                                       | Status  |
| -------- | ----------------------------------------------------------- | ------- |
| TASK-008 | Task lifecycle — `start / check / done` (+ `prompt`)        | planned |
| TASK-009 | Rollback safety — `task rollback`                           | planned |

**MVP 3 definition of done**

- `vibeops task start TASK-NNN` records base branch, base commit, and task branch into `.vibeops/state/tasks/TASK-NNN.json` and creates the task branch.
- `vibeops task prompt TASK-NNN --agent builder` prints a Cursor paste prompt from agent + TASK + docs context.
- `vibeops task check TASK-NNN` compares Acceptance Criteria / Test Plan against the Git state and reports.
- `vibeops task done TASK-NNN` verifies Status / Result / Test Result and prints merge guidance (no auto-merge).
- `vibeops task rollback TASK-NNN` only prints guidance by default; destructive Git operations run only with `--confirm`.

## MVP 4 · Notion Dashboard Sync

| ID       | Title                               | Status  |
| -------- | ----------------------------------- | ------- |
| TASK-010 | `notion init` and `notion test`     | planned |
| TASK-011 | `notion sync` and `task pull`       | planned |

**MVP 4 definition of done**

- `vibeops notion init` documents and helps write the keys required in `.vibeops.env`.
- `vibeops notion test` verifies Notion API access and DB schema (required fields).
- `vibeops notion sync` pushes metadata (summary / status / priority / branch / docs path / result summary) from `docs/tasks/*.md` and `docs/project/03-current-state.md` to Notion.
- `vibeops task pull` reconciles metadata changes (priority / status) from Notion back into `docs/tasks/*.md`.
- Detailed body is never pushed to Notion.

## Wrap-up

| ID       | Title                               | Status  |
| -------- | ----------------------------------- | ------- |
| TASK-012 | Package polish and README           | planned |

**Definition of done**

- README documents `npm i -g vibeops` (or `pnpm dlx vibeops`).
- README shows usage examples, a command table, and what each MVP enables.
- `package.json`'s `bin`, `files`, `keywords`, `engines`, `license` are clean.

## Explicit non-goals

Lives at [00-overview.md "Non-goals (out of MVP)"](00-overview.md#non-goals-out-of-mvp). The backlog only grows within those bounds.
