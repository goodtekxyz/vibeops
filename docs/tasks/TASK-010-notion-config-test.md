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

Notion 연동의 **설정과 검증**을 만든다.

- `vibeops notion init` — `.vibeops.env`에 필요한 환경 변수 자리를 안내·작성 보조.
- `vibeops notion test` — Notion API에 접근 가능한지, Project DB / Task DB의 **필수 속성 스키마**가 맞는지 검증.

실제 동기화는 [TASK-011](TASK-011-notion-sync-task-pull.md)에서.

## Background

Notion은 source of truth가 아니라 human dashboard다. 그래도 “연결되었는지/스키마가 맞는지”는 분명해야 한다. 이 검증을 sync 전 단계로 분리하면, 사용자가 sync 직전에 정확한 오류 메시지를 받게 된다.

## Scope

### `.vibeops.env`(개발자 머신 로컬 파일)와 `.vibeops.env.example`(저장소에 포함)

필요 변수:

- `NOTION_API_KEY` — Notion integration secret
- `NOTION_PROJECT_DB` — 프로젝트(또는 단일 프로젝트 페이지) DB id
- `NOTION_TASK_DB` — TASK DB id

### `vibeops notion init`

- `.vibeops.env`가 없으면 `.vibeops.env.example`을 복사하고 “이 키들을 채워주세요” 안내.
- 이미 있으면 “현재 키 존재 여부” 표시(값은 마스킹).
- `--print` 옵션: `.vibeops.env.example`의 내용을 stdout으로 출력.
- 사용자에게 “Notion에서 integration을 만들고 DB를 integration에 공유해야 한다”는 단계도 안내 텍스트에 포함.

### `vibeops notion test`

- `.vibeops.env`를 읽고 `@notionhq/client`로:
  - users.me() 호출 → API key 유효성
  - databases.retrieve(`NOTION_TASK_DB`) → 접근 가능 + 필수 속성 존재 여부
  - databases.retrieve(`NOTION_PROJECT_DB`) → 동일
- **필수 Task DB 속성**(MVP 안):
  - `Name` (title)
  - `TaskId` (rich_text 또는 unique) — “TASK-NNN”
  - `Status` (status 또는 select) — planned / in_progress / done
  - `Priority` (select)
  - `Branch` (rich_text)
  - `DocsPath` (url 또는 rich_text)
  - `ResultSummary` (rich_text)
- **필수 Project DB 속성**:
  - `Name` (title)
  - `CurrentStateSummary` (rich_text)
  - `NextTaskId` (rich_text)
- 출력: 성공/실패를 항목별 체크리스트로. exit code는 모든 항목 통과 시 0, 하나라도 실패 시 ≠ 0.
- `--json`으로 기계 가독 출력.

## Out of Scope

- 실제 데이터 동기화(→ TASK-011)
- Webhook / 실시간 푸시
- 스키마를 자동 생성(`create database`) — MVP에서는 사용자가 직접 만든다(다만 init 안내 텍스트에 “필수 속성 목록”을 포함)

## Acceptance Criteria

1. `vibeops notion init`이 `.vibeops.env`가 없으면 example을 복사하고 다음 키 목록을 안내한다: `NOTION_API_KEY`, `NOTION_PROJECT_DB`, `NOTION_TASK_DB`.
2. `vibeops notion init --print`는 stdout에 키 목록을 인쇄하고 파일을 만들지 않는다.
3. 비어 있는 키가 있을 때 `vibeops notion test`는 어떤 키가 비었는지 안내하며 종료 코드 ≠ 0(네트워크 호출 시도 X).
4. 키가 채워졌고 권한이 맞으면 `vibeops notion test`가 항목별로 ✅/❌를 출력하고, 모든 ✅면 종료 코드 0.
5. Notion 응답에 필수 속성이 없으면 누락 속성 이름을 보여주고 종료 코드 ≠ 0.
6. `--json`은 valid JSON.
7. `.vibeops.env`는 어떤 명령에서도 stdout에 평문 값을 그대로 노출하지 않는다(마스킹).

## Files to Inspect First

- `src/config/projectConfig.ts` (TASK-002)
- `templates/.vibeops.env.example` (TASK-003)

## Expected Files to Change

- 신규: `src/commands/notion/{init,test}.ts`
- 신규: `src/notion/client.ts` (얇은 wrapper)
- 신규: `src/notion/schema.ts` (필수 속성 정의)
- 신규: `src/config/envConfig.ts` (`.vibeops.env` 읽기)
- 신규: `tests/notion.test.ts` (네트워크 호출은 mock — `@notionhq/client`를 stub)
- 갱신: `package.json`(`@notionhq/client`, `dotenv` 의존성)
- 갱신: 본 TASK Result/Test Result, `docs/project/03-current-state.md`, `docs/logs/YYYY-MM-DD.md`

## Risks

- Notion의 “status” 타입과 “select” 타입 구분 — 둘 다 허용하는 검증을 둔다.
- API rate limit / 네트워크 장애 → `test`는 5초 timeout과 명확한 에러 메시지.
- 사용자가 `.vibeops.env`를 커밋할 위험 → `init`이 `.gitignore`에 라인을 추가하거나 안내.

## Test Plan

- vitest로 `@notionhq/client` mock해서:
  - users.me 성공/실패 케이스
  - databases.retrieve가 필수 속성 모두 가진 경우/누락된 경우
  - 빈 환경 변수 케이스 → 네트워크 호출 0회
- 수동: 실제 Notion workspace에 작은 DB를 만들고 `vibeops notion test` 실행.

## Rollback Plan

- 브랜치 폐기. `.vibeops.env`는 사용자 로컬 파일이므로 영향 없음.

## Implementation Plan

1. `src/config/envConfig.ts`로 dotenv 기반 로딩 + 마스킹 유틸.
2. `src/notion/schema.ts`에 필수 속성 정의.
3. `src/notion/client.ts`에서 `@notionhq/client` 초기화.
4. `commands/notion/init.ts`: 파일 복사·안내·`--print`.
5. `commands/notion/test.ts`: 검증 흐름 + `--json`.
6. tests + 문서 갱신.

## Result

2026-05-11 완료(Review 대기). `vibeops notion init`/`notion test` 본체를 구현했다. 사용자의 갱신된 요구를 반영해 원 TASK-010 문서의 옵션 / env 변수 / DB 스키마를 다음과 같이 재구성했다.

