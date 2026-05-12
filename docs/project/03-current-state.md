# 03 — Current State

> 이 문서는 **사실만** 기록한다. 계획은 [05-backlog.md](05-backlog.md)에 둔다.

## 단계

- **현재 단계**: MVP 1~4 구현 + 패키지 마무리 + GitHub 연동 + Init Git bootstrap UX + Status output polish + Notion env template cleanup + **Public release polish** **Review 대기**.
  - MVP 1(Project Bootstrapper)은 TASK-002 / 003 / 004 / 005로 종료.
  - MVP 2 — **TASK-006 (`vibeops plan`)** 완료 + **TASK-007 (`vibeops task generate`) Review 대기**.
  - MVP 3 — **TASK-008 (`task start / prompt / check / done`)** + **TASK-009 (`task rollback`)** Review 대기.
  - MVP 4 — **TASK-010 (`notion init / notion test`) + TASK-011 (`notion sync` / `task pull`) Review 대기**.
  - Package polish — **TASK-012 (`README` / npm packaging / smoke / publish dry-run) Review 대기**.
  - GitHub 연동 — **TASK-013 (`vibeops github status / init`) Review 대기**.
  - Init Git bootstrap UX — **TASK-014 (`vibeops init --git` / unborn status) Review 대기**.
  - Status output polish — **TASK-015 (`vibeops status` Notion / GitHub / Package 섹션 정비) Review 대기**.
  - Notion env template cleanup — **TASK-016 (`.vibeops.env.example` / `08-env.md` / `notion-sync.md` 에서 legacy `NOTION_API_KEY` / `NOTION_PROJECT_DB` / `NOTION_TASK_DB` 제거) Review 대기**.
  - Public release polish — **TASK-017 (npm package name `@goodtekxyz/vibeops` + README/CHANGELOG 공개 톤 정리 + CLI 출력 영문 통일 + support contacts) Review 대기**.
- Status 흐름 `Planned → In Progress → Review → Done`, Git 상태는 TASK markdown의 `## Git Context` 섹션에 inline 기록.
- `vibeops init` / `status` / `agent {list, show, prompt}` / `plan` / `task {generate, start, prompt, check, done, rollback, pull}` / `notion {init, test, sync}` / `github {status, init}` 가 동작한다. `init` 은 선택적으로 Git 초기화 + 첫 커밋까지 수행할 수 있다.
- 남은 stub: 없음. 남은 일은 사람/Reviewer Agent 검토 후 finalize.

## 갖춰진 것

