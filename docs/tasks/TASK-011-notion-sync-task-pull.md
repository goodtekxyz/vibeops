# TASK-011 · `notion sync` and `task pull`

## Status

Review

## MVP Phase

MVP 4 · Notion Dashboard Sync

## Git Context

(시작 시 `vibeops task start TASK-011`이 채움 — 본 라운드는 Reviewer 검토 후 finalize 예정)

## Goal

Notion을 **human dashboard**로 사용하는 동기화를 구현한다.

- `vibeops notion sync` — `docs/tasks/*.md`와 `docs/project/03-current-state.md`의 **메타**(요약·상태·우선순위·브랜치·docs path·결과 요약)를 Notion Task/Project DB에 푸시한다.
- `vibeops task pull` — Notion에서 TASK 메타(주로 우선순위·상태)를 가져와 `docs/tasks/*.md`의 frontmatter에 정합한다.

상세 본문(Scope, Acceptance Criteria 등)은 어떤 방향으로도 동기화하지 않는다.

## Background

VibeOps의 진실 공급원은 Git이고, Notion은 보는 곳이다. 그래서 sync는 **요약/메타만** 양방향으로 다루고, 상세는 항상 docs/tasks에서 본다는 비대칭을 유지한다.

## Scope

### `vibeops notion sync`

- 입력: 현재 디렉터리의 `docs/tasks/*.md` 전부 + `docs/project/03-current-state.md`.
- 매핑(Task DB):

  | docs/tasks 필드            | Notion 속성                     |
  | -------------------------- | ------------------------------- |
  | frontmatter `id`           | `TaskId`                        |
  | frontmatter `title`/H1     | `Name`                          |
  | frontmatter `status`       | `Status` (planned/in_progress/done) |
  | frontmatter `priority`     | `Priority`                      |
  | `.vibeops/state/.../taskBranch` | `Branch`                   |
  | 파일 경로(`docs/tasks/...`) | `DocsPath`                     |
  | TASK 본문 “Result” 첫 N자  | `ResultSummary`                 |

- 매핑(Project DB, MVP에서는 단일 프로젝트 단일 row):

  | docs/project 필드                          | Notion 속성              |
  | ------------------------------------------ | ------------------------ |
  | `.vibeops.json` `name`                     | `Name`                   |
  | `03-current-state.md` 의 “단계” 요약 N자   | `CurrentStateSummary`    |
  | `03-current-state.md` 의 “다음 TASK”       | `NextTaskId`             |

- 옵션: `--dry-run`(어떤 row가 생성/갱신될지 표시, 호출 X), `--only-tasks`, `--only-project`.
- 멱등: 같은 `TaskId`가 Notion에 있으면 update, 없으면 create. 삭제는 하지 않는다.

### `vibeops task pull`

- Notion Task DB의 각 row에서 `TaskId`, `Status`, `Priority`를 읽어 `docs/tasks/TASK-NNN-*.md`의 frontmatter를 갱신.
- 본문은 절대 건드리지 않는다.
- 매핑 외 속성은 무시.
- 옵션: `--dry-run`(어떤 파일이 어떻게 바뀔지 diff 요약), `--fields status,priority`(기본은 둘 다).

## Out of Scope

- 상세 본문 동기화
- 실시간/Webhook
- 새 TASK를 Notion에서 만들고 docs로 끌어오는 흐름(`task generate`의 영역)
- Notion 페이지 안 child block 동기화

## Acceptance Criteria

1. `vibeops notion sync`가 다음을 모두 수행한다.
   - 각 `docs/tasks/TASK-NNN-*.md`에 대해 Notion Task DB row를 upsert.
   - `docs/project/03-current-state.md`에서 추출한 요약을 Notion Project DB row에 upsert.
   - Notion 속성 중 매핑 외 속성은 건드리지 않는다.
2. `vibeops notion sync --dry-run`이 “create N rows, update M rows”와 미리보기 표를 출력하고 실제 API 호출 0회(또는 read-only 호출만).
3. `vibeops task pull`이 Notion의 `Status`/`Priority`를 `docs/tasks/*.md`의 frontmatter에 반영한다. 본문은 byte 단위로 동일하게 보존된다.
4. `vibeops task pull --dry-run`은 어떤 파일이 바뀔지 표시하고 실제 변경 0건.
5. 둘 다 멱등하다(연속 두 번 실행해도 두 번째는 “no changes”).
6. `.vibeops.env`가 비어 있거나 `notion test`가 실패하는 환경에서는 두 명령이 즉시 명확한 오류로 종료한다(부분 sync 금지).

## Files to Inspect First

- `src/notion/client.ts`, `src/notion/schema.ts` (TASK-010)
- `src/tasks/scanner.ts`, `src/tasks/schema.ts`
- `src/lifecycle/state.ts` (taskBranch 읽기)
- 본 저장소 `docs/project/04-decisions.md` § D-010

## Expected Files to Change

- 신규: `src/commands/notion/sync.ts`, `src/commands/task/pull.ts`
- 신규: `src/notion/mapper.ts` (docs ↔ Notion 매핑)
- 신규: `src/notion/upsert.ts`
- 신규: `tests/notion-sync.test.ts`, `tests/task-pull.test.ts`
- 갱신: 본 TASK Result/Test Result, `docs/project/03-current-state.md`, `docs/logs/YYYY-MM-DD.md`

## Risks

- 매핑이 docs schema에 강하게 결합 → 매핑 정의를 한 곳에 모아 schema 변경 시 한 파일만 보면 된다.
- 사용자가 Notion 측에서 본문을 길게 적어 두었는데 sync가 그걸 덮어쓸 위험 → **본문은 절대 쓰지 않는다**. 메타 속성만 update.
- Rate limit (Notion 3 req/s) — 작은 sleep 또는 배치.

## Test Plan

- vitest로 Notion 클라이언트 mock + 가짜 docs fixture로:
  - 새 TASK 3개 → sync 시 create 3, update 0
  - 한 TASK의 status 변경 → 두 번째 sync 시 update 1
  - `--dry-run` 시 mock 호출 횟수 0(또는 read-only만)
  - `task pull`이 Notion mock 응답에 따라 frontmatter만 변경, 본문 byte 보존 검증
- 수동: 작은 실제 Notion DB에서 sync → pull 왕복.

## Rollback Plan

- 코드 변경은 브랜치 폐기로 되돌리기.
- Notion 측 잘못된 데이터는 사용자가 직접 정리(또는 다음 sync로 덮어쓰기).
- docs 측은 `git restore`로 복원.

## Implementation Plan

1. `notion/mapper.ts`에 docs ↔ Notion 양방향 매핑 정의.
2. `notion/upsert.ts`에 “TaskId 기준 find or create” 로직.
3. `commands/notion/sync.ts`에서 mapper + upsert + `--dry-run`.
4. `commands/task/pull.ts`에서 read-only query → frontmatter만 갱신.
5. 멱등성 보장: update 직전 “diff가 0이면 skip”.
6. tests + 문서 갱신.

## Result

> 본 라운드는 사용자 갱신 요구를 따라 구현했다. 원 TASK-011 정의와 비교한 deviation 을 먼저 명시한다.

### 원 TASK-011 정의 대비 변경 사항 (deviation)

- 매핑(Tasks DB): 원 문서는 `TaskId / Name / Status / Priority / Branch / DocsPath / ResultSummary` 7 속성. 실제 구현은 사용자 갱신 요구의 **10 속성**(`Name / Task ID / Project ID / Status / Priority / MVP Phase / Git Branch / Docs Path / Summary / Result Summary`). `Status` 는 strict `status` 타입 — select 아님.
- 매핑(Projects DB): 원 문서는 `Name / CurrentStateSummary / NextTaskId` 3 속성. 실제 구현은 사용자 갱신 요구의 **8 속성**(`Name / Project ID / Status / Local Path / Git Repo / Current Phase / Docs Path / Summary`). `Git Repo` 만 `rich_text | url` 둘 다 허용 (schema-driven, TASK-010 helper 재사용).
- `task pull` 의 역할: 원 문서는 `Status` / `Priority` 를 docs frontmatter 에 풀백. 실제 구현은 **로컬에 없는 TASK 의 skeleton 파일 생성**으로 좁힘. frontmatter status/priority 양방향 정합은 polish 라운드 후보로 분리. 본문은 절대 건드리지 않는다는 원칙은 그대로 유지.
- 옵션:
  - `notion sync`: 원 문서의 `--dry-run / --only-tasks / --only-project` 유지 + 사용자 갱신 요구의 `--json / --cwd` 추가.
  - `task pull`: 원 문서의 `--dry-run / --fields` 대신 사용자 갱신 요구의 `--dry-run / --json / --status <list> / --limit <n> / --cwd`. `--fields` 는 frontmatter 풀백 기능 자체가 빠지면서 자동 제거.
- Project ID 의 의미: `.vibeops.json` 에 별도 `projectId` 필드가 없어 `config.name` 을 그대로 `Project ID` 로 쓴다. 사용자가 Notion 안에서 다른 ID 를 매기고 싶다면 본 라운드 이후 polish 라운드에서 `vibeops.json.projectId` 필드 분리.

### 구현된 명령

- **`vibeops notion sync`** — `docs/project/00-overview.md` + `docs/project/{05,03}-current-state.md` + `docs/tasks/*.md` 의 메타를 Projects/Tasks DB 에 upsert.
  - 옵션: `--dry-run` (Notion mutation 0건, query 만), `--json`, `--only-tasks`, `--only-project`, `--cwd <path>`.
  - 매칭: Project 는 `Project ID == config.name` 동등 filter, Task 는 `Task ID == TASK-NNN AND Project ID == config.name` AND-filter.
  - 본문은 푸시하지 않음 — Summary / Result Summary 만 1500자 한도 truncate. Notion 안에서 사람이 쓴 page body 는 보존.
  - `Result` 섹션의 placeholder (`(미수행)` 등) 는 `Result Summary` 에 들어가지 않도록 자동 필터.
- **`vibeops task pull`** — Notion Tasks DB 에서 `Project ID == config.name AND Status ∈ {Planned}` (또는 `--status` 로 지정) 인 행을 query → 로컬에 없는 TASK 만 skeleton 으로 생성.
  - 옵션: `--dry-run` (파일 / Notion 변경 0건), `--json`, `--status <list>` (콤마 구분, 기본 `Planned`), `--limit <number>` (기본 20, 최대 100), `--cwd <path>`.
  - `Task ID` 가 비어 있으면 로컬 `highestTaskNumber + 1` 부터 자동 할당.
  - 생성된 파일은 18-섹션 skeleton (TASK-007 의 scaffold 와 동일 골격) + `## Notion Page` 섹션에 `Page ID` / `Docs Path` 기록.
  - 빈 `Docs Path` 만 역방향 update (한 줄). 다른 Notion 속성은 절대 건드리지 않는다.
  - 기존 로컬 파일 덮어쓰기 0건 — `pathExists` 충돌 시 skip.

### Notion API 사용 표면 (read-only / mutation 분리)

| 호출                         | dry-run | sync (real) | pull (real) | 용도                       |
| ---------------------------- | :-----: | :---------: | :---------: | -------------------------- |
| `users.me()`                 |   ―     |    ―        |    ―        | 본 라운드에서는 호출 안 함 (TASK-010 `notion test` 가 따로 검증) |
| `databases.retrieve(id)`     |   ✓     |    ✓        |    ✓        | 스키마 검증 + `Git Repo` 타입 감지 (8 + 10 속성 검증, 미달 시 abort) |
| `databases.query(id)`        |   ✓     |    ✓        |    ✓        | 기존 page 매칭 (sync) / 후보 TASK 조회 (pull) |
| `pages.create(...)`          |   ✗     |    ✓        |    ―        | 새 Project / Task row 만들 때만 |
| `pages.update(...)`          |   ✗     |    ✓        |    ✓        | 기존 Project / Task row (sync), 빈 `Docs Path` 한 줄 (pull) |

