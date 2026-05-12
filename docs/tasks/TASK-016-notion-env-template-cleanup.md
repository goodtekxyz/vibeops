# TASK-016 · Notion env template cleanup

## Status

Review

## MVP Phase

후속 (post-MVP 4 follow-up)

## Goal

새 프로젝트에서 `vibeops init` 이 만들어 주는 `.vibeops.env.example` 과 관련 템플릿 문서(`templates/docs/project/08-env.md`, `templates/.vibeops/workflows/notion-sync.md`)를 최신 VibeOps Notion 구조에 맞춰 정리한다. legacy 환경변수(`NOTION_API_KEY` / `NOTION_PROJECT_DB` / `NOTION_TASK_DB`)는 기본 템플릿 출력에서 제거하고 `NOTION_TOKEN` + `.vibeops.json` `notion.{projectsTargetId,tasksTargetId}` 구조로 단일화한다.

## Background

TASK-015 에서 `vibeops status` 출력의 legacy Notion 환경변수 노출을 제거했지만, 새 프로젝트가 `vibeops init` 으로 받는 `.vibeops.env.example` 에는 여전히 `NOTION_API_KEY=` / `NOTION_PROJECT_DB=` / `NOTION_TASK_DB=` 가 남아 있어 신규 사용자가 잘못된 env 키를 채울 위험이 크다. 같은 이유로 `templates/docs/project/08-env.md` 의 env 표, `templates/.vibeops/workflows/notion-sync.md` 의 설정 안내도 최신 구조와 어긋난다.

## Scope

- `src/bootstrap/installer.ts` `envExampleContents()` 가 `NOTION_TOKEN=` 한 줄(헤더 + 빈 값)만 출력하도록 수정. `NOTION_API_KEY` / `NOTION_PROJECT_DB` / `NOTION_TASK_DB` 라인 제거. `GITHUB_TOKEN` / `OPENAI_*` 같은 다른 키 기본 추가 금지.
- `templates/docs/project/08-env.md` 의 env 표 정리:
  - `NOTION_TOKEN` 한 줄만 기본 변수로 표시.
  - target ID 는 환경변수가 아니라 `.vibeops.json` 의 `notion.projectsTargetId` / `notion.tasksTargetId` 에 저장된다는 한 줄 안내 추가.
  - legacy 키는 같은 문서에 "legacy — 더 이상 사용되지 않음" 정도의 한 줄 호환성 노트로만 남기거나 완전 제거.
- `templates/.vibeops/workflows/notion-sync.md` 의 설정 블록에서 legacy 키 3개 제거 → `NOTION_TOKEN` 으로 갱신, 그리고 target id 는 `.vibeops.json` 에 저장된다는 줄 추가.
- vibeops 자체 프로젝트의 동일한 파일들(`.vibeops.env.example`, `docs/project/08-env.md`, `.vibeops/workflows/notion-sync.md`)도 같은 내용으로 동기화 (template 과 일치 보장).
- `README.md` Notion Setup 섹션에 "Legacy `NOTION_API_KEY` / `NOTION_PROJECT_DB` / `NOTION_TASK_DB` are no longer used — only `NOTION_TOKEN` is read." 한 줄 추가.

## Out of Scope

- `vibeops notion init` / `notion test` / `notion sync` 동작 변경.
- `src/lib/notion-env.ts` 의 token loader 로직 변경 (TASK-015 에서 이미 `NOTION_TOKEN` 만 사용).
- vibeops 자체의 `docs/project/01-architecture.md` / `02-tech-stack.md` 같은 1차 설계 문서 갱신 (역사적 design 기록은 그대로 유지, 현재 상태는 `03-current-state.md` 에서 책임짐).
- 실제 `.vibeops.env` 파일 생성 또는 커밋.

## Acceptance Criteria

- `src/bootstrap/installer.ts` 의 `envExampleContents()` 가 `NOTION_TOKEN=` 한 줄 외에 다른 키를 출력하지 않는다.
- 새 임시 디렉터리에서 `node dist/cli.js init --git --initial-commit` 후 생성된 `.vibeops.env.example` 안에 `NOTION_API_KEY` / `NOTION_PROJECT_DB` / `NOTION_TASK_DB` 가 없고 `NOTION_TOKEN=` 만 존재.
- `templates/docs/project/08-env.md` 와 `templates/.vibeops/workflows/notion-sync.md` 에 legacy 키 0건 (`grep -E 'NOTION_API_KEY|NOTION_PROJECT_DB|NOTION_TASK_DB' templates/` 결과 0건).
- vibeops 자체의 동기화 파일(`.vibeops.env.example`, `docs/project/08-env.md`, `.vibeops/workflows/notion-sync.md`)에도 legacy 키 0건.
- `vibeops status` 출력은 TASK-015 결과를 그대로 유지 (회귀 없음).
- `pnpm typecheck` / `pnpm build` / `pnpm smoke` 통과.
- 실제 `.vibeops.env` 파일은 새로 생성하거나 커밋하지 않는다.
- `NOTION_TOKEN` 원문은 어떤 출력에도 등장하지 않는다.

