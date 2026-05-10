# TASK-011 · `notion sync` and `task pull`

## Status

planned

## MVP Phase

MVP 4 · Notion Dashboard Sync

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

(미수행)

## Test Result

(미수행)