### 사용자 요구사항 vs 원 TASK-010 문서 (deviation)

- 환경 변수: 원 문서는 `NOTION_API_KEY` / `NOTION_PROJECT_DB` / `NOTION_TASK_DB` 셋을 모두 `.vibeops.env`에 둠. 실제 구현은 **`NOTION_TOKEN` 하나만** 비밀로 둔다(`.vibeops.env`). DB id 는 `.vibeops.json` 의 `notion.projectsDatabaseId` / `notion.tasksDatabaseId` 에 들어가 일반 설정 파일과 같이 커밋된다.
- `notion init` 옵션: 원 문서는 `--print` (`.vibeops.env.example` 내용을 stdout 으로 인쇄). 실제 구현은 **`--dry-run / --enable / --projects-db <id> / --tasks-db <id> / --cwd`**. `.vibeops.env` 는 기본적으로 자동 생성하지 않는다. 단, interactive setup 에서 사용자가 **"Paste NOTION_TOKEN now? = Yes"** 를 명시적으로 선택한 경우에만 생성/업데이트한다.
- `notion test` 옵션: `--json` 유지. 원 문서의 7-단계 task DB 속성(`Name / TaskId / Status / Priority / Branch / DocsPath / ResultSummary`) 대신, 사용자 갱신 요구의 **10 속성**(`Name / Task ID / Project ID / Status / Priority / MVP Phase / Git Branch / Docs Path / Summary / Result Summary`)을 강제. Projects DB 도 **8 속성**(`Name / Project ID / Status / Local Path / Git Repo / Current Phase / Docs Path / Summary`)으로 확장.
- `Status` 타입: 원 문서는 `status 또는 select` 허용. 실제 구현은 **`status` 만 허용**(사용자 요구 그대로). `Git Repo` 만 예외로 `rich_text` 또는 `url` 둘 다 허용.

### 추가/변경 파일

- 신규: `src/lib/notion-env.ts` — `.vibeops.env` 미니 파서(`KEY=value`, 따옴표 제거, `#` 주석 무시; dotenv 의존성 없음). `loadNotionEnv(cwd)` 가 `.vibeops.env` → `process.env` 순으로 token 을 찾아 반환. `maskToken(value)` 가 `first4…last4 (len=N)` 형태로 마스킹.
- 신규: `src/lib/notion-schema.ts` — `PROJECTS_DB_PROPERTIES`(8) + `TASKS_DB_PROPERTIES`(10) 정의. `validateDatabaseSchema()` 가 `databases.retrieve()` 응답의 `properties` 맵을 받아 누락(`missing`) / 타입 불일치(`type-mismatch`)를 `SchemaViolation[]` 으로 반환.
- 신규: `src/lib/notion-client.ts` — `@notionhq/client` 의 **lazy 동적 import**(`await import("@notionhq/client")`). 5s timeout. `users.me()` / `databases.retrieve(id)` 만 노출. `notionApiError(err)` 가 `unauthorized / restricted_resource / object_not_found / validation_error / rate_limited / request_timeout / ETIMEDOUT` 등 코드에 친절한 한국어 해석을 붙인다.
- 신규: `src/commands/notion-init.ts` — `.vibeops.json` 에 `notion` 섹션을 안전하게 merge(다른 필드 보존), `.vibeops.env.example` 에 `NOTION_TOKEN=` 한 줄을 append(기존 줄 보존, 이미 있으면 skip), Projects/Tasks DB 필수 속성 콘솔 가이드. `--dry-run` 시 diff 만 출력하고 파일 변경 0건.
- 신규: `src/commands/notion-test.ts` — 8-step pre-flight + 6-step API 검증. 각 단계가 `ok / fail / skip` 셋 중 하나. 한 단계가 `fail` 이면 후속 단계는 자동 `skip`. `--json` 으로 동일 데이터를 valid JSON 으로 출력. exit code 모두 ok=0, 하나라도 실패=1.
- 갱신: `src/types/config.ts` — `NotionConfig { enabled, projectsDatabaseId, tasksDatabaseId }` 추가, `VibeopsConfig.notion?` optional 로 round-trip. `NotionEnvSnapshot.hasToken` 신규 필드.
- 갱신: `src/lib/config.ts` — `readConfig` 가 `notion` 섹션을 안전하게 파싱(잘못된 모양이면 무시). `mergeNotionConfig(base, patch)` 가 다른 필드를 절대 덮어쓰지 않는 patch 머지를 수행. `readNotionEnvSnapshot()` 이 `NOTION_TOKEN` 도 보고.
- 갱신: `src/status/format.ts` — `NOTION_TOKEN` 한 줄 + `.vibeops.json` 의 notion 섹션 요약(`enabled / projectsDatabaseId / tasksDatabaseId` 설정 여부) 표시.
- 갱신: `src/cli.ts` — `notion init` / `notion test` 옵션 노출 (`--dry-run / --enable / --projects-db / --tasks-db / --cwd` · `--json / --cwd`).
- 갱신: `package.json` + `pnpm-lock.yaml` — `@notionhq/client@^5.20.0` dependency 추가.

### 안전장치 (보안)

- **`.vibeops.env` 는 기본적으로 자동 생성하지 않는다.** 단, interactive setup 에서 사용자가 **"Paste NOTION_TOKEN now? = Yes"** 를 명시적으로 선택한 경우에만 생성/업데이트한다. `dry-run` / `non-interactive` / `No` 선택 / 비-TTY 경로에서는 만들지 않는다.
- **`NOTION_TOKEN` 의 원본 값은 stdout 에 절대 노출하지 않는다.** `notion test` 가 마스킹 형식(`secr…zzzz (len=40)`)으로만 표시. 실제 검증: `grep -F "secret_aBcDeF1234567890zzzzzzzzzzzzzzzzz"` → 일치 없음.
- **Notion API 는 read-only.** `users.me` / `databases.retrieve` 만 호출. DB 생성·페이지 푸시·메타 변경 없음.
- **5s timeout** 으로 Notion 장애 시에도 명령이 매달리지 않음.
- 본 라운드 GitHub API · Cursor CLI · LLM API · Git mutation 호출 0건.

### 범위 밖 (TASK-011 이후)

- `notion sync` 본체 구현 — TASK-011.
- `task pull` (Notion → docs/tasks 메타 풀백) — TASK-011.
- Notion Webhook / 실시간 동기화 — MVP 4 밖.
- Notion DB 자동 생성 — 영구적으로 out-of-scope (사람이 만든다).

