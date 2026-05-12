# TASK-019 · docs/ English localization

## Status

Review

## MVP Phase

Post-MVP 4 · public release

## Goal

Translate every Markdown file under `docs/` (vibeops's own historical documentation) plus the repository governance files (`AGENTS.md`, `.cursor/rules/*.mdc`) to English while preserving facts, file paths, section headings, code blocks, and VibeOps terminology. Delete the two existing daily-log files (`docs/logs/2026-05-11.md` and `docs/logs/2026-05-12.md`) so they no longer carry Korean content. Keep `templates/**` (already English, shipped in the npm package) untouched. Preserve legacy Korean-placeholder behavior in code without leaving literal Hangul characters in source.

## Background

TASK-017 (public release polish) and TASK-018 (template English localization) brought the npm-shipped surfaces (`README.md`, `CHANGELOG.md`, `src/**`, `templates/**`) to English. The vibeops repository's own design documents (`docs/project/**`) and TASK history (`docs/tasks/**`) remained in Korean as historical record per the prior policy. The user now wants those vibeops-internal docs to be English too. The two daily-log files (2026-05-11, 2026-05-12) are being removed entirely instead of translated — they were transient working notes accumulated during MVP 1 ~ TASK-018 and the new English source-of-truth (`docs/project/03-current-state.md` + per-TASK Result/Test Result) covers the same facts.

## Scope

- Delete `docs/logs/2026-05-11.md` and `docs/logs/2026-05-12.md`.
- Translate `docs/logs/README.md` (daily log convention) to English.
- Translate `docs/project/00-overview.md` to English (vibeops vision + scope).
- Translate the legacy-numbered project docs `01-architecture.md`, `02-tech-stack.md`, `03-current-state.md`, `04-decisions.md`, `05-backlog.md` (kept for backward compatibility) to English.
- Translate the new-numbered project docs `01-requirements.md`, `02-mvp-scope.md`, `03-architecture.md`, `04-tech-stack.md`, `05-current-state.md`, `06-decisions.md`, `07-backlog.md`, `08-env.md`, `09-deployment.md` (slot-style docs) to English.
- Translate every TASK file in `docs/tasks/TASK-000-template.md` through `docs/tasks/TASK-019-docs-english-localization.md` to English. Preserve Status / MVP Phase / Goal / Scope / Acceptance Criteria / Result / Test Result / Review Notes section headings and per-TASK numbering. Code blocks, paths, and command samples stay verbatim.
- Translate `AGENTS.md` and `.cursor/rules/*.mdc` to English.
- Replace the remaining literal Hangul characters in `src/lib/task.ts` and `src/lib/task-summary.ts` with Unicode escape sequences while preserving the same legacy placeholder behavior.
- Update the running source of truth (`docs/project/03-current-state.md`) so the TASK list extends to `TASK-019` and the current-stage line includes "docs/ English localization".

## Out of Scope

- Changing the structure of `docs/project/` (legacy 01..05 duplicate-numbered files stay in place).
- Changing runtime behavior, tests, templates, or build artifacts.
- npm publish (dry-run only).
- Re-translating `templates/**` (already English under TASK-018).
- Translating chat transcripts or external documents outside `docs/`.
- Removing legacy Korean placeholder recognition in `src/lib/task.ts` / `src/lib/task-summary.ts` (kept for backward compatibility).

## Acceptance Criteria

- `docs/logs/2026-05-11.md` and `docs/logs/2026-05-12.md` no longer exist on disk.
- `rg -P '\p{Hangul}' .` returns zero matches (no literal Hangul characters anywhere in the repository).
- `rg -P '\p{Hangul}' templates .vibeops` still returns zero matches (no regression on TASK-017 / TASK-018 surfaces).
- `pnpm typecheck` / `pnpm build` / `pnpm smoke` exit 0.
- `pnpm publish --dry-run --access public --no-git-checks` exits 0 with `name: @goodtekxyz/vibeops`, `version: 0.2.0`, `total files: 93`, public access. The tarball must still contain only `dist/`, `templates/`, `README.md`, `LICENSE`, `CHANGELOG.md` (docs/ is not shipped).
- `docs/project/03-current-state.md` reflects the new TASK-019 Review state and lists TASKs 001 through 019.
- TASK-019 Result / Test Result sections are filled in.

## Files to Inspect First

- `docs/project/03-current-state.md` — running source of truth.
- `docs/tasks/TASK-000-template.md` ~ `TASK-018-template-english-localization.md` — preserve per-TASK shape.
- `package.json` — confirm `files` excludes `docs/`.
- `templates/**`, `.vibeops/**`, `src/**` — must not regress.

## Expected Files to Change

- Delete: `docs/logs/2026-05-11.md`, `docs/logs/2026-05-12.md`.
- Translate (overwrite in place): `AGENTS.md`, `.cursor/rules/*.mdc`, `docs/logs/README.md`, all `docs/project/*.md` (14 files), all `docs/tasks/TASK-000..TASK-018-*.md` (19 files).
- New: `docs/tasks/TASK-019-docs-english-localization.md` (this file).
- Update: `docs/project/03-current-state.md` current-stage line + TASK range; `src/lib/task.ts`; `src/lib/task-summary.ts`.

## Risks

- Translating ~5,400 lines of historical record by hand. Risk of small fact drift. Mitigation: keep structure (table rows, code blocks, paths, dates) identical and only translate prose. Verify with `pnpm smoke` afterwards.
- Removing two daily-log files erases narrative history. Mitigation: the per-TASK Result/Test Result sections (translated in this TASK) keep the equivalent facts.
- `docs/project/` has two parallel numbering conventions (legacy `01-architecture` / `02-tech-stack` / `03-current-state` / `04-decisions` / `05-backlog` plus new `01-requirements` / `02-mvp-scope` / `03-architecture` / `04-tech-stack` / `05-current-state` / `06-decisions` / `07-backlog`). The vibeops codebase reads both; both must remain present and translated.

## Test Plan

- `rg -P '\p{Hangul}' .` — expect zero matches.
- `rg -P '\p{Hangul}' templates .vibeops` — expect zero matches (regression check).
- `pnpm typecheck` / `pnpm build` / `pnpm smoke` — all green.
- `pnpm publish --dry-run --access public --no-git-checks` — exits 0, `total files: 93`, no `docs/` inside the tarball.
- Open `docs/project/03-current-state.md` and confirm TASK list reaches 019 and current-stage line is updated.

## Rollback Plan

All changes are Markdown text edits, two file deletions, and Unicode-escape-only TypeScript regex updates. `git checkout HEAD~1 -- docs/ AGENTS.md .cursor/rules src/lib/task.ts src/lib/task-summary.ts` (or `git reset --hard HEAD~1`) fully restores the prior state because the work lives on the working tree until committed.

## Git Context

- Branch: `cursor/english-localization-governance-621b`.
- Touched paths: `docs/**`, `AGENTS.md`, `.cursor/rules/*.mdc`, `src/lib/task.ts`, `src/lib/task-summary.ts`, `docs/tasks/TASK-019-docs-english-localization.md` (new).

## Notion Page

Not synced.

## Implementation Plan

1. Create this TASK file (`docs/tasks/TASK-019-docs-english-localization.md`, Status = In Progress).
2. Delete `docs/logs/2026-05-11.md` and `docs/logs/2026-05-12.md`.
3. Translate `docs/logs/README.md`.
4. Translate `docs/project/*.md` (14 files — both legacy and new numbering).
5. Translate `docs/tasks/TASK-000..TASK-018-*.md` (19 files).
6. Translate `AGENTS.md` and `.cursor/rules/*.mdc`.
7. Replace literal Hangul regex text in `src/lib/task.ts` / `src/lib/task-summary.ts` with Unicode escapes.
8. Update `docs/project/03-current-state.md` current-stage line + TASK range to 001..019.
9. Run `pnpm typecheck` / `pnpm build` / `pnpm smoke` / `pnpm publish --dry-run --access public --no-git-checks`.
10. Fill TASK-019 Status = Review, Result, Test Result, Review Notes.

## Result

- Deleted `docs/logs/2026-05-11.md` and `docs/logs/2026-05-12.md`. The narrative facts they captured live in the per-TASK Result / Test Result sections (also translated in this round).
- Translated `docs/logs/README.md` to English while preserving the daily-log convention.
- Translated `docs/project/*.md` (14 files — both legacy-numbered `01-architecture / 02-tech-stack / 03-current-state / 04-decisions / 05-backlog` and the new slot-style `01-requirements / 02-mvp-scope / 03-architecture / 04-tech-stack / 05-current-state / 06-decisions / 07-backlog / 08-env / 09-deployment` plus `00-overview`). All placeholders, file paths, code blocks, and section headings are preserved. The BYOBrowser narrative example in `00-overview.md` was replaced with Acme Automator to match the public README (TASK-017).
- Translated every TASK file from `TASK-000-template.md` through `TASK-018-template-english-localization.md` to English (19 files), keeping Status / MVP Phase / Goal / Scope / Acceptance Criteria / Result / Test Result / Review Notes section headings, per-TASK numbering, file paths, code blocks, and command samples verbatim. Verification command samples now use `rg -P '\p{Hangul}'` instead of embedding literal Hangul in the docs.
- Translated `AGENTS.md` and `.cursor/rules/*.mdc` to English while preserving the same governance rules.
- Replaced the remaining literal Hangul strings in `src/lib/task.ts` and `src/lib/task-summary.ts` with Unicode escape sequences. The same legacy Korean placeholder recognition remains in place; only source text representation changed.
- Updated `docs/project/03-current-state.md` so the current-stage line includes "docs/ English localization", the TASK list spans `TASK-001 ~ TASK-019`, and the state records that no literal Hangul characters remain in the repository.
- Did not touch `templates/**` (already English under TASK-018). `package.json#files` still excludes `docs/`, so docs do not ship to npm.

## Test Result

- `pnpm typecheck` ✓ exit 0.
- `pnpm build` ✓ exit 0.
- `pnpm smoke` ✓ exit 0. 8 cases pass (`--help` / `init --dry-run` / `init --dry-run --git --initial-commit` / `status` / `task generate --dry-run` / `notion init --dry-run` / `github status` / `github init --dry-run --connect goodtek/vibeops`) without regression.
- `pnpm publish --dry-run --access public --no-git-checks` ✓ exit 0. Output confirms `name: @goodtekxyz/vibeops`, `version: 0.2.0`, `total files: 93`, `package size: 122.9 kB`, `unpacked size: 476.4 kB`, `Publishing to https://registry.npmjs.org/ with tag latest and public access (dry-run)`. The tarball still contains only `dist/`, `templates/`, `README.md`, `LICENSE`, `CHANGELOG.md` — `docs/` is not shipped.
- Hangul-character grep:
  - `rg -P '\p{Hangul}' .` yields zero hits.
  - `rg -P '\p{Hangul}' templates .vibeops` yields zero hits (no regression on TASK-017 / TASK-018).
- `docs/logs/` now contains only `README.md`; the two daily-log files were removed as planned.

## Review Notes

- The legacy duplicate numbering inside `docs/project/` (`01-architecture` vs `01-requirements`, `02-tech-stack` vs `02-mvp-scope`, …) was preserved. Both numbering conventions are still read by the vibeops codebase, so both must remain on disk.
- No literal Hangul remains in `docs/`, `AGENTS.md`, `.cursor/rules/*.mdc`, `templates/`, `.vibeops/`, or `src/**`. `src/lib/task.ts` / `src/lib/task-summary.ts` continue to recognise both English and Korean placeholders for backward compatibility through Unicode escape sequences (TASK-017 invariant).
- This round touched markdown text under `docs/`, translated repository governance files, deleted two daily-log files, and changed TypeScript string/regex representation only. `pnpm typecheck` / `pnpm build` / `pnpm smoke` / `pnpm publish --dry-run` all pass.
