# TASK-015 · Status output polish

## Status

Review

## MVP Phase

Follow-on (post-MVP 4)

## Goal

Refresh the `vibeops status` output for the latest VibeOps structure. Drop the legacy env-var names (`NOTION_API_KEY` / `NOTION_PROJECT_DB` / `NOTION_TASK_DB`) from the Notion section in the default output, and add GitHub · Package sections built strictly from local files. Keep the Git unborn/detached distinction (TASK-014) as-is.

## Background

The current Notion section in `vibeops status` still exposes the TASK-002–era `readNotionEnvSnapshot` verbatim. In the latest structure, the only secret in play is `NOTION_TOKEN` (from `.vibeops.env` or `process.env`), and the regular settings live in `.vibeops.json` as `notion.projectsTargetId` / `notion.tasksTargetId`. The legacy keys have been removed from the README, the new docs, and the new `init` flow, but they linger in `status` and mislead users.

GitHub integration (TASK-013) is in place, but `vibeops status` does not surface it — the user has to run `vibeops github status` separately. The Package (npm) state (`name` / `version` / `bin`) is also not visible anywhere.

## Scope

- Redesign the Notion section in `vibeops status`:
  - Show only five lines: `enabled` · `token` · `projects target` · `tasks target` · `hint`.
  - `token` is one of `configured (.vibeops.env)` / `configured (process.env)` / `missing`.
  - Remove legacy keys (`NOTION_API_KEY` / `NOTION_PROJECT_DB` / `NOTION_TASK_DB`) from the default output.
  - Never print the raw `NOTION_TOKEN`.
- Add a GitHub section to `vibeops status`:
  - Read only the `github` section of `.vibeops.json`. No `gh` CLI calls.
  - Show enabled / mode / owner/repo / remote / url. When unset, `hint run \`vibeops github init\``.
- Add a Package section to `vibeops status`:
  - Read only `package.json`. When missing, one line `package.json missing`.
  - When present, show `name` · `version` · `bin`.
