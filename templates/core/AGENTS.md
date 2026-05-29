# {{PROJECT_NAME}} — AI agent guide

> Installed by **VibeOps**. Agents read this repo and `docs/tasks/`, not chat history.

## Source of truth

| What | Where |
|------|--------|
| Current work | `docs/tasks/TASK-NNN-*.md` |
| Project memory | `docs/project/05-current-state.md`, `03-architecture.md`, `06-decisions.md` |
| Change history | Git commits on task branches |
| **Not** trusted | Chat history, Slack |

## Before you code

1. `docs/project/05-current-state.md`
2. `docs/project/03-architecture.md` and `06-decisions.md` when relevant
3. **The full current TASK file** under `docs/tasks/`

## Workflow (human + CLI)

```bash
vibeops init              # once (pick Cursor / Claude Code / Codex packs)
vibeops task add          # new TASK + branch
# Plan: refine TASK file with your agent (see client skills below)
# Build: implement per TASK Scope / Acceptance Criteria
vibeops task done         # close TASK, update project docs, merge
vibeops status            # briefing
vibeops llm connect       # LLM for task add / task done
```

## Client packs (installed at init)

| Tool | Rules / guide | Skills |
|------|----------------|--------|
| **Cursor** | `.cursor/rules/` | `.cursor/skills/` (`plan-task`, `implement-task`) |
| **Claude Code** | `CLAUDE.md` | `.claude/skills/` |
| **Codex CLI** | `AGENTS.md` (this file) | `.agents/skills/` |

## Rules (all agents)

- **One TASK at a time** — stay inside Scope and Acceptance Criteria.
- **Search** before adding files; reuse existing patterns.
- Fill **Result** and **Test Result** before `vibeops task done`.