## Result — UX 패치 (2026-05-11)

사용자 요청에 따라 `notion init` 의 Yes/No 질문 UX 를 전면 개편했다. 핵심: **`confirm` prompt 를 0건 사용하지 않는다.** 모든 Yes/No 는 **2-choice `select` prompt** (Yes / No) 로 통일되어, 사용자가 y/n 을 타이핑하지 않고 ←/→ 또는 ↑/↓ + Enter 만으로 선택한다.

### 신규/변경

- 신규 helper `yesNoSelect` (`src/lib/inquirer-helpers.ts`) — 사용자가 직접 명시한 시그니처 그대로:

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

- 신규 wrapper `askYesNo({ message, nonInteractive, defaultValue })` — CI / 비-TTY 환경에서는 `defaultValue` 를 그대로 반환하고, 그렇지 않으면 `yesNoSelect` 로 위임. 다른 명령에서도 재사용 가능.
- 신규 헬퍼 `inspectEnvFile(cwd)` / `writeNotionTokenToEnvFile(cwd, token)` (`src/lib/notion-env.ts`) — `.vibeops.env` 에 `NOTION_TOKEN=` 라인을 안전 추가/교체(다른 라인 보존, 파일 없으면 헤더와 함께 생성). 호출자가 token 값을 stdout 으로 흘리지 않는 것은 여전히 보장.
- 갱신 `src/commands/notion-init.ts` — interactive 흐름 추가. 다음 5 yes/no 가 **모두 `select` 기반**이며, `confirm` import 0건:
  1. **Use Notion dashboard sync?** — 기본값 = 기존 `notion.enabled`. No 선택 시 DB id / 토큰 질문은 건너뛴다.
  2. **Continue without database IDs?** — 두 DB id 가 모두 빈 경우에만. 기본값 = No (안전한 쪽). No → 명령 취소 + 친절 안내, Yes → enabled=true 만 두고 ID 는 나중에.
  3. **Paste NOTION_TOKEN now?** — 기본값 = No. Yes → `password` prompt (입력값이 화면에 표시되지 않음) → `.vibeops.env` 에 저장.
  4. **Overwrite existing NOTION_TOKEN?** — `.vibeops.env` 에 이미 토큰이 있을 때만. 기본값 = No.
  5. (예약) 향후 추가될 yes/no 도 같은 helper 를 사용해야 한다(코드 리뷰 시 `confirm` import 금지 규칙).
- 갱신 `src/cli.ts` — `notion init` 에 `--non-interactive` 옵션 추가. TTY 환경에서도 강제 non-interactive(CI 용).
- 갱신 `--dry-run` 동작 — interactive 질문을 건너뛰고 계획만 출력(파일·token 입력 0건).
- 자동 fallback — `process.stdin.isTTY !== true` 면 자동으로 non-interactive 모드(`--non-interactive` 와 동일). pipe / `</dev/null` / CI 에서도 안전.

### 보안 정책 (재확인)

- `NOTION_TOKEN` 원본 값은 **stdout 에 절대 노출하지 않는다.** interactive 입력은 `@inquirer/prompts` `password` 의 `mask: "*"` 로 마스킹. 저장된 파일을 다시 보일 때도 `maskToken(value)` 형식(`first4…last4 (len=N)`)만 사용.
- `.vibeops.env` 는 기본적으로 자동 생성하지 않는다. 단, **사용자가 interactive setup 에서 "Paste NOTION_TOKEN now? = Yes" 를 명시적으로 선택한 경우에만** 생성/업데이트한다. dry-run / non-interactive / No 선택 / 비-TTY 경로에서는 절대 만들지 않는다.
- `.vibeops.env` 는 `.gitignore` 대상이며, 기존 라인을 보존하고 `NOTION_TOKEN=` 라인만 추가/교체한다.
- `confirm` prompt 0건 → "y" / "n" 키 입력을 강제하지 않는다.

## Test Result

- `pnpm typecheck` → exit 0.
- `pnpm build` → exit 0.
- `pnpm dev notion --help` → init / test / sync 3-개 노출.
- `pnpm dev notion init --help` → 5 옵션 (`--dry-run / --enable / --projects-db / --tasks-db / --cwd`) 노출.
- `pnpm dev notion test --help` → 2 옵션 (`--json / --cwd`) 노출.
- Sandbox(`/var/folders/.../vibeops-notion-XXXX/`) — `init` 후 11 케이스 검증:

  | # | 명령 | 검증 |
  | --- | --- | --- |
  | 1 | `notion init --dry-run` | `notion` 섹션 추가 + env.example 에 `NOTION_TOKEN=` 추가 계획만 출력, 파일 0건 변경 |
  | 2 | `notion init` (real) | `.vibeops.json` 에 `{ "notion": { "enabled": false, "projectsDatabaseId": "", "tasksDatabaseId": "" } }` 추가. `.vibeops.env.example` 끝에 `NOTION_TOKEN=` append (기존 키 보존) |
  | 3 | `notion init --enable --projects-db PROJ123 --tasks-db TASK456` | `notion.enabled=true / projectsDatabaseId=PROJ123 / tasksDatabaseId=TASK456` 정확히 설정 |
  | 4 | `notion test` (no token) | `NOTION_TOKEN 로드 ✗ + 후속 6 단계 자동 skip`. exit 1 |
  | 5 | `notion test --json` (no token) | valid JSON, `ok=false, checks.length=11, env.tokenMasked=null` |
  | 6 | `notion test` (token present, `enabled=false`) | token 마스킹 `secr…zzzz (len=40)`, `enabled = true ✗`, 후속 6 단계 skip |
  | 7 | `notion test` (token present, `enabled=true`, fake token) | SDK 로드 ✓, `users.me → HTTP 401 → "NOTION_TOKEN 이 거부됐다…"` 친절한 해석, 후속 4 단계 자동 skip |
  | 8 | `notion init` (재실행, idempotent) | `unchanged .vibeops.json`, `unchanged .vibeops.env.example` |
  | 9 | 보안 — token 값이 stdout 에 새지 않는지 | `grep -F "secret_aBcDeF1234567890zzzzzzzzzzzzzzzzz"` → 일치 없음 |
  | 10 | `notion init --enable --projects-db PROJ-NEW --tasks-db TASK-NEW --dry-run` | diff `~ projectsDatabaseId PROJ123 → PROJ-NEW`, `~ tasksDatabaseId TASK456 → TASK-NEW` 표시. 실제 config 미변경 |
  | 11 | `notion init` (in /tmp 디렉터리) | `✗ .vibeops.json 이 없습니다. 먼저 vibeops init 를 실행…` + exit 1 |

