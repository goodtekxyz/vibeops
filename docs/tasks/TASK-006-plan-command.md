# TASK-006 · `plan` command

## Status

planned

## MVP Phase

MVP 2 · Project Planner

## Goal

`vibeops plan`을 구현한다. 프로젝트 아이디어를 받아서 **Cursor에 붙여넣을 계획 수립 프롬프트**를 만들고, 옵션에 따라 `docs/project/*` 골격을 갱신한다.

## Background

`vibeops init` 직후 사용자에게는 빈 `docs/project/00-overview.md` ~ `05-backlog.md`만 있다. 이걸 사람이 직접 채우는 대신, “이 아이디어를 받아서 이 6개 문서를 채워 줘”라는 **표준 프롬프트**를 출력해주는 것이 plan의 역할이다. 자동 호출이 아니라 사람이 Cursor에 붙여 넣는 흐름이다.

## Scope

- `src/commands/plan.ts`
- `src/planner/buildPrompt.ts` — 아이디어 + 현재 `docs/project/*` 상태 + `.vibeops/prompts/plan.md` 템플릿을 합쳐 단일 프롬프트 출력
- `src/planner/applyPlan.ts` — `--apply` 옵션 시 외부에서 받은 plan 결과를 `docs/project/*`에 반영
- 입력 방식:
  - `vibeops plan --idea "<text>"` — 인라인
  - `vibeops plan --idea-file <path>` — 파일에서 읽기
  - stdin 파이프(둘 다 없을 때)
- 옵션:
  - `--out <path>` — 프롬프트를 파일에 저장
  - `--apply <path>` — Cursor가 만든 plan(예: JSON 또는 마크다운 묶음)을 받아 `docs/project/*`로 분배
  - `--dry-run` — `--apply`와 함께 사용 시 “어떤 파일을 어떻게 바꿀지”만 보여주고 실제 변경 0건

## Out of Scope

- VibeOps가 직접 LLM을 호출해 docs/project를 채우는 것 — 영구 비스코프
- 백로그를 자동으로 정렬·우선순위 매기기

## Acceptance Criteria

1. `vibeops plan --idea "BYOBrowser SaaS"`가 다음을 포함하는 마크다운 프롬프트를 stdout에 출력한다.
   - 아이디어 본문
   - 채워야 할 6개 파일 경로와 각 파일에 필요한 섹션 목록
   - 출력 형식 규약(예: “각 파일은 별도 ```fence``` 블록으로 묶어 응답”)
2. 출력은 Cursor에 그대로 붙여 넣을 수 있다(외부 의존 0).
3. `--apply <path>` 시 입력 파일에 위 형식이 들어 있으면 `docs/project/*` 6개를 갱신한다(이미 있는 파일은 기본적으로 덮어쓰는 `--force` 또는 “_v2 백업 후 덮어쓰기” 중 하나의 명확한 정책을 가진다).
4. `--apply --dry-run`은 “어떤 파일을 얼마나 바꿀지” diff 요약만 출력하고 실제 변경 0건.
5. `vibeops plan --help`가 옵션과 출력 형식을 보여준다.

## Files to Inspect First

- `templates/.vibeops/prompts/plan.md` (TASK-003)
- `templates/docs/project/*.md` (TASK-003)
- `src/commands/agent.ts` (TASK-005) — 프롬프트 출력 패턴 재사용

## Expected Files to Change

- 신규: `src/commands/plan.ts`, `src/planner/buildPrompt.ts`, `src/planner/applyPlan.ts`
- 신규: `tests/plan.test.ts`
- 갱신: `.vibeops/prompts/plan.md` (필요 시)
- 갱신: 본 TASK Result/Test Result, `docs/project/03-current-state.md`, `docs/logs/YYYY-MM-DD.md`

## Risks

- “Cursor가 만든 plan을 어떤 형식으로 받을지”를 너무 자유롭게 두면 `--apply` 파서가 깨지기 쉬움 → 형식을 1개로 고정(예: 6개 마크다운 fenced block, 각 블록 첫 줄에 파일 경로 주석).
- `--apply`가 사용자가 손으로 채운 부분을 덮어쓸 위험 → 기본 동작은 “기존 파일을 `*.bak`로 백업하고 덮어씀” + 안내.

## Test Plan

- vitest로 다음 케이스 검증:
  - `--idea` 인라인 → 출력이 6개 섹션 경로를 포함
  - `--apply <fixture>` → `docs/project/*` 6개가 갱신됨
  - `--apply --dry-run` → 파일 변경 없음
  - stdin 파이프 입력도 동작
- 수동: 본 저장소에서 `vibeops plan --idea "Sample"`로 출력 확인.

## Rollback Plan

- 브랜치 폐기. 사용자 측에서 `--apply`로 docs가 덮어써졌을 경우 `*.bak` 파일에서 복원.

## Implementation Plan

1. `.vibeops/prompts/plan.md`의 출력 형식 계약을 명문화(파일 경로 주석 + fenced block).
2. `buildPrompt.ts`로 “아이디어 + 현재 docs 상태 + 형식 계약”을 합쳐 마크다운 빌드.
3. `applyPlan.ts`에서 입력을 파싱해 6개 파일에 분배. 백업 정책 적용.
4. `commands/plan.ts`에서 옵션 처리.
5. tests + 문서 갱신.

## Result

(미수행)

## Test Result

(미수행)