## Files to Inspect First

- `src/bootstrap/installer.ts`
- `.vibeops.env.example`
- `templates/docs/project/08-env.md`
- `templates/.vibeops/workflows/notion-sync.md`
- `docs/project/08-env.md`
- `.vibeops/workflows/notion-sync.md`
- `README.md` (Notion Setup 섹션)

## Expected Files to Change

- `src/bootstrap/installer.ts`
- `.vibeops.env.example`
- `templates/docs/project/08-env.md`
- `templates/.vibeops/workflows/notion-sync.md`
- `docs/project/08-env.md`
- `.vibeops/workflows/notion-sync.md`
- `README.md`
- `docs/project/03-current-state.md`
- `docs/logs/2026-05-12.md`
- `docs/tasks/TASK-016-notion-env-template-cleanup.md` (이 파일)

## Risks

- 기존 프로젝트가 `.vibeops.env` 에 legacy 키를 쓰고 있다면 그 값들은 VibeOps 가 어차피 더 이상 읽지 않음 → 사용자 영향 없음.
- 기존 프로젝트의 `08-env.md` / `notion-sync.md` 는 `vibeops init --force` 가 아니면 덮어쓰지 않음 → 사용자가 직접 갱신해야 하지만 본 TASK 범위는 새 install 경로 정리이므로 허용.
- README 의 single-line 호환성 안내가 잘못 읽혀 legacy 키를 부활시킬 위험은 낮지만, 문구를 `no longer used` 로 단정해 혼동을 줄임.

## Test Plan

- `pnpm typecheck`
- `pnpm build`
- `pnpm smoke`
- `/tmp/vibeops-task016-sandbox` 에서 `node dist/cli.js init --git --initial-commit` 실행 → `.vibeops.env.example` 안에 `NOTION_TOKEN=` 만 있는지 확인 (`grep -c '^NOTION_' .vibeops.env.example` = 1, legacy 키 grep 0건).
- 동일 sandbox 에서 `node dist/cli.js status` 가 TASK-015 와 동일하게 동작하는지 회귀 확인.
- 저장소 전체 `grep -E 'NOTION_API_KEY|NOTION_PROJECT_DB|NOTION_TASK_DB' templates/ src/bootstrap/installer.ts .vibeops.env.example docs/project/08-env.md .vibeops/workflows/notion-sync.md` 결과 0건.

## Rollback Plan

`installer.ts`, `templates/**`, `.vibeops.env.example`, `docs/project/08-env.md`, `.vibeops/workflows/notion-sync.md`, `README.md`, 문서 갱신을 Git revert. 코드 동작 변화는 install 시 생성되는 파일 내용뿐이라 영향 좁음.

## Git Context

- Branch: main 직접 진행 (TASK-014 / 015 와 동일 정책)
- Touched paths: `src/bootstrap/`, `templates/`, `.vibeops.env.example`, `docs/project/`, `.vibeops/workflows/`, `README.md`, `docs/tasks/`, `docs/logs/`

## Notion Page

미연동.

## Implementation Plan

1. `src/bootstrap/installer.ts` `envExampleContents()` 를 `NOTION_TOKEN=` 한 줄 + 헤더만 출력하도록 단순화.
2. `templates/docs/project/08-env.md` 의 env 표를 `NOTION_TOKEN` 한 줄로 줄이고 target ID 보관 위치 (`.vibeops.json` `notion.*TargetId`) 안내 + legacy 키는 deprecation 한 줄로 정리.
3. `templates/.vibeops/workflows/notion-sync.md` 설정 블록 갱신 → `NOTION_TOKEN` + target id 안내.
4. vibeops 자체의 `.vibeops.env.example`, `docs/project/08-env.md`, `.vibeops/workflows/notion-sync.md` 도 같은 형태로 sync.
5. README "Notion Setup" 섹션 끝에 legacy 키 한 줄 호환성 노트 추가.
6. 검증: typecheck / build / smoke + 임시 sandbox `init` 결과의 `.vibeops.env.example` 확인 + 저장소 전체 grep 0건.
7. `03-current-state.md`, `docs/logs/2026-05-12.md`, 본 TASK 파일 Result/Test Result 업데이트.

## Result