- 라이브 저장소 read-only: `node dist/cli.js notion init --dry-run --cwd /Users/hjhamm/goodtek/vibeops`. 명령 후 `.vibeops.json` / `.vibeops.env.example` git status → 미변경.
- 본 라운드 LLM · Cursor CLI · Notion mutation · GitHub API · Git mutation 호출 0건. `users.me` 1회 + `databases.retrieve` 0회(token 거부로 skip)만 외부 호출.
- 보류: vitest 자동 회귀(TASK-001 ~ 010 누적). polish 라운드 통합 예정.

### UX 패치 (2026-05-11 follow-up) 검증

- `pnpm typecheck` / `pnpm build` → exit 0.
- `pnpm dev notion init --help` → `--non-interactive` 옵션 노출(`TTY 환경에서도 대화형 질문 없이 flag 값 / 기본값만 사용 (CI 용)`).
- `grep -nE "confirm\(|from \"@inquirer/prompts\".*\\bconfirm\\b" src/commands/notion-init.ts` → 0 매칭. (`inquirer-helpers.ts` 의 기존 `askConfirm` 은 다른 명령용으로 보존되지만, notion init 은 `askYesNo` / `password` 만 사용.)
- Sandbox `/var/folders/.../vibeops-notion-ux-XXXX/`:
  - `notion init --dry-run` → interactive 질문 0건, plan만 출력, 파일 0건.
  - `notion init --non-interactive --enable --projects-db PROJ-A --tasks-db TASK-B` → 질문 0건, `.vibeops.json` 에 정확히 merge, exit 0.
  - `notion init </dev/null` (비-TTY) → `mode  non-interactive (flags only)` 자동 fallback.
  - `node` 직접 호출 검증: built `dist/lib/inquirer-helpers.js` 의 `yesNoSelect` 가 `select`(not `confirm`) 호출 + `[{name:"Yes", value:true},{name:"No", value:false}]` choices + `loop: false` + `pageSize: 2` 그대로 노출 확인.
  - `expect(1)` 으로 실제 interactive 시나리오 시뮬레이션: Q1 (Use Notion sync) Enter / Projects DB Enter / Tasks DB Enter / Q2 (Paste NOTION_TOKEN now?) Enter 까지 4 단계 모두 `\r` 만으로 진행되어 "Next steps" 출력까지 도달 — y/n 타이핑 강제 0건 ✓.
  - `writeNotionTokenToEnvFile` 단독 검증: 첫 호출 → `created:true`, 두 번째 호출(다른 token) → `replaced:true`, `inspectEnvFile` 가 새 token 인식. 파일 내용에 다른 라인은 없고 헤더 + `NOTION_TOKEN=…` 한 줄만.
  - 보안 — token 원본 값 `secret_bbbbbbbbbbbbbbbbbbbbbbbbbbbb` 가 어떤 CLI stdout 출력에도 등장하지 않음 (probe 스크립트 외부에서는 grep 일치 0건).
- 라이브 저장소 read-only — `git status --porcelain | grep -E "\.vibeops\.(json|env)"` → 0 매칭. `.vibeops.json` / `.vibeops.env*` 미변경.

## Result — Search-driven DB picker (2026-05-11 follow-up #2)

본 라운드는 `vibeops notion init` 의 DB ID 입력 단계를 **`POST /v1/search` 기반 select 흐름**으로 교체했다. 사용자가 NOTION_TOKEN 만 정확히 입력하면, integration 에 공유된 database 목록을 그대로 select prompt 에서 고른다. 32-char id 를 직접 복사할 필요가 없어진다.

### 변경 요약

- **Interactive 흐름 재배치**: `enabled (Q1) → Paste NOTION_TOKEN now (Q2 + 선택적 Overwrite Q3 + password) → Search accessible Notion databases now? (Q-search) → Projects DB select → Tasks DB select → 최종적으로 비어 있는 ID 만 manual fallback → 비어 있으면 Q4 (Continue without DB IDs)`. token 을 먼저 받아야 DB search 가 가능하므로 순서가 뒤집혔다.
- **DB select**: 각 선택지는 `${title}  (${shortId}) — ${tag}: ${matched}/${total} matched, …` 라벨. `tag` 는 추천이면 `recommended`, 아니면 `projects` 또는 `tasks` (선택 단계 종류 기준). 마지막에 항상 `Enter database ID manually…` + `Skip for now (use existing value or leave empty)` 가 붙는다.
- **추천 정렬 (`sortForKind`)**: kind 별로 `matched/total ≥ 60%` 이면 strong → 그 외 matched > 0 partial → matched = 0 rest. 같은 tier 안에서는 matched 내림차순, type-mismatch 오름차순, title 알파벳. `recommendedIds` 첫 항목이 default select 값.
- **즉시 schema 검증 (fail-soft)**: select 직후 또는 manual 입력 직후 schema 검사. search 응답에 `properties` 가 있으면 (`renderImmediateSchemaCheck`) 그걸로, 없으면 `databases.retrieve(id)` 한 번 호출 (`softValidateSchema`). 결과는 `✓` 또는 `! 일부 누락 (matched/total, N missing, M mismatch)` warning 으로만 출력. **init 자체는 절대 막지 않는다** — 엄격한 검증은 `vibeops notion test` 의 책임.
- **DB search 가드**:
  - `--dry-run` / `--non-interactive` / 비-TTY → 질문 자체를 안 함 → API 호출 0건.
  - `--projects-db` 와 `--tasks-db` 가 둘 다 제공되면 search 단계를 건너뜀.
  - 사용자가 token 입력을 거부하고 `.vibeops.env` / `process.env` 에도 없으면 (`resolveEffectiveToken === null`) search 를 건너뛰고 manual fallback 만 안내.
  - Search 결과가 비어 있으면 `Notion returned no accessible databases. Make sure your Projects and Tasks databases are shared with the VibeOps integration: DB page → ⋯ → Connections → VibeOps` 안내.
  - 검색 실패(timeout / unauthorized / restricted_resource / object_not_found / validation_error / rate_limited) 는 `explainSearchError` 로 한국어 메시지 + warning. init 자체는 manual fallback 으로 이어진다.
