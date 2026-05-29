---
name: plan-task
description: Refines a VibeOps TASK file (Goal, Scope, AC, Test Plan) via dialogue. Use when planning or editing docs/tasks/TASK-NNN.md before implementation.
disable-model-invocation: true
---

# Plan a TASK

The human opened a TASK file (e.g. `docs/tasks/TASK-015-….md`).

## Instructions

1. Read `AGENTS.md`, your agent rules, and the TASK file; read `docs/project/05-current-state.md`.
2. Ask only what is missing to make **Scope**, **Acceptance Criteria**, and **Test Plan** verifiable.
3. Edit the TASK file in place — do not create a second TASK id.
4. Keep **Out of Scope** explicit.
5. Do not write application code in this step unless the human asks.

When planning is enough, tell the human to implement per the TASK (Agent mode / Codex / Claude Code as they prefer).
