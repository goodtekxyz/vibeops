# TASK-012 · Package polish and README

## Status

Review

## MVP Phase

Finalisation (post-MVP 4)

## Goal

Polish VibeOps into a state that can be distributed to external users. Tidy the `package.json` meta, `bin` path, `engines`, `files`, `keywords`, and `license`, and rewrite the README so a first-time reader can understand what this is within 5 minutes.

## Background

By now every command works. But for a user meeting VibeOps for the first time via `npm i -g vibeops`, the first impression is the README and `vibeops --help`. This TASK focuses on that first impression.

## Scope

### `package.json`

- `name`: `vibeops` (or namespace).
- `version`: `0.1.0` (when MVP 1–4 are all green).
- `description`: one line (English; Korean optional).
- `bin`: `{ "vibeops": "dist/cli.js" }`.
- `engines.node`: `>=20`.
- `files`: `dist`, `templates`, `README.md`, `LICENSE`.
- `keywords`: `cursor`, `ai`, `coding`, `cli`, `task`, `notion`, `vibeops`.
- `repository`, `homepage`, `bugs`.
- `license`: choose one (e.g. `MIT`).
- `scripts`: `build`, `dev`, `test`, `lint`, `prepublishOnly` (build before publishing).

### README

- One-line definition.
- Why it is needed (≤5 lines).
- 5-minute quick-start (the Acme Automator example as-is).
- Command table (per MVP).
- Source-of-truth table.
- Explicit non-goals.
- Doc links.

### CHANGELOG.md

- `0.1.0` entry: the first release that passes MVP 1–4.

### LICENSE

- MIT, or another licence file as the user chooses.

### Distribution check

- Confirm `pnpm pack` includes `dist/` and `templates/`.
- Confirm `npm publish --dry-run` shows the intended file list.

## Out of Scope

- Adding new features (this TASK is polish-only).
- Changing existing command behaviour.

## Acceptance Criteria

1. `package.json` has `bin`, `engines`, `files`, `keywords`, `license`, `description`, `repository`, and `homepage` all filled in.
2. The `pnpm pack` artefact contains `dist/`, `templates/`, `README.md`, `LICENSE` and **does not** contain `src/` or `tests/`.
3. The README is ordered as "5-minute quick-start → command table → source of truth → non-goals → doc links".
4. `CHANGELOG.md` has a `0.1.0` entry.
5. `npm publish --dry-run` passes without error (the actual publish is separate).
6. `vibeops --help` lists every MVP command, each with a one-line description.

## Files to Inspect First

- This repo's `README.md` (refreshed at TASK start).
- `package.json`, `tsconfig.json`.
- The `dist/` output.

## Expected Files to Change

- update: `package.json`, `README.md`.
- new: `CHANGELOG.md`, `LICENSE` (if needed).
- update: this TASK's Result / Test Result, `docs/project/03-current-state.md`, `docs/logs/YYYY-MM-DD.md`.

## Risks

- A wrong `files` allowlist may drop templates and break `vibeops init` → always inspect the `pnpm pack` output.
- Licence choice is a human decision → MVP defaults to MIT; the user can change it via PR.

## Test Plan

- `pnpm run build` → confirm the `dist/` output.
- `pnpm pack` → inspect the tarball for `dist/` and `templates/`.
- `npm publish --dry-run` → the listed output matches intent.
- In a temp directory, `npm i -g <path-to-tgz>` the tarball and run `vibeops init` end-to-end as a smoke check.

## Rollback Plan

- Discard the branch.
- If publish happened by mistake, immediately guide users with `npm deprecate` (do not automate).

## Implementation Plan

1. Tidy `package.json` meta.
2. Reorganise the README.
3. Add (or decide on) `LICENSE`.
4. Add `CHANGELOG.md`.
5. Verify with `pnpm pack` / `npm publish --dry-run`.
6. Tests (smoke) + doc updates.

## Result

Within the TASK-012 scope, the VibeOps MVP 1–4 implementation was tidied into a CLI package shape that can be distributed via npm.

### Summary of changes

- `README.md` rewritten for the first-time user:
  - `What is VibeOps`.
  - `Why it is needed`.
  - Core philosophy (`VibeOps = workflow rail`, `Cursor = builder`, `Git docs/tasks = AI execution source of truth`, `Notion = human dashboard`).
  - Installation / quick start / the Acme Automator example flow.
  - Full command flow.
  - MVP features (`Project Bootstrapper`, `Interactive Planner`, `Task Generator`, `Git Task Lifecycle`, `Rollback Safety`, `Notion Dashboard Sync`).
  - Runner mode (`prompt mode` default, `cursor-cli` / `direct-llm` future).
  - Notion setup (`.vibeops.env`, `.vibeops.json`, data_source-first discovery, required properties, required Status options).
  - Git rollback safety / Agent workflow / Packaging / Security notes / Roadmap.
