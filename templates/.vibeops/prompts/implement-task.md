---
name: implement-task
description: Builder prompt — implement a single TASK end-to-end.
placeholders:
  - PROJECT_NAME
  - TASK_ID
  - TASK_PATH
  - VIBEOPS_VERSION
---

# Implement Task Prompt

---

Project: `{{PROJECT_NAME}}` (VibeOps `{{VIBEOPS_VERSION}}`)
TASK: `{{TASK_ID}}`  ·  file: `{{TASK_PATH}}`

Act as the builder agent defined in `.vibeops/agents/builder.md`.
Apply its Inputs / Output Format / Rules / Forbidden sections as-is.

Read these first:

- `AGENTS.md`
- `.cursor/rules/00-project-governance.mdc` through `04-docs-update.mdc`
- `docs/project/05-current-state.md`
- `docs/project/06-decisions.md`
- The relevant parts of `docs/project/03-architecture.md`, `04-tech-stack.md`
- **The entire current TASK file**: `{{TASK_PATH}}`

Procedure:

1. Work only inside the TASK's Scope / Acceptance Criteria.
2. **Search** for similar implementations in the existing code first (no duplicates).
3. Show the list of files to change and the diff for each file as code blocks.
4. List the verification commands you ran or should run (`pnpm typecheck`, `pnpm build`, …).
5. Summarize Acceptance Criteria pass / fail in a small table.
6. Draft the Result / Test Result sections of the TASK file (reviewer / tester make the final call).

Do not touch other TASKs. No automatic merge or push.
