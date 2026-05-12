# TASK-018 · Template English localization

## Status

Review

## MVP Phase

Follow-on (post-MVP 4, public release)

## Goal

Translate every template file (`templates/**`) that a new project receives via `vibeops init` into English, so users of the publicly published `@goodtekxyz/vibeops` get a clean English project skeleton without any Korean leaking through. CLI / help / runtime output was localised in TASK-017, but the bodies of the `templates/` shipped inside the npm tarball are still Korean — so right after init, Korean markdown is laid down into the user's workspace. This TASK closes that gap.

## Background

TASK-017 (Public release polish) unified CLI output / README / CHANGELOG into English but explicitly deferred translation of `templates/**` bodies to a follow-up. Since `package.json#files = [dist, templates, README.md, LICENSE, CHANGELOG.md]`, the contents of `templates/` ship inside the npm tarball verbatim and are idempotently copied into the user's project during `vibeops init`. So when a global user runs `npm i -g @goodtekxyz/vibeops` and then `init`, `AGENTS.md`, `.cursor/rules/*.mdc`, `docs/project/00 ~ 09-*.md`, `docs/tasks/TASK-000-template.md`, etc. are still emitted in Korean. This TASK closes that one gap.

## Scope

- Translate `templates/AGENTS.md` (preserve placeholders `{{PROJECT_NAME}}` / `{{VIBEOPS_VERSION}}` / `{{CREATED_AT}}`).
- Translate `templates/.cursor/rules/00-project-governance.mdc` ~ `04-docs-update.mdc` (5 files).
- Translate `templates/.vibeops/agents/*.md` (8 files; planner.md only had its BYOBrowser example replaced in TASK-017, so translate the entire body this round).
- Translate `templates/.vibeops/prompts/*.md` (6 files).
- Translate `templates/.vibeops/workflows/*.md` (4 files).
- Translate `templates/docs/project/00 ~ 09-*.md` (10 files; preserve placeholders · paths).
- Translate `templates/docs/tasks/TASK-000-template.md`.
- Translate `templates/docs/logs/README.md`.
- Keep the self-installed mirror in vibeops's own repo (`.vibeops/agents/*`, `.vibeops/prompts/*`, `.vibeops/workflows/*`) 1:1 in sync with templates — extends TASK-017's policy (which only synced planner.md).
- Maintain VibeOps terminology consistency: `workflow rails`, `source of truth`, `human dashboard`, `prompt mode`, `task lifecycle`.

## Out of Scope

- Translating vibeops's own `AGENTS.md` / `.cursor/rules/*.mdc` / `docs/project/**` / `docs/tasks/TASK-001..017-*.md` / `docs/logs/2026-05-{11,12}.md` from Korean to English. These are not part of the npm package and remain historical records. Honours the user's policy "Do not remove Korean from historical docs/tasks unless those files are shipped to npm".
- Runtime behavioural changes / Notion · GitHub logic changes / new commands / new options.
- Actual npm publish (dry-run only).
- The legacy Korean placeholder regex (`/^\(.*not yet.*\)$/`) in `src/lib/task.ts` — kept for backward compatibility.

## Acceptance Criteria

