# TASK-007 · `task generate` command

## Status

Review

## Git Context

- Base Branch: `main`
- Base Commit: `b717254`
- Task Branch: `task/008-task-lifecycle`
- Started At: `2026-05-11T02:18:00Z`

## MVP Phase

MVP 2 · Project Planner

## Goal

Implement `vibeops task generate`. Given an item from `docs/project/05-backlog.md` (or a title supplied directly), it either **creates TASK files** or **emits a generation prompt**.

## Background

Once `vibeops plan` has populated the backlog, the next step is to expand each backlog item into a TASK file that Cursor can execute on its own. This TASK provides that expansion in two modes:

1. **Prompt mode (default)** — take a backlog item and print a Cursor paste prompt that says "expand this item into a TASK file".
2. **Scaffold mode (`--scaffold`)** — generate the TASK file skeleton directly (empty body, section headers only).

## Scope

- `src/commands/taskGenerate.ts`.
- `src/tasks/idAllocator.ts` — decide the next TASK number (scan `docs/tasks/*.md`, max N+1).
- `src/tasks/scaffold.ts` — `docs/tasks/TASK-NNN-<slug>.md` skeleton writer (uses the same section headers as this repo's TASK template).
- `src/planner/taskPrompt.ts` — build the prompt from `.vibeops/prompts/task-generate.md` + backlog item + project context.
- Options:
  - `--from-backlog <id-or-title>` — choose a backlog item.
  - `--title <text>` — ad-hoc title.
  - `--scaffold` — create files directly (no prompt output).
  - `--mvp <n>` — auto-fill MVP Phase.
  - `--dry-run` — only show "what would be created", no actual changes.
  - `--out <path>` — save the prompt to a file in prompt mode.

## Out of Scope

- Adding backlog items automatically (the backlog is handled by `vibeops plan`).
- Direct LLM calls.

## Acceptance Criteria

1. `vibeops task generate --from-backlog "TASK-001"` or `--title "..."` determines the next TASK number (e.g. TASK-013) and slug, and prints a **Cursor prompt to create the TASK file** to stdout.
2. With `--scaffold`, `docs/tasks/TASK-NNN-<slug>.md` is generated with the same section headers as this repository (Status, MVP Phase, Goal, Background, Scope, Out of Scope, Acceptance Criteria, Files to Inspect First, Expected Files to Change, Risks, Test Plan, Rollback Plan, Implementation Plan, Result, Test Result).
3. If the same number already exists, a collision message is printed and exit code ≠ 0.
4. `--dry-run` shows which files / prompt would be produced; actual change count is 0.
5. The generated TASK file's `Status` is `planned`, and `MVP Phase` is either the `--mvp` option value or "(unassigned)".
6. The prompt-mode output is a single markdown blob ready to paste into Cursor.

## Files to Inspect First

- `templates/docs/tasks/TASK-000-example.md` (TASK-003).
- `templates/.vibeops/prompts/task-generate.md` (TASK-003).
- `src/tasks/scanner.ts` (TASK-004).
- `src/planner/buildPrompt.ts` (TASK-006).

## Expected Files to Change

- new: `src/commands/taskGenerate.ts`, `src/tasks/idAllocator.ts`, `src/tasks/scaffold.ts`, `src/planner/taskPrompt.ts`.
- new: `tests/task-generate.test.ts`.
- update: this TASK's Result / Test Result, `docs/project/03-current-state.md`, `docs/logs/YYYY-MM-DD.md`.

## Risks

- Slug generation with Hangul / special characters → keep only ASCII and join with `-`.
- Number collisions (multiple users at once) → no concurrency assumption in the MVP. On collision, the command only guides.

## Test Plan

- vitest:
  - Empty `docs/tasks/` → next number = 1.
  - Existing TASK-001..012 → next number = 13.
  - With `--scaffold`, every required section header is present in the body.
  - With `--dry-run`, no file changes.
- Manual: `vibeops task generate --title "Sample" --scaffold --dry-run` in this repository.

## Rollback Plan

- Discarding the working branch reverts the code. If the user dislikes files produced by `--scaffold`, deleting those files is enough.

## Implementation Plan

1. Decide the next number with `idAllocator.ts`.
2. Write a slug helper (lowercase / hyphen).
3. Write the section-header skeleton writer in `scaffold.ts`. 1:1 with the repository's TASK template.
4. Build the prompt in `taskPrompt.ts`.
5. Handle options in `commands/taskGenerate.ts`.
6. Tests + doc updates.

## Result

Completed 2026-05-11 (awaiting review). Implemented the `vibeops task generate` body. To reflect the user's updated requirements, the original TASK-007 option set (`--from-backlog`, `--title`, `--mvp`, `--out`) was reorganised as follows.

### User requirement vs the original TASK-007 doc (deviations)

- Original doc: `--from-backlog <id-or-title>` + `--title <text>` two input modes.
  Actual implementation: simplified to a **unified-context mode**. By default it reads `docs/project/07-backlog.md` + the rest of `00 ~ 09` + `.vibeops/brief/project-brief.md` and aggregates them. Ad-hoc input is `--from <path>` and is embedded as an inline code block in the prompt.
- Original doc: `--mvp <n>` → renamed to `--phase <name>` (e.g. `MVP 4`) to align wording with the `plan` command.
- Original doc: `--out <path>` → renamed to `--output <path>` (same name as `plan`).
- Original doc: `--scaffold` creates one TASK file skeleton.
  Actual implementation: a `--count <number>` (default 8) allows creating multiple placeholder TASK files at once. Existing TASK numbers are scanned, the start point is the next available number, and collisions auto-skip. Existing files are never overwritten.
- Original doc: AC mentions 15 sections.
  Actual implementation: per user direction, **18 sections** are enforced (the original 15 + `Git Context` + `Notion Page` + `Review Notes`). The `Git Context` section introduced this round in TASK-008 / 009, the MVP-4 sync `Notion Page` section, and the human / Reviewer-Agent `Review Notes` section are the new additions.

### Added / modified files

- new: `src/lib/project-docs.ts` — reads `docs/project/*` and `.vibeops/brief/project-brief.md` slot by slot, with a legacy-fallback map (`07-backlog.md ← 05-backlog.md`, `03-architecture.md ← 01-architecture.md`, etc.) so this VibeOps repository itself works while it still uses the older numbering.
- new: `src/lib/task-generator.ts` — exports:
  - `slugify(text, fallback)` — ASCII / lowercase / `-` join / NFKD diacritic strip / falls back to `task` when empty.
  - `REQUIRED_TASK_SECTIONS` — 18-section constant.
  - `buildTaskGeneratePrompt(inputs)` — builds a single markdown blob for pasting into the Cursor Planner Agent. Includes Hard rules (no code generation, no LLM / Cursor-CLI / Notion / GitHub-API calls), source-of-truth rules (`docs/tasks/* = AI execution source of truth`, `Notion = human dashboard`), input-doc inventory (`✓` / `·`), suggested count / phase filter, the 18-section requirement, input-doc inline code blocks, and the response format (plan summary → TASK blocks → changed file list → generated TASK summary → Assumptions).
- new: `src/lib/task-scaffold.ts` — `planScaffoldEntries` (reserves N numbers avoiding collisions) + `renderScaffoldMarkdown` (18-section placeholder skeleton) + `writeScaffoldFiles` (skips existing files).
- update: `src/lib/task.ts` — adds helpers `highestTaskNumber(tasksDir)`, `nextTaskNumber(tasksDir)`, `formatTaskId(n, width=3)`.
- update: `src/commands/task-generate.ts` — replaces the stub. Handles `--from` (existence check with a friendly error), `--output`, `--count` (>20 warns; invalid falls back to 8 with a warning), `--phase`, `--scaffold`, `--dry-run`, `--cwd`. Branches between the two modes. Both dry-run and real mode have zero LLM / Cursor-CLI / Notion / GitHub-API / Git-mutation calls.
- update: `src/cli.ts` — exposes the options above on `task generate`.

### Default flow (prompt mode)

1. Read `docs/project/07-backlog.md` + `00 ~ 09` + `.vibeops/brief/project-brief.md` (+ `--from <path>`). Missing slots are marked `·` in the inventory.
2. Find the highest number in `docs/tasks/TASK-*.md` and compute `nextTaskId` (e.g. `TASK-013`).
3. Build a Cursor paste prompt reflecting `count` (default 8) + `phase` (when present).
4. Save it to `.vibeops/generated/task-generate-prompt.md` (or `--output <path>`).
5. Print the inventory · plan · next actions (`paste into Cursor` → review `git diff` → `vibeops task start TASK-NNN`) to the terminal.

### Scaffold-mode flow

1. Scan existing numbers and reserve `count` next numbers (skipping over occupied numbers).
2. With `--dry-run`, only print the list of files that would be created plus a skeleton preview of the first entry, then exit.
3. In real mode, write each file with the 18-section placeholder markdown. Existing files are never overwritten.

### Safeguards

- **Zero LLM / Cursor-CLI / Notion / GitHub-API / Git-mutation calls in VibeOps.** Prompt mode writes a single markdown via `writeText`. Scaffold mode only creates new markdown files; never touches existing ones.
- `--from <path>` missing → friendly error + exit 1.
- `--count` non-integer → falls back to 8 + warning. `--count > 20` warns only (does not abort, "Planner Agent may push back").
- `--dry-run` produces zero file changes in both prompt and scaffold modes.
- `.vibeops/generated/` is gitignored, so the produced prompt is never committed.

## Test Result

- `pnpm typecheck` → exit 0.
- `pnpm build` → exit 0.
- `pnpm exec tsx src/cli.ts task generate --help` → 7 options (`--from / --output / --count / --phase / --scaffold / --dry-run / --cwd`) all visible.
- Sandbox (`/var/folders/.../vibeops-gen-XXXX/`) — after `init`, added TASK-001/002 fixtures and verified the 11 cases below:

  | # | Command | Result |
  | --- | --- | --- |
  | 1 | `task generate --dry-run` | next id `TASK-003`, inventory 10 ✓ + brief 1 ·, "no LLM / Cursor / Notion / GitHub / Git call" output, `.vibeops/generated/` **not created** |
  | 2 | `task generate` (real) | `.vibeops/generated/task-generate-prompt.md` 456 lines produced. Header carries schema=1, version=0.1.0, 18 sections all enforced ✓ |
  | 3 | `task generate --count 5 --phase "MVP 4"` | `**around 5 items**`, `MVP Phase filter: MVP 4`, `## MVP Phase body is MVP 4`, `Notion Page (MVP 4 / TASK-011…)` all correctly emitted in the prompt |
  | 4 | `task generate --output .vibeops/generated/test-task-prompt.md` | Output goes to the specified path ✓ |
  | 5 | `task generate --scaffold --dry-run --count 2` | Zero files created, skeleton preview of the first item printed |
  | 6 | `task generate --scaffold --count 2` | `TASK-003-planned-task.md`, `TASK-004-planned-task.md` produced. **All 18 sections present ✓** (Status / MVP Phase / Goal / Background / Scope / Out of Scope / Acceptance Criteria / Files to Inspect First / Expected Files to Change / Risks / Test Plan / Rollback Plan / Git Context / Notion Page / Implementation Plan / Result / Test Result / Review Notes) |
  | 7 | `task generate --scaffold --count 2` (rerun) | Collision avoidance — proceeds to `TASK-005 / TASK-006`. Existing 003/004 unchanged |
  | 8 | `task generate --from doesnotexist.md` | `✗ --from path not found: …` + exit 1, 0 files written |
  | 9 | `task generate --from my-backlog.md` | First inventory line shows `Custom input (--from) **(primary)**`; the prompt body contains the inline `my-backlog.md` block |
  | 10 | `task generate --count 25 --dry-run` | `! --count 25 is large (soft cap 20). Continuing, but the Planner Agent may push back.` warning; count=25 proceeds |
  | 11 | `task generate --count abc --dry-run` | `! --count must be a positive integer (got: "abc"). Falling back to default 8.` + count=8 proceeds |

- Live-repo read-only check: `node dist/cli.js task generate --dry-run --cwd /Users/hjhamm/goodtek/vibeops` → next id `TASK-013` (current max TASK-012 + 1), inventory 10 ✓ + brief 1 ·, 0 files written. `git status --porcelain | wc -l` identical before/after the command.
- Sandbox cleanup: the 4 `--scaffold`-produced TASK-003 ~ TASK-006-planned-task.md files exist only in the sandbox temp dir (`/var/folders/...`); none in the live repo. Only `--dry-run` was run against the live repo.
- Zero LLM-API / Cursor-CLI / Notion-API / GitHub-API / Git-mutation calls in this round.
- Deferred: vitest auto-regressions (accumulated up to TASK-007). Will be consolidated in the polish round.
