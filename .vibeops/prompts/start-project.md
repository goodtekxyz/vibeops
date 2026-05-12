---
name: start-project
description: First-time onboarding prompt to bootstrap docs/project/* from a single idea.
placeholders:
  - PROJECT_NAME
  - PROJECT_IDEA
---

# Project Start Prompt

Paste the text below directly into the Cursor chat.

---

Project: `{{PROJECT_NAME}}`
Idea: `{{PROJECT_IDEA}}`

Act as the planner agent defined in `.vibeops/agents/planner.md`.
Apply its Inputs / Output Format / Rules / Forbidden sections as-is.

Goal: based on the idea above, fill in these four files.

- `docs/project/00-overview.md`
- `docs/project/01-requirements.md`
- `docs/project/02-mvp-scope.md`
- `docs/project/07-backlog.md`

Output is four fenced markdown blocks. The first line of each block is a `<!-- file: <path> -->` comment.
Do not touch any other files. Do not produce time or staffing estimates, and do not design the architecture.

Required context to read first:
- `AGENTS.md`
- `.cursor/rules/00-project-governance.mdc`
- `.cursor/rules/01-agent-orchestration.mdc`
- `.vibeops/agents/planner.md`

When you finish, report two things together:
1. The next agent to invoke (usually `architect` → fill in `docs/project/{03,04}`).
2. Up to three open questions that the user must decide.
