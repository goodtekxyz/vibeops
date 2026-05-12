---
name: create-plan
description: Build/refresh docs/project/{00,01,02,07} from current idea + existing docs.
placeholders:
  - PROJECT_NAME
  - PROJECT_IDEA
---

# Create Plan Prompt

---

Project: `{{PROJECT_NAME}}`
Updated idea / focus: `{{PROJECT_IDEA}}`

Act as the planner agent defined in `.vibeops/agents/planner.md`.

Existing `docs/project/*` files may already be present. If the files below exist, **read them and update only the deltas** (do not rewrite from scratch):

- `docs/project/00-overview.md`
- `docs/project/01-requirements.md`
- `docs/project/02-mvp-scope.md`
- `docs/project/07-backlog.md`

The output format matches `start-project.md` — four fenced blocks, each starting with `<!-- file: <path> -->`.

Also report:

1. The list of sections you changed (by file, identified by H2 header).
2. The TASK IDs added, removed, or reordered in the backlog.
3. Up to three ambiguous points that need a user decision.

Do not write code. Do not touch `docs/project/03-architecture.md` or `04-tech-stack.md`.