`--dry-run` 경로에서는 `pages.create` / `pages.update` 호출 자체가 도달하지 않도록 `notionSyncCommand` / `taskPullCommand` 의 흐름 분기에서 일찍 return.

### 새 / 갱신된 파일

- 신규 `src/lib/notion-mappers.ts` — Notion property 빌더 (`titleProperty / richTextProperty / urlProperty / selectProperty / statusProperty / gitRepoProperty`), status 양방향 매핑 (`mapTaskStatusToNotion / mapNotionStatusNameToTask`), Notion 응답 reader (`readTitle / readRichText / readStatus / readSelect / readUrlOrRichText`), filter 빌더 (`richTextEqualsFilter / statusEqualsFilter / andFilter`), 1500자 `truncate`. 모두 순수 함수 — 네트워크 없이 unit-test 가능.
- 신규 `src/lib/task-summary.ts` — TASK 본문에서 Goal / Background / Result 섹션 요약 추출, `(미수행) / (미정)` placeholder 자동 필터, `summarizeMarkdownLead`(00-overview 첫 단락 추출), `detectCurrentPhase`(현재 단계 “MVP N” 패턴 추론), `## Notion Page` 섹션 read / upsert (`upsertNotionPageSection / readNotionPageId / writeNotionPageSection`), `task pull` 용 18-섹션 skeleton 렌더 (`renderPulledTaskMarkdown`).
- 신규 `src/lib/notion-sync.ts` — `loadSyncContext` (pre-flight: config / notion.enabled / DB id / NOTION_TOKEN / 프로젝트 정보), `fetchSchemas` (8 + 10 속성 검증 + Git Repo 타입 감지), `buildProjectProperties` / `buildTaskRow` (순수 mapper), `planSync` (`detectExisting=true` 시 query 로 verb=`create|update` 결정), `executeProjectUpsert` / `executeTaskUpsert` (mutation surface).
- 신규 `src/lib/task-pull.ts` — `planPull` (status filter + `Project ID` filter + limit, `highestTaskNumber + 1` 로 ID 자동 할당, 충돌 검사로 skip), `executePullEntry` (skeleton 파일 write + 빈 `Docs Path` 한 줄 update).
- 신규 `src/commands/notion-sync.ts` — wire-up + 친절한 에러 코드 매핑 (`unauthorized / restricted_resource / object_not_found / validation_error / rate_limited / request_timeout`) + `--json` 직렬화.
- 신규 `src/commands/task-pull.ts` — 동일한 에러 매핑 + `considered / new / skipped` 카운트 표시.
- 갱신 `src/lib/notion-client.ts` — `databasesQuery / pagesCreate / pagesUpdate` 메서드 추가 (`@notionhq/client` lazy import 와 5s timeout 은 그대로 유지). `NotionClient` 인터페이스에 `NotionPageRef` / `NotionQueryResult` 도입.
- 갱신 `src/lib/git.ts` — `gitRemoteUrl(cwd, name='origin')` 추가 (read-only · `git remote get-url`).
- 갱신 `src/cli.ts` — `vibeops notion sync` / `vibeops task pull` 의 옵션 wire-up + 한국어 description.
- 갱신 `README.md` — “Notion sync / task pull” 섹션, 사전 준비 단계, 보안 정책, 명령어 요약 표.
- 갱신 `docs/project/03-current-state.md` — 단계 / 명령 트리 / “아직 없는 것” / 다음 TASK.
- 갱신 `docs/tasks/TASK-011-notion-sync-task-pull.md` (본 파일) — Status `Review` + Result / Test Result.
- 갱신 `docs/logs/2026-05-11.md` — TASK-011 항목 추가.

### 안전장치 (보안 / 정책 재확인)

- **`NOTION_TOKEN` 원본 값은 stdout 에 절대 노출하지 않는다.** `notion sync` / `task pull` 의 헤더에는 `maskToken()` (`first4…last4 (len=N)`) 만 표시. JSON 출력에도 원본 토큰 없음. 실 검증: 페이크 토큰 `secret_aBcDeF1234567890zzzzzzzzzzzzzzzzz` 으로 dry-run · `--json` 실행 후 `grep -F` → 0 hit.
- **Notion API 는 read-only + property-only mutation.** page body block 작성 / DB 생성 / DB 스키마 변경 / archive 호출 0건.
- **`--dry-run` 은 진짜 read-only.** `pages.create` / `pages.update` 의 호출 라인 자체가 dry-run 분기 이후에 있어 도달 불가.
- **기존 로컬 TASK 덮어쓰기 0건.** `task pull` 은 `pathExists(absPath)` 충돌이면 즉시 skip 으로 분기.
- **5s timeout.** `@notionhq/client` 의 `timeoutMs` 옵션을 그대로 사용 — Notion 장애 시 명령이 매달리지 않는다.
- 본 라운드 LLM API / Cursor CLI / GitHub API / Webhook / DB 자동 생성 / Git mutation 호출 0건.

## Test Result

> 모든 테스트는 본 저장소에서 빌드된 `dist/cli.js` 를 임시 sandbox(`/tmp/vibeops-sandbox-task011`) 에서 직접 실행한 결과다. 실제 Notion 토큰이 없는 환경이라 라이브 API 호출은 dummy token + 5s timeout 으로 대체했다 (마지막 “friendly-failure”).

### 정적 검증

| 검사                         | 결과 |
| ---------------------------- | :--: |
| `pnpm typecheck` (tsc --noEmit) | ✓   |
| `pnpm build`                    | ✓   |
| `ReadLints` (9 신규/갱신 파일) | ✓ 0 warnings |

### 명령 표면 검증

- `node dist/cli.js notion sync --help` → 4 옵션 (`--dry-run / --json / --only-tasks / --only-project / --cwd`) 정확 노출.
- `node dist/cli.js task pull --help` → 5 옵션 (`--dry-run / --json / --status / --limit / --cwd`) 정확 노출.

### Pre-flight 친절한 에러 메시지

각 단계에서 명령이 즉시 중단 + 정확한 reason 코드 + 한국어 가이드를 출력한다.

| 시나리오                                                | sync 결과                                  | pull 결과                                  |
| ------------------------------------------------------- | ------------------------------------------ | ------------------------------------------ |
| `.vibeops.json` 없음                                    | `no-config` · “`vibeops init` 먼저”        | 동일                                      |
| `notion.enabled = false`                                | `notion-not-enabled`                       | 동일                                      |
| `notion.projectsDatabaseId` 비어 있음                   | `no-projects-db`                           | 동일                                      |
| `notion.tasksDatabaseId` 비어 있음                      | `no-tasks-db`                              | 동일                                      |
| `NOTION_TOKEN` 없음 (`.vibeops.env` / `process.env`)    | `no-token`                                 | 동일                                      |
| dummy token (`secret_a…zz`) + 페이크 DB id (`1111…`)    | `projects-retrieve` · 5s `request_timeout` | (동일 경로 — 같은 schema 검증 단계 공유) |

### 마스킹 / 토큰 누출 검사

- dummy token `secret_aBcDeF1234567890zzzzzzzzzzzzzzzzz` 로 sync 시도:
  - 사람 출력: `token secr…zzzz (len=40)`
  - JSON 출력 (`--json`): `"tokenMasked": "secr…zzzz (len=40)"`
  - stdout · stderr 양쪽에 `grep -F "secret_aBcDeF1234567890zzzzzzzzzzzzzzzzz"` → 0 hit.

### Mapper / planner unit 검증 (node 직접 호출, mock client)

- `truncate('a'.repeat(20), 5)` → `"aaaa…"` (정확히 limit-1 자 + 1 ellipsis).
- `richTextProperty('')` → `{"rich_text":[]}` / `urlProperty('')` → `{"url":null}` / `statusProperty('')` → `{"status":null}` (Notion API 가 비울 때 요구하는 모양).
- `gitRepoProperty('git@x', 'url')` → `{"url":"git@x"}`, `'rich_text'` → `{"rich_text":[…]}` (schema-driven 분기 정확).
- `mapTaskStatusToNotion`: planned/in_progress/review/done/blocked → `Planned / In Progress / Review / Done / Blocked` 모두 일치.
- `mapNotionStatusNameToTask`: `Planned → planned` / `In Progress → in_progress` / `Ready → planned` / `Done → done` / `Mystery → planned`.
- `richTextEqualsFilter` / `statusEqualsFilter` / `andFilter` 가 정확히 Notion API 모양 (`{"and":[{...rich_text:{equals:…}},{...status:{equals:…}}]}`).
- `summarizeGoal` 이 `(미수행)` placeholder 를 0 자로 필터링, `summarizeMarkdownLead` 가 “First paragraph here.” 만 추출, `detectCurrentPhase('Status: MVP 4 · Notion Sync')` → `"MVP 4 · Notion Sync"`.
- `upsertNotionPageSection` 이 기존 `## Notion Page` 섹션을 정확히 갈아 끼우고 `readNotionPageId` 가 그 값을 다시 읽음 (`page_abc`).

### `buildProjectProperties` / `buildTaskRow` 출력 검증 (실제 sandbox 사용)

`vibeops init --name task011-demo` + `vibeops task generate --scaffold --count 2 --phase 'MVP 4'` 후 `loadSyncContext` 호출:

- Projects properties (rich_text 변형): 8 키 모두 존재, `Git Repo: { rich_text: [] }`, `Status: { status: { name: 'Building' } }`, `Current Phase: { select: { name: 'MVP' } }` (sandbox 의 `03-current-state.md` 가 비어 있으므로 fallback).
- Projects properties (url 변형): `Git Repo: { url: null }`.
- Task properties (TASK-000 template 기준): 10 키 모두 존재, `Status: { status: { name: 'Planned' } }`, `Priority: { select: { name: 'P2' } }` (`priority` 누락 시 기본값), `Result Summary: { rich_text: [] }` (Result 섹션이 placeholder 라 자동 비움), `Project ID == 'task011-demo'`.

### `planPull` mock-client 시나리오

mock `databasesQuery` 가 2 행을 돌려준다 — 첫 행 `Task ID=TASK-001 / Status=Planned`, 둘째 행 `Task ID=empty / Status=Ready`. 본 라운드는 `--status Planned,Ready` 로 호출 + sandbox 에는 이미 `TASK-001/002` skeleton 이 존재:

- 결과 entries:
  - `TASK-001 · 'Existing task' · Planned · docs/tasks/TASK-001-existing-task.md` (다른 슬러그라 충돌 아님 — 새 파일로 plan, `notionNeedsDocsPath=true`).
  - `TASK-003 · 'New from Notion' · Ready · docs/tasks/TASK-003-new-from-notion.md` (empty `Task ID` → `highestTaskNumber()+1 = 3`).
- mock 의 `pagesCreate` / `pagesUpdate` 는 호출되지 않음 (planning 단계 + dry-run 보장). 양쪽 모두 `Error('mutation should not run in dry-run')` 으로 fail-safe 설치돼 있었지만 도달 안 함.

### Skip된 항목 (의도)

