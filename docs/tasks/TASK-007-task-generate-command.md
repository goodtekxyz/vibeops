# TASK-007 · `task generate` command

## Status

planned

## MVP Phase

MVP 2 · Project Planner

## Goal

`vibeops task generate`를 구현한다. `docs/project/05-backlog.md`의 항목(또는 사용자가 직접 제공한 제목)을 받아 **TASK 파일을 생성**하거나, 생성용 **프롬프트를 출력**한다.

## Background

`vibeops plan`이 백로그를 만들었다면, 그 다음 단계는 각 백로그 항목을 “Cursor가 단독으로 실행 가능한” TASK 파일로 펼치는 것이다. 본 TASK는 그 펼침을 두 가지 모드로 지원한다.

1. **prompt 모드(기본)** — 백로그 항목을 받아 “이 항목을 TASK 파일로 펼쳐 줘”라는 Cursor 붙여넣기 프롬프트를 출력.
2. **scaffold 모드(`--scaffold`)** — TASK 파일 골격을 직접 생성(섹션 헤더만 채운 빈 파일).

## Scope

- `src/commands/taskGenerate.ts`
- `src/tasks/idAllocator.ts` — 다음 TASK 번호 결정(`docs/tasks/*.md` 스캔, 최대 N+1)
- `src/tasks/scaffold.ts` — `docs/tasks/TASK-NNN-<slug>.md` 골격 작성기(본 저장소 TASK 템플릿과 동일한 섹션 헤더 사용)
- `src/planner/taskPrompt.ts` — `.vibeops/prompts/task-generate.md` + 백로그 항목 + project 컨텍스트로 프롬프트 빌드
- 옵션:
  - `--from-backlog <id-or-title>` — 백로그 항목 지정
  - `--title <text>` — 즉석 제목
  - `--scaffold` — 파일 직접 생성(프롬프트 출력 X)
  - `--mvp <n>` — MVP Phase 자동 채움
  - `--dry-run` — 파일 생성 없이 “어떤 파일이 생길지”만 출력
  - `--out <path>` — 프롬프트 모드에서 파일로 저장

## Out of Scope

- 백로그 항목을 자동으로 추가하는 동작(백로그는 `vibeops plan`이 다룬다)
- LLM 직접 호출

## Acceptance Criteria

1. `vibeops task generate --from-backlog "TASK-001"` 또는 `--title "..."` 입력 시, 다음 TASK 번호(예: TASK-013)와 slug를 결정해서 stdout에 **TASK 파일을 만들 Cursor 프롬프트**를 출력한다.
2. `--scaffold` 옵션 시 `docs/tasks/TASK-NNN-<slug>.md`가 본 저장소와 동일한 섹션 헤더(Status, MVP Phase, Goal, Background, Scope, Out of Scope, Acceptance Criteria, Files to Inspect First, Expected Files to Change, Risks, Test Plan, Rollback Plan, Implementation Plan, Result, Test Result)로 생성된다.
3. 같은 번호가 이미 존재하면 충돌 안내 후 exit code ≠ 0.
4. `--dry-run`은 어떤 파일이 생길지(또는 어떤 프롬프트가 나올지)를 보여주고 실제 변경 0건.
5. 생성된 TASK 파일의 `Status`는 `planned`, `MVP Phase`는 `--mvp` 옵션 또는 “(미정)”.
6. 프롬프트 모드의 출력은 Cursor에 그대로 붙여 넣을 수 있는 단일 마크다운이다.

## Files to Inspect First

- `templates/docs/tasks/TASK-000-example.md` (TASK-003)
- `templates/.vibeops/prompts/task-generate.md` (TASK-003)
- `src/tasks/scanner.ts` (TASK-004)
- `src/planner/buildPrompt.ts` (TASK-006)

## Expected Files to Change

- 신규: `src/commands/taskGenerate.ts`, `src/tasks/idAllocator.ts`, `src/tasks/scaffold.ts`, `src/planner/taskPrompt.ts`
- 신규: `tests/task-generate.test.ts`
- 갱신: 본 TASK Result/Test Result, `docs/project/03-current-state.md`, `docs/logs/YYYY-MM-DD.md`

## Risks

- slug 생성에서 한글/특수문자 처리 → ASCII만 남기고 `-`로 join.
- 번호 충돌(여러 사람이 동시에 작업) → MVP에서는 동시성 가정하지 않음. 충돌 시 명령이 안내만 한다.

## Test Plan

- vitest:
  - 빈 `docs/tasks/` → 다음 번호 = 1
  - 기존 TASK-001..012 → 다음 번호 = 13
  - `--scaffold` 시 파일 내용에 모든 필수 섹션 헤더가 포함되는지 검사
  - `--dry-run` 시 파일 변경 없음
- 수동: 본 저장소에서 `vibeops task generate --title "Sample" --scaffold --dry-run`.

## Rollback Plan

- 브랜치 폐기. 사용자가 `--scaffold`로 생성된 파일이 마음에 안 들면 그 파일만 삭제하면 된다.

## Implementation Plan

1. `idAllocator.ts`로 다음 번호 결정.
2. slug 유틸 작성(소문자/하이픈).
3. `scaffold.ts`로 섹션 헤더 골격 작성기. 본 저장소 TASK 템플릿과 1:1 매칭.
4. `taskPrompt.ts`로 프롬프트 빌드.
5. `commands/taskGenerate.ts`에 옵션 처리.
6. tests + 문서 갱신.

## Result

(미수행)

## Test Result

(미수행)
