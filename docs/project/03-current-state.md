# 03 — Current State

> This document records **facts only**. Plans live in [05-backlog.md](05-backlog.md).

## Stage

- **Current stage**: MVP 1–4 implementation + package polish + GitHub integration + Init Git bootstrap UX + Status output polish + Notion env template cleanup + **Public release polish** **in Review**.
  - MVP 1 (Project Bootstrapper) closed by TASK-002 / 003 / 004 / 005.
  - MVP 2 — **TASK-006 (`vibeops plan`)** complete + **TASK-007 (`vibeops task generate`) in Review**.
  - MVP 3 — **TASK-008 (`task start / prompt / check / done`)** + **TASK-009 (`task rollback`)** in Review.
  - MVP 4 — **TASK-010 (`notion init / notion test`) + TASK-011 (`notion sync` / `task pull`) in Review**.
  - Package polish — **TASK-012 (`README` / npm packaging / smoke / publish dry-run) in Review**.
  - GitHub integration — **TASK-013 (`vibeops github status / init`) in Review**.
  - Init Git bootstrap UX — **TASK-014 (`vibeops init --git` / unborn status) in Review**.
  - Status output polish — **TASK-015 (`vibeops status` Notion / GitHub / Package sections) in Review**.
  - Notion env template cleanup — **TASK-016 (remove legacy `NOTION_API_KEY` / `NOTION_PROJECT_DB` / `NOTION_TASK_DB` from `.vibeops.env.example` / `08-env.md` / `notion-sync.md`) in Review**.
  - Public release polish — **TASK-017 (npm package name `@goodtekxyz/vibeops` + README/CHANGELOG public-tone polish + English-only CLI output + support contacts) in Review**.
- Status flow `Planned → In Progress → Review → Done`. Git state is recorded inline in the TASK markdown's `## Git Context` section.
- `vibeops init` / `status` / `agent {list, show, prompt}` / `plan` / `task {generate, start, prompt, check, done, rollback, pull}` / `notion {init, test, sync}` / `github {status, init}` all work. `init` can optionally bootstrap Git and create the first commit.
- Remaining stubs: none. The only remaining work is human / Reviewer-Agent review before `vibeops task done <id> --finalize`.

## What is in place

