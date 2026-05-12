# TASK-016 · Notion env template cleanup

## Status

Review

## MVP Phase

Follow-on (post-MVP 4 follow-up)

## Goal

Bring the `.vibeops.env.example` produced by `vibeops init` and the related template documents (`templates/docs/project/08-env.md`, `templates/.vibeops/workflows/notion-sync.md`) up to date with VibeOps's current Notion structure. Remove the legacy env vars (`NOTION_API_KEY` / `NOTION_PROJECT_DB` / `NOTION_TASK_DB`) from the default templates and unify around `NOTION_TOKEN` + `.vibeops.json` `notion.{projectsTargetId,tasksTargetId}`.

## Background

TASK-015 stopped exposing legacy Notion env vars in `vibeops status` output, but the `.vibeops.env.example` that a new project receives from `vibeops init` still contains `NOTION_API_KEY=` / `NOTION_PROJECT_DB=` / `NOTION_TASK_DB=` lines, leading new users to fill the wrong env keys. For the same reason, the env table in `templates/docs/project/08-env.md` and the setup instructions in `templates/.vibeops/workflows/notion-sync.md` drift from the new structure.

## Scope

- Edit `envExampleContents()` in `src/bootstrap/installer.ts` to emit only a single `NOTION_TOKEN=` line (header + empty value). Remove `NOTION_API_KEY` / `NOTION_PROJECT_DB` / `NOTION_TASK_DB` lines. Do not seed other keys like `GITHUB_TOKEN` / `OPENAI_*` by default.
- Clean up the env table in `templates/docs/project/08-env.md`:
  - Keep only `NOTION_TOKEN` as the default variable.
  - Add a single sentence explaining that target IDs are stored in `.vibeops.json` `notion.projectsTargetId` / `notion.tasksTargetId`, not in environment variables.
  - Either keep legacy keys as a single-line compatibility note ("legacy — no longer used") or remove them entirely.
- Remove the 3 legacy keys from the configuration block of `templates/.vibeops/workflows/notion-sync.md` → switch to `NOTION_TOKEN` and add a line indicating target IDs are stored in `.vibeops.json`.
- Synchronise the equivalent files inside the vibeops project itself (`.vibeops.env.example`, `docs/project/08-env.md`, `.vibeops/workflows/notion-sync.md`) so they match the templates.
- Add one line to the Notion Setup section in `README.md`: "Legacy `NOTION_API_KEY` / `NOTION_PROJECT_DB` / `NOTION_TASK_DB` are no longer used — only `NOTION_TOKEN` is read."

## Out of Scope

- Behavioural changes to `vibeops notion init` / `notion test` / `notion sync`.
- Changing the token loader logic in `src/lib/notion-env.ts` (TASK-015 already settled on `NOTION_TOKEN` only).
- Updating primary design docs like vibeops's own `docs/project/01-architecture.md` / `02-tech-stack.md` (those are historical design records — current state is owned by `03-current-state.md`).
- Creating or committing a real `.vibeops.env`.

## Acceptance Criteria

- `envExampleContents()` in `src/bootstrap/installer.ts` outputs nothing beyond a single `NOTION_TOKEN=` line.
- After `node dist/cli.js init --git --initial-commit` in a temp directory, the generated `.vibeops.env.example` contains no `NOTION_API_KEY` / `NOTION_PROJECT_DB` / `NOTION_TASK_DB`; only `NOTION_TOKEN=`.
- `templates/docs/project/08-env.md` and `templates/.vibeops/workflows/notion-sync.md` contain zero legacy keys (`grep -E 'NOTION_API_KEY|NOTION_PROJECT_DB|NOTION_TASK_DB' templates/` returns nothing).
- The mirrored files inside the vibeops project (`.vibeops.env.example`, `docs/project/08-env.md`, `.vibeops/workflows/notion-sync.md`) also have zero legacy keys.
- `vibeops status` output preserves the TASK-015 result (no regression).
- `pnpm typecheck` / `pnpm build` / `pnpm smoke` all pass.
- No real `.vibeops.env` file is created or committed.
- The raw `NOTION_TOKEN` value does not appear in any output.

## Files to Inspect First

- `src/bootstrap/installer.ts`
- `.vibeops.env.example`
- `templates/docs/project/08-env.md`
- `templates/.vibeops/workflows/notion-sync.md`
- `docs/project/08-env.md`
- `.vibeops/workflows/notion-sync.md`
- `README.md` (Notion Setup section)

## Expected Files to Change

- `src/bootstrap/installer.ts`
- `.vibeops.env.example`
- `templates/docs/project/08-env.md`
- `templates/.vibeops/workflows/notion-sync.md`
- `docs/project/08-env.md`
- `.vibeops/workflows/notion-sync.md`
- `README.md`
- `docs/project/03-current-state.md`
- `docs/tasks/TASK-016-notion-env-template-cleanup.md` (this file)

## Risks

- If existing projects still keep legacy keys in their `.vibeops.env`, VibeOps no longer reads them anyway → no user impact.
- Existing projects' `08-env.md` / `notion-sync.md` are not overwritten unless `vibeops init --force` is used → users must update manually, but this TASK targets the new-install path so the trade-off is acceptable.
- The README single-line compatibility note could be misread and revive legacy keys, but the wording is committed to "no longer used" to minimise confusion.

## Test Plan

- `pnpm typecheck`
- `pnpm build`
- `pnpm smoke`
- In `/tmp/vibeops-task016-sandbox`, run `node dist/cli.js init --git --initial-commit` → verify `.vibeops.env.example` contains only `NOTION_TOKEN=` (`grep -c '^NOTION_' .vibeops.env.example` = 1, legacy keys grep = 0).
- In the same sandbox, run `node dist/cli.js status` and confirm parity with TASK-015 (no regression).
- Search the whole repo: `grep -E 'NOTION_API_KEY|NOTION_PROJECT_DB|NOTION_TASK_DB' templates/ src/bootstrap/installer.ts .vibeops.env.example docs/project/08-env.md .vibeops/workflows/notion-sync.md` returns 0.

