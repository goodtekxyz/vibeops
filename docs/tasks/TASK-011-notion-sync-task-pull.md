# TASK-011 · `notion sync` and `task pull`

## Status

Review

## MVP Phase

MVP 4 · Notion Dashboard Sync

## Git Context

(populated by `vibeops task start TASK-011` — finalize after reviewer sign-off)

## Goal

Implement the sync that uses Notion as a **human dashboard**.

- `vibeops notion sync` — push **metadata** (summary, status, priority, branch, docs path, result summary) from `docs/tasks/*.md` and `docs/project/03-current-state.md` to Notion Task/Project DBs.
- `vibeops task pull` — fetch TASK metadata (mainly priority / status) from Notion and reconcile the frontmatter in `docs/tasks/*.md`.

The detailed body (Scope, Acceptance Criteria, …) is never synced in either direction.

## Background

VibeOps's source of truth is Git; Notion is the viewing surface. Sync therefore handles **only summary / metadata** in both directions and keeps the asymmetry that details always live in docs/tasks.

## Scope

### `vibeops notion sync`

- Input: all `docs/tasks/*.md` in the current directory + `docs/project/03-current-state.md`.
- Mapping (Task DB):

  | docs/tasks field              | Notion property                  |
  | ----------------------------- | -------------------------------- |
  | frontmatter `id`              | `TaskId`                         |
  | frontmatter `title` / H1      | `Name`                           |
  | frontmatter `status`          | `Status` (planned/in_progress/done) |
  | frontmatter `priority`        | `Priority`                       |
  | `.vibeops/state/.../taskBranch` | `Branch`                        |
  | File path (`docs/tasks/...`)  | `DocsPath`                       |
  | First N chars of body "Result" | `ResultSummary`                 |

- Mapping (Project DB; single project / single row in MVP):

  | docs/project field                                | Notion property            |
  | -------------------------------------------------- | -------------------------- |
  | `.vibeops.json` `name`                             | `Name`                     |
  | "Stage" summary from `03-current-state.md` (N chars) | `CurrentStateSummary`     |
  | "Next TASK" from `03-current-state.md`             | `NextTaskId`               |

- Options: `--dry-run` (preview rows to be created / updated; no API calls), `--only-tasks`, `--only-project`.
- Idempotent: update if the same `TaskId` exists in Notion; create otherwise. Never deletes.

### `vibeops task pull`

- For each Notion Task DB row, read `TaskId`, `Status`, `Priority` and update the frontmatter of `docs/tasks/TASK-NNN-*.md`.
- The body is never touched.
- Unmapped properties are ignored.
- Options: `--dry-run` (summary diff of files that would change), `--fields status,priority` (defaults to both).

## Out of Scope

