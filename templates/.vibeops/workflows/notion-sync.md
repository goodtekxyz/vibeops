# Workflow · Notion Sync

Notion is the **human dashboard**. It is not the source of truth.

## What is synced

| Direction           | What                                                                  | Where                          |
| ------------------- | --------------------------------------------------------------------- | ------------------------------ |
| docs → Notion       | TASK ID, title, status, priority, branch, docs path, result summary    | Task DB                        |
| docs → Notion       | Project name, current-state summary, next TASK ID                       | Project DB (single row by default) |
| Notion → docs       | TASK status, priority (frontmatter)                                   | `docs/tasks/*.md` frontmatter  |

## What is NOT synced

- TASK bodies (Scope, Acceptance Criteria, Implementation Plan, …).
- The bodies of `docs/project/00 ~ 07`.
- Code changes / Git state.

Details always live in the Git docs.

## Setup

```bash
vibeops notion init
# Prompts for NOTION_TOKEN. If `.vibeops.env` does not exist it asks before
# creating one; if it exists, only the NOTION_TOKEN line is replaced safely.
# Target IDs for the Projects / Tasks databases are not environment variables —
# they are stored in `.vibeops.json` as `notion.projectsTargetId` /
# `notion.tasksTargetId`.

vibeops notion test
# Validates API access + DB schemas (required properties: Name / TaskId /
# Status / Priority / Branch / DocsPath / ResultSummary).
```

> The legacy `NOTION_API_KEY` / `NOTION_PROJECT_DB` / `NOTION_TASK_DB` environment variables are no longer used. VibeOps reads only `NOTION_TOKEN`.

## Usage

```bash
vibeops notion sync             # push (idempotent)
vibeops notion sync --dry-run   # preview

vibeops task pull               # Notion → docs frontmatter
vibeops task pull --dry-run     # preview
```

## Non-goals

- Realtime webhooks.
- Two-way body sync.
- Child-block sync on Notion pages.
- Creating new TASKs in Notion and pulling them into docs (that belongs to `vibeops task generate`).
