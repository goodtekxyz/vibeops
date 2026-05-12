# TASK-010 · `notion init` and `notion test`

## Status

Review

## Git Context

- Base Branch: `main`
- Base Commit: `b717254`
- Task Branch: `task/008-task-lifecycle`
- Started At: `2026-05-11T02:35:00Z`

## MVP Phase

MVP 4 · Notion Dashboard Sync

## Goal

Build the **configuration and verification** of the Notion integration.

- `vibeops notion init` — guide and assist writing the environment-variable slots needed in `.vibeops.env`.
- `vibeops notion test` — verify Notion API access and that Projects DB / Tasks DB **required-property schemas** match.

Actual sync is in [TASK-011](TASK-011-notion-sync-task-pull.md).

## Background

Notion is the human dashboard, not the source of truth. Even so, "is it connected? / does the schema match?" must be unambiguous. Splitting this check out before sync gives the user a precise error message right before sync.

## Scope

### `.vibeops.env` (local developer file) and `.vibeops.env.example` (committed)

Required variables:

- `NOTION_API_KEY` — Notion integration secret.
- `NOTION_PROJECT_DB` — Projects (or single-project page) DB id.
- `NOTION_TASK_DB` — Tasks DB id.

### `vibeops notion init`

- If `.vibeops.env` is missing, copy `.vibeops.env.example` and say "fill these keys".
- If it exists, show "key presence" (mask values).
- `--print` option: print `.vibeops.env.example` content to stdout.
- Include guidance to "create an integration in Notion and share the DB to the integration".

### `vibeops notion test`

- Load `.vibeops.env` and via `@notionhq/client`:
  - `users.me()` → API key valid.
  - `databases.retrieve(NOTION_TASK_DB)` → accessible + required properties exist.
  - `databases.retrieve(NOTION_PROJECT_DB)` → same.
- **Required Task-DB properties** (MVP draft):
  - `Name` (title).
  - `TaskId` (rich_text or unique) — "TASK-NNN".
  - `Status` (status or select) — planned / in_progress / done.
  - `Priority` (select).
  - `Branch` (rich_text).
  - `DocsPath` (url or rich_text).
  - `ResultSummary` (rich_text).
- **Required Project-DB properties**:
  - `Name` (title).
  - `CurrentStateSummary` (rich_text).
  - `NextTaskId` (rich_text).
- Output: a per-item ✓/✗ checklist. Exit code 0 if every item passes; ≠ 0 if any fails.
- `--json` for machine-readable output.

## Out of Scope

- Actual data sync (→ TASK-011).
- Webhook / realtime push.
- Auto-creating the schema (`create database`) — in the MVP the user creates DBs themselves (init guides them with the required-property list).

## Acceptance Criteria

1. `vibeops notion init` copies the example if `.vibeops.env` is missing and lists the keys: `NOTION_API_KEY`, `NOTION_PROJECT_DB`, `NOTION_TASK_DB`.
2. `vibeops notion init --print` prints the keys to stdout and creates no file.
3. With any empty keys, `vibeops notion test` reports which keys are empty and exits ≠ 0 (no network call).
4. With keys filled and permissions correct, `vibeops notion test` prints ✅/❌ per item and exits 0 if all ✅.
5. If a required property is missing from the Notion response, the missing property name is shown and exit ≠ 0.
6. `--json` is valid JSON.
7. No command exposes the raw `.vibeops.env` value to stdout (masked).

## Files to Inspect First

- `src/config/projectConfig.ts` (TASK-002).
- `templates/.vibeops.env.example` (TASK-003).

## Expected Files to Change

- new: `src/commands/notion/{init,test}.ts`.
- new: `src/notion/client.ts` (thin wrapper).
- new: `src/notion/schema.ts` (required property definitions).
- new: `src/config/envConfig.ts` (read `.vibeops.env`).
- new: `tests/notion.test.ts` (mock `@notionhq/client` — no real network).
- update: `package.json` (add `@notionhq/client`, `dotenv`).
- update: this TASK's Result / Test Result, `docs/project/03-current-state.md`, `docs/logs/YYYY-MM-DD.md`.

## Risks

- Distinguishing Notion's "status" type from "select" type — allow both.
- API rate limit / network failure → 5s timeout + clear error message.
- Risk the user commits `.vibeops.env` → `init` adds a line to `.gitignore` or warns.

## Test Plan

- vitest with `@notionhq/client` mocked:
  - `users.me` success / failure.
  - `databases.retrieve` with all required properties / with missing ones.
  - Empty env-vars case → zero network calls.
- Manual: create small DBs in a real Notion workspace and run `vibeops notion test`.

## Rollback Plan

- Discard the working branch. `.vibeops.env` is local-only; no impact.

## Implementation Plan

1. `src/config/envConfig.ts` for dotenv-based loading + masking util.
2. `src/notion/schema.ts` for required-property definitions.
3. Initialise `@notionhq/client` in `src/notion/client.ts`.
4. `commands/notion/init.ts`: file copy, guide, `--print`.
5. `commands/notion/test.ts`: verification flow + `--json`.
6. Tests + doc updates.

## Result

Completed 2026-05-11 (awaiting review). Implemented the bodies of `vibeops notion init` and `notion test`. To honour the user's updated requirements, the original TASK-010 doc's options / env variables / DB schema were reorganised as follows.