- 실제 Notion 토큰이 없는 환경이라 `pages.create` / `pages.update` 라이브 호출은 본 라운드에서 검증하지 않음. dry-run + mock + unit 검증으로 covered. polish 라운드에서 실 토큰으로 sync→pull 왕복 시나리오를 vitest 통합 시 추가하기를 권장.
- frontmatter `Status` / `Priority` 양방향 정합(원 TASK-011 문서의 `task pull --fields`)은 본 라운드 범위에서 제외 — Result · deviation 절 참고.

---

## Result — Schema validation TypeError 버그 수정 (2026-05-11 follow-up #1)

### 배경 (재현 가능한 에러)

`pnpm dev notion sync --dry-run` 실행 중 다음과 같이 죽었다.

```
TypeError: Cannot read properties of undefined (reading 'Name')
  at validateDatabaseSchema (src/lib/notion-schema.ts)
```

원인: `databases.retrieve(id)` 응답에 `properties` 가 없는 케이스에서 `validateDatabaseSchema` 가 `inputs.properties[req.name]` 를 그대로 읽어 런타임 크래시를 냈다. Notion API 가 `properties` 를 비워서 돌려주는 케이스는 실제로 존재한다 — integration 이 부모 page 에는 접근하지만 DB 자체의 connection 권한이 없는 경우, 또는 사용자가 page id 를 DB id 로 잘못 입력한 경우.

### 결정

- **`validateDatabaseSchema` 시그니처를 B안으로 통일**: `validateDatabaseSchema({ db, required, retrieveResponse })`. 호출부 (`notion-sync` / `notion-test`) 모두 raw retrieve response 를 그대로 넘긴다. 호출부에서 `.properties` 를 꺼내는 보일러플레이트 제거.
- **`getNotionProperties(input)` helper export**. `undefined / null / {} / { properties: undefined } / database retrieve / data_source retrieve / bare properties map` 7 케이스 안전 처리. 인식할 수 없으면 `null` 반환.
- **`readNotionObjectKind(input)` helper export**. retrieve 응답의 `object` 필드 (`database` / `data_source`) 를 안전 추출. diagnostic 표시용. token 은 절대 출력하지 않는다.
- **`SchemaViolation.kind` 에 `"missing-properties"` 추가**. `properties` 가 인식 안 되면 `validateDatabaseSchema` 가 throw 하지 않고 ONE `missing-properties` violation 을 emit. `property = "(properties)"`, `description = MISSING_PROPERTIES_HINT` 친절한 영/한 메시지.
- **`MISSING_PROPERTIES_HINT` 상수 export**. CLI 와 docs 가 같은 문구를 공유. 사용자 요구사항 4-bullet 그대로 영어 + 한국어 한 줄 추가.
- **`SchemaReport` 확장**: `objectKind`, `id`, `propertiesMissing` 필드 추가. `properties` 는 `Record<string, unknown>` 로 단순화 (없으면 `{}`).
- **`notion sync` 출력에 schema diagnostic 한 줄씩 노출**: `projects DB  id=…  object=database  ok|missing-properties|N violations`. token 노출 0건.
- **`notion sync` 의 schema 분기**가 `propertiesMissing` 일 때 `reason = "schema-missing-properties"` + `MISSING_PROPERTIES_HINT` 메시지 사용. 그 외는 기존 `reason = "schema"`.
- **`notion test` 도 동일 helper 경유**: 기존에 `(check as ...).properties as Record<…>` 캐스팅으로 `properties` 만 뽑아 전달하던 패턴을 폐기. 이제 `retrieveResponse: unknown` 으로 raw 응답을 그대로 전달. 두 명령이 한 경로를 공유하므로 같은 버그가 다시 두 곳에 나뉘어 생길 수 없다.
- **dry-run 정책 유지**: `notion sync --dry-run` 은 `databases.retrieve` / `databases.query` 만 호출, `pages.create` / `pages.update` 호출 0건. schema 단계 실패 시에도 mutation 분기 자체에 진입하지 않는다.

### 변경 파일

- `src/lib/notion-schema.ts` — `getNotionProperties` / `readNotionObjectKind` / `MISSING_PROPERTIES_HINT` 추가, `SchemaViolation.kind` union 확장, `validateDatabaseSchema` 시그니처를 `retrieveResponse: unknown` 으로 변경. `missing-properties` violation emit.
- `src/lib/notion-sync.ts` — `reportFromRetrieve` 가 `unknown` 입력 안전 처리, fallback id, `SchemaReport` 확장 (`objectKind / id / propertiesMissing`), `fetchSchemas` 가 `unknown` 그대로 전달.
- `src/commands/notion-sync.ts` — `MISSING_PROPERTIES_HINT` import, `report.schemas` diagnostic 채워서 stdout/JSON 양쪽에 노출, `reason = "schema-missing-properties"` 분기 추가, finalize 출력에 missing-properties 친절 안내.
- `src/commands/notion-test.ts` — `runCheck` 가 `retrieveResponse: unknown` 을 carry, 새 helper `pushSchemaCheck(report, retrieve, kind)` 로 schema 검사 일원화, 기존 두 곳의 schema 처리 코드 제거.

### 보안

- token 출력 0건. retrieve 응답 자체에서 token 이 reflect 되지 않는다 (Notion API 가 echo 하지 않음). 모든 에러 메시지는 `notionApiError` → `explainNotionError` 경유.
- dry-run 에서 mutation API (`pages.create` / `pages.update`) 호출 0건.

## Test Result — Schema validation TypeError 버그 수정

### 정적 검증

- `pnpm typecheck` ✅ exit 0.
- `pnpm build` ✅ exit 0.
- `ReadLints (notion-schema.ts / notion-sync.ts / notion-sync command / notion-test command)` → 0 warnings.

### Unit (mock client, `dist/lib` 직접 호출) — 15 + 13 시나리오 = 28 assertion, 모두 PASS

`validateDatabaseSchema` defensiveness (`/tmp/vibeops-schema-smoke.mjs`):

1. `undefined` → `missing-properties` violation 1건.
2. `null` → `missing-properties`.
3. `{}` (빈 객체) → `missing-properties`.
4. `{ properties: undefined }` → `missing-properties`.
5. `databases.retrieve()` 정상 응답 → 0 violations.
6. `data_source` retrieve 정상 응답 → 0 violations (동일 처리).
7. bare properties map → 0 violations.
8. `Status: { type: "select" }` (잘못된 타입) → `type-mismatch` 1건.
9. `Summary` 누락 → `missing` 1건.
10-14. `getNotionProperties` 변형 5 케이스 모두 예상값 일치.
15. `readNotionObjectKind` 3 케이스 (database / 빈 / null).

`fetchSchemas` end-to-end (`/tmp/vibeops-sync-smoke.mjs`):

16. 양쪽 retrieve 응답 모두 `properties` 없음 → `ok:true` 반환, `projects.propertiesMissing=true`, `violations[0].kind=missing-properties`. **TypeError 없음.**
17. retrieve `id` 가 그대로 `schemas.projects.id` 로 carry.
18. `objectKind = "data_source"` 로 안전 추출.
19. `gitRepoType = ""` (properties 없으니 빈 값).
20-22. 양쪽 retrieve 정상 응답 → `ok:true`, 0 violations, `Git Repo` 타입 `url` 정확히 감지.
23-25. retrieve 자체가 throw → `ok:false`, `reason=projects-retrieve`, `error.code=object_not_found` 그대로 전달.

### Live CLI 회기 (실 토큰 보유 환경)

`vibeops notion sync --dry-run --json` (사용자가 보고한 정확한 명령):

- `phase: "schema"`, `ok: false`, **exit code 1** — stack trace 없음.
- `tokenMasked: "ntn_…q8ca (len=50)"` — 평문 token 0건.
- `schemas[].id`, `schemas[].objectKind` (`"database"`), `schemas[].propertiesMissing=true`, `schemas[].violationsCount=1` 양쪽 DB 모두 정확.
- `errors[].reason = "schema-missing-properties"`, `errors[].message` 가 `MISSING_PROPERTIES_HINT` 영/한 친절 안내 포함.
- mutation API 호출 0건 (dry-run + schema 단계에서 차단).

`vibeops notion test --json`:

- `notion.users.me` ok, `databases.retrieve(projects/tasks)` 양쪽 ok (`object=database` 정확히 표시).
- `notion.projects.schema` / `notion.tasks.schema` 모두 `status=fail, violations=[missing-properties]`. 같은 helper 경유. 두 명령이 같은 진단을 낸다.

### 잘못된 ID 케이스

- `notion sync` / `notion test` 모두 retrieve 단계에서 `object_not_found` (404) 가 떨어지면 `reason = "projects-retrieve"` (또는 `tasks-retrieve`) 으로 깔끔히 종료. TypeError 가 아니라 `explainNotionError` 가 만든 한국어 메시지를 출력.

### 보안

- `--token` CLI 옵션 부재 (변경 없음).
- 모든 JSON / stdout 출력에서 `secret_…` / `ntn_…` / Bearer 패턴 0 hit (`sanitiseApiError` 는 미변경, 단지 이번 변경이 token 을 노출할 새로운 경로를 만들지 않음).
- `git status --short` → 본 라운드 변경 파일은 `notion-schema.ts / notion-sync.ts / notion-sync.ts(command) / notion-test.ts / docs/*` 4 개 코드 + 문서 3 개로 한정.

### 위험 요소

- `getNotionProperties` 의 "bare properties map" 인식은 well-known 키 (`Name` / `Task ID` / `Project ID` / `Status`) 존재 여부로 판정한다. 사용자가 만든 DB 가 그 키를 모두 없애면 `null` 로 fallback → `missing-properties` violation. 사실상 그 경우 schema 가 이미 무효이므로 무해하지만, polish round 에서 더 엄격한 sentinel (e.g. property 객체에 `type` 키 존재) 로 보강 가능.
- TASK-011 Status 는 그대로 `Review` 유지 — 본 패치는 같은 TASK 의 후속 버그 수정 라운드라 Done 으로 옮기지 않았다.

---

## Result — Notion `database → data_source` resolver (2026-05-11 follow-up #2)

### 배경 (실 환경 진단 결과)

`vibeops notion test` 가 다음과 같이 끝났다.

```
✓ databases.retrieve(projectsDatabaseId)  object=database
✗ Projects DB 필수 속성 검증 — type-mismatch (properties)
```