- `src/bootstrap/installer.ts` `envExampleContents()` 가 `NOTION_TOKEN=` 한 줄만 출력하도록 정리. legacy 3종(`NOTION_API_KEY` / `NOTION_PROJECT_DB` / `NOTION_TASK_DB`) 제거. 헤더 주석에 "NOTION_TOKEN is the only secret VibeOps reads" 와 Notion integration URL 안내 추가. GitHub / OpenAI 키는 의도적으로 미시드.
- vibeops 자체 `.vibeops.env.example` 도 같은 내용으로 재작성해 새 install 결과와 1:1 동기화.
- `templates/docs/project/08-env.md` env 표를 `NOTION_TOKEN` 한 줄로 축소. `.vibeops.json` 의 `notion.{projectsTargetId,tasksTargetId}` 가 target ID 저장 위치임을 본문에 명시. legacy 키는 본문 인용(`>`) 한 줄로 "더 이상 사용되지 않음" 호환성 안내만 유지.
- vibeops 자체 `docs/project/08-env.md` 도 동일 내용으로 sync.
- `templates/.vibeops/workflows/notion-sync.md` 의 설정 코드블록을 `NOTION_TOKEN` 안내 + target ID 저장 위치 안내로 갱신. legacy 키 3종은 본문 인용 한 줄로만 남김.
- vibeops 자체 `.vibeops/workflows/notion-sync.md` 도 동일 내용으로 sync.
- `README.md` Notion Setup 섹션에 (a) `NOTION_TOKEN` 이 유일한 env, (b) target ID 는 `.vibeops.env` 가 아닌 `.vibeops.json` 에 있음, (c) legacy 3종 키는 더 이상 사용하지 않으며 `vibeops init` 이 만드는 `.vibeops.env.example` 에는 `NOTION_TOKEN=` 만 있음 — 세 줄 추가.
- `docs/project/03-current-state.md` 와 `docs/logs/2026-05-12.md` 에 TASK-016 항목 추가. `Bootstrap 엔진` 표 항목에 `envExampleContents()` 의 새 동작 한 줄 보강.

## Test Result

- `pnpm typecheck` ✓
- `pnpm build` ✓
- `pnpm smoke` ✓ (8 케이스, 회귀 없음).
- `/tmp/vibeops-task016-sandbox` 에서 `node dist/cli.js init --git --initial-commit`:
  - 생성된 `.vibeops.env.example` 본문은 헤더 주석 6줄 + 빈 줄 + `NOTION_TOKEN=` + 마지막 개행.
  - `grep -E '^NOTION_' .vibeops.env.example` → `NOTION_TOKEN=` 한 줄만 출력. legacy 키 0건.
  - `grep -E 'NOTION_API_KEY|NOTION_PROJECT_DB|NOTION_TASK_DB' .vibeops.env.example` 0건. (`docs/project/08-env.md` · `.vibeops/workflows/notion-sync.md` 에는 의도된 deprecation 안내 한 줄씩만 남음.)
- 같은 sandbox 에서 `vibeops status` 의 Notion 섹션이 TASK-015 결과와 동일하게 `enabled no / token missing / projects+tasks target missing / hint` 5줄 — 회귀 없음.
- 저장소 install path 정적 grep (`templates/`, `src/bootstrap/installer.ts`, `.vibeops.env.example`, `docs/project/08-env.md`, `.vibeops/workflows/notion-sync.md`) 에서 deprecation 안내(영문/한글)를 제외한 raw legacy 키 사용 0건.
- 실제 `.vibeops.env` 파일은 새로 만들거나 커밋하지 않음. `NOTION_TOKEN` 원문은 어떤 출력에도 등장하지 않음.

## Review Notes

- vibeops 자체의 `docs/project/01-architecture.md` / `02-tech-stack.md` 는 2026-05-11 1차 설계 단계의 historical record 라서 본 TASK 범위에서 갱신하지 않음. 최신 사실은 `03-current-state.md` 가 책임지는 정책 유지.
- legacy 키 deprecation 안내를 영문/한글 두 문맥에 모두 박아 둠 (`08-env.md` 한글, `README.md` 영문, `notion-sync.md` 한글). 향후 한 가지 언어로 통일하면 후속 polish 에서 정리 가능.
- 새 `.vibeops.env.example` 헤더 안내에 Notion integration URL (`https://www.notion.so/profile/integrations`) 을 박아 두어 신규 사용자가 토큰 발급 경로를 바로 찾도록 함. URL 변경 시 한 군데(`installer.ts`)와 `.vibeops.env.example` 두 군데를 함께 갱신해야 함.
- 기존 프로젝트의 `.vibeops.env` 에 legacy 키가 살아 있을 경우 VibeOps 가 그냥 무시한다 — 사용자가 수동으로 정리할 수 있도록 안내만 제공.