### User requirements vs the original TASK-010 doc (deviations)

- Environment variables: the original doc put all of `NOTION_API_KEY` / `NOTION_PROJECT_DB` / `NOTION_TASK_DB` into `.vibeops.env`. Actual implementation keeps **only `NOTION_TOKEN`** as a secret (in `.vibeops.env`). DB ids live in `.vibeops.json` under `notion.projectsDatabaseId` / `notion.tasksDatabaseId`, committed like ordinary config.
- `notion init` options: original `--print` (print `.vibeops.env.example` to stdout). Actual: **`--dry-run / --enable / --projects-db <id> / --tasks-db <id> / --cwd`**. `.vibeops.env` is not auto-created by default. It is created / updated **only when** the user explicitly answers "Paste NOTION_TOKEN now? = Yes" in interactive setup.
- `notion test` options: kept `--json`. Instead of the original 7-property Task DB list (`Name / TaskId / Status / Priority / Branch / DocsPath / ResultSummary`), enforce the user's updated **10 properties** (`Name / Task ID / Project ID / Status / Priority / MVP Phase / Git Branch / Docs Path / Summary / Result Summary`). Projects DB is also extended to **8 properties** (`Name / Project ID / Status / Local Path / Git Repo / Current Phase / Docs Path / Summary`).
- `Status` type: original allowed `status or select`. Actual: **`status` only** (per user). Only `Git Repo` accepts either `rich_text` or `url`.

### Added / modified files

- new: `src/lib/notion-env.ts` — mini `.vibeops.env` parser (`KEY=value`, strips quotes, ignores `#` comments; no dotenv dependency). `loadNotionEnv(cwd)` returns the token by checking `.vibeops.env` → `process.env`. `maskToken(value)` masks as `first4…last4 (len=N)`.
- new: `src/lib/notion-schema.ts` — defines `PROJECTS_DB_PROPERTIES` (8) + `TASKS_DB_PROPERTIES` (10). `validateDatabaseSchema()` takes the `properties` map from `databases.retrieve()` and returns missing (`missing`) / type-mismatch (`type-mismatch`) entries as `SchemaViolation[]`.
- new: `src/lib/notion-client.ts` — **lazy dynamic import** of `@notionhq/client` (`await import("@notionhq/client")`). 5s timeout. Exposes only `users.me()` / `databases.retrieve(id)`. `notionApiError(err)` attaches a friendly English explanation for codes such as `unauthorized / restricted_resource / object_not_found / validation_error / rate_limited / request_timeout / ETIMEDOUT`.
- new: `src/commands/notion-init.ts` — safely merges the `notion` section into `.vibeops.json` (preserving other fields), appends a single `NOTION_TOKEN=` line into `.vibeops.env.example` (preserving existing lines, skipping if present), and prints a console guide of required Projects / Tasks DB properties. `--dry-run` prints only the diff and changes zero files.
- new: `src/commands/notion-test.ts` — 8-step pre-flight + 6-step API verification. Each step is one of `ok / fail / skip`. Once a step `fail`s, subsequent ones are auto-`skip`. `--json` emits the same data as valid JSON. Exit code 0 if all ok, 1 if any fails.
- update: `src/types/config.ts` — added `NotionConfig { enabled, projectsDatabaseId, tasksDatabaseId }`; made `VibeopsConfig.notion?` optional for round-trip. Added `NotionEnvSnapshot.hasToken`.
- update: `src/lib/config.ts` — `readConfig` safely parses the `notion` section (ignoring malformed shapes). `mergeNotionConfig(base, patch)` performs a patch merge that never overwrites unrelated fields. `readNotionEnvSnapshot()` also reports `NOTION_TOKEN`.
- update: `src/status/format.ts` — shows a single `NOTION_TOKEN` line + a summary of the `notion` section in `.vibeops.json` (presence of `enabled / projectsDatabaseId / tasksDatabaseId`).
- update: `src/cli.ts` — exposes options for `notion init` / `notion test` (`--dry-run / --enable / --projects-db / --tasks-db / --cwd` · `--json / --cwd`).
- update: `package.json` + `pnpm-lock.yaml` — adds `@notionhq/client@^5.20.0` as a dependency.

### Safeguards (security)

- **`.vibeops.env` is not auto-created by default.** Created / updated only when the user explicitly chooses "Paste NOTION_TOKEN now? = Yes" in interactive setup. Never created in dry-run / non-interactive / No / non-TTY paths.
- **The raw `NOTION_TOKEN` value never appears on stdout.** `notion test` shows it only in the masked form (`secr…zzzz (len=40)`). Verified: `grep -F "secret_aBcDeF1234567890zzzzzzzzzzzzzzzzz"` → no match.
- **Notion API is read-only.** Calls only `users.me` / `databases.retrieve`. No DB creation, no page push, no metadata change.
- **5s timeout** so commands do not hang on Notion outages.
- Zero GitHub-API / Cursor-CLI / LLM-API / Git-mutation calls this round.

### Out of scope (after TASK-011)

- `notion sync` body — TASK-011.
- `task pull` (Notion → docs/tasks metadata pullback) — TASK-011.
- Notion Webhook / realtime sync — out of MVP 4.
- Notion DB auto-creation — permanently out of scope (humans create them).

## Result — UX patch (2026-05-11)