라이브 토큰으로 직접 호출해 보니, 현재 Notion API (`2025-09-03`) 에서는 `databases.retrieve(databaseId)` 가 `{ object: "database", data_sources: [] }` 만 돌려주고 `properties` 는 deprecated/없음이다. 실제 schema (`properties`) 는 `dataSources.retrieve(dataSourceId)` 로 호출해야 나온다. 사용자가 `.vibeops.json` 에 저장한 id 는 database id (TASK-010 follow-up #4 의 inline-DB scan UX 가 페이지에서 찾아 채워준 그 id) 라서 새 API 의 schema endpoint 와 한 단계 어긋났다. 그래서 follow-up #1 이 잡아준 "TypeError 가 missing-properties violation 로 친절 종료" 까지는 되지만, schema 검증이 영원히 실패하던 것.

### 결정

- **신규 `src/lib/notion-target.ts` + `resolveNotionDataSourceTarget(client, id, label)`** — `database → data_source` 해석 single source of truth. read-only.
- 흐름:
  1. **A**: `dataSourcesRetrieve(id)` 먼저 시도. 성공 + `properties` 있으면 `source: "input-data-source"` 로 즉시 반환.
  2. SDK 가 `client.dataSources` 자체를 노출하지 않으면 (older `@notionhq/client` build) `null` 반환 → 그 자체는 에러가 아니므로 fall-through.
  3. **transport** 계열 에러 (`unauthorized` / `restricted_resource` / `rate_limited` / timeout 등) 는 즉시 `{ ok: false, reason: "transport" }` 로 반환 — fall-through 시 잘못된 진단을 만들지 않도록.
  4. `object_not_found` / `validation_error` / `unknown_error` 만 fall-through.
  5. **B**: `databasesRetrieve(id)` 호출. legacy SDK 가 database 객체에 직접 `properties` 를 carry 하면 `source: "legacy-database"`. 그렇지 않고 `data_sources[]` 가 ≥ 1 이면 `[0]` 선택 (여러 개면 warning 추가), 그 id 로 `dataSourcesRetrieve` 재호출 → `source: "database-default-data-source"`.
  6. `data_sources[]` 가 비어 있으면 `{ ok: false, reason: "no-data-source" }` + 친절 안내 (영어 + 한국어 1줄).
  7. resolved data_source 가 `properties` 없이 돌아오면 `{ ok: false, reason: "no-properties" }` + 친절 안내.
- **`NotionClient` 확장**: `dataSourcesRetrieve(id) → Promise<NotionDataSourceRetrieveResponse | null>` 추가. `client.dataSources` 가 SDK 에 없으면 `null` 반환 (raw HTTP 폴백 없이 resolver 가 알아서 database 경로로 빠진다 — `@notionhq/client@5.20.0` 에는 이미 노출돼 있다).
- **`NotionClient` constructor 에 `logLevel: "error"`** — `dataSourcesRetrieve` 가 4xx 로 fall-through 할 때 SDK 의 `console.warn` 노이즈 (`@notionhq/client warn: request fail`) 를 stderr 에서 제거. 실제 에러는 그대로 throw, 의도된 폴백 경로만 silent.
- **`fetchSchemas` 재작성**: 두 DB 모두 resolver 경유. transport-level 실패도 별도 fast-fail 하지 않고 `reportFromResolved` 로 funnel → `notion sync` / `notion test` 가 같은 풍부한 안내 메시지를 보여준다.
- **`SchemaReport` 확장**: `inputId / inputObject / resolvedId / resolvedObject / source / parentDatabaseId? / title? / warnings[]` carry. JSON 출력에 그대로 노출.
- **`notion test` 의 schema 단계가 3 단계로 분해됨**: `notion.{kind}.retrieve` → `notion.{kind}.resolve` → `notion.{kind}.schema`. 각 단계가 `ok / fail / skip` 로 별개로 보고된다 (`pushSchemaCheck` 폐기, `runResolveAndSchema` 도입).
- **`notion sync` 의 stdout 에 `${kind} DB target` 블록** — input id/object, resolved id/object, source, parent database (있으면), schema 상태, resolver warnings 를 한 묶음으로 출력. JSON `report.schemas[]` 에도 동일 필드. token 노출 0건.
- **`notion init` 의 `softValidateSchema` 도 같은 resolver 경유** — manual id 입력 직후 즉시 검증 흐름이 `database → data_source` 폴백을 받아 정확히 동작한다.
- **dry-run 정책 그대로**: `dataSourcesRetrieve` / `databasesRetrieve` / `databasesQuery` 만 호출. `pages.create` / `pages.update` 는 `--dry-run` 에서 절대 호출되지 않는다.
- **보안**: token 원문 노출 0건. 에러 메시지는 모두 `notionApiError` → `explainNotionError` 경유, `sanitiseApiError` 가 `secret_*** / ntn_*** / Bearer ***` 마스킹.

### 변경 파일

- `src/lib/notion-target.ts` *(신규)* — `resolveNotionDataSourceTarget` + helper + 타입 (`ResolvedNotionTarget / ResolveFailure / ResolveResult / ResolveSource`).
- `src/lib/notion-client.ts` — `NotionDatabaseRetrieveResponse / NotionDataSourceRetrieveResponse / NotionDataSourceRef` 신규 타입, `NotionClient.dataSourcesRetrieve` 추가, SDK 캐스팅에 `dataSources.retrieve` 추가, ctor `logLevel: "error"`.
- `src/lib/notion-sync.ts` — `fetchSchemas / reportFromResolved` 재작성, `SchemaReport` 확장, `getNotionProperties / readNotionObjectKind` import 제거 (resolver 가 책임), `validateDatabaseSchema(..., resolved.properties)` 호출.
- `src/commands/notion-test.ts` — `runResolveAndSchema` 도입, kind 별 3 checks (`retrieve / resolve / schema`), 기존 `pushSchemaCheck` 및 `retrieveResponse` carry 제거.
- `src/commands/notion-sync.ts` — `SchemaDiagnostic` 확장 (`inputId / inputObject / resolvedId / resolvedObject / source / parentDatabaseId? / warnings[]`), stdout `${kind} DB target` 블록 출력, error formatter 가 `missing-properties` violation 의 `description` (resolver 메시지) 그대로 노출.
- `src/commands/notion-init.ts` — `softValidateSchema` 가 `resolveNotionDataSourceTarget` 경유, 폴백 진행 시 resolved id 한 줄 표시.

### Non-goals (이 follow-up 의 한계)

- `task pull` 본체는 같은 `fetchSchemas` 경유라 자동 혜택. 추가 변경 0줄.
- frontmatter 양방향 sync (`task pull --fields`) 는 여전히 polish round 후보.
- 실 토큰 회기는 사용자의 현 권한 상태 (DB 자체에 integration connection 없음) 때문에 "Connections 메뉴로 공유" 안내가 끝까지 노출됨. 정상 schema 검증의 라이브 검증은 사용자 측 회기 필요.

## Test Result — Notion `database → data_source` resolver

### 정적 검증

- `pnpm typecheck` ✅ exit 0.
- `pnpm build` ✅ exit 0.
- `ReadLints (notion-target.ts, notion-client.ts, notion-sync.ts, notion-test.ts(command), notion-sync.ts(command), notion-init.ts)` → 0 warnings.

### Unit (mock `NotionClient`, `dist/lib` 직접 호출) — 24 assertion 모두 PASS

`resolveNotionDataSourceTarget` 8 시나리오 (13 assertion):

1. `dataSourcesRetrieve(id)` 직접 hit → `source="input-data-source"`, title carry. ✅
2. `dataSources` 404 → `databases` → `data_sources[0]` resolve → `source="database-default-data-source"`, `parentDatabaseId` carry, warning ("object_not_found, falling back") 기록. ✅
3. DB 가 3 개 data_sources → `[0]` 선택 + `database has 3 data_sources` warning. ✅
4. DB `data_sources: []` (사용자 실 케이스) → `{ ok: false, reason: "no-data-source" }` + "Connections" 영/한 hint. ✅
5. Legacy DB (database 자체에 `properties`) → `source="legacy-database"`, `resolvedObject="database"`. ✅
6. SDK 가 `dataSourcesRetrieve` 노출 안 함 (`null` 반환) → DB 폴백 후 child DS 정상 해석. ✅
7. `unauthorized` (401) → 즉시 `{ ok: false, reason: "transport", apiError.code: "unauthorized" }`. ✅
8. `dataSources.retrieve` 가 `properties: undefined` → DB 폴백으로 자연 진행. ✅

`fetchSchemas` 통합 3 시나리오 (11 assertion):

9. 직접 DS 해석 → `ok:true, !propertiesMissing, source="input-data-source", gitRepoType="url", 0 violations`. ✅
10. DB → child DS 폴백 → `ok:true, source="database-default-data-source", parentDatabaseId` 정확, 0 violations. ✅
11. DB `data_sources: []` → `ok:true (no fast-fail), propertiesMissing=true, violations[0].description includes "Connections"`. ✅

### Live CLI (실 토큰 환경, integration 권한 미확장 상태)

- `vibeops notion test` → 4 단계 schema 진단:
  - `✓ Projects DB retrieve 접근  input id=… input object=database`
  - `✗ Projects DB target 해석 (database → data_source)  Notion database … does not expose any data_sources accessible to this integration. Open the database as a full page in Notion and add the VibeOps integration directly via the database's '⋯ → Connections' menu. (KR …)`
  - `· Projects DB 필수 속성 검증  target 해석 실패로 인해 검증 생략`
  - Tasks 도 동일. SDK warn 노이즈 stderr 0건 (`logLevel: "error"` 효과 확인).
- `vibeops notion sync --dry-run` → `projects DB target` / `tasks DB target` 블록 (input/resolved id+object, source, schema 상태), 그리고 `schema-missing-properties` 에러 + resolver 의 풍부한 한국어 안내 한 줄씩. exit 1. mutation 0건.
- `vibeops task pull --dry-run --limit 2` → 같은 `fetchSchemas` 통해 schema 위반 안전 차단 (이전과 동일 동작). 회귀 없음.
- `vibeops notion init --dry-run` → 변경 없음 (plan-only).

### 보안

- 모든 JSON / stdout 출력에서 `secret_…` / `ntn_…` / Bearer 패턴 0 hit (`maskToken` 만 노출 — `ntn_…q8ca (len=50)`).
- `--dry-run` 에서 mutation API (`pages.create` / `pages.update`) 호출 0건 (mock + 실 CLI 양쪽 확인).
- `--token` CLI 옵션 부재 invariant 유지.

### 위험 요소

- `@notionhq/client` 가 더 진화해 `data_sources` 응답이 다른 곳으로 옮겨질 수 있음. resolver 는 `client.dataSources.retrieve` 가 미존재면 `null` 반환 → DB 경로로 자연 폴백하므로 큰 영향은 없을 가능성이 높지만, polish round 에서 SDK upgrade 시 추가 회귀 테스트 권장.
- DB 에 data_sources 가 여러 개인 케이스는 본 라운드에선 `[0]` 자동 선택 + warning. 사용자가 nth data_source 를 골라야 할 경우 polish round 에 select prompt 옵션이 필요.
- `legacy-database` 경로는 매우 오래된 SDK / 마이그레이션 이전 워크스페이스용 폴백 — 정상 동작은 mock 으로만 covered.
- TASK-011 Status 는 그대로 `Review` 유지 — 본 패치는 같은 TASK 의 후속 라운드.

---

## Result — Notion 2025-09-03 surface lock-in + `--debug-shape` 진단 (2026-05-11 follow-up #3)

### 배경

follow-up #2 후 실 워크스페이스에서 `notion test` 가 "database does not expose any data_sources" 만 반복 출력. 라이브 진단으로 `databases.retrieve(id)` 가 (default / `2025-09-03` 두 버전 모두) `{ object: "database", data_sources: [], properties: undefined, top-level keys: 17개 }` 를 돌려주고, `2022-06-28` 버전은 `validation_error: Database … does not contain any data sources accessible by this API bot` 으로 명시적으로 실패함을 확인. `search filter=data_source` 도 0건 → integration 이 부모 page 까지만 connection 잡혀 있고 inner data_source 권한이 없는 상태. 코드로 풀 수 있는 문제는 아니지만, 사용자가 자기 권한 상태를 정확히 들여다볼 수 있는 token-safe 진단 도구가 없었던 게 진짜 문제. 더불어 future-proofing 목적으로 (a) API version 명시 pin, (b) `data_sources` / `dataSources` / `child_data_sources` / `childDataSources` 다형 네이밍 + 중첩 id 파싱, (c) SDK 가 `client.dataSources` 미노출일 때 raw `client.request` 폴백을 함께 추가.

### 결정

- **`src/lib/notion-client.ts` `NOTION_API_VERSION = "2025-09-03"` 명시 pin** — Client 생성 시 `notionVersion` 옵션으로 항상 전달. 미래 default 가 바뀌어도 VibeOps 가 의도한 surface (database/data_source 분리) 가 깨지지 않는다. `ClientOptions` 인터페이스도 같이 확장.
- **`NotionClient.dataSourcesRetrieve` 우선순위 3 단**: (A) `client.dataSources.retrieve({ data_source_id })` → (B) `client.request({ path: 'data_sources/{id}', method: 'GET' })` raw 폴백 → (C) 둘 다 미존재면 `null` 반환. 토큰은 SDK 가 알아서 헤더로 붙이고 본 코드 에서는 절대 손대지 않는다.
- **신규 `extractDataSourcesFromDatabaseResponse(response)` (notion-client.ts)** — `data_sources / dataSources / child_data_sources / childDataSources` 4 가지 키 이름과 `entry.id` / `entry.data_source.id` 두 가지 id shape, `entry.name` / `entry.data_source.name` / `entry.title[*].plain_text` 3 가지 이름 fallback 을 모두 처리. 정규형 우선 (snake_case 가 camelCase 보다 강함). `{ field: string | null, items: Array<{ id, name? }> }` 반환.
- **신규 `summariseDatabaseShape(inputId, raw)` (notion-client.ts) + `NotionClient.probeDatabaseShape(id)`** — token-safe `databases.retrieve` digest. 출력 필드: `object / id / title? / hasProperties / propertiesKeysLength / hasDataSources / dataSourcesField? / dataSourcesLength / dataSources[{id, name?}] / topLevelKeys[]`. property 값 / page 본문 / rich_text body / bearer token 는 절대 포함하지 않음 (테스트 17번째 assertion 으로 `_internal: "secret_value_must_not_leak"` 인풋이 출력 dump 에서 0 hit 임을 검증).
- **`resolveNotionDataSourceTarget` 가 `extractDataSourcesFromDatabaseResponse` 경유** — 손으로 `db.data_sources` 읽던 분기 제거. 비-canonical 네이밍이 들어오면 warning 1줄 자동 적재.
- **`HINT_NO_DATA_SOURCE` / `HINT_NO_PROPERTIES` 에 ``Run `vibeops notion test --debug-shape` to inspect the Notion response shape.`` tail** — 사용자가 다음 진단 단계를 알 수 있도록.
- **`vibeops notion test --debug-shape` 옵션 신규 추가** — `notion test` 가 resolver 단계 전에 두 DB 의 shape probe 를 출력. plain mode: `${kind} DB shape` 헤더 + 5~6 줄 (`object / id / title? / has properties / data_sources count + field name + per-DS line / top-level keys`). JSON mode: `report.debugShape[]` 에 `kind / inputId / shape | error` carry.
- **`notion sync` 자동 혜택** — 같은 `fetchSchemas` → `resolveNotionDataSourceTarget` 경유라 별도 변경 없이 새 안내 + debug-shape 권고가 stdout/JSON 에 흘러나간다.
- **`notion init` 의 `softValidateSchema` 도 자동 혜택** — 동일 resolver 경유.
- **dry-run 정책 유지**: `databases.retrieve` / `dataSources.retrieve` / `blocks.children.list` / `users.me` / `search` / `databases.query` 만, `pages.create` / `pages.update` 0건.
- **보안**: token 원문 출력 0건. shape probe 도 필드 이름 / 카운트 / data_source id+name 만 carry. `_internal` 같은 임의 비밀 필드 값이 들어 있어도 출력 0 hit.

### 변경 파일

- `src/lib/notion-client.ts` — `NOTION_API_VERSION` 상수 export, Client ctor `notionVersion` 옵션, `ClientOptions` 인터페이스 확장, SDK cast 에 `request?` 추가, `dataSourcesRetrieve` 3 단 폴백, `probeDatabaseShape` 추가, `extractDataSourcesFromDatabaseResponse` / `summariseDatabaseShape` / `DatabaseShapeProbe` 신규 export.
- `src/lib/notion-target.ts` — `extractDataSourcesFromDatabaseResponse` 사용, `HINT_DEBUG_SHAPE` 도입, `HINT_NO_DATA_SOURCE` / `HINT_NO_PROPERTIES` 갱신, `NotionDataSourceRef` import 제거.
- `src/commands/notion-test.ts` — `--debug-shape` 처리, `report.debugShape[]` carry, plain finalize 의 shape 블록 출력, JSON sanitize 에 debugShape 포함.
- `src/cli.ts` — `notion test --debug-shape` 옵션 등록.

### Non-goals

- 사용자의 실 워크스페이스에서 schema 검증을 통과시키는 것은 Notion UI 단계 (각 DB 의 Connections 메뉴에서 VibeOps integration 추가) 가 남아 있어 코드로 풀 수 없음. 본 라운드는 그 단계를 사용자가 정확히 진단할 수 있게 만드는 데 집중.
- frontmatter 양방향 sync, `legacy-database` 실 워크스페이스 검증 등 polish round 후보는 그대로 유지.

## Test Result — Notion 2025-09-03 surface lock-in + `--debug-shape`

### 정적 검증

- `pnpm typecheck` ✅ exit 0.
- `pnpm build` ✅ exit 0.
- `ReadLints (notion-client.ts, notion-target.ts, notion-test.ts(command), cli.ts)` → 0 warnings.

### Unit (mock + 직접 호출) — 30 assertion 모두 PASS

`extractDataSourcesFromDatabaseResponse` 11 케이스 / 11 assertion:

1. canonical `data_sources` ✅
2. camelCase `dataSources` ✅
3. `child_data_sources` ✅
4. `childDataSources` ✅
5. 중첩 `data_source.id` 인식 ✅
6. `title[]` → name fallback ✅
7. 빈 배열도 `field` 식별 ✅
8. 어떤 키도 없으면 `field: null` ✅
9. null / undefined safe (2 assertion) ✅
10. snake_case 가 camel 보다 우선 ✅

`summariseDatabaseShape` 9 assertion (단일 fixture 에서 6 필드 검증 + 다양한 변형):

11. `object` echo / `title[]` 합성 / `hasProperties + len` / `hasDataSources + count + field` / `topLevelKeys` 정렬 ✅
12. **token-safety**: `_internal: "secret_value_must_not_leak"` 인풋이 출력 dump 에 0 hit ✅
13. 빈 응답 / camelCase + 중첩 id / `null` 입력 안전 처리 ✅

resolver end-to-end (parser 통합) 3 assertion:

14. resolver 가 camelCase `dataSources` 통과 ✅
15. resolver 가 "non-canonical naming" warning 적재 ✅
16. `no-data-source` 메시지에 `--debug-shape` 포함 ✅

`createNotionClient` smoke 4 assertion:

17. `NOTION_API_VERSION === "2025-09-03"` ✅
18. `client.usersMe` / `dataSourcesRetrieve` / `probeDatabaseShape` 함수 노출 ✅

(불연속 인덱스 — 위는 26 + 4 = 30 assertion 전체 모두 PASS.)

### Live CLI (실 토큰, integration 권한 미확장 상태)

- `vibeops notion test --help` → `--debug-shape` 옵션이 옵션 목록에 노출.
- `vibeops notion test --debug-shape` plain:
  ```
  Projects DB shape  input id=fe97b87b-...
    object              database
    id                  fe97b87b-...
    title               Projects (Inline)
    has properties      no
    data_sources        0
    top-level keys      archived, cover, created_time, data_sources, ..., url
  ```
  → 사용자가 자기 워크스페이스의 응답을 token-safe 로 직접 확인 가능. `data_sources` 키는 응답에 분명히 존재하지만 배열이 비었음 = Notion 권한 단계 문제로 진단됨.
- `vibeops notion test --debug-shape --json` → 같은 진단을 `report.debugShape[]` 에 carry. 토큰 마스킹 유지 (`ntn_…q8ca (len=50)` 만 노출).
- `vibeops notion test` (옵션 없이) → 기존 3 단 진단 (`retrieve / resolve / schema`) + 새 안내 메시지 (`Notion returned no data_sources …` + Connections 메뉴 영/한 안내 + `--debug-shape` 권고).
- `vibeops notion sync --dry-run` → `${kind} DB target` 블록 + `schema-missing-properties` 에러 + resolver 의 새 안내 메시지. exit 1, mutation 0건.

### 보안

- `--debug-shape` 출력에 `secret_…` / `ntn_…` / `Bearer` 패턴 0 hit (`_internal` mock 시크릿 unit test 로 cross-check).
- 모든 명령 mutation API 호출 0건 (`pages.create` / `pages.update`) — `--dry-run` + schema 단계 차단.
- `--token` CLI 옵션 부재 invariant 유지.

### 위험 요소

- API version pin 은 `2025-09-03` 고정. 새 surface 가 나와 `data_sources` 가 다른 위치로 옮겨지면 `extractDataSourcesFromDatabaseResponse` 의 후보 목록을 확장하거나 pin 을 bump 해야 한다.
- `dataSourcesRetrieve` raw HTTP 폴백은 SDK 의 `client.request` 공개 API 의존. 미래 SDK 가 그 API 를 제거하면 폴백 실패 → resolver 가 `null` 받아서 자연 종료 (no crash).
- 본 follow-up 은 진단·방어 layer 강화 — 사용자의 권한 상태 자체를 코드로 고치진 않는다.
- TASK-011 Status 는 그대로 `Review` 유지.

---

## Result — API-first page child_database → data_source discovery (2026-05-11 follow-up #4)

### 배경

`database.retrieve(child_database_block.id)` 가 `object=database, is_inline=true, data_sources=0, properties 없음` 으로 돌아오는 실제 케이스가 있었다. 즉 기존 저장값(`projectsDatabaseId` / `tasksDatabaseId`)은 schema/properties 를 얻을 수 있는 target 이 아니었다. 사용자 요구에 따라 discovery 를 “data_source 직접 검색 → page 검색 → page child block scan → child_database block id 로 database.retrieve → database.data_sources[] → data_source.retrieve(properties)” 순서의 API-first 흐름으로 바꿨다. 수동 data source id 복사는 마지막 fallback 으로만 남겼다.

### 결정

- `NotionConfig` 에 `projectsTargetId` / `tasksTargetId` 추가. API 호출 우선순위는 targetId(data_source) → databaseId(legacy/container fallback).
- `.vibeops.json` 저장 정책:
  - API discovery 가 찾은 실제 data_source id는 `projectsTargetId` / `tasksTargetId` 에 저장.
  - page child_database 경로에서 나온 child database/container id는 기존 `projectsDatabaseId` / `tasksDatabaseId` 에 보존.
  - 기존 config 와 호환 유지. targetId 가 비어 있으면 databaseId fallback.
- `src/lib/notion-client.ts` read-only helper 보강:
  - `retrieveDatabase(id)` alias.
  - `retrieveDataSource(id)` alias.
  - `searchPages(query?)`.
  - `listBlockChildren(blockId, { limit?, startCursor? })`.
  - 기존 `dataSourcesRetrieve` 는 SDK `dataSources.retrieve` → raw `client.request("data_sources/{id}")` → `null` 3단 fallback 유지.
  - query/create 는 data_source target 우선(`dataSources.query`, `pages.create parent.data_source_id`)으로 동작하고 legacy database fallback 을 보존.
- `src/lib/notion-discovery.ts`:
  - `discoverInlineDatabasesFromPage(client, pageId)` 가 더 이상 block id 후보만 반환하지 않는다.
  - `blocks.children.list(pageId)` 에서 `child_database` 를 찾고, block id로 `retrieveDatabase(block.id)` 를 호출한 뒤 `extractDataSourcesFromDatabaseResponse` 로 data_source id를 추출한다.
  - 각 data_source id를 `retrieveDataSource` 로 읽고 `properties` 가 있는 후보만 normalize.
  - 후보 `id` 는 실제 저장/사용할 `dataSourceId`; `databaseId` 는 child_database block/container id로 별도 보존.
  - `source: "page-child-database"`, `parentPageId`, `properties`, `schemaKindHint` 포함.
  - searchDataSources 결과도 `retrieveDataSource(id)` 로 properties 를 보강해 schema hint label 이 정확해지게 했다.
- `notion init`:
  - search 결과 또는 page scan 후보 선택 시 `projectsTargetId/tasksTargetId` 에 data_source id 저장.
  - page child 후보는 `projectsDatabaseId/tasksDatabaseId` 에 container id도 보존.
  - manual fallback 문구는 “database id” 대신 “data source id” 로 변경.
  - 선택지 라벨 예: `Projects (Inline) — page child database → data_source abc123…: ✓ project schema`.
- `notion test` / `notion sync` / `task pull`:
  - targetId 우선 resolve.
  - targetId 가 data_source 면 바로 `retrieveDataSource` 후 schema 검증.
  - databaseId fallback 은 기존 resolver 경유.
  - `task pull` 의 query 도 `tasksTargetId` 우선.
- `notion test --debug-shape`:
  - resolved data source 가 있으면 `selected input id`, `resolved data source id`, `source` (`direct-data-source` / `database-data-source` / `page-child-database`), `has properties`, `property keys count`, `schema hint` 를 출력.
  - resolve 실패 시 기존 token-safe database shape (`object`, `top-level keys`, `data_sources count`) 출력.

### 변경 파일

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
- `docs/logs/2026-05-11.md`

## Test Result — API-first page child_database → data_source discovery

### 정적 검증

- `pnpm typecheck` ✅ exit 0.
- `pnpm build` ✅ exit 0.
- `ReadLints` (갱신 TS 11개) → 0 warnings.

### Unit / mock smoke

`/tmp/vibeops-api-first-smoke.mjs` 로 mock `NotionClient` 를 직접 구성해 12 assertion 모두 PASS:

1. page children 에서 `child_database` 2개 발견.
2. 각 block id로 `retrieveDatabase(block.id)` 호출.
3. `data_sources[]` 에서 `DS_PROJECTS` / 중첩 `data_source.id=DS_TASKS` 둘 다 추출.
4. 각 data_source 를 `retrieveDataSource` 로 읽고 `properties` 있는 후보만 반환.
5. 후보 `id === dataSourceId`.
6. `databaseId` 에 child_database block id 보존.
7. `source === "page-child-database"`.
8. projects/tasks properties attached.
9. `schemaKindHint === projects/tasks`.
10. `sortForKind("projects")` 는 Projects 후보 우선.
11. `sortForKind("tasks")` 는 Tasks 후보 우선.
12. `fetchSchemas` 가 `projectsTargetId/tasksTargetId` 를 우선 사용하고 schema 0 violations.

### Live CLI

- `vibeops notion test --debug-shape` (현재 저장 config 는 아직 legacy database ids):
  - `projectsTargetId/tasksTargetId` 가 없으므로 databaseId fallback 사용.
  - Projects/Tasks 모두 `object database`, `has properties no`, `data_sources 0`, `top-level keys` 에 `data_sources` 존재를 token-safe 로 출력.
  - resolve 실패 메시지는 기존과 같이 child database/container 에 실제 data_source 가 없음을 안내.
- `vibeops notion sync --dry-run`:
  - target fallback 으로 같은 resolver 사용.
  - schema 단계에서 안전하게 차단, `pages.create/pages.update` 호출 0건.

### 보안 / 정책

- token 원문 출력 0건 (`maskToken` 만).
- discovery / test / dry-run 은 read-only API 만 사용.
- sync 실제 실행 외 Notion mutation 0건.
- manual data source id 입력 fallback 유지.

### 위험 요소

- 실제 workspace 에서 `database.data_sources[]` 가 계속 0이면 API 로 data_source 를 얻을 수 없다. 이 경우 `--debug-shape` 가 원인을 보여주며, 사용자는 Notion UI 에서 해당 inline database/data source 를 integration 에 다시 연결해야 한다.
- `pages.create parent.data_source_id` 는 Notion 2025-09-03 기준. legacy database id config 는 fallback 을 두었지만, 실제 write 회귀는 별도 라이브 회기에서 검증 필요.
- TASK-011 Status 는 그대로 `Review`.

## Result — sync create/update 가 data_source surface 만 쓰도록 강제 + TASK-000 제외 (2026-05-11 follow-up #5)

### 문제

follow-up #4 후 사용자가 `vibeops notion sync` 실제 실행을 했을 때 `notion test` / `notion sync --dry-run` 은 모두 성공 (`schema valid`, target `object=data_source`) 인데, mutation phase 에서만 매 row 가 `HTTP 404 object_not_found` 로 폭주. 원인 둘:

1. **`pagesCreate` 의 parent 가 데이터 소스 surface 로 가지 않았다.** wrapper 는 SDK `pages.create` 를 호출하면서 인자로 `parent: { data_source_id }` 를 시도하긴 했지만, 호출부 (`executeProjectUpsert/executeTaskUpsert`) 가 넘기는 id 는 `notionProjectsTargetId(notion) = projectsTargetId || projectsDatabaseId` 였다. `.vibeops.json` 의 사용자 config 가 legacy 상태일 때는 이 fallback 으로 **container database id 가 parent.data_source_id 로 들어가** Notion 이 즉시 404. 더 나아가 SDK 가 `validation_error` 를 한 번이라도 던지면 wrapper 가 `parent.database_id` 로 다시 시도하면서, **schema 는 resolved data_source 에서 검증했지만 mutation 은 container database 로 향하는** 어긋남이 생긴다.
2. **query 도 마찬가지로 어긋났다.** `findExistingProject/findExistingTask` 가 `client.databasesQuery(targetId, …)` 를 호출했는데, 이 wrapper 도 내부적으로 typed `dataSources.query` 우선 시도지만, `targetId` 자체가 fallback chain 끝의 container id 일 수 있어 첫 호출이 404 → upsert 가 항상 "create" 로 잡히고, 그러고 나서 create 가 또 404. dry-run 도 같은 query 를 돈 거라 동일하게 실패해야 했는데, schema retrieve 가 성공한 케이스 (resolver 가 input-data-source 로 끝남) 와 mutation create 의 target 이 서로 다른 게 dry-run 출력에 보이지 않고 있었다.

### 변경 요약

- **`src/lib/notion-client.ts`**: Notion 2025-09-03 surface 를 mutation 경로에서도 first-class 로 노출.
  - `queryDataSource(dataSourceId, options)` — (A) typed `client.dataSources?.query`, (B) raw `client.request({ path: "data_sources/{id}/query", method: "POST", body: {filter, page_size} })` 폴백. 토큰/Notion-Version 헤더는 SDK 가 자체 부착.
  - `createPageInDataSource({ dataSourceId, properties })` — typed `client.pages.create({ parent: { type: "data_source_id", data_source_id }, properties })` 첫 시도, SDK 가 `validation_error` 로 거부할 때만 raw `client.request({ path: "pages", method: "POST", body: { parent, properties } })` 로 한 번 폴백. **legacy `parent.database_id` 폴백을 mutation 경로에서 제거** — 더 이상 silent downgrade 가 일어나지 않는다.
  - `updatePage({ pageId, properties })` — `pages.update` 에 대한 명시적 alias. update 는 `page_id` 기준이라 surface 차이 없음.
  - 기존 `pagesCreate / pagesUpdate / databasesQuery` 는 legacy 시그니처 호환을 위해 그대로 두지만, sync/pull mutation 경로는 이 신규 helper 만 사용.
- **`src/lib/notion-sync.ts`**:
  - `findExistingProject(client, dataSourceId, projectId)` / `findExistingTask(client, dataSourceId, projectId, taskId)` — 두 함수 모두 인자에서 `NotionConfig` 를 빼고 **resolver 가 돌려준 `schemas.{projects,tasks}.resolvedId`** 를 직접 받는다. 내부적으로 `client.queryDataSource(...)` 호출.
  - `executeProjectUpsert(client, dataSourceId, entry)` / `executeTaskUpsert(client, dataSourceId, entry)` — 마찬가지로 resolved `data_source` id 를 직접 받아 `client.createPageInDataSource({ dataSourceId, properties })` 와 `client.updatePage({ pageId, properties })` 로 라우팅.
  - `planSync` 가 위 함수들에 `schemas.projects.resolvedId` / `schemas.tasks.resolvedId` 를 명시적으로 전달.
  - `export const SYNC_EXCLUDED_TASK_IDS = new Set(["TASK-000"])` 추가 후 `planSync` 의 task 루프 첫 줄에서 skip. `TASK-000-template.md` 는 `task generate` 가 복제하는 템플릿이므로 Notion 에 row 가 생기면 안 된다.
- **`src/commands/notion-sync.ts`**:
  - `report.schemas` 의 각 diagnostic 에 `parentKind: "data_source_id" | "database_id"` 추가. 출력에 `create parent  data_source_id <id>` / `query target   data_source <id>` 두 줄을 항상 print → dry-run 과 actual sync 가 정확히 동일한 target/parent shape 을 쓴다는 사실을 사용자가 출력만 보고 검증 가능.
  - actual mutation 분기를 `schemaRes.projects.resolvedId` / `schemaRes.tasks.resolvedId` 로 직접 라우팅 (더 이상 `ctx.notion` 을 mutation 헬퍼에 넘기지 않음).
  - 4xx 발생 시 `formatMutateError({ err, action, parentKind, targetId })` 가 `action=create-page, target=<resolved-data-source-id>, parent=data_source_id` 를 표시하고, 404 일 때 "resolved id / integration 연결 확인 / `vibeops notion test --debug-shape`" 힌트를 덧붙임. 토큰은 절대 출력하지 않음 (`maskToken` 만 사용).
- **`src/lib/task-pull.ts` / `src/commands/task-pull.ts`**:
  - `PlanPullInputs` 에서 `notion: NotionConfig` 를 빼고 `tasksDataSourceId: string` 을 받는다. 호출부는 `schemaRes.tasks.resolvedId` 를 그대로 넘긴다.
  - `executePullEntry` 도 더 이상 `notion` 을 받지 않고 `client.updatePage({ pageId, … })` 로 patch.
- **`scripts/notion-sync-surface-check.ts`** (mock smoke): legacy `databasesQuery` / `pagesCreate(databaseId)` 호출이 **0** 임을, 신규 `queryDataSource` / `createPageInDataSource` / `updatePage` 호출이 각 단계마다 정확히 한 번 일어나는지를 assertion 으로 검증.

### 변경 파일

- `src/lib/notion-client.ts`
- `src/lib/notion-sync.ts`
- `src/lib/task-pull.ts`
- `src/commands/notion-sync.ts`
- `src/commands/task-pull.ts`
- `scripts/notion-sync-surface-check.ts` (신규)
- `docs/project/03-current-state.md`
- `docs/tasks/TASK-011-notion-sync-task-pull.md`
- `docs/tasks/TASK-010-notion-config-test.md` (cross-link)
- `docs/logs/2026-05-11.md`
- `README.md`

## Test Result — sync create/update data_source surface lock + TASK-000 제외

### 정적 검증

- `pnpm typecheck` ✅ exit 0.
- `pnpm build` ✅ exit 0.
- `ReadLints` (변경된 5 파일) → 0 warnings.

### Mock smoke

`pnpm exec tsx scripts/notion-sync-surface-check.ts` ⇒ `OK — every Notion mutation routed through data_source surface.`

- `findExistingProject(client, "PROJECTS_DS_ID", …)` 가 `client.queryDataSource("PROJECTS_DS_ID", filter)` 로 정확히 1회.
- `findExistingTask(client, "TASKS_DS_ID", …)` 도 동일.
- `executeProjectUpsert(client, "PROJECTS_DS_ID", { verb: "create", … })` ⇒ `client.createPageInDataSource("PROJECTS_DS_ID", …)`.
- `executeProjectUpsert(client, "PROJECTS_DS_ID", { verb: "update", existingPageId: "page-abc", … })` ⇒ `client.updatePage("page-abc", …)`.
- Tasks 도 동일하게 `createPageInDataSource("TASKS_DS_ID", …)` / `updatePage("page-xyz", …)`.
- legacy `databasesQuery` / `pagesCreate(databaseId)` 호출 횟수 **0** — silent legacy fallback 없음.
- `SYNC_EXCLUDED_TASK_IDS.has("TASK-000") === true`.

### Live CLI

라이브 워크스페이스 `.vibeops.json` 은 projectsTargetId / tasksTargetId 둘 다 채워져 있고 양쪽 모두 inline data_source 로 resolve 됨 (`schema valid`).

- `pnpm dev notion test` ⇒ "Projects DB 필수 속성 검증 8 속성", "Tasks DB 필수 속성 검증 10 속성" 모두 통과, `source=input-data-source`.
- `pnpm dev notion sync --dry-run` ⇒ `Tasks  create 12  update 0  total 12` (TASK-000 제외 확인), schema target 블록에서 `create parent   data_source_id <id>` / `query target    data_source <id>` 두 줄이 양 DB 에 모두 출력됨.
- `pnpm dev notion sync` (실제 실행) ⇒ **404 발생 0건**.
  - `TASK-001 ~ TASK-006` 6개 row 가 Tasks DB 에 정상 생성됨 (Status=`Done`).
  - 나머지 4xx 는 모두 `400 validation_error`: `Invalid status option. Status option "Building/Review/Planned" does not exist`. 이는 사용자의 Notion `Status` property 가 해당 옵션을 등록하지 않은 워크스페이스 설정 문제이고 **VibeOps 의 404 surface bug 와는 다른 클래스**다. 에러 메시지에 `action=create-page, target=<resolved-data-source-id>, parent=data_source_id` 가 함께 표시돼 어디로 가는 호출인지 명확.
- 다시 `pnpm dev notion sync --dry-run` ⇒ 같은 6 row 가 이제 `update task TASK-001..006`, 미생성 6 row 만 `create` 로 잡힘 (`Tasks    create 6  update 6  total 12`). dry-run 의 `update` 판정은 actual sync 가 만든 row 를 `queryDataSource("TASKS_DS_ID", filter)` 가 정확히 찾아냈다는 뜻 — query 도 data_source surface 로 잘 가고 있다.

### 보안 / 정책

- `NOTION_TOKEN` 원문 출력 0건 — `maskToken("ntn_…q8ca")` 만.
- dry-run, `notion test`, `--debug-shape` 어디에서도 mutation 0건.
- page body block 업데이트 0건 — properties 만 사용.
- Git mutation 0건 — sync 결과는 Notion API call 만.

### 위험 요소 / 한계

- 라이브 워크스페이스의 `Status` 옵션 누락 (`Building/Review/Planned`) 은 별도 polish 라운드 후보. 사용자가 해당 옵션을 직접 추가하거나, VibeOps 가 친절한 conversion 매핑을 제공해야 12 row 모두 통과 가능. → **follow-up #6 에서 사전 검증 + 친절 안내로 흡수**.
- legacy `pagesCreate(databaseId)` / `databasesQuery(databaseId)` wrapper 는 still exported. discovery/probe 비-mutation 경로가 쓰고 있어 제거하지 않았다. mutation 진입점은 모두 신규 helper 로 라우팅됐다.
- TASK-011 Status 는 그대로 `Review`. mutation surface 확정 + 라이브 idempotency 검증까지 모두 통과했지만, reviewer 가 (a) 실제 Notion 워크스페이스의 12 row create 가 status 옵션 정비 후 통과하는지, (b) `task pull` 라이브 회귀까지 확인 후 `Done` 처리하는 게 안전.

## Result — Notion Status option 사전 검증 (2026-05-11 follow-up #6)

### 문제

follow-up #5 가 404 surface bug 를 잡은 뒤 라이브 sync 가 모두 HTTP 400 `validation_error: Invalid status option. Status option "Building/Review/Planned" does not exist` 로 떨어졌다. schema validator 는 Status 속성의 **타입** (`type === "status"`) 만 확인했고, VibeOps 가 실제로 쓰는 status option name 이 Notion DB 에 등록돼 있는지는 검사하지 않았다. 그래서 `notion test` 는 ✓ 인데 actual `notion sync` 는 row 마다 400 으로 죽는 partial sync 가 발생.

### 해결 방향

스키마 검증 단계에서 status option 이름까지 미리 검사하고, 누락된 옵션이 있으면 사용자가 Notion 에서 직접 추가하도록 친절히 안내한다. Notion DB 의 schema 자체는 절대 변경하지 않는다 (옵션 자동 생성 / 자동 patch 금지).

### 변경 요약

- **`src/lib/notion-schema.ts`**:
  - 두 상수 추가:
    - `PROJECTS_STATUS_REQUIRED_OPTIONS = ["Building", "Planning", "Paused", "Done", "Archived"]`
    - `TASKS_STATUS_REQUIRED_OPTIONS = ["Planned", "In Progress", "Review", "Done", "Blocked"]`
  - `PropertyRequirement` 에 `readonly requiredOptions?: readonly string[]` 추가. Projects/Tasks 의 `Status` 항목에 위 두 상수를 attach.
  - `SchemaViolation.kind` 확장: 기존 `missing | type-mismatch | missing-properties` 에 `status-options-missing` / `status-options-unreadable` 추가. `missingOptions`, `requiredOptions`, `foundOptions` 필드 함께 추가.
  - `extractStatusOptionNames(prop)` 신규: Notion 응답의 `prop.status.options[].name`, `prop.status.groups[].options[].name`, `prop.status.groups[].option_names[]`, flat `prop.options[]`, legacy `prop.status_options[]` 까지 다섯 가지 shape 을 흡수해 trim/dedup 된 이름 목록 반환. 어느 shape 도 못 읽으면 `null` 을 돌려 caller 가 `status-options-unreadable` 위반으로 surface. throw 하지 않음.
  - `validateDatabaseSchema` 가 type 일치 확인 뒤 `req.requiredOptions` 가 정의되고 actual type 이 `status` 인 경우에만 option 검증을 수행. 못 읽으면 `status-options-unreadable`, 일부 누락이면 `status-options-missing` 위반 emit. type-mismatch 가 이미 있으면 option 검증은 skip.
  - `STATUS_OPTIONS_HINT` 상수 추가 — `"Add missing Status options to the Notion database, then rerun \`vibeops notion test\`."`
- **`src/commands/notion-test.ts`**: violation 렌더링이 새 kind 두 개를 친절하게 표시. `missing` / `Add these options in Notion: Status property → Edit options → <required list>` / `found in Notion: <observed list>` 세 줄로 분해 출력. JSON 출력도 새 필드를 그대로 carry.
- **`src/commands/notion-sync.ts`**: schema 단계에서 violation 중 `status-options-missing|unreadable` 이 하나라도 있으면 `reason: "schema-status-options"` 로 분류하고 `STATUS_OPTIONS_HINT` 를 메시지에 첨부. **mutation 진입 전 fast-fail** — 부분 sync 0건. mutation 도중 발생한 `validation_error: Invalid (status|select) option` 4xx 에는 `mutateHint(err)` 가 자동으로 `STATUS_OPTIONS_HINT` 를 덧붙인다 (Notion 응답이 옵션을 안 돌려주는 edge case 에서도 안내가 나오게).
- **`scripts/notion-status-options-check.ts`** (신규): 9 가지 assertion (modern options / groups / flat fallback / unreadable / 누락 검출 / 풀세트 통과 / type-mismatch 우선 / Projects DB 변형) 으로 새 helper 와 validator 를 단위 검증.

### 변경 파일

- `src/lib/notion-schema.ts`
- `src/commands/notion-test.ts`
- `src/commands/notion-sync.ts`
- `scripts/notion-status-options-check.ts` (신규)
- `README.md`
- `docs/project/03-current-state.md`
- `docs/tasks/TASK-011-notion-sync-task-pull.md`
- `docs/logs/2026-05-11.md`

## Test Result — Notion Status option 사전 검증

### 정적 검증

- `pnpm typecheck` ✅ exit 0.
- `pnpm build` ✅ exit 0.
- `ReadLints` (3 변경 파일) → 0 warnings.

### Mock smoke

- `pnpm exec tsx scripts/notion-status-options-check.ts` ⇒ `OK — extractStatusOptionNames + validateDatabaseSchema status options pass.` 모든 assertion 통과.
- `pnpm exec tsx scripts/notion-sync-surface-check.ts` (follow-up #5 회귀) ⇒ 그대로 OK.

### Live CLI

라이브 워크스페이스의 Notion `Status` property option 을 1회 probe 한 결과 (probe 스크립트는 즉시 폐기):

- Projects DB Status options: `Not started`, `Planning`, `In progress`, `Building`, `Paused`, `Done`, `Archived` ⇒ VibeOps 필수값 5개 (`Building / Planning / Paused / Done / Archived`) 모두 ✓.
- Tasks DB Status options: `Not started`, `Planned`, `In Progress`, `Review`, `Blocked`, `Done`, `Archived` ⇒ VibeOps 필수값 5개 (`Planned / In Progress / Review / Done / Blocked`) 모두 ✓.

명령 결과:

- `vibeops notion test` ⇒ Projects/Tasks 모두 `8 속성 / 10 속성 모두 존재 및 타입 일치`, status options 미스 0건. (워크스페이스가 follow-up #5 발생 이후 사용자가 옵션을 직접 보강한 결과로 가정.)
- `vibeops notion sync --dry-run` ⇒ `Project create 0  update 1  total 1`, `Tasks create 0  update 12  total 12`. 모든 row 가 `update`.
- `vibeops notion sync` (실제 실행) ⇒ `Notion sync 완료.` — Project 1 row + Tasks 12 row 모두 update 통과. **404 / 400 0건**.
- 누락 옵션이 있는 워크스페이스에서는 mock smoke 가 검증한 그대로 `notion test` 가 다음 형태로 친절히 안내한다:

  ```text
  ✗ Tasks DB 필수 속성 검증
      · status-options-missing Status
          missing  In Progress, Review, Blocked
          Add these options in Notion:  Status property → Edit options → Planned, In Progress, Review, Done, Blocked
          found in Notion: Done, Planned
  ```

  같은 메시지가 `notion sync --dry-run` / `notion sync` 에서도 그대로 surface 되며 **mutation 은 시도하지 않는다**.

### 보안 / 정책

- `NOTION_TOKEN` 원문 출력 0건 (`maskToken` 만).
- Notion DB schema mutation 0건. status option auto-creation 0건. 사용자에게 추가해야 할 옵션을 안내만.
- `notion test` / `notion sync --dry-run` 모두 read-only (page mutation 0건).
- `foundOptions` 출력은 사용자가 만든 status option 이름만 carry — 토큰 / 페이지 본문 / 기타 sensitive data 노출 없음.

### 위험 요소 / 한계

- Notion 이 `data_sources.retrieve` 응답에서 `status.options` 를 비활성화 / 부분 제공하는 경우, extractor 가 `null` 을 돌려 `status-options-unreadable` 위반이 나온다. 사용자에게는 `--debug-shape` 또는 Notion UI 의 status 설정을 확인하라는 메시지가 나가 silent pass 가 일어나지 않는다.
- 본 follow-up 은 `status` 속성에 한정. `Priority` / `MVP Phase` 등 select 속성은 자유 값이라 강제 검증 대상에서 제외했지만, 필요 시 같은 `requiredOptions` 메커니즘으로 확장 가능 (polish 라운드 후보).
- TASK-011 Status 는 그대로 `Review`. 사전 검증 + 라이브 sync 무결성까지 통과했지만 reviewer 가 `task pull` 라이브 회귀까지 확인 후 `Done` 처리하는 게 안전.

## Result — task pull 로컬 파일 존재 판단 규칙 정비 (2026-05-11 follow-up #7)

### 문제

라이브 회귀에서 사용자가 Notion Tasks DB 에 `Task ID = TASK-099` 신규 row 를 추가하고 `vibeops task pull --dry-run` 을 실행했더니 출력이 다음과 같았다:

```text
considered 2 rows → new 0 skipped 2
skipped
  · TASK-099 local-file-exists docs/tasks/TASK-012-package-polish-readme.md
  · TASK-012 local-file-exists docs/tasks/TASK-012-package-polish-readme.md
```

`planPull` 이 Notion 의 `Docs Path` 를 **무조건 신뢰** 하면서 발생한 버그. TASK-099 의 `Docs Path` 가 사람이 잘못 설정한 `docs/tasks/TASK-012-package-polish-readme.md` 로 들어가 있었는데, `planPull` 은 그 경로의 파일 존재 여부만 보고 "local-file-exists" 로 skip 했다. 결과적으로 TASK-099 는 영원히 pull 되지 않고, TASK-012 와 TASK-099 가 같은 파일을 가리키는 silent 충돌이 dry-run 에서 잡히지 않았다.

### 해결 방향

`planPull` 의 결정 트리를 (a) Task ID 보장 → (b) duplicate Task ID 검출 → (c) Notion Docs Path 가 Task ID 와 일치하는지 검증 → (d) Notion Docs Path 가 비어 있으면 로컬 `docs/tasks/TASK-NNN-*.md` 검색 → (e) 그래도 없으면 새 파일 계획, 순서로 분명히 분리. mismatch / duplicate / no-task-id 케이스를 별도 skip reason 으로 분류하고, 사용자가 Notion 을 직접 고치도록 안내한다. **자동 rename 금지** — Notion `Docs Path` 자동 수정은 본 follow-up 범위 밖이며 향후 `--fix-docs-path` 옵션으로만 노출 후보.

### 변경 요약

- **`src/lib/task-pull.ts`**:
  - 새 export `docsPathMatchesTaskId(docsRelativePath, taskId)` — basename 이 `${taskId}.md` 또는 `${taskId}-` 접두면 일치, 그 외는 mismatch (case-sensitive).
  - `PullSkipReason` 확장: 기존 `no-task-id | local-file-exists | docs-path-conflict` 에 `docs-path-mismatch` / `duplicate-task-id` 추가.
  - `PullSkip` / `PullEntry` 에 `detail?: string` 필드 추가 — 사용자에게 노출할 token-safe 한 한 줄 사유 (`notion docs path: …`, `expected basename prefix: TASK-099-` 같은 라벨).
  - 신규 export `PullDecisionTrace` + `PullPlan.trace: PullDecisionTrace[]` — considered 한 모든 Notion row 의 (taskId / pageId / notionDocsPath / localResolvedPath / decision / reason) 을 scan 순서대로 기록.
  - `planPull` 1차 패스에서 **Notion query 결과 안의 duplicate Task ID 검출**. 같은 Task ID 가 2회 이상 등장하면 첫 row 만 살리고 나머지는 `duplicate-task-id` 로 skip.
  - 2차 패스 결정 트리:
    1. `Task ID` 비었고 `Docs Path` 도 비었으면 → 다음 번호 자동 할당 (기존 동작 유지) + trace `new-file`.
    2. `Task ID` 비었지만 `Docs Path` 가 있으면 → `no-task-id` skip (자동 rename 금지).
    3. duplicate 표시된 pageId 면 → `duplicate-task-id` skip.
    4. `Docs Path` 가 있는데 basename 이 `${taskId}-` / `${taskId}.md` 패턴과 안 맞으면 → `docs-path-mismatch` skip. detail 에 `notion docs path: …`, `expected basename prefix: TASK-099-`, `action: fix Notion 'Docs Path' for this row (auto-fix not enabled).` 까지 한 번에 surface.
    5. `Docs Path` 가 있고 일치 → 그 경로를 그대로 사용해 파일 존재 여부만 검사. 있으면 `local-file-exists`, 없으면 `new-file`.
    6. `Docs Path` 가 비어 있으면 `docs/tasks/` 디렉터리에서 `TASK-NNN-*.md` / `TASK-NNN.md` 를 직접 검색 (`findLocalTaskFileForId`). 발견 시 `local-file-exists` (그 실제 경로로), 미발견 시 새 `${taskId}-${slug}.md` 계획 + `notionNeedsDocsPath: true`.
  - `executePullEntry` 는 그대로 — `notionNeedsDocsPath: true` 인 경우만 빈 Docs Path 를 채우고, mismatch / 기존 path 변경은 절대 시도하지 않는다.
- **`src/commands/task-pull.ts`**:
  - `TaskPullOptions.verbose?: boolean` 추가.
  - `PullReport.entries` / `skipped` 에 `detail?` 필드 carry. `report.trace` 신규 — JSON 출력은 항상 trace 를 포함하므로 기계 처리가 가능.
  - 기본 텍스트 출력은 간결 유지. skip detail 은 unconditional 로 보여 줘 (`notion docs path: …` / `expected basename prefix: …` 한 줄씩) mismatch 사유가 즉시 보이게.
  - `--verbose` 가 켜지면 `would create` 항목의 detail + 별도 `trace` 섹션 (`taskId  decision  page=<id>` + `notion docs path / local resolved / reason` 3 줄) 출력.
- **`src/cli.ts`**: `vibeops task pull` 에 `--verbose` option 추가, `taskPullCommand` 에 그대로 전달.
- **`scripts/task-pull-decision-check.ts`** (신규): 임시 디렉터리에 `docs/tasks/TASK-012-package-polish-readme.md` 를 만들고 stub `NotionClient.queryDataSource` 로 5 가지 row 케이스 (mismatch / existing-match / duplicate / no-task-id / fresh new) 를 한 번에 검증.

### 변경 파일

- `src/lib/task-pull.ts`
- `src/commands/task-pull.ts`
- `src/cli.ts`
- `scripts/task-pull-decision-check.ts` (신규)
- `docs/tasks/TASK-011-notion-sync-task-pull.md`
- `docs/logs/2026-05-11.md`

## Test Result — task pull 로컬 파일 존재 판단 규칙 정비

### 정적 검증

- `pnpm typecheck` ✅ exit 0.
- `pnpm build` ✅ exit 0.
- `ReadLints` (4 변경 파일) → 0 warnings.

### Mock smoke

- `pnpm exec tsx scripts/task-pull-decision-check.ts` ⇒ `OK — planPull decision tree (mismatch / duplicate / new) pass.` 모든 assertion 통과 (`docsPathMatchesTaskId` 4 unit + 5 row 결정 케이스).
- 회귀: `pnpm exec tsx scripts/notion-sync-surface-check.ts` ⇒ `OK — every Notion mutation routed through data_source surface.` (follow-up #5).
- 회귀: `pnpm exec tsx scripts/notion-status-options-check.ts` ⇒ `OK — extractStatusOptionNames + validateDatabaseSchema status options pass.` (follow-up #6).

### Live CLI

- `vibeops task pull --dry-run`:
  - 출력 (Notion 에서 사용자가 TASK-099 Docs Path 를 정리한 뒤 상태):

    ```text
    considered 2 rows  →  new 1  skipped 1
    would create
      · TASK-099 TASK-0199· Test  status=Planned phase=Phase 0
          docs/tasks/TASK-099-task-0199-test.md
    skipped
      · TASK-012 local-file-exists  docs/tasks/TASK-012-package-polish-readme.md
          notion docs path: docs/tasks/TASK-012-package-polish-readme.md
    ```

    follow-up #7 이전과 비교: TASK-099 가 더 이상 잘못된 TASK-012 경로로 silently skip 되지 않고 새 파일 생성 후보로 잡힌다.
  - mismatch 시점 (mock smoke 가 검증한 동작): skip block 이 detail 두 줄을 즉시 보여 줌:

    ```text
    skipped
      · TASK-099 docs-path-mismatch  docs/tasks/TASK-012-package-polish-readme.md
          notion docs path: docs/tasks/TASK-012-package-polish-readme.md
          expected basename prefix: TASK-099- or TASK-099.md
          action: fix Notion 'Docs Path' for this row (auto-fix not enabled).
    ```

- `vibeops task pull --dry-run --verbose`:
  - 위 출력 + `trace` 섹션 추가:

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

### 보안 / 정책

- `NOTION_TOKEN` 원문 출력 0건.
- `task pull --dry-run` 도, `--verbose` 도 Notion mutation / 파일 mutation 0건.
- mismatch 케이스에서 Notion `Docs Path` 자동 수정 0건. 사용자가 Notion 에서 직접 정정하도록 안내만.
- 새 Trace / detail 출력은 Task ID / page id / docs path / reason 만 carry — 본문 / 토큰 / 기타 sensitive 데이터 노출 없음.

### 위험 요소 / 한계

- mismatch 자동 수정 (`--fix-docs-path`) 은 의도적으로 구현하지 않았다. 자동으로 Notion `Docs Path` 를 patch 하면 실수로 원본 페이지의 연결이 사라질 수 있다. polish 라운드에서 명시적 opt-in 옵션으로 노출 후보.
- 로컬 파일 검색은 `docs/tasks` 디렉터리만 단일 깊이로 스캔 — 하위 폴더 / symlink 시나리오는 본 follow-up 범위 밖.
- `Task ID` 가 비어 있고 `Docs Path` 도 비어 있는 row 는 여전히 자동 번호 할당으로 진행한다 (기존 동작 유지). 향후 strict 정책이 필요하면 `--strict-task-id` 같은 옵션 후보.
- TASK-011 Status 는 그대로 `Review`. mismatch 보호 + duplicate 검출 + verbose trace 까지 안전하게 들어왔고, reviewer 가 (a) 실제 mismatch 시나리오를 워크스페이스에서 1회 재현, (b) `task pull` (actual) 까지 회귀 확인 후 `Done` 처리.

## Review Notes

(미수행 — Reviewer Agent 또는 사람이 채움)
