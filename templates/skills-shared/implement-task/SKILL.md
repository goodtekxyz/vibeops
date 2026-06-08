---
name: implement-task
description: Implement the current VibeOps TASK file in the repo.
---

# Implement TASK

1. Read the full `docs/tasks/TASK-NNN-*.md` (Scope, Acceptance Criteria, Test Plan).
2. Search the codebase before adding new patterns.
3. Implement only within the TASK scope.
4. Do not run `vibeops task ship`, `reship`, `merge`, or `sync` — the human runs the CLI lifecycle.

When implementation is ready, tell the human to run `vibeops task ship TASK-NNN`. For a **Shipped** follow-up after merge, use `vibeops task reship TASK-NNN`.