Per user request, the Yes / No question UX of `notion init` was completely revised. Core rule: **zero `confirm` prompts**. All Yes / No questions are unified into **2-choice `select` prompts** (Yes / No) so the user chooses with ←/→ or ↑/↓ + Enter, without typing y/n.

### New / modified

- new helper `yesNoSelect` (`src/lib/inquirer-helpers.ts`) — signature exactly as specified by the user:

  ```ts
  export async function yesNoSelect(opts: { message: string; defaultValue?: boolean }): Promise<boolean> {
    return await select<boolean>({
      message: opts.message,
      choices: [
        { name: "Yes", value: true },
        { name: "No", value: false },
      ],
      default: opts.defaultValue ?? true,
      loop: false,
      pageSize: 2,
    });
  }
  ```

- new wrapper `askYesNo({ message, nonInteractive, defaultValue })` — in CI / non-TTY environments returns `defaultValue`; otherwise delegates to `yesNoSelect`. Reusable from other commands.
- new helpers `inspectEnvFile(cwd)` / `writeNotionTokenToEnvFile(cwd, token)` (`src/lib/notion-env.ts`) — safely add / replace the `NOTION_TOKEN=` line in `.vibeops.env` (preserves other lines; creates with a header if the file is absent). Callers still guarantee that the token value is never streamed to stdout.
- updated `src/commands/notion-init.ts` — interactive flow added. All 5 yes/no questions go through the `select`-based helper, **with zero `confirm` imports**:
  1. **Use Notion dashboard sync?** — default = existing `notion.enabled`. On No, skips DB id / token questions.
  2. **Continue without database IDs?** — only when both DB ids are empty. Default = No (safer). No → cancel command + friendly guide; Yes → keep `enabled=true` but leave IDs for later.
  3. **Paste NOTION_TOKEN now?** — default = No. Yes → `password` prompt (input not echoed) → saved into `.vibeops.env`.
  4. **Overwrite existing NOTION_TOKEN?** — only if `.vibeops.env` already has a token. Default = No.
  5. (Reserved) any future yes/no must use the same helper (code-review rule: no `confirm` imports).
- updated `src/cli.ts` — added the `--non-interactive` option to `notion init`. Forces non-interactive even in a TTY (for CI).
- updated `--dry-run` behaviour — skips interactive questions and prints the plan only (zero file / token writes).
- automatic fallback — when `process.stdin.isTTY !== true`, automatically enters non-interactive mode (equivalent to `--non-interactive`). Safe under pipes / `</dev/null` / CI.

### Security policy (reaffirmation)

- The raw `NOTION_TOKEN` value **never appears on stdout**. Interactive input is masked via `@inquirer/prompts` `password` with `mask: "*"`. Display of stored values uses only `maskToken(value)` (`first4…last4 (len=N)`).
- `.vibeops.env` is not auto-created by default. Created / updated **only when the user explicitly answers "Paste NOTION_TOKEN now? = Yes" in interactive setup**. Never created in dry-run / non-interactive / No / non-TTY paths.
- `.vibeops.env` is gitignored. Existing lines are preserved; only the `NOTION_TOKEN=` line is added / replaced.
- Zero `confirm` prompts → no "y" / "n" key entry is forced.

## Test Result

- `pnpm typecheck` → exit 0.
- `pnpm build` → exit 0.
- `pnpm dev notion --help` → 3 sub-commands shown (init / test / sync).
- `pnpm dev notion init --help` → 5 options (`--dry-run / --enable / --projects-db / --tasks-db / --cwd`).
- `pnpm dev notion test --help` → 2 options (`--json / --cwd`).
- Sandbox (`/var/folders/.../vibeops-notion-XXXX/`) — after `init`, verified 11 cases:

  | # | Command | Verification |
  | --- | --- | --- |
  | 1 | `notion init --dry-run` | Plan only (`notion` section addition + env.example `NOTION_TOKEN=` line); zero file changes |
  | 2 | `notion init` (real) | `.vibeops.json` gets `{ "notion": { "enabled": false, "projectsDatabaseId": "", "tasksDatabaseId": "" } }`; `NOTION_TOKEN=` appended at the end of `.vibeops.env.example` (existing keys preserved) |
  | 3 | `notion init --enable --projects-db PROJ123 --tasks-db TASK456` | `notion.enabled=true / projectsDatabaseId=PROJ123 / tasksDatabaseId=TASK456` set correctly |
  | 4 | `notion test` (no token) | `NOTION_TOKEN load ✗ + 6 subsequent steps auto-skip`. exit 1 |
  | 5 | `notion test --json` (no token) | Valid JSON, `ok=false, checks.length=11, env.tokenMasked=null` |
  | 6 | `notion test` (token present, `enabled=false`) | Token masked `secr…zzzz (len=40)`, `enabled = true ✗`, 6 subsequent steps skipped |
  | 7 | `notion test` (token present, `enabled=true`, fake token) | SDK load ✓, `users.me → HTTP 401 → "NOTION_TOKEN was rejected…"` friendly interpretation, 4 subsequent steps auto-skipped |
  | 8 | `notion init` (re-run, idempotent) | `unchanged .vibeops.json`, `unchanged .vibeops.env.example` |
  | 9 | Security — token value must not leak to stdout | `grep -F "secret_aBcDeF1234567890zzzzzzzzzzzzzzzzz"` → no match |
  | 10 | `notion init --enable --projects-db PROJ-NEW --tasks-db TASK-NEW --dry-run` | Shows diff `~ projectsDatabaseId PROJ123 → PROJ-NEW`, `~ tasksDatabaseId TASK456 → TASK-NEW`. Real config unchanged |
  | 11 | `notion init` (run in /tmp) | `✗ no .vibeops.json. Run \`vibeops init\` first…` + exit 1 |

