# TASK-003 · Templates — rules, agents, prompts, workflows, docs

## Status

planned

## MVP Phase

MVP 1 · Project Bootstrapper

## Goal

`vibeops init`이 복사할 **실제 템플릿 콘텐츠**를 작성한다: Cursor Rules, `AGENTS.md`, `docs/project/*` 골격, `docs/tasks/` 템플릿, `.vibeops/agents/*`, `.vibeops/prompts/*`, `.vibeops/workflows/*`. TASK-002에서 만든 복사기는 그대로 두고, 안에 들어갈 콘텐츠를 채우는 것에 집중한다.

## Background

VibeOps의 가치는 “부트스트랩되는 그 콘텐츠가 좋은가”에 달려 있다. 이 콘텐츠가 Cursor에게 주는 운영 지침과 작업 입력이 된다.

## Scope

### `AGENTS.md` 템플릿

- VibeOps 자신 저장소의 `AGENTS.md`와 같은 구조: 읽기 순서, 진실 공급원, 단일 TASK, dry-run, 작업 완료 후 보고 형식.
- 단, 프로젝트 이름은 placeholder로 두고 `init`에서 `.vibeops.json`의 name으로 치환.

### `.cursor/rules/*.mdc`

- `00-vibeops-governance.mdc`: 진실 공급원, 한 TASK 원칙, 리팩터링·연동 제한.
- `01-ai-workflow.mdc`: 시작 전 읽기, 중복 구현 금지, `--dry-run` 우선.
- `02-docs-update.mdc`: 구현 끝나면 `03-current-state.md` / TASK / `docs/logs/`를 함께 갱신.

### `docs/project/*` 골격 6개

- `00-overview.md` ~ `05-backlog.md`. **빈 섹션 헤더**와 “이 섹션에는 무엇을 채워야 하는지” 가이드 코멘트를 둔다(Cursor가 `vibeops plan`으로 채울 자리).

### `docs/tasks/TASK-000-example.md`

- 본 저장소의 TASK 템플릿과 같은 섹션을 가진 예시(또는 `_template.md`).

### `docs/logs/.keep`

- 빈 파일(또는 디렉터리 README).

### `.vibeops/agents/*.md` (4개)

- `planner.md` — 역할: 아이디어 → docs/project 골격 + 백로그. 출력 형식 규칙.
- `builder.md` — 역할: 한 TASK를 받아 코드 변경. Scope 밖 금지, 문서 갱신 의무.
- `reviewer.md` — 역할: 변경 diff를 보고 Acceptance Criteria 통과 여부 점검.
- `releaser.md` — 역할: 변경을 커밋·머지 가이드. 자동 머지는 하지 않음을 명시.

### `.vibeops/prompts/*.md`

- `plan.md` — `vibeops plan` 출력 본문에서 사용할 Cursor 붙여넣기 프롬프트 템플릿.
- `task-generate.md` — 백로그 항목을 받아 TASK 파일 골격을 만들 프롬프트 템플릿.
- `task-builder.md` — `vibeops task prompt ... --agent builder` 출력의 기본 골격.

### `.vibeops/workflows/*.md`

- `task-lifecycle.md` — `start → prompt → check → done` 흐름 설명.
- `notion-sync.md` — 무엇이 동기화되고 무엇이 안 되는지(메타만 푸시).

## Out of Scope

- `init` 명령의 로직 변경(이미 TASK-002 완료 전제)
- 도메인 명령(`plan`, `task ...`, `notion ...`)의 동작 구현

## Acceptance Criteria

