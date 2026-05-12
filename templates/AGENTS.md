# {{PROJECT_NAME}} — AI agent operating guide

> This file was installed by **VibeOps**. Every AI agent on this project (including Cursor) reads it before touching code.

## Purpose

This project runs **Cursor-based vibe coding** on rails. The execution input is **`docs/tasks/TASK-*.md`**, not chat history.

## Required reading before you code

Read the docs below **before you start implementing**. Order top to bottom.

| Document                                   | Why                                                       |
| ------------------------------------------ | --------------------------------------------------------- |
| `docs/project/05-current-state.md`         | Where the project is today and what comes next             |
| `docs/project/00-overview.md`              | Vision, terminology, MVP boundaries                       |
| `docs/project/02-mvp-scope.md`             | What is in / out of MVP                                   |
| `docs/project/03-architecture.md`          | System, folders, data flow                                |
| `docs/project/04-tech-stack.md`            | Tools used to build the project                            |
| `docs/project/06-decisions.md`             | Decisions already made (avoid conflicts)                   |
| `docs/project/07-backlog.md`               | TASK order and definition of done                          |
| **Current TASK file** `docs/tasks/TASK-NNN-*` | Scope and Acceptance Criteria for the current TASK     |

`docs/project/01-requirements.md`, `08-env.md`, `09-deployment.md` are referenced as needed. **Always read the entire current TASK file.**

## Source of truth

| What                       | Where                              |
| -------------------------- | ---------------------------------- |
| AI execution input         | Git `docs/tasks/*.md`              |
| Project design and status  | Git `docs/project/*.md`            |
| Change history and rollback | Git commits / branches            |
| Human dashboard            | Notion (metadata only, never body) |
| **Not** a source of truth  | Chat (Cursor history, Slack)       |

## TASK-driven development rules

1. Implement **one TASK at a time**.
2. Stay inside the TASK's **Scope / Acceptance Criteria**.
3. Before adding new code, **search** for existing implementations or patterns and avoid duplication.
4. **Every mutating command** should support **`--dry-run`** (or an equivalent) so the plan can be previewed without side effects.
5. **Large refactors** happen only when a dedicated TASK calls for them.
6. **Notion / Git integrations** are only added when an explicit TASK assigns that responsibility.
7. When the work is finished, update docs per [Completion report](#completion-report) and `.cursor/rules/04-docs-update.mdc`.

Details live in `.cursor/rules/`.

## Agent roles

`.vibeops/agents/*.md` defines 8 agents for this project.

- `orchestrator` — picks the next TASK and delegates to other agents.
- `planner` — expands an idea into `docs/project/{00,01,02,07}`.
- `architect` — fills in `docs/project/{03,04}` (architecture, tech stack).
- `builder` — takes one TASK and edits code.
- `reviewer` — compares the diff against the Acceptance Criteria.
- `tester` — runs the Test Plan and fills in Test Result.
- `docs` — updates `05-current-state.md`, the TASK Result, and `docs/logs/`.
- `recovery` — diagnoses rollback options (destructive actions require `--confirm`).

## Forbidden

- Changing requirements or implementing things "loosely" based on chat alone.
- Editing code or config **without reading the current TASK file**.
- Mixing **multiple TASKs** in one session, or adding a large structure (e.g. `src/`) without a TASK.
- Features **outside the TASK Scope** or **outside the MVP**.
- Creating similar modules **without searching first**.
- Performing **large refactors** without a dedicated TASK.
- Adding **Notion / Git integration** that the TASK does not authorize.
- Calling the TASK done without updating **`05-current-state.md` / the TASK file / `docs/logs/YYYY-MM-DD.md`**.

## Cursor rule files

| File                                                  | Contents                                                  |
| ----------------------------------------------------- | --------------------------------------------------------- |
| `.cursor/rules/00-project-governance.mdc`             | Source of truth, one-TASK rule, MVP scope                  |
| `.cursor/rules/01-agent-orchestration.mdc`            | Roles of the 8 agents and how they collaborate            |
| `.cursor/rules/02-task-workflow.mdc`                  | How to start / run / finish a TASK, dry-run first         |
| `.cursor/rules/03-git-safety.mdc`                     | Branch / rollback safety, no force-push                    |
| `.cursor/rules/04-docs-update.mdc`                    | Mandatory doc updates after implementation                 |

## Completion report

When you finish a TASK, include at least the following in your chat response:

1. **TASK ID** (for example `TASK-001`).
2. **Summary** — 2 to 4 sentences on what was achieved.
3. **Changed files** — list of the main paths.
4. **Verification** — the commands you ran and their results.
5. **Doc updates** — confirm you updated `05-current-state.md`, the TASK's Result / Test Result, and `docs/logs/YYYY-MM-DD.md`.

Do not end the report with just "done".

## VibeOps metadata

- Project name: `{{PROJECT_NAME}}`
- Bootstrapped by: VibeOps `{{VIBEOPS_VERSION}}`
- Created at: `{{CREATED_AT}}`