- Live-repo read-only: `node dist/cli.js notion init --dry-run --cwd /Users/hjhamm/goodtek/vibeops`. After the command, `.vibeops.json` / `.vibeops.env.example` git-status → unchanged.
- Zero LLM / Cursor-CLI / Notion-mutation / GitHub-API / Git-mutation calls this round. Only `users.me` once (`databases.retrieve` skipped due to token rejection) for external traffic.
- Deferred: vitest auto-regressions (cumulative since TASK-001 ~ 010). To be consolidated in the polish round.

### UX patch (2026-05-11 follow-up) verification

- `pnpm typecheck` / `pnpm build` → exit 0.
- `pnpm dev notion init --help` → `--non-interactive` option shown (`skip interactive questions in a TTY and use flag / default values (for CI)`).
- `grep -nE "confirm\(|from \"@inquirer/prompts\".*\\bconfirm\\b" src/commands/notion-init.ts` → 0 matches. (`inquirer-helpers.ts`'s existing `askConfirm` is kept for other commands, but `notion init` uses only `askYesNo` / `password`.)
- Sandbox `/var/folders/.../vibeops-notion-ux-XXXX/`:
  - `notion init --dry-run` → zero interactive questions; plan only; zero files.
  - `notion init --non-interactive --enable --projects-db PROJ-A --tasks-db TASK-B` → zero questions, merged correctly into `.vibeops.json`, exit 0.
  - `notion init </dev/null` (non-TTY) → automatically falls back to `mode  non-interactive (flags only)`.
  - Direct `node` verification: built `dist/lib/inquirer-helpers.js`'s `yesNoSelect` calls `select` (not `confirm`), with `[{name:"Yes", value:true},{name:"No", value:false}]` choices + `loop: false` + `pageSize: 2`.
  - Real interactive simulation with `expect(1)`: Q1 (Use Notion sync) Enter / Projects DB Enter / Tasks DB Enter / Q2 (Paste NOTION_TOKEN now?) Enter — all 4 stages proceed with `\r` only, reaching the "Next steps" output. Zero forced y/n typing ✓.
  - Standalone `writeNotionTokenToEnvFile`: first call → `created:true`; second call (different token) → `replaced:true`, `inspectEnvFile` recognises the new token. The file contains only the header + a single `NOTION_TOKEN=…` line.
  - Security — the raw token `secret_bbbbbbbbbbbbbbbbbbbbbbbbbbbb` never appears in any CLI stdout (zero grep matches outside the probe script).
- Live-repo read-only — `git status --porcelain | grep -E "\.vibeops\.(json|env)"` → 0 matches. `.vibeops.json` / `.vibeops.env*` unchanged.

## Result — Search-driven DB picker (2026-05-11 follow-up #2)

This round replaced the DB-ID input stage of `vibeops notion init` with a **`POST /v1/search`-driven select flow**. As long as the user enters a correct NOTION_TOKEN, they pick the databases shared with the integration from a select prompt; copying a 32-char id by hand is no longer required.

### Summary of changes

- **Interactive flow re-ordered**: `enabled (Q1) → Paste NOTION_TOKEN now (Q2 + optional Overwrite Q3 + password) → Search accessible Notion databases now? (Q-search) → Select Projects DB → Select Tasks DB → manual fallback only for empty IDs → Q4 (Continue without DB IDs) if still empty`. The token has to be received first to make DB search possible, so the order was inverted.
- **DB select**: each choice is labelled `${title}  (${shortId}) — ${tag}: ${matched}/${total} matched, …`. `tag` is `recommended` when applicable, otherwise `projects` or `tasks` (based on the current select stage). The choices always end with `Enter database ID manually…` + `Skip for now (use existing value or leave empty)`.
- **Recommendation sort (`sortForKind`)**: per kind, `matched/total ≥ 60%` is "strong" → otherwise matched > 0 is "partial" → matched = 0 is "rest". Within a tier, sort by matched desc, type-mismatch asc, title alpha. The first entry of `recommendedIds` is the default select value.
- **Immediate schema check (fail-soft)**: schema is checked right after select or manual input. If the search response has `properties`, use it (`renderImmediateSchemaCheck`); otherwise call `databases.retrieve(id)` once (`softValidateSchema`). The result is only `✓` or a `! some missing (matched/total, N missing, M mismatch)` warning. **init itself never blocks** — strict verification is the job of `vibeops notion test`.
- **DB-search guards**:
  - `--dry-run` / `--non-interactive` / non-TTY → the question is not asked → zero API calls.
  - If both `--projects-db` and `--tasks-db` are provided, the search stage is skipped.
  - If the user declines to provide a token and none exists in `.vibeops.env` / `process.env` (`resolveEffectiveToken === null`), search is skipped and only the manual fallback is offered.
  - When search returns nothing, prints `Notion returned no accessible databases. Make sure your Projects and Tasks databases are shared with the VibeOps integration: DB page → ⋯ → Connections → VibeOps`.
  - Search failures (timeout / unauthorized / restricted_resource / object_not_found / validation_error / rate_limited) get a friendly English explanation via `explainSearchError` + a warning. The init flow still moves on to the manual fallback.
- **API surface extension**: added `NotionClient.search(options)` (lazy `@notionhq/client`, 5s timeout). Interface: `query? / objectFilter ('database'|'page') / pageSize / startCursor`. Response: `{ results: NotionSearchHit[]; hasMore; nextCursor }`. The result `object` accepts the new `data_source` type as well as `database` (mid-migration on Notion's side).
- **Discovery module**: new `src/lib/notion-discovery.ts`.
  - `discoverDatabases(client)` — automatic pagination, 50-entry cap (`NOTION_DISCOVERY_MAX`); returns `truncated`. Excludes `object === 'page'`, includes `data_source`, deduplicates ids.
  - `normalizeHit(hit)` — produces `NotionDatabaseChoice` (extract title + fallback `(Untitled database)` + per-kind schema scores).
  - `sortForKind('projects'|'tasks', dbs)` — recommendation sort + `recommendedIds`.
  - `buildChoiceLabel({ kind, database, isRecommended })` — select label.
  - `shortId(id)` — `firstN…lastN` compressed display (returned as-is when ≤ 12 chars).
- **Security hardening**:
  - **The token is never accepted as a CLI argument** (no `--token`; env or interactive `password` only). The policy has held since TASK-010; this is the explicit statement.
  - New `sanitiseApiError(err)` replaces `secret_…` / `ntn_…` / `Bearer …` patterns in Notion SDK error messages with `***`. The same sanitiser is applied to other errors such as 5s timeouts.
  - All search results are read-only — zero page-body-block / DB-schema changes.

### New / modified files

- new `src/lib/notion-discovery.ts` — search invocation + normalise + recommendation score + sort + label builder.
- updated `src/lib/notion-client.ts` — adds `NotionSearchHit / NotionSearchResult / NotionSearchOptions`, `NotionClient.search`, SDK call wrapping (default `page_size` 50, response normalisation).
- updated `src/commands/notion-init.ts` — reordered flow (`token → search → DB select → manual fallback`), with `resolveEffectiveToken / pickDatabasesViaSearch / pickOneDatabase / renderImmediateSchemaCheck / softValidateSchema / sanitiseApiError / explainSearchError / maskId`.

### Security policy (reaffirmation)

- The raw `NOTION_TOKEN` value appears nowhere on stdout or error messages. Input is `password`-masked; display uses `maskToken()` (`first4…last4 (len=N)`); SDK errors are processed through `sanitiseApiError()` (`secret_***` / `ntn_***` / `Bearer ***`).
- **No CLI option accepts the token.** Only `.vibeops.env` / `process.env.NOTION_TOKEN` / interactive `password`.
- `.vibeops.env` is not auto-created by default. Created / updated only when the user explicitly answers "Paste NOTION_TOKEN now? = Yes" in interactive setup. Never created in dry-run / non-interactive / No / non-TTY paths.
- Zero mutation API calls this round beyond `search` / `databases.retrieve`.

## Test Result — Search-driven DB picker

### Static verification

| Check                                | Result |
| ------------------------------------ | :----: |
| `pnpm typecheck` (tsc --noEmit)      | exit 0 |
| `pnpm build`                         | exit 0 |
| `ReadLints` (3 updated + 1 new ts)   | 0 warnings |
| `node dist/cli.js notion init --help` | All 6 options (`--dry-run / --enable / --projects-db / --tasks-db / --non-interactive / --cwd`) shown correctly |

### Sandbox `/tmp/vibeops-task010-ux/`

- **`vibeops init --name task010-ux`** → 39 files installed; `.vibeops.json` correct.
- **`notion init --dry-run`** → 0 questions, 0 search calls, plan printed, then `dry-run — no files were written.`.
- **`notion init --non-interactive --enable --projects-db test-projects-db --tasks-db test-tasks-db`** → 0 questions, 0 search calls, `.vibeops.json.notion = { enabled: true, projectsDatabaseId: "test-projects-db", tasksDatabaseId: "test-tasks-db" }`.
- **`notion test`** → `NOTION_TOKEN load ✗ + 6 subsequent steps skip`. exit 1.

### Unit (direct `node` calls, mocked Client)

- **`shortId`** — `1a2b3c4d-1111-2222-3333-444444440000` → `1a2b3c4d…0000` / `abc` → `abc` (≤ 12 chars).
- **`normalizeHit`** — `title=[]` input → falls back to `(Untitled database)`.
- **Score verification**:
  - Projects DB (all 8 properties) → `projectsScore.matched=8/8`, `tasksScore.matched=5/10` (shared properties only).
  - Tasks DB (all 10 properties) → `tasksScore.matched=10/10`, `projectsScore.matched=5/8`.
  - Partial match + `Status` type mismatch → `{ matched:1, missing:8, typeMismatch:1, total:10 }` correct.
- **`sortForKind('projects')`** → `[VibeOps Projects, VibeOps Tasks, My Notes]`, `recommendedIds = [Projects, Tasks]` (both ≥ 60%).
- **`sortForKind('tasks')`** → `[VibeOps Tasks, VibeOps Projects, My Notes]`, `recommendedIds = [Tasks]` (Projects is 5/10 < 60% so partial).
- **`buildChoiceLabel`** — recommended → `recommended: matched/total`; non-recommended → `projects: matched/total, N missing`.
- **`discoverDatabases` pagination** (2 mocked batches) → 2 calls, 4 results, `page` objects auto-excluded, `data_source` included, duplicate ids skipped, `truncated=false`.
- **`discoverDatabases` cap** (60 mocked DBs) → 50 results, `truncated=true` correct (hasMore is honoured at the cap).
- **Empty result** (mock empty) → `count=0, truncated=false, totalHits=0`.

### Security verification

- **`sanitiseApiError` regex** — `secret_aBcDeF1234567890zzzzzzzzzzzzzzzz1234` / `ntn_abc…` / `Bearer ntn_…` in Notion error messages get replaced with `secret_*** / Bearer ***` (zero raw token hits).
- **CLI option surface** — `--help` output has no `--token` option. Beyond `loadNotionEnv`, there are zero token-input paths.
- **Live repo read-only** — after `git status --short`, `.vibeops.json` / `.vibeops.env*` are unchanged; no accidental changes outside `src/commands/notion-init.ts`.

### Skipped items (intentional)

- A live scenario in which a user goes search → select → schema check could not be exercised without a real Notion token. Recommend a polish-round vitest pass or a manual user run (`pnpm dev notion init` → token → DB select → `vibeops notion test`).
- `data_source` object sort / label rendering was covered only via mocks. If Notion's API migration alters response shapes, the polish round handles it.

---

## Result — Discovery bug fix: object filter `data_source` (2026-05-11 follow-up #3)

### Background (reproducible error)

After choosing "Search accessible Notion databases now? Yes" in `vibeops notion init`, the Notion REST API rejected the request with:

```
body.filter.value should be `"page"` or `"data_source"`, instead was `"database"`.
```

Cause: the current Notion REST API (`POST /v1/search`) accepts `filter.property = "object"` `value` of **only `page` or `data_source`**. `"database"`, which was historically valid, is no longer accepted. VibeOps was sending `"database"`.

### Changes

- **`src/lib/notion-client.ts`**
  - Narrowed `NotionSearchObjectFilter` to `"data_source" | "page"` (permanently dropped `database`).
  - Updated the SDK call signature accordingly. `database` no longer compiles.
- **`src/lib/notion-discovery.ts`**
  - `discoverDatabases(client)` always uses `objectFilter: "data_source"`. Extracted the helper `runSearchPaginated(client, filter)`.
  - When a `validation_error` (or a 4xx whose message contains `body.filter.value` / `data_source`) appears, it falls back once to `objectFilter: "page"`. Any `page` response is filtered out by the kind guard (`object !== "database" && object !== "data_source"`), so the result is naturally empty and the user is directed to the manual id-input path.
  - When the fallback fires, the result carries `fallbackFrom: "data_source"`, `filterUsed: "page"` so callers can show a one-liner.
  - Response normalisation still accepts both `database` and `data_source` (both shapes may coexist on Notion's side).
  - New export `NotionDataSourceChoice` — a type alias of `NotionDatabaseChoice` for new call sites that want to emphasise the data_source semantics. Existing `NotionDatabaseChoice` continues to work.
- **`src/commands/notion-init.ts`**
  - When `discoverDatabases`'s result carries `fallbackFrom`, `pickDatabasesViaSearch` prints a one-line English warning + a dim line explaining "Notion's search filter currently only accepts \"data_source\"". The user is still guided to the manual fallback or retry flow.
  - `explainSearchError`'s `validation_error` branch is strengthened: if the message contains `body.filter.value` or `data_source`, it explains "SDK may be outdated" and points to the manual id-input fallback.

### Security

- The raw token is never echoed anywhere. The reason carried in the fallback message uses only Notion's `message` field (`body.filter.value should be ...`) — no token.
- `sanitiseApiError` still masks `secret_***` / `Bearer ***`.
- The manual DB-id-input fallback (`--projects-db` / `--tasks-db` / manual input) is preserved.

### Non-goals (this follow-up's limits)

- Did not touch `notion sync` / `task pull` (TASK-011) bodies.
- Kept the `@notionhq/client` version as-is — only narrowed the wrapper signature so any SDK version is acceptable.

## Test Result — Discovery bug fix

### Static verification

- `pnpm typecheck` ✅ — 0 errors (narrowing `NotionSearchObjectFilter` introduced no regression).
- `pnpm build` ✅ — in the compiled `dist/lib/notion-discovery.js` grep:
  - `objectFilter: filter` ✅ (variable only; no literal `"database"`).
  - `runSearchPaginated(client, "data_source")` ✅ initial call.
  - `runSearchPaginated(client, "page")` ✅ fallback call.
  - The literal `"database"` exists only in comments / types; zero API-call arguments.

### CLI verification

- `pnpm exec tsx src/cli.ts notion init --dry-run` → normal. The dry-run guard is unchanged — no token accepted, zero file changes.
- `pnpm exec tsx src/cli.ts notion init --help` → no `--token` option (security invariant preserved).

### Real-token verification (recommend manual user regression)

- Automation cannot use a real token; this round verified via mocks only. User-side regression procedure:
  1. `pnpm dev notion init`.
  2. Paste NOTION_TOKEN.
  3. "Search accessible Notion databases now?" → Yes.
  4. Confirm `/v1/search` passes without `validation_error` and that the results appear in the select prompt.
  5. (Bonus) When simulating an outdated SDK / older SDK version, confirm the warning `Notion rejected "data_source" object filter and fell back to "page".` is shown and that the manual id-input flow kicks in.

### Risks / future polish

- Notion may move the `properties` location of the response separately from `data_source`. `normalizeHit` already accepts `hit.properties` when present, but if a future SDK wraps it as `data_source.properties`, a polish round is needed.
- The `validation_error` message text (`body.filter.value`) could change; `isUnsupportedObjectFilterError` also looks at `data_source` substring.

---

## Result — Inline DB discovery via page scan (2026-05-11 follow-up #4)

### Background

There is a case where the integration has access to a parent page but the inline database / data_source inside it does not appear in `POST /v1/search filter=data_source`. Up to the previous patch (follow-up #3), this state ended at "No accessible databases" and only suggested entering a 32-char id by hand. The user had to discover the inline DB id manually.

### Decision

- **Extend the search flow into two stages.**
  1. `searchDataSources(client)` → if ≥ 1 hit, use that.
  2. If 0 hits, call `searchPages(client)` → present "Select a page to scan for inline databases" select prompt → on user selection, call `blocks.children.list(pageId)` and scan **1 level deep**.
  3. From the scan, extract `child_database` / `data_source` blocks as `NotionDatabaseChoice` candidates. These candidates feed into the Projects / Tasks DB selects.
  4. In any stage, if the result is 0, retain the manual id-input fallback.
- **No recursion, only 1-depth scan**. Block scan cap is **at most 100 blocks** (`NOTION_PAGE_SCAN_MAX_BLOCKS`). Page search keeps the existing `NOTION_DISCOVERY_MAX = 50`.
- Inline-candidate schema info is not in the `blocks.children.list` response, so `properties = undefined`; `projectsScore` / `tasksScore` are populated as `{ matched:0, missing:total }`. Right after the user selects, `databases.retrieve(id)` is used by `softValidateSchema` (identical to the manual-input path).
- **Improved permission guidance**:
  ```
  VibeOps can access pages, but no data sources were returned by Notion search.
  If your databases are inline, select the parent page so VibeOps can scan its child blocks.
  If they still do not appear, open each database as a page and add the VibeOps integration directly.
  ```
- **Select choice label extension**: when source = `"page-block"`, the candidate is labelled `${title}  (${shortId(id)}) — inline database in ${parentTitle}: no property info`. In place of the `kind` (projects/tasks) tag, `inline database in ${parentTitle}` is shown.

### New API surface

- `NotionClient.blocksChildrenList({ blockId, pageSize?, startCursor? }): Promise<NotionBlockList>` — 5s timeout, page_size ≤ 100.
- `searchDataSources(client)` — pure `objectFilter: "data_source"` (no fallback).
- `searchPages(client)` — pure `objectFilter: "page"`; extracts page title (`properties.<title-prop>.title[]` first; top-level `title[]` also supported).
- `listPageChildren(client, pageId)` — paginated 1-depth scan, cap = `NOTION_PAGE_SCAN_MAX_BLOCKS` (100).
- `discoverInlineDatabasesFromPage(client, pageId, parentTitle?)` — extracts only `child_database` / `data_source` blocks and normalises them as `NotionDatabaseChoice`. Deduplicates ids and ignores unknown types.
- `discoverNotionDatabases(client)` — the orchestrator. Returns `{ dataSources, pages, warnings, dataSourcesEmpty, dataSourceErrored, dataSourcesTruncated, pagesTruncated }`. `validation_error` is absorbed as `dataSourceErrored=true` + proceeds with page search. Other transport errors throw.
- Extended `NotionDatabaseChoice`: `source?: "search" | "page-block"`, `parentPageId?: string`, `parentPageTitle?: string`. `object` may now be `"child_database"`.

### UX / CLI flow (notion init)

```
→ Notion /v1/search (read-only, 5s timeout, page_size ≤ 50)…
   case A — data_source ≥ 1:
     ┌─ Select Projects DB  (arrow keys · Enter — recommended: N)
     └─ Select Tasks    DB  (arrow keys · Enter — recommended: N)
   case B — data_source 0, pages ≥ 1:
     "VibeOps can access pages, but no data sources were returned by Notion search.
      If your databases are inline, select the parent page so VibeOps can scan its child blocks.
      If they still do not appear, open each database as a page and add the VibeOps integration directly."
     · N pages accessible — pick a parent page to scan its 1-depth blocks (cap 100 blocks)
     ┌─ Select a page to scan for inline databases
     │     VibeOps  (1a2b3c4d…0001)
     │     Misc Notes  (4d5e6f7g…0002)
     │     Skip page scan — proceed with 32-char id input
     └→ blocks.children.list(1a2b3c4d…0001) — 1-depth scan (cap 100 blocks, read-only)…
        · 2 inline database candidates found.
     ┌─ Select Projects DB
     │     Projects  (1a2b3c4d…0003) — inline database in VibeOps: no property info
     │     Tasks     (1a2b3c4d…0004) — inline database in VibeOps: no property info
     │     Enter database ID manually…
     │     Skip for now
     └─ (right after select: databases.retrieve → softValidateSchema)
   case C — data_source 0, pages 0:
     "· no accessible pages either — proceed with 32-char id input."
```

### Security / safety

- Only read-only APIs are used — `search`, `blocks.children.list`, `databases.retrieve` (immediate schema check).
- Zero raw token output — all API error messages are masked by `sanitiseApiError` (`secret_***` / `Bearer ***`).
- Keeps the 5s timeout (lazy `@notionhq/client`).
- Page-scan cap 100 — picking a wrong, huge page does not run away.
- No recursive scan — `has_children` is ignored.
- Manual DB-id-input fallback retained in every branch.

### Non-goals (this follow-up's limits)

- 1-depth scan only. Inline DBs inside a `child_page` are handled in a polish round.
- `notion sync` / `task pull` bodies are not touched.

## Test Result — Inline DB discovery via page scan

### Static verification

- `pnpm typecheck` ✅ exit 0.
- `pnpm build` ✅ exit 0.
- `ReadLints (notion-discovery.ts, notion-client.ts, notion-init.ts)` → 0 warnings.

### CLI verification

- `pnpm exec tsx src/cli.ts notion init --dry-run` → normal plan output; zero file changes; no token accepted.
- `pnpm exec tsx src/cli.ts notion init --help` → no `--token` option (security invariant preserved).

### Unit (mock NotionClient, direct `dist/lib` calls) — 6 scenarios

1. **data_source ≥ 1** (two hits: Projects + Tasks) → `discoverNotionDatabases` returns `dataSources.length===2, pages.length===0`. ✅
2. **data_source 0, pages 1** (only VibeOps page shared) → returns `dataSourcesEmpty=true, dataSourceErrored=false, pages=[VibeOps]`; `pages[0].title === "VibeOps"` is extracted. ✅
3. **Two inline child_databases** (VibeOps page children: paragraph + Projects + Tasks + embed) → `discoverInlineDatabasesFromPage` returns only 2. `source=page-block`, `parentPageId=pageRoot`, `parentPageTitle=VibeOps`, `object=child_database`. ✅
4. **inline data_source block compatibility** (`type=data_source, data_source.id=dsXYZ, title=[{plain_text:"Pulled DS"}]`) → 1 extracted, `object=data_source`. ✅
5. **cap 100 blocks** (150 mocked) → both `listPageChildren` / `discoverInlineDatabasesFromPage` cut exactly at 100. ✅
6. **validation_error fallback** (mock throws `validation_error` on `data_source` search; proceed with page search) → `dataSourceErrored=true`, `pages.length===1`. ✅

### Security / safety verification

- In the mock flow, `pages.create` / `pages.update` / `databases.query` are never called.
- The `--token` CLI option remains absent.
- `git status --short` → 4 files changed this round (notion-client.ts / notion-discovery.ts / notion-init.ts / docs/*).
- `discoverNotionDatabases`'s `warnings` array never contains a raw token / id (only Notion's `message` field is passed through).

### Real-token regression (user manual)

Automation cannot exercise a real token, so this round used mocks only. Recommended user-side regression:

1. `pnpm dev notion init`.
2. Paste `NOTION_TOKEN`.
3. "Search accessible Notion databases now? Yes".
4. In the data_source-empty case: confirm "VibeOps can access pages, …" guidance + page select is shown.
5. Pick the parent page (VibeOps) → "1-depth scan (cap 100 blocks)" log → 2 candidates detected → select Projects / Tasks.
6. Right after the select, confirm `softValidateSchema` calls `databases.retrieve(id)` and prints `✓` / `! some missing` warning.
7. Confirm `vibeops notion test` reports the 8/6 stages exactly as ok / fail with the same id.

### Skipped items (intentional)

- Recursive scan into `child_page → inner inline DB` is not in scope — polish-round candidate.
- Inline DB schema (`properties`) preview is not provided in the search stage; right after the user select, the same `softValidateSchema` runs via a single `databases.retrieve(id)`.

---

## See also — Notion 2025-09-03 data_source resolver (TASK-011 follow-up #3)

`notion init`'s `softValidateSchema` (right after manual id input) was swapped onto the same `resolveNotionDataSourceTarget` (TASK-011 follow-up #3). For database → data_source auto-resolution, polymorphic-name parsing (`data_sources` / `dataSources` / `child_data_sources` / `childDataSources` + nested `data_source.id`), `--debug-shape` diagnostics, and the `notionVersion: "2025-09-03"` pin, see `docs/tasks/TASK-011-notion-sync-task-pull.md` § `## Result — Notion 2025-09-03 surface lock-in + --debug-shape diagnostic`.

## See also — API-first page child_database → data_source discovery (TASK-011 follow-up #4)

`notion init`'s discovery storage policy changed again. Now the inline `child_database` block id found via page scan is not stored on its own. Instead it is read by `retrieveDatabase(block.id)`, then the real `data_source` id from `database.data_sources[]` is verified via `retrieveDataSource`. Only data_sources with `properties` become candidates, and `.vibeops.json` prefers storing the resolved data_source id as `notion.projectsTargetId` / `notion.tasksTargetId`. The existing `projectsDatabaseId` / `tasksDatabaseId` are retained as container/debug fallbacks. For the full change and verification, see `docs/tasks/TASK-011-notion-sync-task-pull.md` § `## Result — API-first page child_database → data_source discovery`.