- Keep the Git section (TASK-014's unborn handling).
- Add equivalent fields (`notion.tokenSource`, `github.*`, `package.*`) to `vibeops status --json` without conflicting with existing keys.
- Tidy the collector / formatter / config types / notion-env helper.
- Update the status-related description in the README.

## Out of Scope

- Behavioural changes to `notion test` / `notion sync` / `github status` / `github init`.
- Cleaning up legacy keys still present in `.vibeops.env.example` · `installer.ts` (separate follow-up).
- Network / external command calls such as Notion API or `gh auth` verification.
- Broad colour / theme redesign.

## Acceptance Criteria

- `node dist/cli.js status` no longer prints `NOTION_API_KEY` / `NOTION_PROJECT_DB` / `NOTION_TASK_DB` anywhere in the Notion section.
- When `.vibeops.env` contains `NOTION_TOKEN=...`, the Notion token line displays `configured (.vibeops.env)` and the raw token is not printed.
- When `.vibeops.env` is missing but `process.env.NOTION_TOKEN` is set, the line displays `configured (process.env)`.
- When `.vibeops.json` has `github.enabled = true` + owner/repo, the GitHub section shows enabled `yes` along with owner/repo · url in one block.
- When GitHub is not configured, it shows as a single block: `GitHub\n  enabled  no\n  hint     run \`vibeops github init\``.
- In a directory with a `package.json`, the Package section shows name/version/bin. In a directory without one, it shows just `package.json missing` and the command exits cleanly.
- The Git section preserves TASK-014's behaviour (`normal` / `unborn` / `detached`).
- The `notion` object in `node dist/cli.js status --json` contains `enabled` / `hasToken` / `tokenSource` / `hasProjectsTarget` / `hasTasksTarget`.
- The `--json` output gains `github` · `package` objects.
- `vibeops status` makes 0 `gh` child-process calls and 0 Notion API calls.
- `pnpm typecheck` · `pnpm build` · `pnpm smoke` all pass.

## Files to Inspect First

- `src/status/collector.ts`
- `src/status/format.ts`
- `src/lib/notion-env.ts`
- `src/lib/config.ts`
- `src/lib/package-json.ts`
- `src/types/config.ts`
- `README.md` (status output examples)

## Expected Files to Change

- `src/status/collector.ts`
- `src/status/format.ts`
- `src/lib/config.ts` (remove or deprecate the legacy `readNotionEnvSnapshot`)
- `src/lib/notion-env.ts` (token-source helper)
- `src/types/config.ts` (new types such as `NotionStatusSnapshot`)
- `README.md`
- `docs/project/03-current-state.md`
- `docs/tasks/TASK-015-status-output-polish.md` (this file)

## Risks

- A directory without `package.json` might break status → `readPackageJson` already returns `null`, so the collector safe-falls-back.
- Removing the legacy `NotionEnvSnapshot` type could break external callers — verified no `src/`-external imports exist, so safe.
- Even with `.vibeops.env` present, the `NOTION_TOKEN` line may be absent → use the same `loadNotionEnv` fallback chain to stay consistent.
- A JSON-schema change can affect external automations → keep existing fields and only add new ones.

## Test Plan

- `pnpm typecheck`
- `pnpm build`
- `pnpm smoke`
- `node dist/cli.js status` (the current vibeops repo: Notion enabled=no, GitHub enabled=yes, Package=vibeops).
- Inside a new temp folder, after `node dist/cli.js init --git --initial-commit`, run `node dist/cli.js status` → confirm the Notion section has no legacy keys.
- In a temp folder without `package.json`, run `node dist/cli.js status` → confirm `Package\n  package.json missing` and clean exit.
- In `node dist/cli.js status --json` output, confirm `notion.tokenSource`, `github`, `package` fields.

## Rollback Plan

Revert `src/status/{collector,format}.ts`, `src/lib/notion-env.ts`, `src/lib/config.ts`, `src/types/config.ts`, `README.md`, and the doc updates — all are read-only output changes, so a Git revert fully restores them.

## Git Context

- Branch: proceed on main without a separate branch (same policy as TASK-014).
- Touched paths: `src/status/`, `src/lib/notion-env.ts`, `src/lib/config.ts`, `src/types/config.ts`, `README.md`, `docs/`.

## Notion Page

Not connected.

## Implementation Plan

1. Add `NotionStatusSnapshot` · `GithubStatusSnapshot` · `PackageStatusSnapshot` types to `src/types/config.ts`. Mark `NotionEnvSnapshot` as deprecated, or remove it.
2. Add `getNotionTokenSource(cwd): Promise<{ hasToken, source }>` to `src/lib/notion-env.ts` — reuses `loadNotionEnv` while never exposing the raw token to the caller.
3. Remove the `readNotionEnvSnapshot` call sites from the collector in `src/lib/config.ts`. Drop the function itself (no external consumers).
4. Rewrite `src/status/collector.ts` to fill the new `notion` / `github` / `package` snapshots.
5. Rewrite `printHuman` · `toJson` in `src/status/format.ts` to render the new sections.
6. Update README to reflect the new sections with an example.
7. Record the result in `docs/project/03-current-state.md` and this TASK file.

## Result

- Added `NotionStatusSnapshot` / `NotionTokenSource` / `GithubStatusSnapshot` / `PackageStatusSnapshot` types to `src/types/config.ts`. The legacy `NotionEnvSnapshot` is removed (status no longer references it).
- Added the token-safe `getNotionTokenSource(cwd)` to `src/lib/notion-env.ts`. Reuses `loadNotionEnv` to preserve the `.vibeops.env` → `process.env` priority. Returns only `{ hasToken, source }` (never the raw token).
- Removed the legacy `readNotionEnvSnapshot` / `NotionEnvSnapshot` imports from `src/lib/config.ts` (after confirming no external uses).
- Rewrote `src/status/collector.ts`, splitting into `snapshotNotion` / `snapshotGithub` / `snapshotPackage`. Notion ORs `loadNotionEnv` with `notion.{projectsTargetId,projectsDatabaseId}` / `notion.{tasksTargetId,tasksDatabaseId}` to determine target presence. GitHub reads only the `github` section of `.vibeops.json`. Package maps `readPackageJson(cwd)`'s `null` directly to `exists: false`. `bin` handles three cases: string / object / unset (`basename` + extension stripped → first object key → "").
- Rewrote `src/status/format.ts`: the Notion / GitHub / Package sections of `printHuman` now render in the new 5/6/3-line form. Label-width alignment (`pad`) and `tokenLine` / `targetLine` / `notionHint` helpers were extracted. The `tokenSource` value is displayed as `configured (.vibeops.env)` / `configured (process.env)` but the raw token is never printed. Zero legacy key (NOTION_API_KEY/PROJECT_DB/TASK_DB) output. When GitHub is unconfigured, it collapses into two lines: `enabled no` + `hint run \`vibeops github init\``. When Package is missing, it collapses into two lines: `Package\n  package.json missing`. The JSON output contains `notion.{enabled, hasToken, tokenSource, hasProjectsTarget, hasTasksTarget}` / `github.*` / `package.*`.
- Added a new "Status Output" section to `README.md` right after "Init Git Bootstrap" — full-output example + unconfigured case + Acme Automator case + JSON exposed-key guidance. Notes that legacy env keys are no longer printed.

## Test Result

- `pnpm typecheck` ✓
- `pnpm build` ✓
- `pnpm smoke` ✓ (8 cases pass — `--help`, `init --dry-run`, `init --dry-run --git --initial-commit`, `status`, `task generate --dry-run`, `notion init --dry-run`, `github status`, `github init --dry-run --connect goodtek/vibeops`).
- `node dist/cli.js status` (the current vibeops repo): Notion enabled=no / token configured (.vibeops.env) / projects+tasks target missing / hint `vibeops notion init`. GitHub enabled=yes / mode gh-cli / owner/repo goodtekxyz/vibeops / remote origin / url. Package name vibeops / version 0.1.0 / bin vibeops. Zero legacy keys.
- `node dist/cli.js status --json`: `notion.tokenSource = ".vibeops.env"` / `hasToken true` / `hasProjectsTarget false` / `hasTasksTarget false`. The `github` object contains enabled / mode / owner / repo / remote / url. `package.exists true` + name/version/bin.
- In `/tmp/vibeops-task015-sandbox`, after `init --git --initial-commit`, `status` shows Git `branch main / status clean`, Notion `enabled no / token missing / projects+tasks target missing`, GitHub `enabled no / hint`, Package `package.json missing`. All sections look right, with zero legacy keys.
- In `/tmp/vibeops-task015-unborn`, after `init --git --no-initial-commit`, `status` preserves Git `branch main (unborn, no commits yet) / status dirty / hint create the first commit ...`. The JSON also has `git.state="unborn"` / `git.hasCommits=false`.
- `NOTION_TOKEN=secret_test_value node dist/cli.js status` → the token line switches to `configured (process.env)`. Zero raw-token output.
- Searched `src/status/` for `github-cli` / `notion-client` imports → 0 hits. Statically verified that status does not call external commands or network.

## Review Notes

- The legacy `NotionEnvSnapshot` type and `readNotionEnvSnapshot` function were removed after grep confirmed no external imports. It is unlikely that an external automation depended on those exports.
- When `package.json#bin` is an object, only the first key is shown — assumes a single bin like VibeOps itself. Multi-bin projects need a future enhancement.
- The legacy `NOTION_API_KEY=` line still present in `.vibeops.env.example` / `installer.ts` is separate from the status output and outside this TASK's scope. A follow-up can clean it up.
- The Notion-enabled decision reads only `.vibeops.json#notion.enabled` — even with a token, if setup is not complete, it shows `no` for consistent UX.