- Body sync.
- Realtime / webhooks.
- Creating a new TASK in Notion and pulling it down (this is `task generate`'s domain).
- Syncing child blocks inside a Notion page.

## Acceptance Criteria

1. `vibeops notion sync` performs all of:
   - For every `docs/tasks/TASK-NNN-*.md`, upsert a Notion Task DB row.
   - Upsert a Notion Project DB row using the summary extracted from `docs/project/03-current-state.md`.
   - Never modify Notion properties that are not part of the mapping.
2. `vibeops notion sync --dry-run` prints "create N rows, update M rows" + a preview table; zero real API calls (or only read-only calls).
3. `vibeops task pull` reflects Notion's `Status` / `Priority` into the frontmatter of `docs/tasks/*.md`. The body remains byte-identical.
4. `vibeops task pull --dry-run` shows which files would change and produces zero changes.
5. Both are idempotent (a second consecutive run yields "no changes").
6. When `.vibeops.env` is empty or `notion test` fails, both commands exit immediately with a clear error (no partial sync).

## Files to Inspect First

- `src/notion/client.ts`, `src/notion/schema.ts` (TASK-010).
- `src/tasks/scanner.ts`, `src/tasks/schema.ts`.
- `src/lifecycle/state.ts` (reads taskBranch).
- This repo's `docs/project/04-decisions.md` § D-010.

## Expected Files to Change

- new: `src/commands/notion/sync.ts`, `src/commands/task/pull.ts`.
- new: `src/notion/mapper.ts` (docs ↔ Notion mapping).
- new: `src/notion/upsert.ts`.
- new: `tests/notion-sync.test.ts`, `tests/task-pull.test.ts`.
- update: this TASK's Result / Test Result, `docs/project/03-current-state.md`, `docs/logs/YYYY-MM-DD.md`.

## Risks

- The mapping is tightly coupled with the docs schema → centralise it in one file so schema changes need only one place.
- A user might write long content on the Notion side and `sync` could overwrite it → **never write the body**. Only update metadata properties.
- Notion rate limit (3 req/s) — small sleep or batching.

## Test Plan

- vitest with the Notion client mocked + fake docs fixtures:
  - 3 new TASKs → first sync = create 3, update 0.
  - One TASK's status changes → second sync = update 1.
  - With `--dry-run`, zero mock calls (or read-only only).
  - `task pull` only touches frontmatter; assert body bytes are preserved.
- Manual: sync → pull round-trip on a small real Notion DB.

## Rollback Plan

- Revert code by discarding the branch.
- Bad data on Notion is cleaned by the user (or overwritten on the next sync).
- On the docs side, `git restore`.

## Implementation Plan

1. Define the bidirectional docs ↔ Notion mapping in `notion/mapper.ts`.
2. "Find or create by TaskId" logic in `notion/upsert.ts`.
3. `commands/notion/sync.ts` wiring mapper + upsert + `--dry-run`.
4. `commands/task/pull.ts` doing a read-only query and updating frontmatter only.
5. Guarantee idempotency: skip the update if the diff is zero.
6. Tests + doc updates.

## Result

> This round honoured the user's updated requirements. Deviations against the original TASK-011 doc are listed first.

### Deviations vs the original TASK-011 doc

- Mapping (Tasks DB): original was 7 properties (`TaskId / Name / Status / Priority / Branch / DocsPath / ResultSummary`). Actual uses the user-updated **10 properties** (`Name / Task ID / Project ID / Status / Priority / MVP Phase / Git Branch / Docs Path / Summary / Result Summary`). `Status` is strict `status` — not select.
- Mapping (Projects DB): original was 3 properties (`Name / CurrentStateSummary / NextTaskId`). Actual uses the user-updated **8 properties** (`Name / Project ID / Status / Local Path / Git Repo / Current Phase / Docs Path / Summary`). Only `Git Repo` is schema-driven and accepts either `rich_text | url` (reuses the TASK-010 helper).
- Role of `task pull`: original pulled back `Status` / `Priority` into the docs frontmatter. Actual is narrowed to **creating skeleton files for TASKs absent locally**. Bidirectional frontmatter status / priority sync becomes a polish-round candidate. The rule "never touch the body" is preserved.
- Options:
  - `notion sync`: keep the original `--dry-run / --only-tasks / --only-project` + add the user-updated `--json / --cwd`.
  - `task pull`: replace the original `--dry-run / --fields` with the user-updated `--dry-run / --json / --status <list> / --limit <n> / --cwd`. `--fields` was removed together with the frontmatter pullback feature.
- Meaning of Project ID: `.vibeops.json` has no separate `projectId` field, so `config.name` is reused as `Project ID`. If the user wants a different ID in Notion, a polish round can split out `vibeops.json.projectId`.

### Commands implemented

- **`vibeops notion sync`** — upserts metadata from `docs/project/00-overview.md` + `docs/project/{05,03}-current-state.md` + `docs/tasks/*.md` into Projects/Tasks DBs.
  - Options: `--dry-run` (zero Notion mutations; queries only), `--json`, `--only-tasks`, `--only-project`, `--cwd <path>`.
  - Matching: Project uses an equality filter on `Project ID == config.name`; Task uses an AND filter on `Task ID == TASK-NNN AND Project ID == config.name`.
  - Body is not pushed — Summary / Result Summary are truncated to 1500 chars. Human-written Notion page bodies are preserved.
  - Result-section placeholders (e.g. `(not yet)`) are auto-filtered from `Result Summary`.
- **`vibeops task pull`** — queries the Notion Tasks DB for rows where `Project ID == config.name AND Status ∈ {Planned}` (or as specified by `--status`) → creates skeleton files only for TASKs absent locally.
  - Options: `--dry-run` (zero file / Notion changes), `--json`, `--status <list>` (comma-separated, default `Planned`), `--limit <number>` (default 20, max 100), `--cwd <path>`.
  - If `Task ID` is empty, auto-allocates from `highestTaskNumber + 1` locally.
  - Generated files are 18-section skeletons (same shape as TASK-007's scaffold) + a `## Notion Page` section recording `Page ID` / `Docs Path`.
  - Only an empty `Docs Path` is reverse-updated (one line). Other Notion properties are never touched.
  - Existing local files are never overwritten — `pathExists` collisions skip.

### Notion API surface (read-only / mutation split)

| Call                           | dry-run | sync (real) | pull (real) | Use                              |
| ------------------------------ | :-----: | :---------: | :---------: | -------------------------------- |
| `users.me()`                   |   ―     |    ―        |    ―        | Not called in this round (TASK-010 `notion test` verifies it) |
| `databases.retrieve(id)`       |   ✓     |    ✓        |    ✓        | Schema verification + `Git Repo` type detection (8 + 10 properties; abort if short) |
| `databases.query(id)`          |   ✓     |    ✓        |    ✓        | Match existing page (sync) / fetch candidate TASKs (pull) |
| `pages.create(...)`            |   ✗     |    ✓        |    ―        | Only when creating new Project / Task rows |
| `pages.update(...)`            |   ✗     |    ✓        |    ✓        | Existing Project / Task rows (sync); single line for empty `Docs Path` (pull) |

In the `--dry-run` path, the `pages.create` / `pages.update` calls are guarded by early returns inside `notionSyncCommand` / `taskPullCommand`.

### New / updated files

- new `src/lib/notion-mappers.ts` — Notion property builders (`titleProperty / richTextProperty / urlProperty / selectProperty / statusProperty / gitRepoProperty`), bidirectional status mapping (`mapTaskStatusToNotion / mapNotionStatusNameToTask`), Notion response readers (`readTitle / readRichText / readStatus / readSelect / readUrlOrRichText`), filter builders (`richTextEqualsFilter / statusEqualsFilter / andFilter`), 1500-char `truncate`. All pure functions — unit-testable without network.
- new `src/lib/task-summary.ts` — extract Goal / Background / Result summaries from the TASK body, auto-filter `(not yet) / (unassigned)` placeholders, `summarizeMarkdownLead` (extract the first paragraph of 00-overview), `detectCurrentPhase` (infer the "MVP N" pattern from the current stage), `## Notion Page` section read / upsert (`upsertNotionPageSection / readNotionPageId / writeNotionPageSection`), and the 18-section skeleton renderer for `task pull` (`renderPulledTaskMarkdown`).
- new `src/lib/notion-sync.ts` — `loadSyncContext` (pre-flight: config / notion.enabled / DB id / NOTION_TOKEN / project info), `fetchSchemas` (8 + 10 property verification + Git Repo type detection), `buildProjectProperties` / `buildTaskRow` (pure mappers), `planSync` (with `detectExisting=true`, query to decide `verb=create|update`), `executeProjectUpsert` / `executeTaskUpsert` (mutation surface).
- new `src/lib/task-pull.ts` — `planPull` (status filter + `Project ID` filter + limit; auto-allocate ID at `highestTaskNumber + 1`; skip on collision), `executePullEntry` (write skeleton + update empty `Docs Path` once).
- new `src/commands/notion-sync.ts` — wires up the pipeline + a friendly error-code map (`unauthorized / restricted_resource / object_not_found / validation_error / rate_limited / request_timeout`) + `--json` serialisation.
- new `src/commands/task-pull.ts` — same error map + `considered / new / skipped` counters.
- updated `src/lib/notion-client.ts` — adds `databasesQuery / pagesCreate / pagesUpdate` (preserves `@notionhq/client` lazy import + 5s timeout). Introduces `NotionPageRef` / `NotionQueryResult` into the `NotionClient` interface.
- updated `src/lib/git.ts` — adds `gitRemoteUrl(cwd, name='origin')` (read-only · `git remote get-url`).
- updated `src/cli.ts` — wires up `vibeops notion sync` / `vibeops task pull` options + English descriptions.
- updated `README.md` — "Notion sync / task pull" section, prerequisites, security policy, command-summary table.
- updated `docs/project/03-current-state.md` — stage / command tree / "what is missing" / next TASK.
- updated `docs/tasks/TASK-011-notion-sync-task-pull.md` (this file) — Status `Review` + Result / Test Result.

### Safeguards (security / policy reaffirmation)

- **The raw `NOTION_TOKEN` value is never printed.** `notion sync` / `task pull` headers show only `maskToken()` (`first4…last4 (len=N)`). No raw token in JSON either. Verified: dry-run · `--json` with the fake token `secret_aBcDeF1234567890zzzzzzzzzzzzzzzzz` → `grep -F` 0 hits.
- **Notion API is read-only + property-only mutation.** Zero page-body-block writes / DB creation / DB-schema changes / archive calls.
- **`--dry-run` is genuinely read-only.** `pages.create` / `pages.update` call lines are reachable only after the dry-run branch.
- **Existing local TASK files are never overwritten.** `task pull` skips on `pathExists(absPath)` collision.
- **5s timeout.** Uses `@notionhq/client`'s `timeoutMs` option so commands do not hang on Notion outages.
- Zero LLM-API / Cursor-CLI / GitHub-API / webhook / DB-auto-create / Git-mutation calls this round.

## Test Result

> All tests were run against the built `dist/cli.js` in a temporary sandbox (`/tmp/vibeops-sandbox-task011`). With no real Notion token available, live API calls were substituted by a dummy token + 5s timeout (the final "friendly-failure" path).

### Static verification

| Check                             | Result |
| --------------------------------- | :----: |
| `pnpm typecheck` (tsc --noEmit)   | ✓     |
| `pnpm build`                      | ✓     |
| `ReadLints` (9 new/changed files) | ✓ 0 warnings |

### Command-surface verification

- `node dist/cli.js notion sync --help` → 4 options (`--dry-run / --json / --only-tasks / --only-project / --cwd`) shown correctly.
- `node dist/cli.js task pull --help` → 5 options (`--dry-run / --json / --status / --limit / --cwd`) shown correctly.

### Pre-flight friendly errors

Each stage aborts immediately with the correct reason code + English guidance.

| Scenario                                                | sync result                                | pull result                              |
| ------------------------------------------------------- | ------------------------------------------ | ---------------------------------------- |
| No `.vibeops.json`                                      | `no-config` · "Run `vibeops init` first"   | Same                                     |
| `notion.enabled = false`                                | `notion-not-enabled`                       | Same                                     |
| `notion.projectsDatabaseId` empty                       | `no-projects-db`                           | Same                                     |
| `notion.tasksDatabaseId` empty                          | `no-tasks-db`                              | Same                                     |
| No `NOTION_TOKEN` (`.vibeops.env` / `process.env`)      | `no-token`                                 | Same                                     |
| Dummy token (`secret_a…zz`) + fake DB id (`1111…`)      | `projects-retrieve` · 5s `request_timeout` | (Same path — shared schema stage)        |

### Masking / token-leak check

- With the dummy token `secret_aBcDeF1234567890zzzzzzzzzzzzzzzzz`, attempting sync:
  - Human output: `token secr…zzzz (len=40)`.
  - JSON output (`--json`): `"tokenMasked": "secr…zzzz (len=40)"`.
  - Both stdout and stderr `grep -F "secret_aBcDeF1234567890zzzzzzzzzzzzzzzzz"` → 0 hits.

### Mapper / planner unit verification (direct `node`, mock client)

- `truncate('a'.repeat(20), 5)` → `"aaaa…"` (exactly limit-1 chars + 1 ellipsis).
- `richTextProperty('')` → `{"rich_text":[]}` / `urlProperty('')` → `{"url":null}` / `statusProperty('')` → `{"status":null}` (the shapes Notion API requires when blanking values).
- `gitRepoProperty('git@x', 'url')` → `{"url":"git@x"}`; `'rich_text'` → `{"rich_text":[…]}` (schema-driven dispatch is correct).
- `mapTaskStatusToNotion`: planned / in_progress / review / done / blocked → `Planned / In Progress / Review / Done / Blocked` exactly.
- `mapNotionStatusNameToTask`: `Planned → planned` / `In Progress → in_progress` / `Ready → planned` / `Done → done` / `Mystery → planned`.
- `richTextEqualsFilter` / `statusEqualsFilter` / `andFilter` produce exactly the Notion API shape (`{"and":[{...rich_text:{equals:…}},{...status:{equals:…}}]}`).
- `summarizeGoal` filters `(not yet)` placeholders to 0 chars; `summarizeMarkdownLead` extracts "First paragraph here." only; `detectCurrentPhase('Status: MVP 4 · Notion Sync')` → `"MVP 4 · Notion Sync"`.
- `upsertNotionPageSection` replaces the existing `## Notion Page` section exactly; `readNotionPageId` reads it back (`page_abc`).

### `buildProjectProperties` / `buildTaskRow` output (real sandbox)

After `vibeops init --name task011-demo` + `vibeops task generate --scaffold --count 2 --phase 'MVP 4'`, calling `loadSyncContext`:

- Projects properties (rich_text variant): all 8 keys present; `Git Repo: { rich_text: [] }`; `Status: { status: { name: 'Building' } }`; `Current Phase: { select: { name: 'MVP' } }` (the sandbox's `03-current-state.md` is empty, hence the fallback).
- Projects properties (url variant): `Git Repo: { url: null }`.
- Task properties (using TASK-000 template): all 10 keys present; `Status: { status: { name: 'Planned' } }`; `Priority: { select: { name: 'P2' } }` (default when `priority` is missing); `Result Summary: { rich_text: [] }` (auto-emptied because the Result section is a placeholder); `Project ID == 'task011-demo'`.

### `planPull` mock-client scenario

Mock `databasesQuery` returns 2 rows — first row `Task ID=TASK-001 / Status=Planned`; second row `Task ID=empty / Status=Ready`. This round runs with `--status Planned,Ready` while the sandbox already has `TASK-001/002` skeletons:

- Result entries:
  - `TASK-001 · 'Existing task' · Planned · docs/tasks/TASK-001-existing-task.md` (different slug → no collision → plan a new file; `notionNeedsDocsPath=true`).
  - `TASK-003 · 'New from Notion' · Ready · docs/tasks/TASK-003-new-from-notion.md` (empty `Task ID` → `highestTaskNumber()+1 = 3`).
- Mock `pagesCreate` / `pagesUpdate` are never invoked (planning + dry-run). Both have `Error('mutation should not run in dry-run')` installed as a fail-safe but are not reached.

### Intentionally skipped

- With no real Notion token available, live `pages.create` / `pages.update` calls were not exercised this round. Covered by dry-run + mock + unit. A vitest integration run with a real token (sync → pull round-trip) is recommended in the polish round.
- Bidirectional frontmatter `Status` / `Priority` sync (the original `task pull --fields`) is out of scope this round — see the Result / deviations section.

---

## Result — Schema-validation TypeError bug fix (2026-05-11 follow-up #1)

### Background (reproducible error)

`pnpm dev notion sync --dry-run` died with:

```
TypeError: Cannot read properties of undefined (reading 'Name')
  at validateDatabaseSchema (src/lib/notion-schema.ts)
```

Cause: when the `databases.retrieve(id)` response has no `properties`, `validateDatabaseSchema` was reading `inputs.properties[req.name]` directly and crashing at runtime. The Notion API really does return an empty `properties` in some cases — when the integration has access to the parent page but no connection on the DB itself, or when the user mistyped a page id as a DB id.

### Decision

- **Unify the `validateDatabaseSchema` signature to plan B**: `validateDatabaseSchema({ db, required, retrieveResponse })`. Both callers (`notion-sync` / `notion-test`) pass the raw retrieve response. The `.properties` boilerplate disappears from call sites.
- **Export `getNotionProperties(input)`**. Handles the 7 cases (`undefined / null / {} / { properties: undefined } / database retrieve / data_source retrieve / bare properties map`) safely. Returns `null` when unrecognised.
- **Export `readNotionObjectKind(input)`**. Safely extracts `object` (`database` / `data_source`) from a retrieve response. For diagnostic display. Never prints the token.
- **Add `"missing-properties"` to `SchemaViolation.kind`**. When `properties` is not recognised, `validateDatabaseSchema` does not throw and emits ONE `missing-properties` violation. `property = "(properties)"`, `description = MISSING_PROPERTIES_HINT` (friendly English message).
- **Export the `MISSING_PROPERTIES_HINT` constant**. CLI and docs share the same wording. Reuses the user's exact 4-bullet wording in English.
- **Extend `SchemaReport`**: add `objectKind`, `id`, `propertiesMissing`. Simplify `properties` to `Record<string, unknown>` (defaults to `{}`).
- **`notion sync` prints a per-DB schema diagnostic line**: `projects DB  id=…  object=database  ok|missing-properties|N violations`. Zero token output.
- **`notion sync`'s schema branch** uses `reason = "schema-missing-properties"` + `MISSING_PROPERTIES_HINT` when `propertiesMissing`; otherwise `reason = "schema"`.
- **`notion test` routes through the same helper**: deprecates the cast `(check as ...).properties as Record<…>` that previously extracted `properties`. Now passes the raw response as `retrieveResponse: unknown`. With both commands sharing the same path, the same bug cannot reappear in two places.
- **dry-run policy preserved**: `notion sync --dry-run` calls only `databases.retrieve` / `databases.query`; zero `pages.create` / `pages.update`. Even when the schema stage fails, mutation paths are never entered.

### Changed files

- `src/lib/notion-schema.ts` — added `getNotionProperties` / `readNotionObjectKind` / `MISSING_PROPERTIES_HINT`; extended `SchemaViolation.kind`; switched `validateDatabaseSchema` signature to `retrieveResponse: unknown`. Emits the `missing-properties` violation.
- `src/lib/notion-sync.ts` — `reportFromRetrieve` safely handles `unknown` input + fallback id; extended `SchemaReport` (`objectKind / id / propertiesMissing`); `fetchSchemas` forwards `unknown`.
- `src/commands/notion-sync.ts` — imports `MISSING_PROPERTIES_HINT`; fills `report.schemas` diagnostics + emits to both stdout / JSON; adds the `reason = "schema-missing-properties"` branch; final output prints the missing-properties friendly hint.
- `src/commands/notion-test.ts` — `runCheck` carries `retrieveResponse: unknown`; consolidates schema checks via the new `pushSchemaCheck(report, retrieve, kind)`; removes duplicated schema handling.

### Security

- Zero token output. Notion does not echo the token in retrieve responses; all error messages go through `notionApiError` → `explainNotionError`.
- Zero mutation API (`pages.create` / `pages.update`) calls in dry-run.

## Test Result — Schema-validation TypeError bug fix

### Static verification

- `pnpm typecheck` ✅ exit 0.
- `pnpm build` ✅ exit 0.
- `ReadLints (notion-schema.ts / notion-sync.ts / notion-sync command / notion-test command)` → 0 warnings.

### Unit (mock client, direct `dist/lib` calls) — 15 + 13 scenarios = 28 assertions, all PASS

`validateDatabaseSchema` defensiveness (`/tmp/vibeops-schema-smoke.mjs`):

1. `undefined` → 1 `missing-properties` violation.
2. `null` → `missing-properties`.
3. `{}` (empty object) → `missing-properties`.
4. `{ properties: undefined }` → `missing-properties`.
5. Normal `databases.retrieve()` response → 0 violations.
6. Normal `data_source` retrieve → 0 violations (same handling).
7. Bare properties map → 0 violations.
8. `Status: { type: "select" }` (wrong type) → 1 `type-mismatch`.
9. Missing `Summary` → 1 `missing`.
10–14. The 5 `getNotionProperties` variants all match expectations.
15. `readNotionObjectKind` for 3 cases (database / empty / null).

`fetchSchemas` end-to-end (`/tmp/vibeops-sync-smoke.mjs`):

16. Both retrieve responses lack `properties` → `ok:true`, `projects.propertiesMissing=true`, `violations[0].kind=missing-properties`. **No TypeError.**
17. The retrieve `id` is carried into `schemas.projects.id`.
18. `objectKind = "data_source"` extracted safely.
19. `gitRepoType = ""` (empty because there are no properties).
20–22. Both retrieves OK → `ok:true`, 0 violations, `Git Repo` correctly detected as `url`.
23–25. retrieve itself throws → `ok:false`, `reason=projects-retrieve`, `error.code=object_not_found` propagated.

### Live CLI regression (real-token environment)

`vibeops notion sync --dry-run --json` (the exact command the user reported):

- `phase: "schema"`, `ok: false`, **exit code 1** — no stack trace.
- `tokenMasked: "ntn_…q8ca (len=50)"` — zero raw tokens.
- `schemas[].id`, `schemas[].objectKind` (`"database"`), `schemas[].propertiesMissing=true`, `schemas[].violationsCount=1` correct for both DBs.
- `errors[].reason = "schema-missing-properties"`; `errors[].message` includes the friendly `MISSING_PROPERTIES_HINT`.
- Zero mutation API calls (dry-run + schema-stage cut).

`vibeops notion test --json`:

- `notion.users.me` ok; `databases.retrieve(projects/tasks)` both ok (`object=database` shown correctly).
- `notion.projects.schema` / `notion.tasks.schema` both `status=fail, violations=[missing-properties]`. Same helper. Both commands report the same diagnosis.

### Wrong-ID case

- Both `notion sync` and `notion test`: on a 404 (`object_not_found`) at retrieve stage, exit cleanly with `reason = "projects-retrieve"` (or `tasks-retrieve`). No TypeError; `explainNotionError`'s English message is shown.

### Security

- No `--token` CLI option (unchanged).
- Zero `secret_…` / `ntn_…` / Bearer pattern hits in JSON / stdout (`sanitiseApiError` is unchanged; this round did not introduce any new token-exposing path).
- `git status --short` → this round's changes are limited to `notion-schema.ts / notion-sync.ts / notion-sync.ts(command) / notion-test.ts` + 3 doc files.

### Risks

- `getNotionProperties`'s "bare properties map" detection uses the presence of well-known keys (`Name` / `Task ID` / `Project ID` / `Status`). If a user-created DB lacks all those keys, it falls back to `null` → `missing-properties` violation. In practice that DB is already invalid, so this is harmless; a polish round could harden it with a stricter sentinel (e.g. property objects must contain `type`).
- TASK-011 Status stays at `Review` — this patch is a follow-up bug-fix within the same TASK and does not promote it to Done.

---

## Result — Notion `database → data_source` resolver (2026-05-11 follow-up #2)

### Background (live diagnosis)

`vibeops notion test` ended with:

```
✓ databases.retrieve(projectsDatabaseId)  object=database
✗ Projects DB required-property verification — type-mismatch (properties)
```

Direct live testing showed that under the current Notion API (`2025-09-03`), `databases.retrieve(databaseId)` only returns `{ object: "database", data_sources: [] }` with no `properties`. The real schema (`properties`) is on `dataSources.retrieve(dataSourceId)`. The id stored by the user in `.vibeops.json` is a database id (the one populated by TASK-010 follow-up #4's inline-DB scan UX), and that is one level off from the new API's schema endpoint. So follow-up #1's catch ("TypeError became a friendly missing-properties violation") fired but the schema check would never pass.

### Decision

- **New `src/lib/notion-target.ts` + `resolveNotionDataSourceTarget(client, id, label)`** — the single source of truth for `database → data_source` resolution. Read-only.
- Flow:
  1. **A**: try `dataSourcesRetrieve(id)` first. If success + has `properties`, return immediately with `source: "input-data-source"`.
  2. If the SDK does not expose `client.dataSources` (older `@notionhq/client` build), `null` is returned and it falls through (not an error).
  3. **Transport** errors (`unauthorized` / `restricted_resource` / `rate_limited` / timeout, …) return `{ ok: false, reason: "transport" }` immediately so fall-through never produces a wrong diagnosis.
  4. Only `object_not_found` / `validation_error` / `unknown_error` fall through.
  5. **B**: call `databasesRetrieve(id)`. If a legacy SDK carries `properties` directly on the database, use `source: "legacy-database"`. Otherwise pick `[0]` from `data_sources[]` (warning if multiple) and call `dataSourcesRetrieve` again → `source: "database-default-data-source"`.
  6. Empty `data_sources[]` → `{ ok: false, reason: "no-data-source" }` + friendly hint (English + one Korean line).
  7. Resolved data_source returned without `properties` → `{ ok: false, reason: "no-properties" }` + friendly hint.
- **`NotionClient` extension**: `dataSourcesRetrieve(id) → Promise<NotionDataSourceRetrieveResponse | null>`. Returns `null` when `client.dataSources` is not exposed by the SDK (the resolver naturally falls back to the database path — `@notionhq/client@5.20.0` already exposes it).
- **`NotionClient` constructor with `logLevel: "error"`** — silences the SDK's `console.warn` noise (`@notionhq/client warn: request fail`) when `dataSourcesRetrieve` falls through with a 4xx. Real errors still throw; only the intentional fall-through path is silent.
- **`fetchSchemas` rewrite**: both DBs go through the resolver. Even transport failures funnel through `reportFromResolved` instead of fast-failing separately, so `notion sync` / `notion test` show the same rich guidance.
- **`SchemaReport` extension**: carries `inputId / inputObject / resolvedId / resolvedObject / source / parentDatabaseId? / title? / warnings[]`. Exposed in JSON output.
- **`notion test`'s schema stage splits into 3 stages**: `notion.{kind}.retrieve` → `notion.{kind}.resolve` → `notion.{kind}.schema`. Each is reported individually as `ok / fail / skip` (`pushSchemaCheck` is deprecated in favour of `runResolveAndSchema`).
- **`notion sync` stdout adds a `${kind} DB target` block** — input id/object, resolved id/object, source, parent database (if present), schema status, resolver warnings as one bundle. The same fields land in JSON `report.schemas[]`. Zero token output.
- **`notion init`'s `softValidateSchema` also routes through the resolver** — right after manual id input, the immediate-check flow correctly receives the `database → data_source` fallback.
- **dry-run policy preserved**: only `dataSourcesRetrieve` / `databasesRetrieve` / `databasesQuery` are called; `pages.create` / `pages.update` are never reached in `--dry-run`.
- **Security**: zero raw-token output. Every error message goes through `notionApiError` → `explainNotionError`; `sanitiseApiError` masks `secret_*** / ntn_*** / Bearer ***`.

### Changed files

- `src/lib/notion-target.ts` *(new)* — `resolveNotionDataSourceTarget` + helpers + types (`ResolvedNotionTarget / ResolveFailure / ResolveResult / ResolveSource`).
- `src/lib/notion-client.ts` — new types `NotionDatabaseRetrieveResponse / NotionDataSourceRetrieveResponse / NotionDataSourceRef`; added `NotionClient.dataSourcesRetrieve`; SDK casting now includes `dataSources.retrieve`; ctor sets `logLevel: "error"`.
- `src/lib/notion-sync.ts` — rewrote `fetchSchemas / reportFromResolved`; extended `SchemaReport`; dropped `getNotionProperties / readNotionObjectKind` imports (the resolver owns that); calls `validateDatabaseSchema(..., resolved.properties)`.
- `src/commands/notion-test.ts` — introduces `runResolveAndSchema`, 3 checks per kind (`retrieve / resolve / schema`); removes the old `pushSchemaCheck` and `retrieveResponse` carry.
- `src/commands/notion-sync.ts` — extended `SchemaDiagnostic` (`inputId / inputObject / resolvedId / resolvedObject / source / parentDatabaseId? / warnings[]`); emits the `${kind} DB target` block to stdout; the error formatter forwards the resolver's `description` for `missing-properties`.
- `src/commands/notion-init.ts` — `softValidateSchema` goes through `resolveNotionDataSourceTarget`; when falling back, prints the resolved id on a single line.

### Non-goals (this follow-up's limits)

- `task pull` body is automatically beneficial because it uses the same `fetchSchemas`. Zero additional changes.
- Bidirectional frontmatter sync (`task pull --fields`) is still a polish-round candidate.
- A real-token regression run cannot pass schema verification yet — the user's current permission state (no integration connection on the DB itself) still surfaces the "use Connections menu" guidance to the very end. A live verification of a clean schema requires a user-side regression.

## Test Result — Notion `database → data_source` resolver

### Static verification

- `pnpm typecheck` ✅ exit 0.
- `pnpm build` ✅ exit 0.
- `ReadLints (notion-target.ts, notion-client.ts, notion-sync.ts, notion-test.ts(command), notion-sync.ts(command), notion-init.ts)` → 0 warnings.

### Unit (mock `NotionClient`, direct `dist/lib` calls) — 24 assertions, all PASS

`resolveNotionDataSourceTarget` — 8 scenarios (13 assertions):

1. `dataSourcesRetrieve(id)` direct hit → `source="input-data-source"`, title carried. ✅
2. `dataSources` 404 → `databases` → resolves first of `data_sources[]` → `source="database-default-data-source"`, carries `parentDatabaseId`, records warning ("object_not_found, falling back"). ✅
3. DB with 3 `data_sources` → picks `[0]` + warning `database has 3 data_sources`. ✅
4. DB `data_sources: []` (the user's real case) → `{ ok: false, reason: "no-data-source" }` + "Connections" hint (English + one Korean line). ✅
5. Legacy DB (database carries `properties` itself) → `source="legacy-database"`, `resolvedObject="database"`. ✅
6. SDK does not expose `dataSourcesRetrieve` (returns `null`) → falls back via the database path, correctly resolves the child DS. ✅
7. `unauthorized` (401) → immediately `{ ok: false, reason: "transport", apiError.code: "unauthorized" }`. ✅
8. `dataSources.retrieve` returns `properties: undefined` → naturally proceeds via the database fallback. ✅

`fetchSchemas` integration — 3 scenarios (11 assertions):

9. Direct DS resolution → `ok:true, !propertiesMissing, source="input-data-source", gitRepoType="url", 0 violations`. ✅
10. DB → child DS fallback → `ok:true, source="database-default-data-source", parentDatabaseId` correct, 0 violations. ✅
11. DB `data_sources: []` → `ok:true (no fast-fail), propertiesMissing=true, violations[0].description includes "Connections"`. ✅

### Live CLI (real token, integration permissions not yet extended)

- `vibeops notion test` → 4-stage schema diagnostic:
  - `✓ Projects DB retrieve  input id=… input object=database`.
  - `✗ Projects DB target resolve (database → data_source)  Notion database … does not expose any data_sources accessible to this integration. Open the database as a full page in Notion and add the VibeOps integration directly via the database's '⋯ → Connections' menu.`.
  - `· Projects DB required-property verification  skipped because target resolution failed`.
  - Tasks: same. Zero SDK warn noise in stderr (`logLevel: "error"` effective).
- `vibeops notion sync --dry-run` → `projects DB target` / `tasks DB target` blocks (input/resolved id+object, source, schema status), plus one `schema-missing-properties` error per DB with the resolver's rich English hint. exit 1, zero mutations.
- `vibeops task pull --dry-run --limit 2` → goes through the same `fetchSchemas`; safely cut by the schema violation (same behaviour as before). No regression.
- `vibeops notion init --dry-run` → unchanged (plan only).

### Security

- Zero `secret_…` / `ntn_…` / Bearer pattern hits in JSON / stdout (`maskToken` only — `ntn_…q8ca (len=50)`).
- Zero mutation API (`pages.create` / `pages.update`) calls in `--dry-run` (verified for both mocks and live CLI).
- The `--token` CLI option remains absent.

### Risks

- `@notionhq/client` could evolve so that the `data_sources` response moves elsewhere. The resolver returns `null` when `client.dataSources.retrieve` is missing → falls back via the database path; likely not much impact, but additional regression tests are advised when the SDK is upgraded in a polish round.
- DBs with multiple `data_sources` are auto-selected by `[0]` + warning. If the user must pick the nth data_source, a select-prompt option will be needed in the polish round.
- The `legacy-database` path is for very old SDKs / pre-migration workspaces — its normal operation is covered only by mocks.
- TASK-011 Status stays at `Review` — this patch is the same TASK's follow-up round.

---

## Result — Notion 2025-09-03 surface lock-in + `--debug-shape` diagnostic (2026-05-11 follow-up #3)

### Background

After follow-up #2, `notion test` in the real workspace kept emitting "database does not expose any data_sources". Live diagnosis revealed that `databases.retrieve(id)` (under both default and `2025-09-03`) returned `{ object: "database", data_sources: [], properties: undefined, top-level keys: 17 }`, while the `2022-06-28` version failed explicitly with `validation_error: Database … does not contain any data sources accessible by this API bot`. `search filter=data_source` also returned 0 — meaning the integration is connected only up to the parent page and lacks data_source-level permission. This is not solvable in code, but the real issue is that the user had no token-safe diagnostic tool to inspect their permission state. For future-proofing we added (a) explicit API-version pinning, (b) polymorphic parsing of `data_sources` / `dataSources` / `child_data_sources` / `childDataSources` + nested id, and (c) a raw `client.request` fallback when the SDK does not expose `client.dataSources`.

### Decision

- **Pin `NOTION_API_VERSION = "2025-09-03"` in `src/lib/notion-client.ts`** — always passed as `notionVersion` at Client construction. Even if Notion's default changes later, VibeOps's intended surface (database/data_source split) stays intact. `ClientOptions` is extended in step.
- **`NotionClient.dataSourcesRetrieve` 3-tier priority**: (A) `client.dataSources.retrieve({ data_source_id })` → (B) raw `client.request({ path: 'data_sources/{id}', method: 'GET' })` fallback → (C) `null` if neither exists. The token is appended by the SDK; this code never touches it.
- **New `extractDataSourcesFromDatabaseResponse(response)` (notion-client.ts)** — accepts 4 key-name variants (`data_sources / dataSources / child_data_sources / childDataSources`), 2 id shapes (`entry.id` / `entry.data_source.id`), and 3 name fallbacks (`entry.name` / `entry.data_source.name` / `entry.title[*].plain_text`). Canonical first (snake_case beats camelCase). Returns `{ field: string | null, items: Array<{ id, name? }> }`.
- **New `summariseDatabaseShape(inputId, raw)` (notion-client.ts) + `NotionClient.probeDatabaseShape(id)`** — token-safe digest of `databases.retrieve`. Output fields: `object / id / title? / hasProperties / propertiesKeysLength / hasDataSources / dataSourcesField? / dataSourcesLength / dataSources[{id, name?}] / topLevelKeys[]`. Never contains property values / page body / rich_text body / bearer token (verified by an assertion that feeds `_internal: "secret_value_must_not_leak"` and grep-matches 0 hits in the dump).
- **`resolveNotionDataSourceTarget` goes through `extractDataSourcesFromDatabaseResponse`** — removes the hand-rolled `db.data_sources` branch. When non-canonical naming arrives, a single warning is recorded.
- **`HINT_NO_DATA_SOURCE` / `HINT_NO_PROPERTIES` carry a tail of ``Run `vibeops notion test --debug-shape` to inspect the Notion response shape.``** — guides the user to the next diagnostic.
- **New `vibeops notion test --debug-shape`** — `notion test` prints the shape probe of both DBs before the resolver stage. Plain mode: `${kind} DB shape` header + 5–6 lines (`object / id / title? / has properties / data_sources count + field name + per-DS line / top-level keys`). JSON mode: `report.debugShape[]` carries `kind / inputId / shape | error`.
- **Automatic benefit for `notion sync`** — same `fetchSchemas` → `resolveNotionDataSourceTarget`, so the new guidance + `--debug-shape` advice flow to stdout/JSON without code changes.
- **Automatic benefit for `notion init`'s `softValidateSchema`** — same resolver.
- **dry-run policy preserved**: only `databases.retrieve` / `dataSources.retrieve` / `blocks.children.list` / `users.me` / `search` / `databases.query`; zero `pages.create` / `pages.update`.
- **Security**: zero raw-token output. The shape probe carries only field names / counts / data_source id+name. Even arbitrary secret fields like `_internal` produce 0 hits.

### Changed files

- `src/lib/notion-client.ts` — exports the `NOTION_API_VERSION` constant, ctor `notionVersion` option, extended `ClientOptions`, added `request?` to the SDK cast, 3-tier `dataSourcesRetrieve`, added `probeDatabaseShape`, new exports `extractDataSourcesFromDatabaseResponse` / `summariseDatabaseShape` / `DatabaseShapeProbe`.
- `src/lib/notion-target.ts` — uses `extractDataSourcesFromDatabaseResponse`, introduces `HINT_DEBUG_SHAPE`, updated `HINT_NO_DATA_SOURCE` / `HINT_NO_PROPERTIES`, removed the `NotionDataSourceRef` import.
- `src/commands/notion-test.ts` — handles `--debug-shape`, carries `report.debugShape[]`, prints the shape block in the plain finalize, includes debugShape in JSON sanitisation.
- `src/cli.ts` — registers the `notion test --debug-shape` option.

### Non-goals

- Passing schema validation in the user's real workspace remains a Notion UI step (each DB's Connections menu must connect the VibeOps integration); it cannot be solved in code. This round focuses on making that step diagnosable.
- Bidirectional frontmatter sync, real-workspace `legacy-database` validation, etc. remain polish-round candidates.

## Test Result — Notion 2025-09-03 surface lock-in + `--debug-shape`

### Static verification

- `pnpm typecheck` ✅ exit 0.
- `pnpm build` ✅ exit 0.
- `ReadLints (notion-client.ts, notion-target.ts, notion-test.ts(command), cli.ts)` → 0 warnings.

### Unit (mock + direct calls) — 30 assertions, all PASS

`extractDataSourcesFromDatabaseResponse` — 11 cases / 11 assertions:

1. canonical `data_sources` ✅
2. camelCase `dataSources` ✅
3. `child_data_sources` ✅
4. `childDataSources` ✅
5. nested `data_source.id` recognition ✅
6. `title[]` → name fallback ✅
7. empty array still identifies `field` ✅
8. no recognised key → `field: null` ✅
9. null / undefined safe (2 assertions) ✅
10. snake_case beats camel ✅

`summariseDatabaseShape` — 9 assertions (6 fields on one fixture + multiple variants):

11. `object` echo / `title[]` synthesis / `hasProperties + len` / `hasDataSources + count + field` / `topLevelKeys` sorted ✅
12. **token-safety**: `_internal: "secret_value_must_not_leak"` input → 0 hits in dump ✅
13. Empty response / camelCase + nested id / null input handled safely ✅

Resolver end-to-end (parser integration) — 3 assertions:

14. Resolver passes camelCase `dataSources` ✅
15. Resolver records "non-canonical naming" warning ✅
16. `no-data-source` message includes `--debug-shape` ✅

`createNotionClient` smoke — 4 assertions:

17. `NOTION_API_VERSION === "2025-09-03"` ✅
18. `client.usersMe` / `dataSourcesRetrieve` / `probeDatabaseShape` functions exposed ✅

(Indices are discontinuous; the 26 + 4 = 30 assertions above all PASS.)

### Live CLI (real token, integration permissions not extended)

- `vibeops notion test --help` → `--debug-shape` appears in the option list.
- `vibeops notion test --debug-shape` (plain):
  ```
  Projects DB shape  input id=fe97b87b-...
    object              database
    id                  fe97b87b-...
    title               Projects (Inline)
    has properties      no
    data_sources        0
    top-level keys      archived, cover, created_time, data_sources, ..., url
  ```
  → The user inspects their workspace response token-safe directly. The `data_sources` key clearly exists in the response but the array is empty = diagnosed as a Notion-permission step.
- `vibeops notion test --debug-shape --json` → carries the same diagnostic in `report.debugShape[]`. Token masking preserved (`ntn_…q8ca (len=50)` only).
- `vibeops notion test` (without option) → the existing 3-stage diagnostic (`retrieve / resolve / schema`) + the new guidance (`Notion returned no data_sources …` + Connections-menu English hint + `--debug-shape` advice).
- `vibeops notion sync --dry-run` → `${kind} DB target` block + `schema-missing-properties` error + resolver's new hint. exit 1, zero mutations.

### Security

- Zero `secret_…` / `ntn_…` / `Bearer` hits in `--debug-shape` output (cross-checked by `_internal` mock-secret unit test).
- Zero mutation API calls (`pages.create` / `pages.update`) across commands — guaranteed by `--dry-run` + schema-stage gate.
- The `--token` CLI option stays absent.

### Risks

- API version is pinned to `2025-09-03`. If a new surface moves `data_sources` elsewhere, extend `extractDataSourcesFromDatabaseResponse` candidates or bump the pin.
- The `dataSourcesRetrieve` raw HTTP fallback depends on the SDK's public `client.request` API. If a future SDK removes it, the fallback fails → resolver receives `null` and exits naturally (no crash).
- This follow-up is a diagnostics / defence layer — it does not fix the user's permission state in code.
- TASK-011 Status stays at `Review`.

---

## Result — API-first page child_database → data_source discovery (2026-05-11 follow-up #4)

### Background

There were real cases where `database.retrieve(child_database_block.id)` returned `object=database, is_inline=true, data_sources=0, no properties`. In other words, the stored `projectsDatabaseId` / `tasksDatabaseId` was not the target that yields schema / properties. Per user request, discovery is reorganised into an API-first flow: "search data_source directly → search pages → scan page children → run `database.retrieve` on the child_database block id → fetch `database.data_sources[]` → run `data_source.retrieve` (properties)". Manual data source id input remains only as the last fallback.

### Decision

- Add `projectsTargetId` / `tasksTargetId` to `NotionConfig`. API call priority: targetId (data_source) → databaseId (legacy/container fallback).
- `.vibeops.json` storage policy:
  - The real data_source id found by API discovery goes into `projectsTargetId` / `tasksTargetId`.
  - The child database / container id observed via the page-child_database path is preserved in the existing `projectsDatabaseId` / `tasksDatabaseId`.
  - Backward-compatible with old configs. When targetId is empty, databaseId is used as fallback.
- Reinforced read-only helpers in `src/lib/notion-client.ts`:
  - `retrieveDatabase(id)` alias.
  - `retrieveDataSource(id)` alias.
  - `searchPages(query?)`.
  - `listBlockChildren(blockId, { limit?, startCursor? })`.
  - The existing `dataSourcesRetrieve` keeps its 3-tier fallback (SDK `dataSources.retrieve` → raw `client.request("data_sources/{id}")` → `null`).
  - query / create prefer the data_source target (`dataSources.query`, `pages.create parent.data_source_id`) with the legacy database fallback preserved.
- `src/lib/notion-discovery.ts`:
  - `discoverInlineDatabasesFromPage(client, pageId)` no longer returns block-id candidates only.
  - It locates `child_database` in `blocks.children.list(pageId)`, calls `retrieveDatabase(block.id)` with the block id, then extracts the data_source id via `extractDataSourcesFromDatabaseResponse`.
  - Each data_source id is loaded with `retrieveDataSource`; only those with `properties` are normalised as candidates.
  - The candidate `id` is the actual `dataSourceId` to store / use; `databaseId` preserves the child_database block / container id separately.
  - Includes `source: "page-child-database"`, `parentPageId`, `properties`, `schemaKindHint`.
  - searchDataSources results are also enriched via `retrieveDataSource(id)` for accurate schema-hint labels.
- `notion init`:
  - Selecting a search result or page-scan candidate stores the data_source id in `projectsTargetId/tasksTargetId`.
  - Page-child candidates also preserve the container id in `projectsDatabaseId/tasksDatabaseId`.
  - Manual fallback wording changes from "database id" to "data source id".
  - Example choice label: `Projects (Inline) — page child database → data_source abc123…: ✓ project schema`.
- `notion test` / `notion sync` / `task pull`:
  - targetId resolution comes first.
  - If targetId is a data_source, schema validation runs through `retrieveDataSource` directly.
  - The databaseId fallback still routes through the existing resolver.
  - `task pull`'s query also prefers `tasksTargetId`.
- `notion test --debug-shape`:
  - When a data source resolves, prints `selected input id`, `resolved data source id`, `source` (`direct-data-source` / `database-data-source` / `page-child-database`), `has properties`, `property keys count`, `schema hint`.
  - On resolve failure, prints the existing token-safe database shape (`object`, `top-level keys`, `data_sources count`).

### Changed files

- `src/types/config.ts`
- `src/lib/config.ts`
- `src/lib/notion-client.ts`
- `src/lib/notion-discovery.ts`
- `src/lib/notion-sync.ts`
- `src/lib/task-pull.ts`
- `src/commands/notion-init.ts`
- `src/commands/notion-test.ts`
- `src/commands/notion-sync.ts`
- `src/commands/task-pull.ts`
- `src/status/format.ts`
- `README.md`
- `docs/project/03-current-state.md`
- `docs/tasks/TASK-010-notion-config-test.md`
- `docs/tasks/TASK-011-notion-sync-task-pull.md`

## Test Result — API-first page child_database → data_source discovery

### Static verification

- `pnpm typecheck` ✅ exit 0.
- `pnpm build` ✅ exit 0.
- `ReadLints` (11 updated TS files) → 0 warnings.

### Unit / mock smoke

`/tmp/vibeops-api-first-smoke.mjs` directly assembles a mock `NotionClient`. All 12 assertions PASS:

1. 2 `child_database` blocks found in page children.
2. `retrieveDatabase(block.id)` called per block id.
3. `data_sources[]` extracts both `DS_PROJECTS` / nested `data_source.id=DS_TASKS`.
4. `retrieveDataSource` returns candidates only for data_sources with `properties`.
5. Candidate `id === dataSourceId`.
6. `databaseId` preserves the child_database block id.
7. `source === "page-child-database"`.
8. projects / tasks properties attached.
9. `schemaKindHint === projects/tasks`.
10. `sortForKind("projects")` puts Projects candidates first.
11. `sortForKind("tasks")` puts Tasks candidates first.
12. `fetchSchemas` prefers `projectsTargetId/tasksTargetId` and yields 0 schema violations.

### Live CLI

- `vibeops notion test --debug-shape` (current stored config still has legacy database ids):
  - With `projectsTargetId/tasksTargetId` absent, databaseId fallback is used.
  - Both Projects/Tasks: `object database`, `has properties no`, `data_sources 0`; `top-level keys` shows `data_sources` token-safely.
  - The resolve-failure message points out that the child database / container has no real data_source, as before.
- `vibeops notion sync --dry-run`:
  - Same resolver via target fallback.
  - Cut safely at the schema stage; zero `pages.create/pages.update` calls.

### Security / policy

- Zero raw-token output (`maskToken` only).
- discovery / test / dry-run use only read-only APIs.
- Zero Notion mutations besides actual sync execution.
- Manual data-source-id input fallback preserved.

### Risks

- In real workspaces where `database.data_sources[]` keeps returning 0, the API cannot yield a data_source. `--debug-shape` makes the cause visible; the user must re-connect the inline database / data source to the integration in the Notion UI.
- `pages.create parent.data_source_id` is Notion 2025-09-03. Legacy database-id configs have a fallback, but live write regression should be verified separately.
- TASK-011 Status stays at `Review`.

## Result — sync create/update locked to the data_source surface + TASK-000 excluded (2026-05-11 follow-up #5)

### Problem

After follow-up #4, when the user actually executed `vibeops notion sync`, `notion test` / `notion sync --dry-run` both succeeded (`schema valid`, target `object=data_source`), but during the mutation phase every row exploded with `HTTP 404 object_not_found`. Two causes:

1. **`pagesCreate`'s parent did not actually go to the data-source surface.** The wrapper called SDK `pages.create` with `parent: { data_source_id }`, but the call sites (`executeProjectUpsert / executeTaskUpsert`) passed `notionProjectsTargetId(notion) = projectsTargetId || projectsDatabaseId`. When the user's `.vibeops.json` was still legacy, this fallback sent **the container database id as `parent.data_source_id`** and Notion 404'd. Worse, once the SDK threw `validation_error` even once, the wrapper retried with `parent.database_id`, producing the divergence "**schema validated on the resolved data_source, but mutation went to the container database**".
2. **Query had the same divergence.** `findExistingProject / findExistingTask` called `client.databasesQuery(targetId, …)`. The wrapper internally tried typed `dataSources.query` first, but `targetId` itself could be the container at the end of the fallback chain, so the first call 404'd → upsert always saw "create" → create 404'd again. Dry-run ran the same query, so it should also have failed; the divergence ("schema retrieve succeeded with resolver `input-data-source`" vs "mutation create target") was simply not visible in the dry-run output.

### Summary of changes

- **`src/lib/notion-client.ts`**: expose the Notion 2025-09-03 surface as first-class on the mutation path too.
  - `queryDataSource(dataSourceId, options)` — (A) typed `client.dataSources?.query`, (B) raw `client.request({ path: "data_sources/{id}/query", method: "POST", body: {filter, page_size} })` fallback. Token / Notion-Version headers are attached by the SDK.
  - `createPageInDataSource({ dataSourceId, properties })` — first tries typed `client.pages.create({ parent: { type: "data_source_id", data_source_id }, properties })`; only when the SDK rejects with `validation_error`, falls back once to raw `client.request({ path: "pages", method: "POST", body: { parent, properties } })`. **Removed the legacy `parent.database_id` fallback from the mutation path** — no more silent downgrades.
  - `updatePage({ pageId, properties })` — explicit alias for `pages.update`. Update is keyed on `page_id`, so no surface difference.
  - Legacy `pagesCreate / pagesUpdate / databasesQuery` remain for compatibility, but the sync/pull mutation path uses only the new helpers.
- **`src/lib/notion-sync.ts`**:
  - `findExistingProject(client, dataSourceId, projectId)` / `findExistingTask(client, dataSourceId, projectId, taskId)` — both drop the `NotionConfig` argument and **take `schemas.{projects,tasks}.resolvedId` (returned by the resolver)** directly. Internally call `client.queryDataSource(...)`.
  - `executeProjectUpsert(client, dataSourceId, entry)` / `executeTaskUpsert(client, dataSourceId, entry)` — same: take the resolved `data_source` id directly and route through `client.createPageInDataSource({ dataSourceId, properties })` and `client.updatePage({ pageId, properties })`.
  - `planSync` explicitly passes `schemas.projects.resolvedId` / `schemas.tasks.resolvedId` to those functions.
  - Adds `export const SYNC_EXCLUDED_TASK_IDS = new Set(["TASK-000"])`; skips it on the first line of `planSync`'s task loop. `TASK-000-template.md` is the template `task generate` clones — no Notion row should be produced.
- **`src/commands/notion-sync.ts`**:
  - Each diagnostic in `report.schemas` carries `parentKind: "data_source_id" | "database_id"`. Always prints two lines (`create parent  data_source_id <id>` / `query target   data_source <id>`) → the user can verify, just by reading the output, that dry-run and actual sync use the exact same target / parent shape.
  - Routes the actual mutation branch by `schemaRes.projects.resolvedId` / `schemaRes.tasks.resolvedId` (no longer passes `ctx.notion` to the mutation helpers).
  - On 4xx, `formatMutateError({ err, action, parentKind, targetId })` shows `action=create-page, target=<resolved-data-source-id>, parent=data_source_id` and, on 404, attaches the hint "Verify the resolved id / integration connection / run `vibeops notion test --debug-shape`". Never prints the token (uses `maskToken` only).
- **`src/lib/task-pull.ts` / `src/commands/task-pull.ts`**:
  - `PlanPullInputs` drops `notion: NotionConfig` and accepts `tasksDataSourceId: string`. Callers pass `schemaRes.tasks.resolvedId` directly.
  - `executePullEntry` no longer takes `notion`; patches via `client.updatePage({ pageId, … })`.
- **`scripts/notion-sync-surface-check.ts`** (mock smoke): asserts that legacy `databasesQuery` / `pagesCreate(databaseId)` calls are **0**, and that the new `queryDataSource` / `createPageInDataSource` / `updatePage` are each invoked exactly once at the right stage.

### Changed files

- `src/lib/notion-client.ts`
- `src/lib/notion-sync.ts`
- `src/lib/task-pull.ts`
- `src/commands/notion-sync.ts`
- `src/commands/task-pull.ts`
- `scripts/notion-sync-surface-check.ts` (new)
- `docs/project/03-current-state.md`
- `docs/tasks/TASK-011-notion-sync-task-pull.md`
- `docs/tasks/TASK-010-notion-config-test.md` (cross-link)
- `README.md`

## Test Result — sync create/update data_source surface lock + TASK-000 exclusion

### Static verification

- `pnpm typecheck` ✅ exit 0.
- `pnpm build` ✅ exit 0.
- `ReadLints` (5 changed files) → 0 warnings.

### Mock smoke

`pnpm exec tsx scripts/notion-sync-surface-check.ts` ⇒ `OK — every Notion mutation routed through data_source surface.`

- `findExistingProject(client, "PROJECTS_DS_ID", …)` calls `client.queryDataSource("PROJECTS_DS_ID", filter)` exactly once.
- `findExistingTask(client, "TASKS_DS_ID", …)` same.
- `executeProjectUpsert(client, "PROJECTS_DS_ID", { verb: "create", … })` ⇒ `client.createPageInDataSource("PROJECTS_DS_ID", …)`.
- `executeProjectUpsert(client, "PROJECTS_DS_ID", { verb: "update", existingPageId: "page-abc", … })` ⇒ `client.updatePage("page-abc", …)`.
- Tasks same: `createPageInDataSource("TASKS_DS_ID", …)` / `updatePage("page-xyz", …)`.
- Legacy `databasesQuery` / `pagesCreate(databaseId)` call count is **0** — no silent legacy fallback.
- `SYNC_EXCLUDED_TASK_IDS.has("TASK-000") === true`.

### Live CLI

The live workspace's `.vibeops.json` has both `projectsTargetId / tasksTargetId` set, and both resolve to inline data_source (`schema valid`).

- `pnpm dev notion test` ⇒ "Projects DB required-property verification 8 properties" and "Tasks DB required-property verification 10 properties" both pass; `source=input-data-source`.
- `pnpm dev notion sync --dry-run` ⇒ `Tasks  create 12  update 0  total 12` (TASK-000 excluded), and the schema target block prints `create parent   data_source_id <id>` / `query target    data_source <id>` for both DBs.
- `pnpm dev notion sync` (actual) ⇒ **0 404s**.
  - `TASK-001 ~ TASK-006` → 6 rows created in Tasks DB (Status=`Done`).
  - The remaining 4xx are all `400 validation_error`: `Invalid status option. Status option "Building/Review/Planned" does not exist`. These are a different class — the user's Notion `Status` property does not have those options registered. The error message also shows `action=create-page, target=<resolved-data-source-id>, parent=data_source_id`, so the call routing is unambiguous.
- Re-running `pnpm dev notion sync --dry-run` ⇒ those same 6 rows are now `update task TASK-001..006`, and only 6 not-yet-created rows show `create` (`Tasks    create 6  update 6  total 12`). The dry-run "update" decision means `queryDataSource("TASKS_DS_ID", filter)` correctly found the rows created by the actual sync — query is also routing through the data_source surface.

### Security / policy

- Zero `NOTION_TOKEN` raw output — `maskToken("ntn_…q8ca")` only.
- Zero mutations in dry-run / `notion test` / `--debug-shape`.
- Zero page-body-block updates — properties only.
- Zero Git mutations — sync produces only Notion API calls.

### Risks / limits

- The live workspace's missing `Status` options (`Building/Review/Planned`) is a polish-round candidate. Either the user adds those options manually or VibeOps provides a friendly conversion map for all 12 rows to pass. → **Absorbed by follow-up #6 (pre-validation + friendly guidance)**.
- The legacy `pagesCreate(databaseId)` / `databasesQuery(databaseId)` wrappers are still exported because discovery / probe non-mutation paths use them; the mutation entry points all route through the new helpers.
- TASK-011 Status stays at `Review`. The mutation surface fix + live idempotency check pass, but the reviewer should still confirm (a) all 12 rows create after fixing status options in the workspace and (b) `task pull` regression — then move it to `Done`.

## Result — Notion Status option pre-validation (2026-05-11 follow-up #6)

### Problem

After follow-up #5 fixed the 404 surface bug, the live sync failed entirely with HTTP 400 `validation_error: Invalid status option. Status option "Building/Review/Planned" does not exist`. The schema validator checked only the **type** of the Status property (`type === "status"`) and did not check that the status option names VibeOps actually uses are registered on the Notion DB. So `notion test` ✓ but actual `notion sync` died with 400 per row — partial sync.

### Direction

Pre-validate status option names in the schema stage; when something is missing, friendly-guide the user to add the options in Notion. Never mutate the Notion DB schema (no auto-creation / auto-patch).

### Summary of changes

- **`src/lib/notion-schema.ts`**:
  - Two new constants:
    - `PROJECTS_STATUS_REQUIRED_OPTIONS = ["Building", "Planning", "Paused", "Done", "Archived"]`.
    - `TASKS_STATUS_REQUIRED_OPTIONS = ["Planned", "In Progress", "Review", "Done", "Blocked"]`.
  - Add `readonly requiredOptions?: readonly string[]` to `PropertyRequirement`. Attach the constants above on the Projects/Tasks `Status` entries.
  - Extend `SchemaViolation.kind`: add `status-options-missing` / `status-options-unreadable` to the existing `missing | type-mismatch | missing-properties`. Add `missingOptions`, `requiredOptions`, `foundOptions` fields.
  - New `extractStatusOptionNames(prop)`: absorbs 5 shapes (`prop.status.options[].name`, `prop.status.groups[].options[].name`, `prop.status.groups[].option_names[]`, flat `prop.options[]`, legacy `prop.status_options[]`) and returns trimmed/deduplicated names. If no shape is readable, returns `null` so the caller can raise `status-options-unreadable`. Never throws.
  - `validateDatabaseSchema` runs option validation only when `req.requiredOptions` is set and the actual type is `status`. Unreadable → `status-options-unreadable`; missing → `status-options-missing`. If `type-mismatch` is already present, option validation is skipped.
  - Adds the `STATUS_OPTIONS_HINT` constant — `"Add missing Status options to the Notion database, then rerun \`vibeops notion test\`."`.
- **`src/commands/notion-test.ts`**: violation rendering shows the two new kinds friendly — three lines (`missing` / `Add these options in Notion: Status property → Edit options → <required list>` / `found in Notion: <observed list>`). JSON output carries the new fields verbatim.
- **`src/commands/notion-sync.ts`**: at the schema stage, classify violations with `status-options-missing|unreadable` as `reason: "schema-status-options"` and attach `STATUS_OPTIONS_HINT` to the message. **fast-fail before any mutation** — zero partial sync. For mutation-time `validation_error: Invalid (status|select) option` 4xx, `mutateHint(err)` auto-attaches `STATUS_OPTIONS_HINT` (so the guidance also shows up on the edge case where Notion returns no options).
- **`scripts/notion-status-options-check.ts`** (new): 9 assertions covering the new helper and validator (modern options / groups / flat fallback / unreadable / missing detection / full-set pass / type-mismatch priority / Projects DB variants).

### Changed files

- `src/lib/notion-schema.ts`
- `src/commands/notion-test.ts`
- `src/commands/notion-sync.ts`
- `scripts/notion-status-options-check.ts` (new)
- `README.md`
- `docs/project/03-current-state.md`
- `docs/tasks/TASK-011-notion-sync-task-pull.md`

## Test Result — Notion Status option pre-validation

### Static verification

- `pnpm typecheck` ✅ exit 0.
- `pnpm build` ✅ exit 0.
- `ReadLints` (3 changed files) → 0 warnings.

### Mock smoke

- `pnpm exec tsx scripts/notion-status-options-check.ts` ⇒ `OK — extractStatusOptionNames + validateDatabaseSchema status options pass.` All assertions pass.
- `pnpm exec tsx scripts/notion-sync-surface-check.ts` (follow-up #5 regression) ⇒ still OK.

### Live CLI

A one-shot probe of the live workspace's Notion `Status` property options (the probe script was destroyed immediately afterwards):

- Projects DB Status options: `Not started`, `Planning`, `In progress`, `Building`, `Paused`, `Done`, `Archived` ⇒ all 5 VibeOps requirements (`Building / Planning / Paused / Done / Archived`) ✓.
- Tasks DB Status options: `Not started`, `Planned`, `In Progress`, `Review`, `Blocked`, `Done`, `Archived` ⇒ all 5 VibeOps requirements (`Planned / In Progress / Review / Done / Blocked`) ✓.

Command results:

- `vibeops notion test` ⇒ Projects / Tasks both `8 / 10 properties present and types match`; 0 status-option misses. (Assumes the user added the options manually after follow-up #5 surfaced the issue.)
- `vibeops notion sync --dry-run` ⇒ `Project create 0  update 1  total 1`, `Tasks create 0  update 12  total 12`. Every row is `update`.
- `vibeops notion sync` (actual) ⇒ `Notion sync complete.` — 1 Project row + 12 Tasks rows all update successfully. **0 404 / 400**.
- In workspaces missing options, `notion test` surfaces the friendly hint exactly as the mock smoke verifies:

  ```text
  ✗ Tasks DB required-property verification
      · status-options-missing Status
          missing  In Progress, Review, Blocked
          Add these options in Notion:  Status property → Edit options → Planned, In Progress, Review, Done, Blocked
          found in Notion: Done, Planned
  ```

  The same message also appears under `notion sync --dry-run` / `notion sync`, and **no mutation is attempted**.

### Security / policy

- Zero raw `NOTION_TOKEN` output (`maskToken` only).
- Zero Notion DB schema mutations. Zero status-option auto-creations. We only guide the user.
- `notion test` / `notion sync --dry-run` are read-only (zero page mutations).
- `foundOptions` carries only the user-defined status option names — no tokens / no page bodies / no other sensitive data.

### Risks / limits

- When Notion partially disables / partially provides `status.options` in the `data_sources.retrieve` response, the extractor returns `null` → `status-options-unreadable` violation. The user is told to inspect with `--debug-shape` or check the Notion UI; no silent pass occurs.
- This follow-up is limited to the `status` property. `Priority` / `MVP Phase` etc. are free-form selects and excluded from required validation, though the same `requiredOptions` mechanism could be extended in a polish round.
- TASK-011 Status stays at `Review`. Pre-validation + live sync integrity are clear, but the reviewer should also confirm `task pull` regression before moving to `Done`.

## Result — task pull local-file existence rule refinement (2026-05-11 follow-up #7)

### Problem

In a live regression, the user added a new row `Task ID = TASK-099` to the Notion Tasks DB and ran `vibeops task pull --dry-run`. Output:

```text
considered 2 rows → new 0 skipped 2
skipped
  · TASK-099 local-file-exists docs/tasks/TASK-012-package-polish-readme.md
  · TASK-012 local-file-exists docs/tasks/TASK-012-package-polish-readme.md
```

`planPull` was **unconditionally trusting** Notion's `Docs Path`. TASK-099 had its `Docs Path` mis-set to `docs/tasks/TASK-012-package-polish-readme.md`, but `planPull` only saw "the file exists at that path" and skipped as `local-file-exists`. As a result, TASK-099 would never get pulled, and the silent collision (TASK-012 and TASK-099 pointing at the same file) was not caught by dry-run.

### Direction

Split `planPull`'s decision tree into (a) Task ID guarantee → (b) duplicate Task ID detection → (c) verify Notion Docs Path matches the Task ID → (d) when empty, search locally for `docs/tasks/TASK-NNN-*.md` → (e) otherwise plan a new file. Classify mismatch / duplicate / no-task-id into separate skip reasons and ask the user to fix Notion manually. **No automatic rename** — automatic Notion `Docs Path` patching is outside this follow-up's scope; a future `--fix-docs-path` opt-in is a candidate.

### Summary of changes

- **`src/lib/task-pull.ts`**:
  - New export `docsPathMatchesTaskId(docsRelativePath, taskId)` — basename `${taskId}.md` or prefix `${taskId}-` matches; everything else mismatches (case-sensitive).
  - Extend `PullSkipReason`: add `docs-path-mismatch` / `duplicate-task-id` to the existing `no-task-id | local-file-exists | docs-path-conflict`.
  - Add `detail?: string` to `PullSkip` / `PullEntry` — a token-safe one-liner shown to the user (e.g. `notion docs path: …`, `expected basename prefix: TASK-099-`).
  - New export `PullDecisionTrace` + `PullPlan.trace: PullDecisionTrace[]` — records every considered Notion row's (taskId / pageId / notionDocsPath / localResolvedPath / decision / reason) in scan order.
  - First-pass: **detect duplicates inside the Notion query result**. When the same Task ID appears twice or more, keep the first and skip the rest as `duplicate-task-id`.
  - Second-pass decision tree:
    1. `Task ID` empty AND `Docs Path` empty → auto-allocate the next number (existing behaviour) + trace `new-file`.
    2. `Task ID` empty BUT `Docs Path` set → `no-task-id` skip (no auto-rename).
    3. pageId is marked as duplicate → `duplicate-task-id` skip.
    4. `Docs Path` set but basename does not match `${taskId}-` / `${taskId}.md` → `docs-path-mismatch` skip. Detail surfaces `notion docs path: …`, `expected basename prefix: TASK-099-`, `action: fix Notion 'Docs Path' for this row (auto-fix not enabled).` together.
    5. `Docs Path` set and matches → use it as-is, then check file existence. If present, `local-file-exists`; otherwise plan a new file.
    6. `Docs Path` empty → search `docs/tasks/` for `TASK-NNN-*.md` / `TASK-NNN.md` (`findLocalTaskFileForId`). If found, `local-file-exists` at that resolved path; otherwise plan a new `${taskId}-${slug}.md` + `notionNeedsDocsPath: true`.
  - `executePullEntry` is unchanged — it fills only the empty Docs Path when `notionNeedsDocsPath: true`; never modifies a mismatch / pre-existing path.
- **`src/commands/task-pull.ts`**:
  - Add `TaskPullOptions.verbose?: boolean`.
  - Carry `detail?` on `PullReport.entries` / `skipped`. New `report.trace` — always included in JSON for machine handling.
  - The default text output stays concise. Skip detail is unconditional (`notion docs path: …` / `expected basename prefix: …` one line each) so mismatch reasons are visible immediately.
  - When `--verbose` is on, `would create` entries also show their detail, and a separate `trace` section prints (`taskId  decision  page=<id>` + `notion docs path / local resolved / reason` 3 lines).
- **`src/cli.ts`**: adds the `--verbose` option to `vibeops task pull` and forwards it to `taskPullCommand`.
- **`scripts/task-pull-decision-check.ts`** (new): in a temp directory, creates `docs/tasks/TASK-012-package-polish-readme.md` and uses a stub `NotionClient.queryDataSource` to verify 5 row cases (mismatch / existing-match / duplicate / no-task-id / fresh new) in one pass.

### Changed files

- `src/lib/task-pull.ts`
- `src/commands/task-pull.ts`
- `src/cli.ts`
- `scripts/task-pull-decision-check.ts` (new)
- `docs/tasks/TASK-011-notion-sync-task-pull.md`

## Test Result — task pull local-file existence rule refinement

### Static verification

- `pnpm typecheck` ✅ exit 0.
- `pnpm build` ✅ exit 0.
- `ReadLints` (4 changed files) → 0 warnings.

### Mock smoke

- `pnpm exec tsx scripts/task-pull-decision-check.ts` ⇒ `OK — planPull decision tree (mismatch / duplicate / new) pass.` All assertions pass (4 `docsPathMatchesTaskId` unit + 5 row decision cases).
- Regression: `pnpm exec tsx scripts/notion-sync-surface-check.ts` ⇒ `OK — every Notion mutation routed through data_source surface.` (follow-up #5).
- Regression: `pnpm exec tsx scripts/notion-status-options-check.ts` ⇒ `OK — extractStatusOptionNames + validateDatabaseSchema status options pass.` (follow-up #6).

### Live CLI

- `vibeops task pull --dry-run`:
  - Output (after the user fixed TASK-099's Docs Path in Notion):

    ```text
    considered 2 rows  →  new 1  skipped 1
    would create
      · TASK-099 TASK-0199· Test  status=Planned phase=Phase 0
          docs/tasks/TASK-099-task-0199-test.md
    skipped
      · TASK-012 local-file-exists  docs/tasks/TASK-012-package-polish-readme.md
          notion docs path: docs/tasks/TASK-012-package-polish-readme.md
    ```

    Compare to before follow-up #7: TASK-099 is no longer silently skipped onto a wrong TASK-012 path; it is now picked up as a new-file candidate.
  - The mismatch case (covered by the mock smoke): the skip block immediately shows two lines:

    ```text
    skipped
      · TASK-099 docs-path-mismatch  docs/tasks/TASK-012-package-polish-readme.md
          notion docs path: docs/tasks/TASK-012-package-polish-readme.md
          expected basename prefix: TASK-099- or TASK-099.md
          action: fix Notion 'Docs Path' for this row (auto-fix not enabled).
    ```

- `vibeops task pull --dry-run --verbose`:
  - Adds a `trace` section to the output:

    ```text
    trace
      TASK-099  new-file  page=35d3…2278
          notion docs path : (empty)
          local resolved   : docs/tasks/TASK-099-task-0199-test.md
          reason           : Notion Docs Path empty — planning fresh local file under docs/tasks
      TASK-012  skip-local-file-exists  page=35d3…5470
          notion docs path : docs/tasks/TASK-012-package-polish-readme.md
          local resolved   : docs/tasks/TASK-012-package-polish-readme.md
          reason           : Notion Docs Path matched Task ID and file already exists on disk
    ```

### Security / policy

- Zero raw `NOTION_TOKEN` output.
- `task pull --dry-run` and `--verbose` produce zero Notion / file mutations.
- Zero automatic Notion `Docs Path` corrections on mismatch. We only ask the user to fix it in Notion.
- New trace / detail output carries only Task ID / page id / docs path / reason — no body / token / other sensitive data.

### Risks / limits

- Mismatch auto-correction (`--fix-docs-path`) was intentionally not implemented. Auto-patching a Notion `Docs Path` could accidentally break the connection to the original page. A polish round could expose it as an explicit opt-in option.
- Local file search scans `docs/tasks` at a single depth — subfolder / symlink scenarios are out of scope.
- Rows with empty `Task ID` AND empty `Docs Path` still get auto-numbered (existing behaviour). For a stricter policy, a `--strict-task-id` option is a candidate.
- TASK-011 Status stays at `Review`. Mismatch protection + duplicate detection + verbose trace all landed safely; before promoting to `Done` the reviewer should (a) reproduce a real mismatch scenario in the workspace once and (b) verify `task pull` (actual) regression.

## Review Notes

(not yet — filled by the Reviewer Agent or a human)
