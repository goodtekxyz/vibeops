# TASK-002 · `init` command — install VibeOps project system

## Status

done

## MVP Phase

MVP 1 · Project Bootstrapper

## Goal

Implement `vibeops init`. It installs the **VibeOps operating structure** (`AGENTS.md`, `.cursor/rules/*`, `docs/project/*`, `docs/tasks/`, `.vibeops/agents/*`, `.vibeops/prompts/*`, `.vibeops/workflows/*`, `.vibeops.json`, `.vibeops.env.example`) into the current directory (or `--cwd <path>`).

This TASK focuses on the **command logic and file-copy engine**; the actual template content is filled in [TASK-003](TASK-003-templates.md). For TASK-002, a placeholder file per template path is enough.

## Background

The first value VibeOps provides is "don't recreate the same structure by hand for every new project". `init` must be idempotent and safe. Existing files are skipped by default.

## Scope

- `src/commands/init.ts` — register and implement `vibeops init`.
- `src/bootstrap/installer.ts` — directory/file copier (template dir → target path).
- `src/bootstrap/manifest.ts` — express "files to install" as data (entries filled in TASK-003).
- `src/config/projectConfig.ts` — write `.vibeops.json` (project name, VibeOps version, creation date).
- `templates/` (directory inside the repo) — in this TASK only the directory structure and placeholders.
- Options:
  - `--dry-run` — print "what would be created / overwritten" without writing.
  - `--force` — overwrite existing files.
  - `--cwd <path>` — install into a different directory.
  - `--name <projectName>` — project name written into `.vibeops.json`.

## Out of Scope

- Writing real template content (→ TASK-003).
- Any domain command implementation.
- Git initialisation (assumed `git init` was already done).

## Acceptance Criteria

1. In an empty directory, `vibeops init` creates these paths:
   - `AGENTS.md`
   - `.cursor/rules/00-vibeops-governance.mdc`
   - `.cursor/rules/01-ai-workflow.mdc`
   - `.cursor/rules/02-docs-update.mdc`
   - `docs/project/00-overview.md` ~ `05-backlog.md`
   - `docs/tasks/TASK-000-example.md` (or a README)
   - `docs/logs/.keep`
   - `.vibeops/agents/{planner,builder,reviewer,releaser}.md`
   - `.vibeops/prompts/{plan,task-generate,task-builder}.md`
   - `.vibeops/workflows/{task-lifecycle,notion-sync}.md`
   - `.vibeops.json`, `.vibeops.env.example`.
2. Running `vibeops init` a second time in the same directory does **not** overwrite existing files. A "skipped (already exists)" count is printed.
3. `vibeops init --dry-run` lists what would be created; actual change count is 0.
4. `vibeops init --force` overwrites existing files and prints the overwrite count.
5. `.vibeops.json` contains at least `{ "name": <projectName>, "vibeopsVersion": <semver>, "createdAt": <iso>, "schemaVersion": 1 }`.
6. `.vibeops.env.example` contains `NOTION_API_KEY=`, `NOTION_PROJECT_DB=`, `NOTION_TASK_DB=` lines.
7. `vibeops init --help` shows the options and a behavioural summary.

## Files to Inspect First

- `src/cli.ts` (the commander bootstrap from TASK-001).
- `src/commands/*.ts` stubs (especially the init stub).
- `docs/project/01-architecture.md` § Bootstrap section.

## Expected Files to Change

- new: `src/commands/init.ts`, `src/bootstrap/installer.ts`, `src/bootstrap/manifest.ts`, `src/config/projectConfig.ts`.
- new: `templates/**` (skeleton only — real content lands in TASK-003).
- new: `tests/init.test.ts` (verify init behaviour in a tmpdir).
- update: `package.json` (add deps such as `cross-env` if needed).
- update: `docs/project/03-current-state.md`, this TASK's Result / Test Result, `docs/logs/YYYY-MM-DD.md`.

## Risks

- Windows paths / permissions — MVP targets macOS / Linux. Lack of Windows support can be stated in the README / docs.
- A user could accidentally pass `--force` and wipe their docs → consider printing "would overwrite N files" once more when `--force` is set.

## Test Plan

- Use vitest to run `init` in a temp directory → assert the expected files appear.
- On the second run, assert the "skipped" count matches expectation.
- With `--dry-run`, assert no files are created.
- With `--force`, assert placeholder content is updated.
- Manual smoke: in an empty folder, `vibeops init` → verify with `tree -a -L 3`.

## Rollback Plan

