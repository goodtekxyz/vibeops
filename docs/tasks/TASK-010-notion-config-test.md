# TASK-010 · `notion init` and `notion test`

## Status

planned

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

(미수행)

## Test Result

(미수행)