1. `vibeops init`을 빈 디렉터리에서 실행하면 위에 나열된 **모든 파일**이 placeholder가 아니라 **실제 작성된 내용**으로 생긴다.
2. 생성된 `AGENTS.md`와 `.cursor/rules/*`만으로 “단일 TASK 원칙, dry-run 우선, 구현 후 docs 3종 갱신” 규칙이 명확히 읽힌다.
3. `docs/project/00-overview.md` ~ `05-backlog.md` 골격은 **섹션 헤더와 가이드 코멘트**가 있고, Cursor가 `vibeops plan`으로 채울 자리가 비어 있다.
4. `.vibeops/agents/*.md` 네 개는 각각 **역할 · 입력 · 출력 형식 · 금지사항**을 명확히 기재한다.
5. `.vibeops/prompts/*.md` 세 개는 `{{TASK_ID}}`, `{{TASK_PATH}}`, `{{PROJECT_NAME}}` 등의 **치환 자리**가 정의되어 있다.
6. `vibeops init`의 “설치된 파일 수”가 TASK-002 결과 대비 늘어나며 모든 파일이 콘텐츠를 가진다.

## Files to Inspect First

- `templates/**` (TASK-002에서 만든 스켈레톤)
- `src/bootstrap/manifest.ts`
- 본 저장소의 `AGENTS.md`, `.cursor/rules/*.mdc`, `docs/project/*`, `docs/tasks/*` — 참조 원본

## Expected Files to Change

- 신규/갱신: `templates/AGENTS.md`
- 신규/갱신: `templates/.cursor/rules/{00-vibeops-governance,01-ai-workflow,02-docs-update}.mdc`
- 신규/갱신: `templates/docs/project/{00..05}-*.md`
- 신규/갱신: `templates/docs/tasks/TASK-000-example.md`
- 신규/갱신: `templates/.vibeops/agents/{planner,builder,reviewer,releaser}.md`
- 신규/갱신: `templates/.vibeops/prompts/{plan,task-generate,task-builder}.md`
- 신규/갱신: `templates/.vibeops/workflows/{task-lifecycle,notion-sync}.md`
- 갱신: `src/bootstrap/manifest.ts` (placeholder 항목 제거 또는 경로 조정)
- 갱신: `docs/project/03-current-state.md`, 본 TASK Result/Test Result, `docs/logs/YYYY-MM-DD.md`

## Risks

- 템플릿이 “VibeOps 자신”을 가정하는 톤으로 적혀 다른 프로젝트에 부자연스러울 수 있음 → 일반화된 표현 사용, 프로젝트 이름은 placeholder.
- 치환 토큰(`{{PROJECT_NAME}}` 등)을 도입하면 `installer`가 token replace를 알아야 함 → TASK-002 단계에서는 없었으면 본 TASK에서 가벼운 placeholder replace 유틸을 추가.

## Test Plan

- vitest로 tmpdir에 `init` 실행 → 각 기대 파일이 존재하고 “placeholder” 문자열이 남지 않은지(예: `{{PROJECT_NAME}}`이 치환되었는지) 확인.
- 각 `.vibeops/agents/*.md`에 “역할/입력/출력 형식/금지사항” 헤더가 모두 있는지 grep.
- 수동: 새 디렉터리에서 `vibeops init --name test-proj`로 설치 후 `tree`로 결과 확인.

## Rollback Plan

- 브랜치 폐기로 충분.

## Implementation Plan

1. 본 저장소의 `AGENTS.md`·`.cursor/rules/`·`docs/project/`를 참고해 `templates/` 안에 동일한 골격을 만든다(저장소 자신 vs 사용자 프로젝트용으로 톤만 일반화).
2. `.vibeops/agents/*.md` 4개에 역할·입력·출력 형식·금지사항을 채운다.
3. `.vibeops/prompts/*.md` 3개에 placeholder 치환 자리를 정의한다.
4. `.vibeops/workflows/*.md` 2개를 작성한다.
5. `installer`에 단순 placeholder 치환(`{{PROJECT_NAME}}` 등) 유틸을 추가한다(설치 시 `.vibeops.json`의 값으로 치환).
6. tests 갱신.
7. 문서 갱신.

## Result

(미수행)

## Test Result

(미수행)