## Rollback Plan

Revert `installer.ts`, `templates/**`, `.vibeops.env.example`, `docs/project/08-env.md`, `.vibeops/workflows/notion-sync.md`, `README.md`, and the doc updates via Git. The behavioural change is limited to the files produced during install, so the impact area is narrow.

## Git Context

- Branch: directly on main (same policy as TASK-014 / 015).
- Touched paths: `src/bootstrap/`, `templates/`, `.vibeops.env.example`, `docs/project/`, `.vibeops/workflows/`, `README.md`, `docs/tasks/`.

## Notion Page

Not connected.

## Implementation Plan

1. Simplify `envExampleContents()` in `src/bootstrap/installer.ts` to output a single `NOTION_TOKEN=` line + header.
2. Shrink the env table in `templates/docs/project/08-env.md` to a single `NOTION_TOKEN` line, add guidance on where target IDs live (`.vibeops.json` `notion.*TargetId`), and consolidate legacy keys into a single deprecation note.
3. Refresh the configuration block in `templates/.vibeops/workflows/notion-sync.md` → `NOTION_TOKEN` + target-ID guidance.
4. Sync the same content into vibeops's own `.vibeops.env.example`, `docs/project/08-env.md`, `.vibeops/workflows/notion-sync.md`.
5. Add a single-line compatibility note at the end of README "Notion Setup" for legacy keys.
6. Verify: typecheck / build / smoke + the `.vibeops.env.example` in the temp sandbox after `init` + repo-wide grep returning 0.
7. Update `03-current-state.md` and this TASK file's Result / Test Result.

## Result

- Cleaned `envExampleContents()` in `src/bootstrap/installer.ts` so it outputs only the `NOTION_TOKEN=` line. Removed the 3 legacy variants (`NOTION_API_KEY` / `NOTION_PROJECT_DB` / `NOTION_TASK_DB`). Header comment now reads "NOTION_TOKEN is the only secret VibeOps reads" and references the Notion integration URL. GitHub / OpenAI keys are intentionally not seeded.
- Rewrote vibeops's own `.vibeops.env.example` with the same content so the new-install result mirrors 1:1.
- Shrank the env table in `templates/docs/project/08-env.md` to a single `NOTION_TOKEN` line. Stated in body text that `.vibeops.json`'s `notion.{projectsTargetId,tasksTargetId}` is where target IDs live. Left the legacy keys only as a one-line quoted (`>`) compatibility note "no longer used".
- Synced vibeops's own `docs/project/08-env.md` to match.
- Updated the configuration code block in `templates/.vibeops/workflows/notion-sync.md` to `NOTION_TOKEN` guidance + a note that target IDs live in `.vibeops.json`. Legacy keys remain only as a single quoted line.
- Synced vibeops's own `.vibeops/workflows/notion-sync.md` to match.
- Added three lines to the README's Notion Setup section: (a) `NOTION_TOKEN` is the only env, (b) target IDs live in `.vibeops.json`, not `.vibeops.env`, and (c) the 3 legacy keys are no longer used and `vibeops init`'s `.vibeops.env.example` contains only `NOTION_TOKEN=`.
- Recorded TASK-016 in `docs/project/03-current-state.md`. Added one line to the "Bootstrap engine" table describing the new behaviour of `envExampleContents()`.

## Test Result

- `pnpm typecheck` ✓
- `pnpm build` ✓
- `pnpm smoke` ✓ (8 cases, no regression).
- `/tmp/vibeops-task016-sandbox` after `node dist/cli.js init --git --initial-commit`:
  - Generated `.vibeops.env.example` consists of 6 header comment lines + blank line + `NOTION_TOKEN=` + trailing newline.
  - `grep -E '^NOTION_' .vibeops.env.example` → only `NOTION_TOKEN=` line. 0 legacy keys.
  - `grep -E 'NOTION_API_KEY|NOTION_PROJECT_DB|NOTION_TASK_DB' .vibeops.env.example` → 0. (`docs/project/08-env.md` · `.vibeops/workflows/notion-sync.md` keep only the intended single-line deprecation note.)
- In the same sandbox, the Notion section of `vibeops status` matches TASK-015 exactly: `enabled no / token missing / projects+tasks target missing / hint` 5 lines — no regression.
- A static grep over install-path files (`templates/`, `src/bootstrap/installer.ts`, `.vibeops.env.example`, `docs/project/08-env.md`, `.vibeops/workflows/notion-sync.md`) finds 0 raw uses of legacy keys (excluding the intended deprecation notes).
- No new `.vibeops.env` file is created or committed. The raw `NOTION_TOKEN` value does not appear in any output.

## Review Notes

- vibeops's own `docs/project/01-architecture.md` / `02-tech-stack.md` are 2026-05-11 first-design historical records; they are out of scope for this TASK. The latest facts are owned by `03-current-state.md`.
- Deprecation notes are embedded in two language contexts (`08-env.md` Korean → English, `README.md` English, `notion-sync.md` Korean → English). A future polish round can unify to a single language.
- The new `.vibeops.env.example` header guidance embeds the Notion integration URL (`https://www.notion.so/profile/integrations`) so new users can find the token issuance path immediately. When that URL changes, two places (`installer.ts` and `.vibeops.env.example`) must be updated together.
- If existing projects still have legacy keys in `.vibeops.env`, VibeOps simply ignores them — we only point users toward manual cleanup.