- 0 Hangul characters (use a Unicode Hangul search pattern) anywhere in `templates/**`.
- 0 Korean characters anywhere in `.vibeops/agents/**`, `.vibeops/prompts/**`, `.vibeops/workflows/**` (vibeops's own mirror).
- 0 Korean characters in any file created when running `vibeops init` against a sandbox directory.
- `pnpm typecheck` / `pnpm build` / `pnpm smoke` all exit 0.
- `pnpm publish --dry-run --access public --no-git-checks` exits 0 + the tarball contains exactly `dist`, `templates`, `README.md`, `LICENSE`, `CHANGELOG.md`.
- Every markdown placeholder (`{{PROJECT_NAME}}`, `{{VIBEOPS_VERSION}}`, `{{CREATED_AT}}`) / file path (e.g. `docs/project/05-current-state.md`) / TASK section heading (e.g. `## Acceptance Criteria`) is preserved.
- VibeOps terminology consistency (workflow rails / source of truth / human dashboard / prompt mode / task lifecycle) — appears naturally in body text.

## Files to Inspect First

- `templates/AGENTS.md`
- `templates/.cursor/rules/*.mdc`
- `templates/.vibeops/{agents,prompts,workflows}/*.md`
- `templates/docs/project/*.md`
- `templates/docs/tasks/TASK-000-template.md`
- `templates/docs/logs/README.md`
- `src/bootstrap/manifest.ts`, `src/bootstrap/installer.ts` — confirm the template-copy behaviour (no code changes expected).

## Expected Files to Change

- `templates/AGENTS.md`
- `templates/.cursor/rules/00-project-governance.mdc`
- `templates/.cursor/rules/01-agent-orchestration.mdc`
- `templates/.cursor/rules/02-task-workflow.mdc`
- `templates/.cursor/rules/03-git-safety.mdc`
- `templates/.cursor/rules/04-docs-update.mdc`
- `templates/.vibeops/agents/architect.md`
- `templates/.vibeops/agents/builder.md`
- `templates/.vibeops/agents/docs.md`
- `templates/.vibeops/agents/orchestrator.md`
- `templates/.vibeops/agents/planner.md`
- `templates/.vibeops/agents/recovery.md`
- `templates/.vibeops/agents/reviewer.md`
- `templates/.vibeops/agents/tester.md`
- `templates/.vibeops/prompts/create-plan.md`
- `templates/.vibeops/prompts/generate-tasks.md`
- `templates/.vibeops/prompts/implement-task.md`
- `templates/.vibeops/prompts/review-task.md`
- `templates/.vibeops/prompts/rollback.md`
- `templates/.vibeops/prompts/start-project.md`
- `templates/.vibeops/workflows/notion-sync.md`
- `templates/.vibeops/workflows/project-start.md`
- `templates/.vibeops/workflows/rollback.md`
- `templates/.vibeops/workflows/task-lifecycle.md`
- `templates/docs/logs/README.md`
- `templates/docs/project/00-overview.md` ~ `09-deployment.md` (10 files)
- `templates/docs/tasks/TASK-000-template.md`
- `.vibeops/agents/*.md` (8 files) — sync to templates
- `.vibeops/prompts/*.md` (6 files) — sync to templates
- `.vibeops/workflows/*.md` (4 files) — sync to templates
- `docs/project/03-current-state.md`, `docs/tasks/TASK-018-template-english-localization.md` (this file).

## Risks

- Broad markdown translation — meaning could drift. Mitigation: preserve placeholders / paths / headings / VibeOps terminology verbatim, then post-check with grep + diff.
- Without syncing vibeops's own self-installed `.vibeops/` mirror, vibeops's own working state becomes a Korean/English mix. → sync in this TASK.
- Korean placeholders like `(not yet)` should fade away from vibeops's own `docs/tasks/TASK-000-*.md`, and the TASK-008 `task done` validator (legacy placeholder regex was set to recognise both Korean and English in TASK-017) must accept the new English placeholder `(not yet)`. The PLACEHOLDER_RE in `src/lib/task.ts` and `src/lib/task-summary.ts` already recognises both — no regression.

## Test Plan

- `pnpm typecheck` / `pnpm build` / `pnpm smoke`.
- `rg -P '\p{Hangul}' templates/ .vibeops/` returns 0.
- `node dist/cli.js init --dry-run --cwd <sandbox>` exits 0 + Korean grep returns 0.
- In a new sandbox, after `node dist/cli.js init --git --initial-commit`, `rg -P '\p{Hangul}' <sandbox>` returns 0.
- `pnpm publish --dry-run --access public --no-git-checks` exits 0 + tarball file list unchanged (expected to stay at 93 files).
- `node dist/cli.js task generate --scaffold --count 1 --cwd <sandbox>` or `node dist/cli.js task done <id> --dry-run` correctly handles the new English placeholder (regression check).

## Rollback Plan

All changes are markdown text edits in `templates/` and `.vibeops/`, so a Git revert fully restores them. Zero runtime behavioural changes ⇒ minimal regression risk.

## Git Context

- Branch: directly on main.
- Touched paths: `templates/**`, `.vibeops/**`, `docs/tasks/TASK-018-*.md`, `docs/project/03-current-state.md`.

## Notion Page

Not connected.

## Implementation Plan

1. Create this TASK file (`docs/tasks/TASK-018-template-english-localization.md`, Status=In Progress).
2. Translate `templates/AGENTS.md` (preserve placeholders).
3. Translate `templates/.cursor/rules/*.mdc` (5 files).
4. Translate `templates/.vibeops/agents/*.md` (8 files).
5. Translate `templates/.vibeops/prompts/*.md` (6 files).
6. Translate `templates/.vibeops/workflows/*.md` (4 files).
7. Translate `templates/docs/project/*.md` (10 files).
8. Translate `templates/docs/tasks/TASK-000-template.md`.
9. Translate `templates/docs/logs/README.md`.
10. Sync vibeops's own mirror under `.vibeops/agents/`, `.vibeops/prompts/`, `.vibeops/workflows/` to match templates.
11. Pass `pnpm typecheck` / `pnpm build` / `pnpm smoke`.
12. After `vibeops init --git --initial-commit` in a sandbox, verify the Korean grep returns 0.
13. Verify `pnpm publish --dry-run --access public --no-git-checks` passes + check tarball file list.
14. Update `docs/project/03-current-state.md`, this TASK Status=Review + Result / Test Result.

## Result

- `templates/AGENTS.md` translated — placeholders (`{{PROJECT_NAME}}`, `{{VIBEOPS_VERSION}}`, `{{CREATED_AT}}`) preserved. Required reading table / Source of truth table / TASK-driven rules / Agent roles / Forbidden / Cursor rule files / Completion report / VibeOps metadata — all 8 sections kept; only the body was translated.
- `templates/.cursor/rules/*.mdc` 5 files translated — kept frontmatter `description` / `alwaysApply`. Translated body sections (Source of truth / One TASK at a time / MVP scope / Refactors / Branch policy / Commit messages / Safety / Docs Update, …).
- `templates/.vibeops/agents/*.md` 8 files (`architect`, `builder`, `docs`, `orchestrator`, `planner`, `recovery`, `reviewer`, `tester`) — preserved frontmatter `name` / `role` / `description`; translated all 5 body sections (`Role / Inputs / Output Format / Rules / Forbidden`). The `Acme Automator` example in planner.md was already in English (TASK-017) and was kept as-is.
- `templates/.vibeops/prompts/*.md` 6 files (`create-plan`, `generate-tasks`, `implement-task`, `review-task`, `rollback`, `start-project`) — kept frontmatter `name` / `description` / `placeholders`; rewrote bodies as Cursor-pasteable English markdown. The 18-section standard placeholder generated by `vibeops task generate` is also in English (`Result` / `Test Result` body becomes `(not yet)`).
- `templates/.vibeops/workflows/*.md` 4 files (`notion-sync`, `project-start`, `rollback`, `task-lifecycle`) — preserved tables · code blocks · commands; translated prose only. The legacy NOTION_API_KEY/PROJECT_DB/TASK_DB deprecation note in notion-sync remains as a single English line.
- `templates/docs/project/*.md` 10 files (`00-overview`, `01-requirements`, `02-mvp-scope`, `03-architecture`, `04-tech-stack`, `05-current-state`, `06-decisions`, `07-backlog`, `08-env`, `09-deployment`) — slot/placeholder comments + tables/examples all translated. IDs like `F-001` / `NF-001` in `01-requirements.md` preserved. The NOTION_TOKEN table + legacy-env deprecation note in `08-env.md` unified in English. D-001 ~ D-003 in `06-decisions.md` translated freely.
- `templates/docs/tasks/TASK-000-template.md` — 18-section skeleton translated. `## Result` / `## Test Result` body unified as `(not yet)`, so the PLACEHOLDER_RE regex in `vibeops task done` accepts the English placeholder too (TASK-017 already made it accept both — no regression).
- `templates/docs/logs/README.md` translated — daily-log standard (`### Decision summary` / `### Changed files` / `### Verification` / `### Next work`) unified in English.
- Sync of VibeOps's own self-installed mirror (18 files): `.vibeops/agents/{architect,builder,docs,orchestrator,planner,recovery,reviewer,tester}.md` (8) + `.vibeops/prompts/{create-plan,generate-tasks,implement-task,review-task,rollback,start-project}.md` (6) + `.vibeops/workflows/{notion-sync,project-start,rollback,task-lifecycle}.md` (4). 1:1 sync via `cp templates/... .vibeops/...`.
- Compatibility policy preserved:
  - vibeops's own `AGENTS.md` / `.cursor/rules/*.mdc` / `docs/project/**` / `docs/tasks/TASK-001..017-*.md` / `docs/logs/2026-05-{11,12}.md` are historical records — not in the npm package, so Korean is kept. Honours the user's explicit policy "Do not remove Korean from historical docs/tasks unless those files are shipped to npm".
  - The legacy Korean placeholder regex in `src/lib/task.ts` / `src/lib/task-summary.ts` is kept (TASK-017 already made it accept English and Korean). Existing Korean TASK markdown continues to work with the new CLI.
  - VibeOps terminology consistency: `workflow rails`, `source of truth`, `human dashboard`, `prompt mode`, `task lifecycle` — all appear naturally in body text.

## Test Result

- `pnpm typecheck` — exit 0.
- `pnpm build` — exit 0. `dist/` regenerated.
- `pnpm smoke` — exit 0. 8 smoke cases (`--help` / `init --dry-run` / `init --dry-run --git --initial-commit` / `status` / `task generate --dry-run` / `notion init --dry-run` / `github status` / `github init --dry-run --connect goodtek/vibeops`) without regression.
- Regression grep:
  - 0 Korean characters in `templates/**`.
  - 0 Korean characters in `.vibeops/**` (own mirror).
  - 0 Korean characters in `README.md` / `CHANGELOG.md` / `package.json`.
  - Korean residue in `src/**`: only the legacy placeholder regex in `src/lib/task.ts` and `src/lib/task-summary.ts` — intentional backward compatibility (TASK-017 ~ TASK-018 Out of Scope).
- Sandbox init (`/var/folders/.../vibeops-task018-XXXX.TljdO0KFFI`):
  - `node dist/cli.js init --cwd <sandbox> --name "acme-automator" --git --initial-commit` exit 0. 39 created, 0 overwritten, 0 skipped, `git init` + `default branch main` + initial commit succeeded.
  - `find <sandbox> -type f -not -path "*/.git/*" | wc -l` = 39 — VibeOps laid down 38 templates + `.vibeops.json` + `.gitignore`.
  - `grep -RP '[\\x{ac00}-\\x{d7a3}]' <sandbox>` = 0 — zero Korean characters in the user's workspace.
- `pnpm publish --dry-run --access public --no-git-checks` — exit 0. Verified `name: @goodtekxyz/vibeops`, `version: 0.2.0`, `total files: 93`, `package size: 122.9 kB` (≈2.4 kB smaller from English translation), `unpacked size: 476.4 kB`, `Publishing to https://registry.npmjs.org/ with tag latest and public access (dry-run)`. Tarball contains `dist/`, `templates/`, `README.md`, `LICENSE`, `CHANGELOG.md`. No actual npm publish.

## Review Notes

- Every change in this TASK is a markdown text edit only — zero TypeScript code / `dist/` / `src/**` behavioural changes. `pnpm typecheck` / `pnpm build` / `pnpm smoke` all passing confirms that policy.
- vibeops's own `docs/project/**` / `AGENTS.md` / `.cursor/rules/**` / `docs/tasks/TASK-NNN-*.md` (currently TASK-001 ~ TASK-018) and `docs/logs/2026-05-{11,12}.md` are historical records kept in Korean. If localising vibeops's own docs is desired, split into a separate TASK. The npm-package user does not receive these files (`docs/` is not in `package.json#files`).
- `pnpm publish --dry-run` total files of 93 is the same as TASK-017. Only the package size shrinks to 122.9 kB (~2.4 kB drop) as a natural side effect of the English translation.
- The PLACEHOLDER_RE (`/^\\(.*not yet.*\\)$/`) in `src/lib/task.ts` already accepts the English placeholder `(not yet)`. The new template (`templates/docs/tasks/TASK-000-template.md`) uses `(not yet)`, but existing Korean TASK markdown continues to work.
- First impression for new users running `vibeops init` is unified English markdown across the board — global UX gap closed. Korean-speaking users can still re-fill the body in Korean (placeholders · section headers remain English).
- Actual `npm publish` is performed manually by the user via `pnpm publish --access public` (entering 2FA).