- `package.json` distribution metadata fortified:
  - Added `description`, `packageManager`, `author`, `license`, `repository`, `homepage`, `bugs`, `keywords`.
  - Restricted `files` to `dist`, `templates`, `README.md`, `LICENSE`, `CHANGELOG.md`.
  - Tidied `scripts` into `dev`, `build`, `typecheck`, `start`, `smoke`, `prepack`, `publish:dry`.
  - Removed `private: true`. The actual publish is not performed.
- New `LICENSE`: MIT, copyright holder `VibeOps contributors`.
- New `CHANGELOG.md`: a `0.1.0 - 2026-05-11` release-candidate entry.
- `.gitignore` tidied:
  - `dist/` is a build artefact: do not commit; produced by `prepack` and included in the npm package.
  - Keep ignoring `.vibeops.env`, `.vibeops/tmp/`, `.vibeops/cache/`, `.vibeops/brief/`, `.vibeops/generated/`.
  - Do not ignore `.vibeops/agents`, `.vibeops/prompts`, `.vibeops/workflows`.
- New `scripts/smoke.mjs`:
  - Asserts `dist/cli.js` exists.
  - `node dist/cli.js --help`.
  - `node dist/cli.js init --dry-run`.
  - `node dist/cli.js status`.
  - `node dist/cli.js task generate --dry-run`.
  - `node dist/cli.js notion init --dry-run`.
  - Does not include network-requiring real Notion API tests.
- Verified the `src/cli.ts` shebang (`#!/usr/bin/env node`) and `dist/cli.js` shebang are preserved post-build.
- `.vibeops.json` is kept in a safe state without real Notion target ids:

  ```json
  {
    "notion": {
      "enabled": false,
      "projectsDatabaseId": "",
      "tasksDatabaseId": "",
      "projectsTargetId": "",
      "tasksTargetId": ""
    }
  }
  ```

### Changed files

- `.gitignore`
- `README.md`
- `package.json`
- `LICENSE` (new)
- `CHANGELOG.md` (new)
- `scripts/smoke.mjs` (new)
- `docs/project/03-current-state.md`
- `docs/tasks/TASK-012-package-polish-readme.md`

## Test Result

### Static / build

- `pnpm typecheck` ✅ exit 0.
- `pnpm build` ✅ exit 0.
- First-line shebang on `dist/cli.js` ✅ `#!/usr/bin/env node`.
- `ReadLints` (`package.json`, `README.md`, `.gitignore`, `scripts/smoke.mjs`) ✅ 0 warnings.

### CLI smoke

All of these exit 0 ✅:

- `node dist/cli.js --help`.
- `node dist/cli.js init --dry-run`.
- `node dist/cli.js task generate --dry-run`.
- `node dist/cli.js notion init --dry-run`.
- `pnpm smoke`.

What `pnpm smoke` verifies internally:

- `pnpm typecheck`.
- `pnpm build`.
- `node scripts/smoke.mjs`.
  - `node dist/cli.js --help`.
  - `node dist/cli.js init --dry-run`.
  - `node dist/cli.js status`.
  - `node dist/cli.js task generate --dry-run`.
  - `node dist/cli.js notion init --dry-run`.

### Packaging / publish dry-run

- `pnpm pack` ✅ exit 0.
  - Tarball contents include `dist/`, `templates/`, `README.md`, `LICENSE`, `CHANGELOG.md`, `package.json`.
  - Confirmed `src/` is not included.
  - The generated `vibeops-0.1.0.tgz` was inspected and removed.
- `pnpm publish --dry-run` ⚠️ blocked by pnpm git safety:

  ```text
  ERR_PNPM_GIT_UNCLEAN Unclean working tree. Commit or stash changes first.
  ```

  pnpm correctly blocks an actual publish on a dirty working tree. The package verification with the git check disabled passes:

- `pnpm publish --dry-run --no-git-checks` ✅ exit 0.
  - `prepack` runs `pnpm build`.
  - npm notice tarball contents include `dist/`, `templates/`, `README.md`, `LICENSE`, `CHANGELOG.md`.
  - `src/` not included.
  - No actual publish (`dry-run`).

### Remaining risks

- The original `pnpm publish --dry-run` should be re-run on a clean working tree (commit or stash first) so the pnpm git check also passes.
- `repository` / `homepage` / `bugs` were populated relative to `https://github.com/vibeops/vibeops`. If the actual remote URL differs, fix before publishing.
- TASK-007 ~ TASK-011 are still candidates for human / Reviewer Agent sign-off via `vibeops task done <id> --finalize`. TASK-012 did not auto-finalise them.