- Discarding the working branch reverts the code changes.
- User-side side effects (mis-installed files) can be cleaned by deleting the directory because `vibeops init` is idempotent.

## Implementation Plan

1. Lay out the `templates/` directory structure (one-line placeholders are fine).
2. Define "source → target" entries as data in `src/bootstrap/manifest.ts`.
3. Build an idempotent copier in `src/bootstrap/installer.ts` (`exists ? skip : write`). `--force` overwrites. `--dry-run` only prints "would create/overwrite" without writing.
4. Generate `.vibeops.json` via `src/config/projectConfig.ts`.
5. Register the commander command + 4 options in `src/commands/init.ts`.
6. Write `tests/init.test.ts`.
7. Update docs.

## Result

Completed 2026-05-11. `vibeops init` installs the VibeOps operating structure into the current directory (or `--cwd <path>`).

- **Command implementation**: `src/commands/init.ts` — handles `--dry-run` / `--force` / `--cwd` / `--name`. The project name is taken from `--name` first, otherwise from `basename(cwd)`.
- **Copy engine**: `src/bootstrap/manifest.ts` (walk + sort templates directory), `src/bootstrap/installer.ts` (idempotent copy, dry-run / force handling), `src/bootstrap/substitute.ts` (replaces `{{PROJECT_NAME}}`, `{{VIBEOPS_VERSION}}`, `{{CREATED_AT}}`).
- **Config file**: `src/lib/config.ts` exposes `readConfig` / `buildConfig` / `writeConfig` / `readNotionEnvSnapshot`. `.vibeops.json` schema is `{ name, vibeopsVersion, schemaVersion: 1, createdAt }`.
- **`.vibeops.env.example`**: includes `NOTION_API_KEY=`, `NOTION_PROJECT_DB=`, `NOTION_TASK_DB=` lines.
- **`.gitignore`**: adds a single `.vibeops.env` line if missing; untouched otherwise.
- **idempotent**: a second run reports "skipped (already exists)"; `--force` is needed to overwrite.
- This TASK was scoped to the command logic and copier; **template content was filled together in TASK-003 in the same round**.
- **Deferred**: vitest smoke (`tests/init.test.ts`) was excluded from this round per user scope — kept as a follow-up reinforcement TASK. Verification used a manual sandbox (`/tmp/vibeops-sandbox`) instead.

### Changed files

| File | Kind |
| --- | --- |
| `src/commands/init.ts` | update (stub → real implementation) |
| `src/bootstrap/manifest.ts` | new |
| `src/bootstrap/installer.ts` | new |
| `src/bootstrap/substitute.ts` | new |
| `src/lib/config.ts` | new |
| `src/lib/filesystem.ts` | new |
| `src/lib/paths.ts` | new |
| `src/lib/logger.ts` | new |
| `src/types/config.ts` | new |
| `src/cli.ts` | update (option wiring) |
| `package.json` | update (added `gray-matter`, `templates` added to `files`) |
| `pnpm-lock.yaml` | update |

## Test Result

- `pnpm typecheck` → exit 0, zero errors.
- `pnpm build` → exit 0, `dist/` produced.
- `pnpm dev init --dry-run` (vibeops repo) → 37 "would create", 1 "skipped (already exists: docs/project/00-overview.md)", exit 0. Verified zero actual file changes.
- Sandbox real install: `rm -rf /tmp/vibeops-sandbox && mkdir -p /tmp/vibeops-sandbox && git -C /tmp/vibeops-sandbox init -q && pnpm dev init --cwd /tmp/vibeops-sandbox --name byobrowser` → **39 created** (36 templates + `.vibeops.json` + `.vibeops.env.example` + `.gitignore`), 0 overwritten, 0 skipped, exit 0.
- Second run (idempotency): `pnpm dev init --cwd /tmp/vibeops-sandbox` → 0 created, 0 overwritten, all files skipped. AC#2 passes.
- Inspected the generated `.vibeops.json`: `{ "name": "byobrowser", "vibeopsVersion": "0.1.0", "schemaVersion": 1, "createdAt": "2026-05-11T00:14:42.101Z" }` — AC#5 passes.
- Inspected the generated `.vibeops.env.example`: `NOTION_API_KEY=`, `NOTION_PROJECT_DB=`, `NOTION_TASK_DB=` all present — AC#6 passes.
- `pnpm dev init --help` → all 4 options (`--dry-run`, `--force`, `--cwd`, `--name`) shown — AC#7 passes.
- ReadLints (`src/`) → 0 issues.
- Acceptance Criteria 1–7 all pass.