- **API surface 확장**: `NotionClient.search(options)` 추가 (lazy `@notionhq/client` 그대로, 5s timeout). 인터페이스: `query? / objectFilter ('database'|'page') / pageSize / startCursor`. 응답은 `{ results: NotionSearchHit[]; hasMore; nextCursor }`. 결과 객체 타입은 `database` 외에 Notion 측 API 마이그레이션 중인 `data_source` 도 그대로 받아들인다.
- **Discovery 모듈**: `src/lib/notion-discovery.ts` 신규.
  - `discoverDatabases(client)` — pagination 자동, 50건 cap (`NOTION_DISCOVERY_MAX`), `truncated` 반환. `object === 'page'` 는 제외, `data_source` 는 포함, id 중복 제거.
  - `normalizeHit(hit)` — `NotionDatabaseChoice` (title 추출 + `(Untitled database)` fallback + 양쪽 schema score).
  - `sortForKind('projects'|'tasks', dbs)` — 추천 정렬 + `recommendedIds`.
  - `buildChoiceLabel({ kind, database, isRecommended })` — select 라벨.
  - `shortId(id)` — `firstN…lastN` 압축 표시 (12자 이하면 그대로).
- **보안 강화**:
  - **`token` 을 CLI 인자로 받지 않는다** (`--token` 옵션 없음, env 또는 interactive `password` 만). 이 정책은 TASK-010 부터 유지 — 이번에 명시.
  - 새 `sanitiseApiError(err)` 가 Notion SDK 에러 메시지에서 `secret_…` / `ntn_…` / `Bearer …` 패턴을 `***` 로 치환해 출력. 5s timeout error 등 다른 에러도 동일 sanitize.
  - 모든 search 결과는 read-only — page body block / DB schema 변경 0건.

### 새 / 갱신된 파일

- 신규 `src/lib/notion-discovery.ts` — search 호출 + normalize + 추천 점수 + 정렬 + 라벨 빌더.
- 갱신 `src/lib/notion-client.ts` — `NotionSearchHit / NotionSearchResult / NotionSearchOptions` 추가, `NotionClient.search` 추가, SDK 호출 wrapping (`page_size` 기본 50, 응답 표준화).
- 갱신 `src/commands/notion-init.ts` — 흐름 재배치 (`token → search → DB select → manual fallback`), `resolveEffectiveToken / pickDatabasesViaSearch / pickOneDatabase / renderImmediateSchemaCheck / softValidateSchema / sanitiseApiError / explainSearchError / maskId` 도입.

### 보안 정책 (재확인)

- `NOTION_TOKEN` 원본 값은 stdout / 에러 메시지 어디에도 노출되지 않는다. 입력은 `password` 마스킹, 마스킹 표시는 `maskToken()` (`first4…last4 (len=N)`), SDK 에러는 `sanitiseApiError()` 가 `secret_***` / `ntn_***` / `Bearer ***` 로 치환.
- **token 을 CLI 인자로 받는 옵션은 없다.** `.vibeops.env` 또는 `process.env.NOTION_TOKEN` 또는 interactive `password` 만.
- `.vibeops.env` 는 기본적으로 자동 생성하지 않는다. 단, interactive setup 에서 사용자가 **"Paste NOTION_TOKEN now? = Yes"** 를 명시적으로 선택한 경우에만 생성/업데이트한다. dry-run / non-interactive / No 선택 / 비-TTY 경로에서는 만들지 않는다.
- `search` / `databases.retrieve` 외에 mutation API 는 본 라운드 호출 0건.

## Test Result — Search-driven DB picker

### 정적 검증

| 검사                                | 결과 |
| ----------------------------------- | :--: |
| `pnpm typecheck` (tsc --noEmit)     | exit 0 |
| `pnpm build`                        | exit 0 |
| `ReadLints` (3 갱신 + 1 신규 ts)    | 0 warnings |
| `node dist/cli.js notion init --help` | 옵션 6개 (`--dry-run / --enable / --projects-db / --tasks-db / --non-interactive / --cwd`) 정확 노출 |

### Sandbox `/tmp/vibeops-task010-ux/`

- **`vibeops init --name task010-ux`** → 39 파일 설치, `.vibeops.json` 정상.
- **`notion init --dry-run`** → 질문 0건, search 호출 0건, plan 출력 후 `dry-run — no files were written.`.
- **`notion init --non-interactive --enable --projects-db test-projects-db --tasks-db test-tasks-db`** → 질문 0건, search 0건, `.vibeops.json.notion = { enabled: true, projectsDatabaseId: "test-projects-db", tasksDatabaseId: "test-tasks-db" }` 정확 저장.
- **`notion test`** → `NOTION_TOKEN 로드 ✗ + 후속 6 단계 skip`. exit 1.

### Unit (`node` 직접 호출, mock Client)

- **`shortId`** — `1a2b3c4d-1111-2222-3333-444444440000` → `1a2b3c4d…0000` / `abc` → `abc` (12자 이하 그대로).
- **`normalizeHit`** — `title=[]` 입력 → `(Untitled database)` fallback.
- **Score 검증**:
  - Projects DB(8 속성 완비) → `projectsScore.matched=8/8`, `tasksScore.matched=5/10` (공유 속성만).
  - Tasks DB(10 속성 완비) → `tasksScore.matched=10/10`, `projectsScore.matched=5/8`.
  - 부분 일치 + `Status` 타입 mismatch → `{ matched:1, missing:8, typeMismatch:1, total:10 }` 정확.
- **`sortForKind('projects')`** → `[VibeOps Projects, VibeOps Tasks, My Notes]`, `recommendedIds = [Projects, Tasks]` (둘 다 60% 이상).
- **`sortForKind('tasks')`** → `[VibeOps Tasks, VibeOps Projects, My Notes]`, `recommendedIds = [Tasks]` (Projects 는 5/10 < 60% 라 partial).
- **`buildChoiceLabel`** — recommended → `recommended: matched/total`; non-recommended → `projects: matched/total, N missing`.
- **`discoverDatabases` pagination** (mock 2 batches) → 호출 2회, 결과 4개, `page` 객체 자동 제외, `data_source` 포함, 중복 id skip, `truncated=false`.
- **`discoverDatabases` cap** (mock 60건 DB) → 결과 50건, `truncated=true` 정확 (cap 도달 시 hasMore 반영).
- **빈 결과** (mock empty) → `count=0, truncated=false, totalHits=0`.