| Item                              | Location                                          | Notes                                                                 |
| --------------------------------- | ------------------------------------------------- | --------------------------------------------------------------------- |
| Product definition                | `docs/project/00-overview.md` ~ `05-backlog.md`   | Updated 2026-05-11.                                                  |
| Operating rules                   | `AGENTS.md`, `.cursor/rules/*.mdc`                | VibeOps repository's own rules.                                       |
| TASK list                         | `docs/tasks/TASK-001 ~ TASK-017`                  | TASK-001~006 done; **TASK-007~017 in Review**.                        |
| Logs                              | `docs/logs/README.md`                             | Daily-log convention. The two earlier daily-log files (`2026-05-11.md` / `2026-05-12.md`) were removed; per-TASK Result/Test Result sections carry the equivalent narrative. |
| **CLI package skeleton**          | `package.json`, `tsconfig.json`, `.gitignore`, `LICENSE`, `CHANGELOG.md`, `scripts/smoke.mjs` | Node 20+, ESM, `bin=dist/cli.js`, `packageManager=pnpm@9.15.9`, MIT. **TASK-017** set `name = "@goodtekxyz/vibeops"`, `version = "0.2.0"`, `publishConfig.access = "public"`. `files` is limited to `dist`, `templates`, `README.md`, `LICENSE`, `CHANGELOG.md`. Scripts: `dev / build / typecheck / start / smoke / prepack / publish:dry`. `dist/` is gitignored and produced by `prepack` for npm packaging. `pnpm pack`, `pnpm publish --dry-run --no-git-checks`, and **`pnpm publish --dry-run --access public --no-git-checks`** all pass — package name `@goodtekxyz/vibeops`, total files 93, public access. Actual publish has not run. |
| **CLI entry point**               | `src/cli.ts`, `src/version.ts`                    | commander v12. **TASK-017** unified every `description` / `option` to English and removed internal `(MVP 1)` / `(TASK-010)` / `(post-MVP 4)` labels. Zero Korean characters in CLI help / error / log output (the legacy placeholder regex in `task.ts` is retained for backward compatibility only). |
| **Common utilities**              | `src/lib/{config,filesystem,git,logger,paths,task,task-prompt,brief,prompt-builder,inquirer-helpers}.ts`, `src/types/{config,task,brief}.ts` | `task.ts` and `git.ts` were extended significantly in MVP 3 as lifecycle helpers. `task-prompt.ts` stitches agent + TASK + project context. |
| **Bootstrap engine**              | `src/bootstrap/{manifest,installer,substitute}.ts`, `src/commands/init.ts`, `src/lib/git.ts` | Template walk + idempotent copy + placeholder substitution. **TASK-014** added an optional Git bootstrap in `vibeops init`: interactive flow asks `Initialize Git repository?`, `Use main as default branch?`, `Create initial commit?`, `Initial commit message` via `yesNoSelect`/input (no `confirm`). Flags: `--git / --no-git / --initial-commit / --no-initial-commit / --default-branch <name> / --commit-message <message>`. For fresh repos: `git init` → set unborn HEAD to `main` → show `git status --porcelain` file count → `git add .` → `git commit -m ...`. Existing Git repos: skip `git init`; skip / warn default-branch change and initial commit if commits already exist. `--dry-run` performs zero Git mutations. No automatic push or remote changes. **TASK-016** trimmed `envExampleContents()` to a single `NOTION_TOKEN=` line plus a Notion-integration-URL header — removing the legacy `NOTION_API_KEY` / `NOTION_PROJECT_DB` / `NOTION_TASK_DB` lines. `templates/docs/project/08-env.md`, `templates/.vibeops/workflows/notion-sync.md` (and the vibeops self-copy) were aligned, and target-id storage location (`.vibeops.json` `notion.{projectsTargetId,tasksTargetId}`) is now documented. |
| **Status collector / formatter** | `src/status/{collector,format}.ts`, `src/lib/{git,notion-env,package-json,config}.ts`, `src/types/config.ts` | Human + JSON output, including a `review` count. **TASK-014** distinguishes Git state `none / normal / unborn / detached`. Before the first commit, shows `branch main (unborn, no commits yet)`, `status dirty`, `hint create the first commit or run \`vibeops init --git --initial-commit\``. **TASK-015** redesigned the Notion section into 5 lines (`enabled / token / projects target / tasks target / hint`), removed legacy `NOTION_API_KEY` / `NOTION_PROJECT_DB` / `NOTION_TASK_DB` output, and added `getNotionTokenSource(cwd)` which returns only token presence + source (`.vibeops.env` → `process.env`) with zero raw token output. New GitHub section (reads `.vibeops.json` `github` only, zero `gh` child processes) and Package section (`readPackageJson` shows `name / version / bin` only; falls back to a single `package.json missing` line). JSON now exposes `notion.{enabled, hasToken, tokenSource, hasProjectsTarget, hasTasksTarget}` / `github.{enabled, mode, owner, repo, remote, url}` / `package.{exists, name, version, bin}`. `status` is explicitly local-only (no Notion API calls, no `gh` CLI). |
| **Agent loader / prompts**        | `src/agent/{loader,prompt}.ts`                    | Uses gray-matter.                                                     |
| **Plan engine**                   | `src/lib/brief.ts`, `src/lib/prompt-builder.ts`, `src/lib/inquirer-helpers.ts`, `src/types/brief.ts` | 20-question interactive flow + brief markdown + Cursor planning prompt. UX round (2026-05-11): trimmed choices, default stack `Next.js / NestJS / PostgreSQL / Drizzle / pnpm`, smart `projectType` default, `loop: false` + `pageSize: 8` for select/checkbox. |
| **Task lifecycle engine**         | `src/commands/task-{start,check,done,rollback}.ts`, `src/lib/task.ts` (Git Context · Status update + `nextTaskNumber`/`highestTaskNumber`/`formatTaskId`), `src/lib/git.ts` (run/diff/log/branch/reset + porcelain parser + 6 changed-files helpers), `src/lib/task-prompt.ts` | Inline-updates `## Status` / `## Git Context` sections in the TASK markdown. 4-stage status flow `Planned → In Progress → Review → Done`. Every command supports `--dry-run` or is read-only. Rollback uses a 2-step confirm (`--confirm` non-destructive / `--confirm-destructive` destructive). `task check` combines working tree (unstaged + staged + untracked) ∪ committed via Set-dedup and reports `working tree / committed / total` in 3 lines (rename- and untracked-aware). Zero automatic commits, zero pushes, zero Notion calls. |
| **Task generation engine**        | `src/commands/task-generate.ts`, `src/lib/project-docs.ts`, `src/lib/task-generator.ts`, `src/lib/task-scaffold.ts` | Two modes: (a) **prompt** — combines `docs/project/*` + brief + `--from <path>` into `.vibeops/generated/task-generate-prompt.md`. Forces 18 sections on the Planner Agent (Status / MVP Phase / Goal / Background / Scope / Out of Scope / Acceptance Criteria / Files to Inspect First / Expected Files to Change / Risks / Test Plan / Rollback Plan / **Git Context** / **Notion Page** / Implementation Plan / Result / Test Result / **Review Notes**). (b) **scaffold** — `--scaffold --count N` creates N 18-section placeholder TASK files from the next number (collision-free, never overwrites). Options: `--from / --output / --count / --phase / --scaffold / --dry-run / --cwd`. Zero LLM, zero Cursor-CLI, zero Notion, zero GitHub-API, zero Git-mutation calls. |
| **Notion config + verify engine** | `src/commands/notion-{init,test}.ts`, `src/lib/notion-{env,schema,client,discovery,target}.ts`, `src/types/config.ts` (`NotionConfig`), `src/lib/config.ts` (`mergeNotionConfig`) | `notion init` safely merges `notion.{ enabled, projectsDatabaseId, tasksDatabaseId }` into `.vibeops.json` and appends a single `NOTION_TOKEN=` line into `.vibeops.env.example` (preserving existing keys). When the user supplies a token, it **calls `POST /v1/search` to list databases shared with the integration** and offers Projects/Tasks DB selection via a `select` prompt (recommendation-sorted + `Enter manually` / `Skip` fallback). **The search filter uses Notion's current `data_source` value** (`database` is permanently dropped); on `validation_error`, falls back to `page` once and guides the user to enter ids manually. **If `data_source` yields zero hits, it switches to a `page` search**, prompts "Select a page to scan for inline databases", and on selection calls `blocks.children.list(pageId)` — scanning only **1-deep, up to 100 blocks** — to normalize inline `child_database` / `data_source` blocks (no recursion). Immediately soft-validates schema after selection. `notion test` performs pre-flight + API checks and reports each as `ok / fail / skip`. `--json` supported. **`vibeops notion test --debug-shape` (TASK-011 follow-up #3)** prints a token-safe digest of each DB's `databases.retrieve` response (`object / id / title? / has properties / data_sources count + field + per-DS line / top-level keys`). Enforces Projects DB 8 properties + Tasks DB 10 properties (`Name / Task ID / Project ID / Status / Priority / MVP Phase / Git Branch / Docs Path / Summary / Result Summary`). `Status` is strict; only `Git Repo` accepts both `rich_text \| url`. **`src/lib/notion-target.ts`'s `resolveNotionDataSourceTarget` is the single entry point for `database → data_source` resolution (TASK-011 follow-up #2)**: first `dataSources.retrieve(id)` → on failure fall back to `databases.retrieve(id)`'s `data_sources[]` (absorbing snake_case + `dataSources` / `child_data_sources` / `childDataSources` + nested `data_source.id` via `extractDataSourcesFromDatabaseResponse`) → if still unresolved, returns `{ reason: "no-data-source"\|"no-properties"\|"transport" }` + a friendly hint + suggestion to run `--debug-shape` (follow-up #3). `notion init` / `notion test` / `notion sync` all route through the same resolver, so the new API (`2025-09-03`) database/data_source split and permission split is diagnosed consistently. `notion test`'s schema stage is split into `retrieve → resolve → schema`, 3 lines. `NotionClient` exports `dataSourcesRetrieve` (typed SDK → raw `client.request({ path: "data_sources/{id}" })` fallback → `null`), `probeDatabaseShape`, `summariseDatabaseShape`, `extractDataSourcesFromDatabaseResponse`; ctor explicitly pins `logLevel: "error"` + `notionVersion: "2025-09-03"`. `@notionhq/client@5.20.0` lazy import + 5s timeout. **Zero plaintext `NOTION_TOKEN` output (even debug-shape only carries field names / counts / data_source id+name), zero Notion mutations (only `search` + `users.me` + `databases.retrieve` + `dataSources.retrieve` + `blocks.children.list`).** |
| **Notion sync engine**            | `src/commands/{notion-sync,task-pull}.ts`, `src/lib/{notion-sync,task-pull,notion-mappers,task-summary,notion-schema}.ts`, `src/lib/notion-client.ts` (adds `queryDataSource / createPageInDataSource / updatePage` + legacy `databasesQuery / pagesCreate / pagesUpdate`), `src/lib/git.ts` (adds `gitRemoteUrl`) | **TASK-011**. `notion sync` upserts metadata from `docs/project/00-overview.md` · `docs/project/{05,03}-current-state.md` · `docs/tasks/*.md` into Projects DB 8 properties + Tasks DB 10 properties (`Project ID` key / `Project ID + Task ID` key). Body is never pushed — only Summary / Result Summary, both truncated at 1500 characters. `--dry-run` / `--json` / `--only-tasks` / `--only-project` / `--cwd`. `task pull` queries Notion rows where `Status ∈ {Planned, Ready, …}` and creates `docs/tasks/TASK-NNN-slug.md` skeletons in the 18-section shape + only reverse-updates the empty `Docs Path` (a single line). No body overwrite, no existing-file overwrite. `--dry-run` / `--json` / `--status <list>` / `--limit <n>` / `--cwd`. **`--dry-run` makes zero mutations — query only**. **All mutations and queries use the Notion 2025-09-03 `data_source` surface only (TASK-011 follow-up #5)**: `findExisting*` calls `client.queryDataSource(schemas.{projects,tasks}.resolvedId, filter)`; `executeProjectUpsert` / `executeTaskUpsert` call `client.createPageInDataSource({ dataSourceId, properties })` + `client.updatePage({ pageId, properties })`. `pages.create` parent is `{ type: "data_source_id", data_source_id }`. Legacy `parent.database_id` fallback has been removed from the mutation path — preventing the leak where schema was validated on `data_source` but mutation hit the container database. If the SDK does not expose `client.dataSources.query`, falls back to raw `POST /v1/data_sources/{id}/query`; if `pages.create` is rejected by SDK validation, falls back to raw `POST /v1/pages` (both reuse the SDK's `Authorization` / `Notion-Version` / `Content-Type`). 4xx responses include `action=create-page \| update-page, target=<resolved-data-source-id>, parent=data_source_id`; 404 attaches the `vibeops notion test --debug-shape` hint. **`TASK-000-template.md` is excluded from sync via `SYNC_EXCLUDED_TASK_IDS`** — it is the template `task generate` clones, so it must not produce a Notion row. **`task pull` decision tree (TASK-011 follow-up #7)**: `planPull` decides per row by (a) detecting duplicate Task IDs, (b) checking that the Notion `Docs Path` basename matches the Task ID (`docsPathMatchesTaskId`), (c) when Docs Path is empty, searching `docs/tasks/` directly for `TASK-NNN-*.md`. New skip reasons `docs-path-mismatch` / `duplicate-task-id`; every skip / entry carries a token-safe `detail`. `PullPlan.trace[]` records the decision (taskId / pageId / notionDocsPath / localResolvedPath / decision / reason) for every considered row. `vibeops task pull --verbose` shows trace + entry detail. Zero automatic rename on mismatch — the user fixes Notion manually. **Status-property option pre-check (TASK-011 follow-up #6)**: `PROJECTS_STATUS_REQUIRED_OPTIONS` (`Building / Planning / Paused / Done / Archived`) + `TASKS_STATUS_REQUIRED_OPTIONS` (`Planned / In Progress / Review / Done / Blocked`) are compared by `validateDatabaseSchema` against Notion's `status.options` / `status.groups[].options` / flat `options` shapes (parsed by `extractStatusOptionNames`) → missing options raise `status-options-missing`, unreadable shapes raise `status-options-unreadable`. `notion test` prints three lines (`missing` / `Add these options in Notion: …` / `found in Notion: …`). `notion sync` also fast-fails in the schema stage with `reason: schema-status-options` to block any partial mutation. A `validation_error: Invalid (status\|select) option` 4xx during mutation automatically attaches `STATUS_OPTIONS_HINT`. Zero automatic Notion DB schema mutation, zero automatic option creation. Zero LLM / Cursor-CLI / GitHub-API / webhook / DB-auto-creation / page-body-block update / plaintext `NOTION_TOKEN` output. |
| **GitHub integration engine**     | `src/commands/github-{status,init}.ts`, `src/lib/{github-cli,package-json}.ts`, `src/types/config.ts` (`GithubConfig` / `DEFAULT_GITHUB_CONFIG`), `src/lib/config.ts` (`mergeGithubConfig`) | **TASK-013**. `github status` performs a 6-line (`gh installed / gh authenticated / git remote origin / config enabled / package repo`) read-only diagnosis. `github init` runs an interactive flow (`yesNoSelect`-based — no `y/n` typing) covering (A) gh installation (B) gh authentication (C) current remote check (D) `gh repo create <owner>/<repo> --public\|--private --source=. --remote=origin` to create a new repo (E) `git remote add origin <url>` to connect an existing repo (F) update `package.json` `repository.url` / `homepage` / `bugs.url` (G) merge `.vibeops.json` `github = { enabled, mode: "gh-cli", owner, repo, remote, visibility, url }`. Flags (`--dry-run / --yes / --owner / --repo / --public / --private / --remote / --connect <owner/repo \| URL> / --no-package-update / --cwd`). `--dry-run` performs zero gh / git / file mutations and still prints the plan even without gh installed / authenticated (warn only). `--yes` runs non-interactively with defaults but **never** auto-invokes a TTY `gh auth login`. `parseGitHubRemote` parses 4 forms: ssh / https / `git+https` / `owner/repo` slug. `gh` child processes are invoked via `execFile` args array only (shell-injection blocked); tokens / Authorization headers are masked in output. Zero automatic `git push` — the user runs `git push -u <remote> <branch>` themselves. Zero `GITHUB_TOKEN` storage — auth is delegated to `gh auth`. |
| **Commands implemented (17)**     | `init`, `status`, `agent list / show / prompt`, `plan`, `task generate / start / prompt / check / done / rollback / pull`, `notion init / test / sync`, `github status / init` | All commands implemented. |
| **Template content (36 files)**   | `templates/**`                                    | AGENTS.md / 5 rules / 8 agents / 6 prompts / 4 workflows / 10 project docs / TASK-000 / logs README. All bodies are in English (placeholders / paths / section headings / VibeOps vocabulary preserved). `.vibeops/agents` · `.vibeops/prompts` · `.vibeops/workflows` (18 files) are 1:1 synced with templates. After sandbox `vibeops init --git --initial-commit`, the user workspace contains zero Korean characters. |

### Notion target resolver — current state (2026-05-11)

- `notion.projectsTargetId` / `notion.tasksTargetId` are the new preferred targets. The values must be Notion `data_source` ids on which the schema / properties are actually readable.
- Legacy `notion.projectsDatabaseId` / `notion.tasksDatabaseId` are kept as legacy / container fallback. In the page-child_database scan path, the child database block / container id is stored there.
- `vibeops notion init` API-first discovery flow:
  1. `/v1/search object=data_source`
  2. If empty, `/v1/search object=page`
  3. User selects a parent page
  4. `/v1/blocks/{page_id}/children` for `child_database` scan
  5. `retrieveDatabase(child_database.block.id)` → `database.data_sources[]`
  6. `retrieveDataSource(data_source.id)` → `properties` for schema hint
  7. Store the resolved data_source id as the targetId
- `notion test`, `notion sync`, and `task pull` resolve in targetId → databaseId order.

### Registered command tree

```
vibeops
├─ init [--dry-run] [--force] [--cwd <path>] [--name <projectName>]
│        [--git | --no-git] [--initial-commit | --no-initial-commit]
│        [--default-branch <name>] [--commit-message <message>]        ✓ implemented (TASK-014)
├─ status [--json] [--cwd <path>]                                      ✓ implemented
├─ plan [--idea <text>] [--from <path>] [--output <path>] [--non-interactive] [--cwd <path>]   ✓ implemented
├─ agent
│  ├─ list [--json] [--cwd <path>]                                     ✓ implemented
│  ├─ show <name> [--raw] [--cwd <path>]                               ✓ implemented
│  └─ prompt <name> <taskId> [--context <path...>] [--cwd <path>]      ✓ implemented
├─ task
│  ├─ generate [--from <path>] [--output <path>] [--count <n>]
│  │           [--phase <name>] [--scaffold] [--dry-run] [--cwd <p>]   ✓ implemented (TASK-007)
│  ├─ start <taskId> [--dry-run] [--allow-dirty] [--agent <name>]      ✓ implemented (TASK-008)
│  ├─ prompt <taskId> --agent <name>                                   ✓ implemented (delegates to agent-prompt)
│  ├─ check <taskId> [--strict] [--agent <name>]                       ✓ implemented (TASK-008)
│  ├─ done <taskId> [--dry-run] [--finalize]                           ✓ implemented (TASK-008)
│  ├─ rollback <taskId> [--confirm | --confirm-destructive]
│  │                     [--strategy <branch-delete|reset-base|revert-merge>]
│  │                     [--keep-branch] [--dry-run]                   ✓ implemented (TASK-009)
│  └─ pull [--dry-run] [--json] [--status <list>] [--limit <n>] [--cwd <p>] [--verbose]
│                                                                       ✓ implemented (TASK-011)
└─ notion
│  ├─ init [--dry-run] [--enable] [--projects-db <id>] [--tasks-db <id>]
│  │       [--non-interactive] [--cwd <path>]                          ✓ implemented (TASK-010)
│  ├─ test [--json] [--cwd <path>]                                     ✓ implemented (TASK-010)
│  └─ sync [--dry-run] [--json] [--only-tasks] [--only-project] [--cwd <p>]
│                                                                      ✓ implemented (TASK-011)
└─ github
   ├─ status [--json] [--cwd <path>]                                   ✓ implemented (TASK-013)
   └─ init [--dry-run] [--yes] [--owner <user>] [--repo <name>]
           [--public | --private] [--remote <name>]
           [--connect <owner/repo or url>] [--no-package-update]
           [--cwd <path>]                                              ✓ implemented (TASK-013)
```

### 8 agents (extended spec)

TASK-003 originally assumed 4 agents (planner/builder/reviewer/releaser), but the user requested an 8-agent lineup in this round.

| Agent          | Role                                                |
| -------------- | --------------------------------------------------- |
| `orchestrator` | Pick the next TASK; delegate to the right agent.    |
| `planner`      | Idea → `docs/project/{00,01,02,07}`.                |
| `architect`    | `docs/project/{03,04}` (architecture / tech stack). |
| `builder`      | Single-TASK code changes.                           |
| `reviewer`     | Diff vs Acceptance Criteria.                        |
| `tester`       | Run Test Plan → Test Result.                        |
| `docs`         | Update `05-current-state` / TASK Result / `docs/logs`. |
| `recovery`     | Rollback diagnostics (destructive operations only with `--confirm`). |

## What is still missing

- Actual npm publish (TASK-012 went only to dry-run).
- `plan --apply` · `task generate --apply` that automatically distributes a Planner Agent response into `docs/project/*` / `docs/tasks/*` (candidate for a separate TASK).
- vitest integration (TASK-001 ~ 011 acceptance-criteria smoke tests were replaced with manual sandbox sequences; polish-round candidate).
- ESLint / Prettier configuration.
- `--copy` option (`agent prompt --copy`) — follow-up TASK candidate.
- Final `vibeops task done <id> --finalize` to flip TASK-007 / 008 / 009 / 010 / 011 / 012 / 013 / 014 / 015 / 016 / 017 from Review to Done after human or Reviewer Agent sign-off.
- The original TASK-011 design that pulled only the Notion `Status` was narrowed in this round to Notion → `docs/tasks` **skeleton creation** (only for TASKs that do not yet exist, body placeholder only); frontmatter updates are excluded. Notion → frontmatter status / priority round-trip is a polish-round candidate.
- `vibeops github` REST API fallback (`GITHUB_TOKEN`) — this round only supports the `gh` CLI path. Headless / CI automation is a polish candidate.
- A flow where `vibeops github` also automates `git push` — explicitly not implemented. The user runs `git push` themselves.

## Next TASK

After human / Reviewer Agent review of TASK-007 ~ 017, mark only the necessary TASKs Done with `vibeops task done <id> --finalize`. Actual npm publish and actual GitHub repo creation / connection are gated on a separate release / human decision.

## Progress rules (short summary)

- One TASK at a time.
- Every mutating command supports `--dry-run` where possible.
- When implementation ends, update this document, the corresponding TASK file, and `docs/logs/YYYY-MM-DD.md` together.
