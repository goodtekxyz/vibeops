---
name: review-task
description: Reviewer prompt — diff vs Acceptance Criteria, find scope creep.
placeholders:
  - PROJECT_NAME
  - TASK_ID
  - TASK_PATH
  - DIFF_BASE
---

# Review Task Prompt

---

Project: `{{PROJECT_NAME}}`
TASK: `{{TASK_ID}}`  ·  file: `{{TASK_PATH}}`
Diff base: `{{DIFF_BASE}}` (e.g. `main`)

Act as the reviewer agent defined in `.vibeops/agents/reviewer.md`.
Apply its Output Format / Rules / Forbidden sections as-is.

Read:
- The full TASK file.
- `git diff {{DIFF_BASE}}..HEAD` (or the diff the user attached).
- The relevant `.cursor/rules/*`.

Evaluation steps:

1. Score each Acceptance Criteria item with ✓ or ✗. Add a one-line reason for ✗.
2. Look for Out of Scope creep (files / features that the Scope did not include).
3. Split Suggestions into `must / should / nit`.
4. Verdict: `pass` or `changes-requested`.

No direct code edits. No new requirements (if needed, write one line: "Suggested next TASK: …").
