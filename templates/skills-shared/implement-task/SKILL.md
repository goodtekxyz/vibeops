---
name: implement-task
description: Implements the current VibeOps TASK per Scope and Acceptance Criteria. Use when building features for docs/tasks/TASK-NNN.md.
disable-model-invocation: true
---

# Implement a TASK

## Read first

1. `AGENTS.md` and your agent rules (e.g. `.cursor/rules/`, `CLAUDE.md`)
2. `docs/project/05-current-state.md`, `03-architecture.md`, `06-decisions.md`
3. The TASK file referenced by the human

## Instructions

1. Work **only** within Scope and Acceptance Criteria.
2. Search the repo before adding files; match existing patterns.
3. Fill **Result** and **Test Result** with facts when done.
4. Do not run `vibeops task done` or merge — the human closes the TASK.

Tell the human to run `vibeops task done TASK-NNN` when ready.
