# {{PROJECT_NAME}} — Claude Code

Read **`AGENTS.md`** first (VibeOps workflow and source of truth).

## Skills (project)

| Skill | When |
|-------|------|
| `/plan-task` | Refine `docs/tasks/TASK-NNN-*.md` before coding |
| `/implement-task` | Build per TASK Scope and Acceptance Criteria |

Skills live in `.claude/skills/`.

## Session start

1. `docs/project/05-current-state.md`
2. The **full** current `docs/tasks/TASK-NNN-*.md` file
3. `docs/project/03-architecture.md` and `06-decisions.md` when relevant

## Git

- Branch: `task/*` from `vibeops task add`
- Commit messages include the TASK id, e.g. `feat(task-015): short title`
- Do not merge to main unless the human runs `vibeops task done` or asks

## Finishing

Fill **Result** and **Test Result** in the TASK file, then tell the human to run `vibeops task done TASK-NNN`.