### 보안 검증

- **`sanitiseApiError` regex** — Notion 에러 메시지에 든 `secret_aBcDeF1234567890zzzzzzzzzzzzzzzz1234` / `ntn_abc…` / `Bearer ntn_…` 패턴을 `secret_*** / Bearer ***` 으로 치환 (raw 토큰 0 hit).
- **CLI 옵션 surface** — `--help` 출력에 `--token` 옵션 없음. `loadNotionEnv` 외 token 입력 경로 0개.
- **본 저장소 read-only** — `git status --short` 후 `.vibeops.json` / `.vibeops.env*` 미변경, `src/commands/notion-init.ts` 외 우발 변경 0건.

### Skip 된 항목 (의도)

- 실 Notion 토큰이 없는 환경이라 사람이 직접 search → select → schema check 까지 가는 라이브 시나리오는 본 라운드에서 검증하지 못함. polish 라운드(vitest 통합) 또는 사용자 수동 회기 (`pnpm dev notion init` → token → DB 선택 → `vibeops notion test`) 로 확인 권장.
- `data_source` 객체 정렬·라벨 표시는 mock 시나리오로만 covered. Notion 측 API 마이그레이션 결과 일부 응답 형태가 달라질 경우 polish 라운드에서 대응.

---

## Result — Discovery bug fix: object filter `data_source` (2026-05-11 follow-up #3)

### 배경 (재현 가능한 에러)

`vibeops notion init` 에서 "Search accessible Notion databases now? Yes" 를 선택하면 Notion REST API 가 다음과 같이 거부했다.

```
body.filter.value should be `"page"` or `"data_source"`, instead was `"database"`.
```

원인: 현재 Notion REST API (`POST /v1/search`) 는 `filter.property = "object"` 의 `value` 로 **`page` 또는 `data_source` 만** 받는다. 과거에 허용되던 `"database"` 는 더 이상 통하지 않는다. VibeOps 가 호출하던 값은 `"database"` 였다.

### 변경

- **`src/lib/notion-client.ts`**
  - `NotionSearchObjectFilter` 타입을 `"data_source" | "page"` 로 좁힘 (`database` 영구 제거).
  - SDK 호출 시그니처도 동일하게 갱신. `database` 는 더 이상 컴파일러 통과 안 됨.
- **`src/lib/notion-discovery.ts`**
  - `discoverDatabases(client)` 가 항상 `objectFilter: "data_source"` 로 호출하도록 변경. 내부 헬퍼 `runSearchPaginated(client, filter)` 추출.
  - `validation_error` (또는 `body.filter.value` / `data_source` 관련 메시지를 포함한 4xx) 가 떨어지면 한 번 `objectFilter: "page"` 로 폴백한다. `page` 응답은 우리 kind guard (`object !== "database" && object !== "data_source"`) 에서 모두 제외되므로 결과 0건이 되고, 사용자는 자연스럽게 manual id 입력 경로로 안내된다.
  - 폴백이 발생하면 결과에 `fallbackFrom: "data_source"`, `filterUsed: "page"` 를 실어서 callers 가 사용자에게 한 줄 알릴 수 있게 한다.
  - 응답 normalize 는 그대로 `database` / `data_source` 둘 다 받아 들인다 (Notion 측에서 양 형태가 혼재할 수 있음 가정).
  - 신규 export `NotionDataSourceChoice` — `NotionDatabaseChoice` 와 동일한 shape 의 타입 alias. 신규 콜사이트에서 의도를 명확히 하기 위함. 기존 `NotionDatabaseChoice` 그대로 사용 가능.
- **`src/commands/notion-init.ts`**
  - `pickDatabasesViaSearch` 에서 `discoverDatabases` 결과의 `fallbackFrom` 이 있을 경우 한국어 warning 한 줄 + dim 한 줄로 "현재 Notion API 는 search filter \"data_source\" 만 받는다" 라는 내부 원인을 남기되, 사용자에게는 그대로 manual fallback 또는 재시도 흐름을 안내.
  - `explainSearchError` 의 `validation_error` 분기를 강화: `body.filter.value` 또는 `data_source` 가 메시지에 포함되면 SDK 가 오래됐을 가능성 + manual id 입력 fallback 까지 한국어로 안내.

### 보안

- token 원문은 어떤 경로에서도 echo 되지 않는다. 폴백 메시지에 실리는 reason 은 Notion 의 `message` 필드(`body.filter.value should be ...`)만 사용 — 토큰을 포함하지 않는다.
- `sanitiseApiError` 가 그대로 `secret_***` / `Bearer ***` 마스킹을 수행.
- DB id 직접 입력 fallback (`--projects-db` / `--tasks-db` / manual 입력) 은 그대로 유지.

### Non-goals (이 follow-up 의 한계)

- `notion sync` / `task pull` 본체 (TASK-011) 는 건드리지 않았다.
- `@notionhq/client` 버전 자체는 그대로 유지 — 우리는 SDK 가 어떤 버전이든 받아들이도록 wrapper 시그니처만 좁혔다.

## Test Result — Discovery bug fix

### 정적 검증

- `pnpm typecheck` ✅ — 0 error (`NotionSearchObjectFilter` 좁히기로 인한 회귀 없음).
- `pnpm build` ✅ — `dist/lib/notion-discovery.js` 컴파일 결과에서 grep:
  - `objectFilter: filter` ✅ (변수만, 리터럴 `"database"` 없음)
  - `runSearchPaginated(client, "data_source")` ✅ 최초 호출
  - `runSearchPaginated(client, "page")` ✅ 폴백 호출
  - 리터럴 `"database"` 는 주석/타입에만 존재, API 호출 인자로는 0건.

### CLI 검증

- `pnpm exec tsx src/cli.ts notion init --dry-run` → 정상. dry-run 가드는 변경 없음 — 어떤 토큰도 받지 않고 파일 변경 0건.
- `pnpm exec tsx src/cli.ts notion init --help` → `--token` 옵션 없음 (보안 invariant 유지).

### 실 토큰 검증 (사용자 수동 회기 권장)

