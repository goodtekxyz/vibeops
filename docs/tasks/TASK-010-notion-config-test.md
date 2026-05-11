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