| 항목                           | 위치                                            | 비고                                                                 |
| ------------------------------ | ----------------------------------------------- | -------------------------------------------------------------------- |
| 제품 정의                      | `docs/project/00-overview.md` ~ `05-backlog.md` | 2026-05-11 업데이트                                                  |
| 운영 지침                      | `AGENTS.md`, `.cursor/rules/*.mdc`              | VibeOps 저장소 자신의 규칙                                           |
| TASK 목록                      | `docs/tasks/TASK-001 ~ TASK-017`                | TASK-001~006 done, **TASK-007~017 Review 대기**                       |
| 로그                           | `docs/logs/YYYY-MM-DD.md`                       | `2026-05-11.md` 항목 누적                                            |
| **CLI 패키지 골격**            | `package.json`, `tsconfig.json`, `.gitignore`, `LICENSE`, `CHANGELOG.md`, `scripts/smoke.mjs` | Node 20+, ESM, bin=`dist/cli.js`, `packageManager=pnpm@9.15.9`, MIT. **TASK-017** 로 `name = "@goodtekxyz/vibeops"`, `version = "0.2.0"`, `publishConfig.access = "public"` 추가. `files` 는 `dist`, `templates`, `README.md`, `LICENSE`, `CHANGELOG.md` 로 제한. scripts: `dev / build / typecheck / start / smoke / prepack / publish:dry`. `dist/` 는 gitignore, `prepack` 으로 생성해 npm package 에 포함. `pnpm pack`, `pnpm publish --dry-run --no-git-checks`, **`pnpm publish --dry-run --access public --no-git-checks`** 모두 통과 — package name `@goodtekxyz/vibeops`, total files 93, public access 명시. 실제 publish 는 미수행. |
| **CLI 진입점**                 | `src/cli.ts`, `src/version.ts`                  | commander v12 기반. **TASK-017** 로 모든 `description` / `option` 텍스트 영문 통일 + 내부 `(MVP 1)` / `(TASK-010)` / `(post-MVP 4)` 라벨 제거. CLI help / error / log 출력에서 한국어 글자 0건 (`task.ts` 의 legacy placeholder regex 만 backward compatibility 차원에서 유지). |
| **공통 유틸**                  | `src/lib/{config,filesystem,git,logger,paths,task,task-prompt,brief,prompt-builder,inquirer-helpers}.ts`, `src/types/{config,task,brief}.ts` | `task.ts` · `git.ts`는 MVP 3에서 라이프사이클 헬퍼로 대폭 확장. `task-prompt.ts`는 agent + TASK + project 컨텍스트 합성. |
| **Bootstrap 엔진**             | `src/bootstrap/{manifest,installer,substitute}.ts`, `src/commands/init.ts`, `src/lib/git.ts` | 템플릿 walk + idempotent 복사 + placeholder 치환. **TASK-014** 로 `vibeops init` 에 선택적 Git bootstrap 추가: interactive 에서 `Initialize Git repository?`, `Use main as default branch?`, `Create initial commit?`, `Initial commit message` 를 모두 `yesNoSelect`/input 으로 묻는다 (`confirm` 없음). flags: `--git / --no-git / --initial-commit / --no-initial-commit / --default-branch <name> / --commit-message <message>`. 새 repo 에서는 `git init` → unborn HEAD 를 `main` 으로 설정 → `git status --porcelain` 파일 수 표시 → `git add .` → `git commit -m ...`. 기존 Git repo 는 `git init` skip, 기존 커밋이 있으면 default branch 변경과 initial commit skip/warn. `--dry-run` Git mutation 0건. 자동 push / remote 변경 0건. **TASK-016** 로 `envExampleContents()` 가 `NOTION_TOKEN=` 한 줄 + Notion integration URL 안내 헤더만 출력 — legacy `NOTION_API_KEY` / `NOTION_PROJECT_DB` / `NOTION_TASK_DB` 라인 제거. `templates/docs/project/08-env.md`, `templates/.vibeops/workflows/notion-sync.md` (그리고 vibeops 자체 copy) 도 같이 정리. target ID 저장 위치(`.vibeops.json` `notion.{projectsTargetId,tasksTargetId}`) 를 본문에 명시. |
| **Status 수집·포맷**           | `src/status/{collector,format}.ts`, `src/lib/{git,notion-env,package-json,config}.ts`, `src/types/config.ts` | 사람/JSON 양쪽. `review` 카운트 포함. **TASK-014** 로 Git 상태가 `none / normal / unborn / detached` 를 구분한다. 최초 커밋 전에는 `branch main (unborn, no commits yet)`, `status dirty`, `hint create the first commit or run \`vibeops init --git --initial-commit\`` 를 표시한다. **TASK-015** 로 Notion 섹션이 `enabled / token / projects target / tasks target / hint` 5줄 구조로 재설계됨 — legacy `NOTION_API_KEY` / `NOTION_PROJECT_DB` / `NOTION_TASK_DB` 출력 제거, `getNotionTokenSource(cwd)` 가 `.vibeops.env` → `process.env` 순서로 token 존재 여부 + source 만 반환 (원문 출력 0건). GitHub 섹션 (`.vibeops.json` `github` 만 읽음, `gh` 자식 프로세스 0건) 와 Package 섹션 (`readPackageJson` 으로 `name / version / bin` 만 표시, `package.json` 없으면 `package.json missing` 1줄) 추가. JSON 에 `notion.{enabled, hasToken, tokenSource, hasProjectsTarget, hasTasksTarget}` / `github.{enabled, mode, owner, repo, remote, url}` / `package.{exists, name, version, bin}` 노출. status 는 Notion API / `gh` CLI 모두 호출하지 않는 로컬 전용 명령으로 명시. |
| **Agent 로더·프롬프트**        | `src/agent/{loader,prompt}.ts`                  | gray-matter 사용                                                     |
| **Plan 엔진**                  | `src/lib/brief.ts`, `src/lib/prompt-builder.ts`, `src/lib/inquirer-helpers.ts`, `src/types/brief.ts` | 20문항 대화형 + brief markdown + Cursor planning prompt. UX 라운드(2026-05-11): 선택지 다이어트, 기본 스택 `Next.js / NestJS / PostgreSQL / Drizzle / pnpm`, projectType 스마트 디폴트, select·checkbox에 `loop: false` + `pageSize: 8` |
| **Task Lifecycle 엔진**        | `src/commands/task-{start,check,done,rollback}.ts`, `src/lib/task.ts` (Git Context · Status 갱신 + `nextTaskNumber`/`highestTaskNumber`/`formatTaskId`), `src/lib/git.ts` (run/diff/log/branch/reset + porcelain 파서 + 6개 changed-files 헬퍼), `src/lib/task-prompt.ts` | TASK markdown의 `## Status` / `## Git Context` 섹션을 inline 갱신. Status 흐름 4단계(`Planned → In Progress → Review → Done`). 모든 명령에 `--dry-run` 또는 read-only. rollback은 2단계 confirm(`--confirm` 비파괴 / `--confirm-destructive` 파괴). `task check`는 working tree(unstaged+staged+untracked) ∪ committed를 Set-dedup으로 합산해 `working tree / committed / total` 3줄로 분해 표시(rename·untracked 인지). 자동 commit · 푸시 · Notion 호출 0건. |
| **Task Generation 엔진**       | `src/commands/task-generate.ts`, `src/lib/project-docs.ts`, `src/lib/task-generator.ts`, `src/lib/task-scaffold.ts` | 두 모드: (a) **prompt** — `docs/project/*` + brief + `--from <path>`를 합산해 `.vibeops/generated/task-generate-prompt.md` 생성. Planner Agent에게 18 섹션(Status / MVP Phase / Goal / Background / Scope / Out of Scope / Acceptance Criteria / Files to Inspect First / Expected Files to Change / Risks / Test Plan / Rollback Plan / **Git Context** / **Notion Page** / Implementation Plan / Result / Test Result / **Review Notes**)을 강제. (b) **scaffold** — `--scaffold --count N`으로 18 섹션 placeholder TASK 파일 N개를 다음 번호부터 생성(충돌 회피, 덮어쓰기 금지). 옵션: `--from / --output / --count / --phase / --scaffold / --dry-run / --cwd`. LLM·Cursor CLI·Notion·GitHub API·Git mutation 호출 0건. |
| **Notion 설정 + 검증 엔진**    | `src/commands/notion-{init,test}.ts`, `src/lib/notion-{env,schema,client,discovery,target}.ts`, `src/types/config.ts` (`NotionConfig`), `src/lib/config.ts` (`mergeNotionConfig`) | `notion init` 가 `.vibeops.json` 에 `notion.{ enabled, projectsDatabaseId, tasksDatabaseId }` 섹션을 안전 merge + `.vibeops.env.example` 에 `NOTION_TOKEN=` 한 줄 append (기존 키 보존). 사용자가 token 만 입력하면 **`POST /v1/search` 로 integration 에 공유된 database 목록을 자동 조회**해 Projects/Tasks DB 를 select prompt(추천 정렬 + `Enter manually` / `Skip` fallback)로 고르게 한다. **search filter 는 현재 Notion API 규약대로 `data_source` 로 송신** (`database` 는 영구 폐기), `validation_error` 시 `page` 로 1회 폴백 후 manual id 입력 안내. **data_source 결과가 0개일 때는 `page` search 로 후속 진행**해 "Select a page to scan for inline databases" prompt 를 띄우고, 사용자가 부모 page 를 고르면 `blocks.children.list(pageId)` 로 **1-depth 만, 최대 100 block 까지** 스캔해 inline `child_database` / `data_source` 블록을 후보로 정규화한다 (recursive scan 없음). 선택 직후 즉시 schema soft-validate. `notion test` 가 pre-flight + API 검증을 `ok / fail / skip` 로 보고. `--json` 지원. **`vibeops notion test --debug-shape` (TASK-011 follow-up #3)** 옵션이 두 DB 의 `databases.retrieve` 응답을 token-safe digest 로 출력 (`object / id / title? / has properties / data_sources count + field + per-DS line / top-level keys`). Projects DB 8 속성 + Tasks DB 10 속성 (`Name / Task ID / Project ID / Status / Priority / MVP Phase / Git Branch / Docs Path / Summary / Result Summary`) 강제. `Status` strict, `Git Repo` 만 `rich_text \| url` 둘 다 허용. **`src/lib/notion-target.ts` 의 `resolveNotionDataSourceTarget` 단일 entry point 가 `database → data_source` 해석을 책임진다 (TASK-011 follow-up #2)**: `dataSources.retrieve(id)` 먼저 → 실패 시 `databases.retrieve(id)` 의 `data_sources[]` 폴백 (snake_case + `dataSources` / `child_data_sources` / `childDataSources` + 중첩 `data_source.id` 까지 `extractDataSourcesFromDatabaseResponse` 가 흡수) → 그것도 실패하면 `{ reason: "no-data-source"\|"no-properties"\|"transport" }` + 영/한 친절 안내 + `--debug-shape` 권고 (follow-up #3). `notion init` / `notion test` / `notion sync` 가 모두 같은 resolver 만 경유 → 새 API (`2025-09-03`) 의 database/data_source 분리 / 권한 분리 케이스를 일관되게 진단. `notion test` schema 단계는 `retrieve → resolve → schema` 3 단으로 분해 표시. `NotionClient` 가 `dataSourcesRetrieve` (typed SDK → raw `client.request({ path: "data_sources/{id}" })` 폴백 → `null`), `probeDatabaseShape`, `summariseDatabaseShape`, `extractDataSourcesFromDatabaseResponse` export, ctor `logLevel: "error"` + `notionVersion: "2025-09-03"` 명시 pin. `@notionhq/client@5.20.0` lazy import + 5s timeout. **`NOTION_TOKEN` 평문 출력 0건 (debug-shape 도 필드 이름·카운트·data_source id+name 만 carry), Notion mutation 0건 (`search` + `users.me` + `databases.retrieve` + `dataSources.retrieve` + `blocks.children.list` 만).** |
| **Notion 동기화 엔진**         | `src/commands/{notion-sync,task-pull}.ts`, `src/lib/{notion-sync,task-pull,notion-mappers,task-summary,notion-schema}.ts`, `src/lib/notion-client.ts` 확장(`queryDataSource / createPageInDataSource / updatePage` + legacy `databasesQuery / pagesCreate / pagesUpdate`), `src/lib/git.ts` 확장(`gitRemoteUrl`) | **TASK-011**. `notion sync` 가 `docs/project/00-overview.md` · `docs/project/{05,03}-current-state.md` · `docs/tasks/*.md` 의 메타를 Projects DB 8속성 + Tasks DB 10속성으로 upsert (`Project ID` 키 / `Project ID + Task ID` 키). 본문은 절대 푸시하지 않음 — Summary / Result Summary 만 1500자 한도로 잘라 푸시. `--dry-run` / `--json` / `--only-tasks` / `--only-project` / `--cwd`. `task pull` 이 Notion `Status ∈ {Planned, Ready, …}` 행을 query 해 `docs/tasks/TASK-NNN-slug.md` skeleton 을 18 섹션 형태로 생성 + 빈 `Docs Path` 만 역방향 update (한 줄). 본문 덮어쓰기 금지, 기존 파일 덮어쓰기 금지. `--dry-run` / `--json` / `--status <list>` / `--limit <n>` / `--cwd`. **dry-run 에서 mutation 0건 — query 만**. **mutation/query 모두 Notion 2025-09-03 `data_source` surface 만 사용 (TASK-011 follow-up #5)**: `findExisting*` 가 `client.queryDataSource(schemas.{projects,tasks}.resolvedId, filter)` 로, `executeProjectUpsert` / `executeTaskUpsert` 가 `client.createPageInDataSource({ dataSourceId, properties })` + `client.updatePage({ pageId, properties })` 로 라우팅. `pages.create` 의 parent 는 `{ type: "data_source_id", data_source_id }`. legacy `parent.database_id` 폴백은 mutation 경로에서 제거 — schema 가 data_source 에서 검증된 뒤 mutation 이 container database 로 새는 케이스 차단. SDK 가 `client.dataSources.query` 를 노출하지 않으면 raw `POST /v1/data_sources/{id}/query`, `pages.create` 가 SDK validation 으로 거부되면 raw `POST /v1/pages` 로 1회 폴백 (둘 다 SDK 내장 `Authorization` / `Notion-Version` / `Content-Type` 그대로 사용). 4xx 응답에는 `action=create-page \| update-page, target=<resolved-data-source-id>, parent=data_source_id` 가 포함되고 404 일 때 `vibeops notion test --debug-shape` 힌트가 따라붙음. **`TASK-000-template.md` 는 `SYNC_EXCLUDED_TASK_IDS` 로 sync 대상에서 기본 제외** — `task generate` 가 복제하는 템플릿 파일이라 Notion row 가 생기면 안 됨. **`task pull` 결정 트리 정비 (TASK-011 follow-up #7)**: `planPull` 이 (a) duplicate Task ID 검출, (b) Notion `Docs Path` basename 이 Task ID 와 매칭되는지 (`docsPathMatchesTaskId`) 검사, (c) Docs Path 가 비어 있으면 `docs/tasks/` 디렉터리에서 `TASK-NNN-*.md` 직접 검색하는 순서로 row 별 결정. 새 skip reason `docs-path-mismatch` / `duplicate-task-id`, skip / entry 모두에 token-safe `detail`. `PullPlan.trace[]` 로 considered 한 모든 row 의 결정 사유 (taskId / pageId / notionDocsPath / localResolvedPath / decision / reason) 기록. `vibeops task pull --verbose` 옵션이 trace + entry detail 까지 보여 줌. mismatch 자동 rename 0건 — 사용자가 Notion 에서 직접 정정하도록 안내만. **Status property option 사전 검증 (TASK-011 follow-up #6)**: `PROJECTS_STATUS_REQUIRED_OPTIONS` (`Building / Planning / Paused / Done / Archived`) + `TASKS_STATUS_REQUIRED_OPTIONS` (`Planned / In Progress / Review / Done / Blocked`) 를 `validateDatabaseSchema` 가 `extractStatusOptionNames` 로 흡수한 Notion `status.options` / `status.groups[].options` / flat `options` shape 과 비교 → 누락 시 `status-options-missing` 위반, 못 읽으면 `status-options-unreadable` 위반. `notion test` 출력에 `missing` / `Add these options in Notion: …` / `found in Notion: …` 세 줄로 친절 안내. `notion sync` 도 schema 단계에서 `reason: schema-status-options` 로 fast-fail 해 partial mutation 차단. mutation 도중 발생한 `validation_error: Invalid (status\|select) option` 4xx 에도 `STATUS_OPTIONS_HINT` 자동 첨부. Notion DB schema mutation / option 자동 생성 0건. LLM / Cursor CLI / GitHub API / Webhook / DB 자동 생성 / page body block 갱신 / `NOTION_TOKEN` 평문 출력 0건. |
| **GitHub 연동 엔진**           | `src/commands/github-{status,init}.ts`, `src/lib/{github-cli,package-json}.ts`, `src/types/config.ts` (`GithubConfig` / `DEFAULT_GITHUB_CONFIG`), `src/lib/config.ts` (`mergeGithubConfig`) | **TASK-013**. `github status` 가 6 줄 (`gh installed / gh authenticated / git remote origin / config enabled / package repo`) 으로 read-only 진단. `github init` 이 interactive (`yesNoSelect` 기반 — `y/n` 타이핑 없음) flow 로 (A) gh 설치 (B) gh 인증 (C) 현재 remote 점검 (D) `gh repo create <owner>/<repo> --public\|--private --source=. --remote=origin` 으로 신규 repo 생성 (E) `git remote add origin <url>` 로 기존 repo 연결 (F) `package.json` `repository.url` / `homepage` / `bugs.url` 갱신 (G) `.vibeops.json` `github = { enabled, mode: "gh-cli", owner, repo, remote, visibility, url }` merge 작성을 순서대로 수행. flag 군 (`--dry-run / --yes / --owner / --repo / --public / --private / --remote / --connect <owner/repo \| URL> / --no-package-update / --cwd`). `--dry-run` 은 gh / git / 파일 mutation 0건이고 gh 미설치 / 미인증 상태에서도 plan 출력은 가능 (warn 만). `--yes` 는 비-interactive 기본값 진행이지만 `gh auth login` TTY 점유는 절대 자동 실행하지 않는다. `parseGitHubRemote` 가 ssh / https / `git+https` / `owner/repo` 슬러그 4 형식 파싱. `gh` child process 는 `execFile` 의 args 배열로만 호출 (shell injection 차단), 토큰/Authorization 헤더는 출력에서 마스킹. `git push` 자동 실행 0건 — push 는 사용자가 `git push -u <remote> <branch>` 로 직접. `GITHUB_TOKEN` 저장 0건 — 인증은 `gh auth` 가 담당. |
| **본체 구현된 명령 (17개)**    | `init`, `status`, `agent list / show / prompt`, `plan`, `task generate / start / prompt / check / done / rollback / pull`, `notion init / test / sync`, `github status / init` | 모든 명령 구현 완료 |
| **템플릿 콘텐츠 (36개)**       | `templates/**`                                  | AGENTS.md / 5 rules / 8 agents / 6 prompts / 4 workflows / 10 project docs / TASK-000 / logs README |

### Notion target resolver 최신 상태 (2026-05-11)

- `notion.projectsTargetId` / `notion.tasksTargetId` 가 새 preferred target 이다. 값은 실제 schema/properties 를 읽을 수 있는 Notion `data_source` id 여야 한다.
- 기존 `notion.projectsDatabaseId` / `notion.tasksDatabaseId` 는 legacy/container fallback 으로 유지한다. page child_database scan 경로에서는 child database block/container id가 여기에 보존된다.
- `vibeops notion init` 의 API-first discovery 흐름:
  1. `/v1/search object=data_source`
  2. 결과가 없으면 `/v1/search object=page`
  3. 사용자가 부모 page 선택
  4. `/v1/blocks/{page_id}/children` 에서 `child_database` scan
  5. `retrieveDatabase(child_database.block.id)` → `database.data_sources[]`
  6. `retrieveDataSource(data_source.id)` → `properties` 로 schema hint
  7. resolved data_source id를 targetId로 저장
- `notion test`, `notion sync`, `task pull` 은 targetId → databaseId 순서로 resolve한다.

### 등록된 명령 트리

```
vibeops
├─ init [--dry-run] [--force] [--cwd <path>] [--name <projectName>]
│        [--git | --no-git] [--initial-commit | --no-initial-commit]
│        [--default-branch <name>] [--commit-message <message>]        ✓ 구현 (TASK-014)
├─ status [--json] [--cwd <path>]                                      ✓ 구현
├─ plan [--idea <text>] [--from <path>] [--output <path>] [--non-interactive] [--cwd <path>]   ✓ 구현
├─ agent
│  ├─ list [--json] [--cwd <path>]                                     ✓ 구현
│  ├─ show <name> [--raw] [--cwd <path>]                               ✓ 구현
│  └─ prompt <name> <taskId> [--context <path...>] [--cwd <path>]      ✓ 구현
├─ task
│  ├─ generate [--from <path>] [--output <path>] [--count <n>]
│  │           [--phase <name>] [--scaffold] [--dry-run] [--cwd <p>]    ✓ 구현 (TASK-007)
│  ├─ start <taskId> [--dry-run] [--allow-dirty] [--agent <name>]      ✓ 구현 (TASK-008)
│  ├─ prompt <taskId> --agent <name>                                   ✓ 구현 (agent-prompt 위임)
│  ├─ check <taskId> [--strict] [--agent <name>]                       ✓ 구현 (TASK-008)
│  ├─ done <taskId> [--dry-run] [--finalize]                           ✓ 구현 (TASK-008)
│  ├─ rollback <taskId> [--confirm | --confirm-destructive]
│  │                     [--strategy <branch-delete|reset-base|revert-merge>]
│  │                     [--keep-branch] [--dry-run]                   ✓ 구현 (TASK-009)
│  └─ pull [--dry-run] [--json] [--status <list>] [--limit <n>] [--cwd <p>] [--verbose]
│                                                                       ✓ 구현 (TASK-011)
└─ notion
│  ├─ init [--dry-run] [--enable] [--projects-db <id>] [--tasks-db <id>]
│  │       [--non-interactive] [--cwd <path>]                          ✓ 구현 (TASK-010)
│  ├─ test [--json] [--cwd <path>]                                     ✓ 구현 (TASK-010)
│  └─ sync [--dry-run] [--json] [--only-tasks] [--only-project] [--cwd <p>]
│                                                                      ✓ 구현 (TASK-011)
└─ github
   ├─ status [--json] [--cwd <path>]                                   ✓ 구현 (TASK-013)
   └─ init [--dry-run] [--yes] [--owner <user>] [--repo <name>]
           [--public | --private] [--remote <name>]
           [--connect <owner/repo or url>] [--no-package-update]
           [--cwd <path>]                                              ✓ 구현 (TASK-013)
```

### 8개 에이전트 (확장 명세)

원래 TASK-003은 4개 에이전트(planner/builder/reviewer/releaser)를 가정했지만, 본 라운드 사용자 지시로 8개로 확장 채택했다.

| Agent          | 역할                                                |
| -------------- | --------------------------------------------------- |
| `orchestrator` | 다음 TASK 선택, 적절한 에이전트로 위임              |
| `planner`      | 아이디어 → `docs/project/{00,01,02,07}`             |
| `architect`    | `docs/project/{03,04}` (아키텍처·기술 스택)         |
| `builder`      | 단일 TASK 코드 변경                                 |
| `reviewer`     | diff vs Acceptance Criteria                        |
| `tester`       | Test Plan 실행 → Test Result                        |
| `docs`         | `05-current-state` / TASK Result / `docs/logs` 갱신 |
| `recovery`     | 롤백 진단(파괴적 작업은 `--confirm`)                |

## 아직 없는 것

- 실제 npm publish (TASK-012는 dry-run까지만 수행)
- Planner Agent 응답을 `docs/project/*` / `docs/tasks/*` 에 자동 분배하는 `plan --apply` · `task generate --apply` (별도 TASK 후보)
- vitest 통합 (TASK-001 ~ 011 AC 스모크는 임시 sandbox 수동 시퀀스로 대체. polish 라운드 통합 후보)
- ESLint / Prettier 설정
- `--copy` 옵션 (`agent prompt --copy`) — 후속 보강 TASK 후보
- TASK-007 / 008 / 009 / 010 / 011 / 012 / 013 / 014 Result/Test Result 본 라운드에서 작성 → 사람 또는 Reviewer Agent 검토 후 `vibeops task done <id> --finalize`로 Done 처리 필요
- `task pull` 이 Notion `Status` 만 풀백하던 원 TASK-011 설계는 본 라운드에 변경 — 사용자 갱신 요구는 Notion → docs/tasks **skeleton 생성**(존재하지 않는 TASK 만, 본문 placeholder)으로 좁히고 frontmatter 갱신은 제외. Notion → frontmatter status/priority 양방향 정합은 polish 라운드 후보.
- `vibeops github` REST API fallback (`GITHUB_TOKEN`) — 이번 라운드는 `gh` CLI 단일 경로. headless / CI 자동화는 polish 후보.
- `vibeops github` 가 `git push` 까지 자동화하는 흐름 — 명시적으로 미구현. 사용자가 직접 push 한다.

## 다음 TASK

사람/Reviewer Agent가 TASK-007~014 Review 결과를 확인한 뒤 필요한 TASK만 `vibeops task done <id> --finalize`로 Done 처리한다. 실제 npm publish 및 실제 GitHub repo 생성/연결은 별도 릴리스/사람 결정 후 수행한다.

## 진행 규칙 (간단 요약)

- 한 번에 **한 TASK**만 진행한다.
- 모든 변경 명령은 가능한 `--dry-run`을 갖는다.
- 구현이 끝나면 이 문서, 해당 TASK 파일, `docs/logs/YYYY-MM-DD.md`를 함께 갱신한다.