- 자동화에서는 실 토큰을 사용할 수 없어 본 라운드에서는 mock 으로만 검증했다. 사용자 측 회기 절차:
  1. `pnpm dev notion init`
  2. NOTION_TOKEN 붙여 넣기
  3. "Search accessible Notion databases now?" → Yes
  4. `/v1/search` 가 `validation_error` 없이 통과하고, 검색 결과가 select 프롬프트에 나오는지 확인
  5. (검증 보너스) 의도적으로 잘못된 SDK / 옛 SDK 버전을 시뮬레이션할 경우, warning `Notion 이 object filter "data_source" 를 거부해서 "page" 로 폴백했다.` 가 노출되고 manual id 입력 흐름으로 빠지는지 확인.

### Risks / 후속 polish

- Notion 측에서 `data_source` 와 별도로 응답의 `properties` 위치가 옮겨질 가능성. `normalizeHit` 은 `hit.properties` 가 객체이면 그대로 채택하지만, 향후 SDK 가 `data_source.properties` 형태로 wrapping 한다면 별도 polish round 가 필요.
- `validation_error` 메시지 텍스트 (`body.filter.value`) 가 미래에 바뀔 수 있으므로 `isUnsupportedObjectFilterError` 는 `data_source` substring 도 함께 본다.

---

## Result — Inline DB discovery via page scan (2026-05-11 follow-up #4)

### 배경

