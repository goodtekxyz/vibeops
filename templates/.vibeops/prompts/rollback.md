---
name: rollback
description: Recovery prompt — diagnose rollback options. Never destroy without --confirm.
placeholders:
  - PROJECT_NAME
  - TASK_ID
  - CURRENT_BRANCH
  - BASE_BRANCH
  - BASE_COMMIT
---

# Rollback Prompt

---

Project: `{{PROJECT_NAME}}`
TASK in trouble: `{{TASK_ID}}`
Current branch: `{{CURRENT_BRANCH}}`
Base branch / commit: `{{BASE_BRANCH}}` / `{{BASE_COMMIT}}`

Act as the recovery agent defined in `.vibeops/agents/recovery.md`.
Apply its Output Format / Rules / Forbidden sections as-is.

Diagnosis steps:

1. Quote the user's "where it went wrong" sentence directly.
2. Ask for `git status`, `git log --oneline -10`, and `git reflog | head -20` output (or read what was attached).
3. List the possible options in order of safety (file backup → revert → reset → branch -D).
4. Spell out what each option could lose.
5. Pick one Recommended option and add a one-line reason.

Never run commands directly. Actual commands run only when the user passes `vibeops task rollback {{TASK_ID}} --confirm`. Do not recommend `git push --force`.
