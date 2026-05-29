# {{PROJECT_NAME}} — AI agent guide

> Installed by **VibeOps**. Cursor reads this repo, not chat history.

## Source of truth

| What | Where |
|------|--------|
| Current work | `docs/tasks/TASK-NNN-*.md` |
| Project memory | `docs/project/05-current-state.md`, `03-architecture.md`, `06-decisions.md` |
| Change history | Git commits on task branches |
| **Not** trusted | Cursor chat, Slack |

## Before you code

1. `docs/project/05-current-state.md`
2. `docs/project/03-architecture.md` and `06-decisions.md` when relevant
3. **The full current TASK file** under `docs/tasks/`

## Workflow (human + CLI)

```bash
vibeops init              # once
vibeops task add          # new TASK + branch
# Plan in Cursor Ask: @docs/tasks/TASK-NNN-….md
# Build in Cursor Agent: same file + Scope / Acceptance Criteria
vibeops task done         # close TASK, update project docs, push + open MR/PR
vibeops status            # briefing
vibeops llm connect       # set up LLM providers and pick default
```

## Rules

- **One TASK at a time** — stay inside Scope and Acceptance Criteria.
- **Search** before adding files; reuse existing patterns.
- When the TASK is finished, **Result** and **Test Result** must be filled before `vibeops task done`.

Details: `.cursor/rules/`.