integration 이 부모 page 에는 access 권한이 있지만, 그 안의 inline database / data_source 가 `POST /v1/search filter=data_source` 결과에 등장하지 않는 case 가 있다. 직전 패치(follow-up #3) 까지의 UX 는 이 상태에서 "No accessible databases" 로 종료한 뒤 32-char id 직접 입력만 안내했다. 사용자는 inline DB 의 id 를 직접 알아내야 했다.

### 결정

- **검색 흐름을 2 단계로 확장**한다.
  1. `searchDataSources(client)` → ≥ 1 hit 이면 그대로 사용.
  2. 0 hit 이면 `searchPages(client)` 호출 → 사용자에게 "Select a page to scan for inline databases" select prompt 노출 → 사용자가 page 를 선택하면 `blocks.children.list(pageId)` 로 **1-depth** 스캔.
  3. 스캔에서 `child_database` / `data_source` 블록을 추출해 `NotionDatabaseChoice` 후보로 정규화. 그 후보들이 Projects / Tasks DB 선택지에 들어간다.
  4. 어떤 단계든 결과 0개면 manual id 입력 fallback 유지.
- **재귀 없음, 1-depth 만 스캔**한다. block scan 은 **최대 100 block** (`NOTION_PAGE_SCAN_MAX_BLOCKS`). page search 는 기존 `NOTION_DISCOVERY_MAX = 50` 그대로.
- inline 후보의 schema 정보는 `blocks.children.list` 응답에 없으므로, `properties = undefined` 로 두고 `projectsScore` / `tasksScore` 는 `{ matched:0, missing:total }` 로 채운다. 사용자가 선택한 직후 `databases.retrieve(id)` 로 `softValidateSchema` 가 흐름에 그대로 붙는다 (이미 manual 입력 path 와 동일).
- **권한 안내 메시지 개선**:
  ```
  VibeOps can access pages, but no data sources were returned by Notion search.
  If your databases are inline, select the parent page so VibeOps can scan its child blocks.
  If they still do not appear, open each database as a page and add the VibeOps integration directly.
  ```
- **select choice label 확장**: source = `"page-block"` 인 후보는 `${title}  (${shortId(id)}) — inline database in ${parentTitle}: no property info` 형태로 노출. `kind`(projects/tasks) tag 자리에 `inline database in ${parentTitle}` 가 들어가는 방식.

### API surface (신규)

- `NotionClient.blocksChildrenList({ blockId, pageSize?, startCursor? }): Promise<NotionBlockList>` — 5s timeout, page_size ≤ 100.
- `searchDataSources(client)` — pure `objectFilter: "data_source"` (no fallback).
- `searchPages(client)` — pure `objectFilter: "page"`, page title 추출 (`properties.<title-prop>.title[]` 우선, top-level `title[]` 도 지원).
- `listPageChildren(client, pageId)` — paginated 1-depth scan, cap = `NOTION_PAGE_SCAN_MAX_BLOCKS` (100).
- `discoverInlineDatabasesFromPage(client, pageId, parentTitle?)` — `child_database` / `data_source` 블록만 추출해 `NotionDatabaseChoice` 로 노멀라이즈. id 중복 dedup, 알 수 없는 타입은 무시.
- `discoverNotionDatabases(client)` — 오케스트레이터. `{ dataSources, pages, warnings, dataSourcesEmpty, dataSourceErrored, dataSourcesTruncated, pagesTruncated }` 반환. `validation_error` 는 흡수해서 `dataSourceErrored=true` 로 표시 + page search 로 진행. 그 외 transport 에러는 throw.
- `NotionDatabaseChoice` 확장: `source?: "search" | "page-block"`, `parentPageId?: string`, `parentPageTitle?: string`. `object` 에 `"child_database"` 가 추가됐다.

### UX / CLI 흐름 (notion init)

```
→ Notion /v1/search 호출 (read-only, 5s timeout, page_size ≤ 50)…
   case A — data_source ≥ 1:
     ┌─ Select Projects DB  (방향키 · Enter — 추천: N 개)
     └─ Select Tasks    DB  (방향키 · Enter — 추천: N 개)
   case B — data_source 0, pages ≥ 1:
     "VibeOps can access pages, but no data sources were returned by Notion search.
      If your databases are inline, select the parent page so VibeOps can scan its child blocks.
      If they still do not appear, open each database as a page and add the VibeOps integration directly."
     · N pages accessible — 부모 페이지를 골라 1-depth 블록을 스캔한다 (cap 100 blocks)
     ┌─ Select a page to scan for inline databases
     │     VibeOps  (1a2b3c4d…0001)
     │     Misc Notes  (4d5e6f7g…0002)
     │     Skip page scan — 32-char id 직접 입력으로 진행
     └→ blocks.children.list(1a2b3c4d…0001) — 1-depth scan (cap 100 blocks, read-only)…
        · 2 inline database 후보 발견.
     ┌─ Select Projects DB
     │     Projects  (1a2b3c4d…0003) — inline database in VibeOps: no property info
     │     Tasks     (1a2b3c4d…0004) — inline database in VibeOps: no property info
     │     Enter database ID manually…
     │     Skip for now
     └─ (선택 후 즉시 databases.retrieve → softValidateSchema)
   case C — data_source 0, pages 0:
     "· 접근 가능한 page 도 없다 — 32-char id 직접 입력으로 진행."
```

### 보안 / 안전성

- read-only API 만 사용 — `search`, `blocks.children.list`, `databases.retrieve` (즉시 schema 검증).
- token 원문 출력 0건 — 모든 API 에러 메시지는 `sanitiseApiError` 가 `secret_***` / `Bearer ***` 마스킹.
- 5s timeout 유지 (lazy `@notionhq/client` 그대로).
- page scan cap 100 — 사용자가 잘못된 큰 페이지를 골라도 폭주하지 않는다.
- recursive scan 없음 — `has_children` 은 무시한다.
- DB id 직접 입력 fallback 은 모든 분기에서 유지.

### Non-goals (이 follow-up 의 한계)

- 1-depth 만 스캔. `child_page` 안의 inline DB 는 polish round 에서 다룬다.
- `notion sync` / `task pull` 본체는 건드리지 않았다.

## Test Result — Inline DB discovery via page scan

### 정적 검증

- `pnpm typecheck` ✅ exit 0.
- `pnpm build` ✅ exit 0.
- `ReadLints (notion-discovery.ts, notion-client.ts, notion-init.ts)` → 0 warnings.

### CLI 검증

- `pnpm exec tsx src/cli.ts notion init --dry-run` → 정상 plan 출력, 파일 변경 0건, 어떤 토큰도 받지 않음.
- `pnpm exec tsx src/cli.ts notion init --help` → `--token` 옵션 없음 (보안 invariant 유지).

### Unit (mock NotionClient, dist/lib 직접 호출) — 6 시나리오

1. **data_source ≥ 1** (Projects + Tasks 두 개 hit) → `discoverNotionDatabases` 가 `dataSources.length===2, pages.length===0` 반환. ✅
2. **data_source 0, pages 1** (VibeOps page 만 공유) → `dataSourcesEmpty=true, dataSourceErrored=false, pages=[VibeOps]` 반환, `pages[0].title === "VibeOps"` 추출. ✅
3. **inline child_database 2개** (VibeOps page 의 children: paragraph + Projects + Tasks + embed) → `discoverInlineDatabasesFromPage` 가 2개만 반환. `source=page-block`, `parentPageId=pageRoot`, `parentPageTitle=VibeOps`, `object=child_database`. ✅
4. **inline data_source 블록 호환** (`type=data_source, data_source.id=dsXYZ, title=[{plain_text:"Pulled DS"}]`) → 1건 추출, `object=data_source`. ✅
5. **cap 100 blocks** (150건 mock) → `listPageChildren` / `discoverInlineDatabasesFromPage` 모두 정확히 100건에서 cut. ✅
6. **validation_error 폴백** (`data_source` search 에 `validation_error` 던지면 page search 로 계속) → `dataSourceErrored=true`, `pages.length===1`. ✅

### 보안 / 안전성 검증

- mock 흐름에서 `pages.create` / `pages.update` / `databases.query` 호출 0건.
- `--token` CLI 옵션 부재 invariant 유지.
- `git status --short` → 변경된 파일은 본 라운드 4 개 (notion-client.ts / notion-discovery.ts / notion-init.ts / docs/*).
- `discoverNotionDatabases` 의 `warnings` 배열에 token / id 가 평문으로 실리지 않는다 (Notion `message` 필드만 전달).

### 실 토큰 회기 (사용자 수동)

자동화에서 실 토큰을 쓸 수 없어 본 라운드에서는 mock 으로만 covered. 사용자 측 회기 권장 절차:

1. `pnpm dev notion init`
2. `NOTION_TOKEN` 붙여 넣기.
3. "Search accessible Notion databases now? Yes".
4. data_source 0개 케이스에서: "VibeOps can access pages, …" 안내 + page select 가 노출되는지 확인.
5. 부모 page (VibeOps) 선택 → "1-depth scan (cap 100 blocks)" 로그 → 후보 2개 검출 → Projects / Tasks 각각 select.
6. 선택 직후 `softValidateSchema` 가 `databases.retrieve(id)` 로 schema 검증을 돌리고 `✓` / `! 일부 누락` warning 을 출력하는지 확인.
7. `vibeops notion test` 가 동일 id 로 8/6 단계 모두 ok / fail 정확히 보고하는지 확인.

### Skip 된 항목 (의도)

- `child_page → 내부 inline DB` 재귀 스캔은 본 TASK 범위 아님 — polish round 후보.
- inline DB schema (`properties`) preview 는 본 라운드에서 search 단계에서 제공하지 않는다. 사용자 선택 직후 `databases.retrieve(id)` 1회 호출로 동일한 schema soft-validate 가 작동한다.

---

## See also — Notion 2025-09-03 data_source resolver (TASK-011 follow-up #3)

`notion init` 의 manual id 입력 직후 `softValidateSchema` 도 같은 `resolveNotionDataSourceTarget` 경유로 갈아끼웠다 (TASK-011 follow-up #3). database → data_source 자동 해석, 다형 네이밍 파싱(`data_sources` / `dataSources` / `child_data_sources` / `childDataSources` + 중첩 `data_source.id`), `--debug-shape` 진단, `notionVersion: "2025-09-03"` 명시 pin 등 본체 변경 내역은 `docs/tasks/TASK-011-notion-sync-task-pull.md` 의 `## Result — Notion 2025-09-03 surface lock-in + --debug-shape 진단` 절을 참고.

## See also — API-first page child_database → data_source discovery (TASK-011 follow-up #4)

`notion init` 의 discovery 저장 정책이 한 번 더 바뀌었다. 이제 page scan 으로 찾은 inline `child_database` block id 자체를 저장하지 않고, 그 block id를 `retrieveDatabase(block.id)` 로 읽은 뒤 `database.data_sources[]` 의 실제 `data_source` id를 `retrieveDataSource` 로 검증한다. `properties` 가 있는 data_source 만 후보가 되며, `.vibeops.json` 에는 `notion.projectsTargetId` / `notion.tasksTargetId` 로 resolved data_source id를 우선 저장한다. 기존 `projectsDatabaseId` / `tasksDatabaseId` 는 container/debug fallback 으로 보존한다. 자세한 변경과 검증은 `docs/tasks/TASK-011-notion-sync-task-pull.md` 의 `## Result — API-first page child_database → data_source discovery` 절을 참고.
