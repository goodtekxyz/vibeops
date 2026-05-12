# TASK-004 · `status` command

## Status

done

## MVP Phase

MVP 1 · Project Bootstrapper

## Goal

Implement `vibeops status`. Check whether the current directory (or `--cwd`) is a VibeOps project and show, in a human-readable format, installation state / doc state / TASK counts / Notion connectivity availability.

## Background

Right after bootstrap, users need a first diagnostic to answer "what is installed so far". Because every later command will partially repeat this information, modularising **state collection** well here yields high reuse value.

## Scope

- `src/commands/status.ts`.
- `src/status/collector.ts` — gather:
  - VibeOps installation state (`.vibeops.json` present? `AGENTS.md`? `.cursor/rules/`?).
  - Template-file presence (M of N required files exist).
  - Scan `docs/tasks/*.md` and count TASKs (total / planned / in_progress / done).
  - Current Git branch, dirty? (summary).
  - Notion environment-variable presence (no actual calls, just key presence).
- Options:
  - `--json` — machine-friendly JSON (later commands reuse status).
  - `--cwd <path>`.

## Out of Scope

- Real Notion calls (→ TASK-010 `notion test`).
- TASK status mutation (→ TASK-008).

## Acceptance Criteria

1. In a directory without VibeOps, `vibeops status` prints "Not a VibeOps project" and lists which files are missing (exit code ≠ 0).
2. In an installed directory, the output has these sections:
   - Project (name, vibeopsVersion, schemaVersion)
   - Installation (required-file checklist, missing items)
   - Tasks (total / planned / in_progress / done, the next runnable TASK)
   - Git (current branch, dirty?)
   - Notion (env keys present? — no actual calls)
3. With `--json`, the same information is emitted as valid JSON.
4. All information gathering is **read-only** (no file is created or modified).
5. Fast — completes within 1 second on large repos (file counts in the dozens to hundreds).

## Files to Inspect First

- `src/config/projectConfig.ts` (TASK-002).
- `templates/docs/tasks/TASK-000-example.md` (verify the TASK metadata header format).
- `docs/project/01-architecture.md` § components table.

## Expected Files to Change

- new: `src/commands/status.ts`, `src/status/collector.ts`, `src/status/format.ts`.
- new: `src/tasks/scanner.ts` (TASK-file scanner — also reused in TASK-008).
- new: `tests/status.test.ts`.
- update: this TASK's Result / Test Result, `docs/project/03-current-state.md`, `docs/logs/YYYY-MM-DD.md`.

## Risks

- TASK metadata format (frontmatter) must match the TASK-003 templates → validate both via the same schema module.
- A Git call failure (non-repo) must not crash status → catch it and show "not a git repo".

## Test Plan

- vitest cases:
  - Empty directory → `Not a VibeOps project`, exit code 1.
  - Right after `init` → all required files OK, tasks=0 (or 1 example).
  - With several TASK files → status reports the correct counts.
  - `--json` is valid JSON.
- Manual: run `vibeops status` against this repo to inspect itself.

## Rollback Plan

- Discarding the working branch is enough. Read-only, so no user-side side effects.

## Implementation Plan

1. Define the TASK metadata frontmatter schema in `src/tasks/schema.ts` (zod recommended).
2. Use `scanner.ts` to read `docs/tasks/*.md` and extract metadata + title.
3. In `collector.ts`, aggregate installation / tasks / git / notion information into an object.
4. In `format.ts`, branch between human output and `--json`.
5. Register the command in `commands/status.ts`.
6. Tests + doc updates.

## Result

Completed 2026-05-11. `vibeops status` inspects the current directory's VibeOps installation, TASK state, Git, and Notion environment variables — read-only.

- **State collection**: `src/status/collector.ts` — `collectStatus(cwd)` gathers:
  - `.vibeops.json` parsed (or `null` if missing).
  - Required / optional file checklist (10 items: `.vibeops.json` · `AGENTS.md` · `.cursor/rules/` · `docs/project/` · `docs/tasks/` etc.).
  - Scan `docs/tasks/*.md` → TaskMeta list, counts (total / planned / in_progress / blocked / done), the next runnable TASK.
  - Current Git branch + dirty (`src/lib/git.ts`).
  - Notion environment-variable presence (`NOTION_API_KEY`, `NOTION_PROJECT_DB`, `NOTION_TASK_DB`) — no actual API calls.
- **Output formatter**: `src/status/format.ts` — 5 human sections (Project · Installation · Tasks · Git · Notion) + `toJson()`.
- **TASK scanner**: `src/lib/task.ts` — parse frontmatter via gray-matter; when absent, extract `## Status` and `## MVP Phase` from the body via regex (current repo TASK files all use the body-header pattern). Extract the ID from `TASK-NNN-...` filenames.
- **Options**: `--json` (machine-readable), `--cwd <path>`.
- **Exit code**: when the directory is not VibeOps or a required file is missing, `process.exitCode = 1`. Read-only — never modifies or creates a file.
- **Deferred**: vitest smoke (`tests/status.test.ts`) excluded from this round per user scope. Manual verification was used instead.

### Changed files

| File | Kind |
| --- | --- |
| `src/commands/status.ts` | update (stub → real implementation) |
| `src/status/collector.ts` | new |
| `src/status/format.ts` | new |
| `src/lib/task.ts` | new |
| `src/lib/git.ts` | new |
| `src/types/task.ts` | new |
| `src/cli.ts` | update (`--json`, `--cwd` options) |

## Test Result

- **vibeops repo itself** (no `.vibeops.json`): `pnpm dev status` → exit 1, "Not a VibeOps project", 4 required paths missing (`.vibeops.json` / `AGENTS.md` / `.cursor/rules/` / `.vibeops/agents/`). Simultaneously catches the 12 TASKs (planned 11, done 1) count and the next TASK (TASK-002) accurately. Git branch (`task/002-init-system`) / dirty also correct. — AC#1 pass.
- **After sandbox install**: `pnpm dev status --cwd /tmp/vibeops-sandbox` → exit 0, Project (name=byobrowser, vibeopsVersion=0.1.0, schemaVersion=1, createdAt shown) + Installation all ✓ + Tasks (total:1, planned:1, next=TASK-000) + Notion (all keys absent) + "VibeOps project ready." message. — AC#2 pass.
- `--json`: `pnpm exec tsx src/cli.ts status --cwd /tmp/vibeops-sandbox --json | python3 -c "import sys,json; d=json.load(sys.stdin); ..."` → valid JSON, `isVibeopsProject: True`, `config.name: byobrowser`, `tasks.counts: {total:1, planned:1, ...}`, `notion: {hasApiKey: False, ...}`. — AC#3 pass.
- **Read-only**: running status twice after install causes zero changes to the directory (`git diff /tmp/vibeops-sandbox` clean). — AC#4 pass.
- **Performance**: ~600ms to inspect the vibeops repo itself (~80 files). AC#5 pass with margin.
- Acceptance Criteria 1–5 all pass.
