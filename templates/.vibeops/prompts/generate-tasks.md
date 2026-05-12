---
name: generate-tasks
description: Expand a backlog row into a full docs/tasks/TASK-NNN-*.md.
placeholders:
  - PROJECT_NAME
  - BACKLOG_ITEM
  - TASK_ID
  - TASK_SLUG
---

# Generate Task Prompt

---

Project: `{{PROJECT_NAME}}`
Backlog item: `{{BACKLOG_ITEM}}`
Target TASK: `{{TASK_ID}}` slug `{{TASK_SLUG}}`

Act as a "TASK author" (an offshoot of planner). Take the backlog item above and produce a single TASK file.

Output is a single fenced markdown block. The first line is the comment `<!-- file: docs/tasks/{{TASK_ID}}-{{TASK_SLUG}}.md -->`.

The file must include **all** of the sections below (keep the header even when the section is empty):

- `Status` (planned)
- `MVP Phase`
- `Goal` (2 to 4 sentences)
- `Background` (why we need this now)
- `Scope` (bullets)
- `Out of Scope` (bullets — explicit exclusions)
- `Acceptance Criteria` (numbered, verifiable statements)
- `Files to Inspect First`
- `Expected Files to Change`
- `Risks`
- `Test Plan` (prefer runnable commands)
- `Rollback Plan`
- `Implementation Plan` (numbered)
- `Result` — `(not yet)`
- `Test Result` — `(not yet)`

Read `docs/project/03-architecture.md`, `04-tech-stack.md`, `06-decisions.md` first so the TASK does not contradict them. Features outside the MVP go into Out of Scope as explicit rejections.
