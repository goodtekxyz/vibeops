# vibeops — AI Agent Operating Guide

> This file was installed by **VibeOps**. Every AI agent in this project, including Cursor, reads this document before touching code.

## Purpose

This project keeps **Cursor-based vibe coding** on a structured workflow. The work input is **`docs/tasks/TASK-*.md`**, not chat.

## Documents to read before coding

Read the following **before implementation starts**, in order from top to bottom.

| Document                                   | Why                                      |
| ------------------------------------------ | ---------------------------------------- |
| `docs/project/05-current-state.md`         | Where the project is and what is next.   |
| `docs/project/00-overview.md`              | Vision, vocabulary, and MVP boundary.    |
| `docs/project/02-mvp-scope.md`             | What is inside or outside the MVP.       |
| `docs/project/03-architecture.md`          | System, folders, and data flow.          |
| `docs/project/04-tech-stack.md`            | Which tools the project uses.            |
| `docs/project/06-decisions.md`             | Decisions already made, to avoid conflict. |
| `docs/project/07-backlog.md`               | TASK order and definition of done.       |
| **Current TASK file** `docs/tasks/TASK-NNN-*` | Scope and Acceptance Criteria for this work. |

Refer to `docs/project/01-requirements.md`, `08-env.md`, and `09-deployment.md` when needed. **Always read the full current TASK file.**

## Source of truth

| What                            | Where                         |
| ------------------------------- | ----------------------------- |
| AI execution baseline           | Git `docs/tasks/*.md`         |
| Project design / current state  | Git `docs/project/*.md`       |
| Change history / rollback basis | Git commits / branches        |
| Human operations board          | Notion (metadata only, no body) |
| **Not** a baseline              | Chat (Cursor history, Slack)  |

## TASK-driven development rules

1. Implement **one TASK at a time**.
2. Do not work outside the TASK **Scope / Acceptance Criteria**.
3. Before adding new code, **search** for existing implementations or patterns and avoid duplication.
4. Design **every mutating command** to support **`--dry-run`** where possible so the plan can be shown without side effects.
5. Do **large refactors** only when a separate TASK explicitly covers them.
6. Implement **Notion or Git integration** only in TASKs that explicitly own that responsibility.
7. When work finishes, update docs before **`vibeops task ship`** (Result, Test Result, `05-current-state.md`, logs) per `.cursor/rules/03-docs-before-ship.mdc`.

## CLI workflow (consumer projects)

```bash
vibeops task add
# Cursor: plan + implement (@docs/tasks/TASK-NNN-*.md)

vibeops task ship TASK-NNN
vibeops task merge TASK-NNN    # or merge in GitHub/GitLab UI
vibeops task sync TASK-NNN     # optional — integration pull + delete task branch

# Same TASK follow-up:
vibeops task reship TASK-NNN
vibeops task merge TASK-NNN
```

TASK markdown **Status:** **In Progress** → **Shipped**. Merge and sync do not change the TASK file.

Follow `.cursor/rules/` for details.

## Agent roles

This project defines 8 agents in `.vibeops/agents/*.md`.

- `orchestrator` — picks the next TASK and delegates to the right agent.
- `planner` — expands an idea into `docs/project/{00,01,02,07}`.
- `architect` — fills `docs/project/{03,04}` (architecture and tech stack).
- `builder` — receives one TASK and changes code.
- `reviewer` — compares the diff with the Acceptance Criteria.
- `tester` — runs the Test Plan and fills Test Result.
- `docs` — updates `05-current-state.md`, TASK Result, and `docs/logs/`.
- `recovery` — diagnoses rollback options; destructive work requires `--confirm`.

## Forbidden

- Changing requirements or doing a vague implementation based only on chat.
- Changing code or config **without reading the current TASK file**.
- Mixing **multiple TASKs** in one session, or adding large structures such as `src/` without a TASK.
- Features outside the TASK **Scope** or outside the **MVP**.
- Creating a duplicate module **without searching** first.
- Performing a **large refactor** without a separate TASK.
- Adding **Notion or Git integration** not covered by the TASK.
- Calling a TASK ready to ship while skipping updates to **`05-current-state.md`, the TASK Result/Test Result, or `docs/logs/YYYY-MM-DD.md`** before `task ship`.
- Running `task merge`, `task sync`, or `task reship` unless the human asks.

## Cursor rule files

| File                                                  | Contents                                          |
| ----------------------------------------------------- | ------------------------------------------------- |
| `.cursor/rules/00-project-governance.mdc`             | Source of truth, one-TASK rule, MVP boundary.     |
| `.cursor/rules/01-agent-orchestration.mdc`            | The 8 agents' roles and collaboration flow.       |
| `.cursor/rules/02-task-workflow.mdc`                  | One-TASK start / progress / completion rules, dry-run first. |
| `.cursor/rules/03-git-safety.mdc`                     | Branch and rollback safeguards, no force-push.    |
| `.cursor/rules/03-docs-before-ship.mdc`              | Fill Result/Test and project docs before `task ship`. |
| `.cursor/rules/04-docs-update.mdc`                    | Required doc updates before ship.        |

## Completion report format

When implementation is ready to ship, include at least the following in the chat response (human runs `vibeops task ship`).

1. **TASK ID** (for example, `TASK-001`)
2. **Summary** — 2 to 4 sentences describing what was accomplished.
3. **Changed files** — list the main paths.
4. **Verification** — commands run and their results.
5. **Docs updated** — state whether `05-current-state.md`, the TASK Result/Test Result, and `docs/logs/YYYY-MM-DD.md` were updated.

Do not skip this report or just say "done".

## VibeOps metadata

- Project name: `vibeops`
- Bootstrapped by: VibeOps `0.1.0`
- Created at: `2026-05-11T01:53:45.788Z`
