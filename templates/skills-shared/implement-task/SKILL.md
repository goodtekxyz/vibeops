---
name: implement-task
description: Implement the current VibeOps TASK file in the repo.
---

# Implement TASK

1. Read the full `docs/tasks/TASK-NNN-*.md` (Scope, Acceptance Criteria, Test Plan).
2. Search the codebase before adding new patterns.
3. Implement only within the TASK scope.
4. Do not run `vibeops task ship`, `merge`, or `sync` — the human runs the CLI lifecycle.

When implementation is ready, tell the human to run `vibeops task ship TASK-NNN`. `ship` is state-aware: re-running it before merge updates the open PR; after merge it starts a new PR cycle with `vibeops task ship --new-cycle`.
