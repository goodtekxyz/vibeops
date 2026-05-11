# TASK-007 · `task generate` command

## Status

Review

## Git Context

- Base Branch: `main`
- Base Commit: `b717254`
- Task Branch: `task/008-task-lifecycle`
- Started At: `2026-05-11T02:18:00Z`

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

2026-05-11 완료(Review 대기). `vibeops task generate` 본체를 구현했다. 사용자의 갱신된 요구를 반영해 원 TASK-007 문서의 옵션 세트(`--from-backlog`, `--title`, `--mvp`, `--out`)를 다음과 같이 재구성했다.

### 사용자 요구사항 vs 원 TASK-007 문서 (deviation)

- 원 문서: `--from-backlog <id-or-title>` + `--title <text>` 두 입력 모드.  
  실제 구현: **컨텍스트 통합 모드**로 단순화. 기본은 `docs/project/07-backlog.md` + 나머지 `00 ~ 09` + `.vibeops/brief/project-brief.md`를 모두 읽어 한 번에 합산한다. 임의 입력은 `--from <path>`로 들어가며 inline 코드 블록으로 프롬프트에 포함된다.
- 원 문서: `--mvp <n>` → 구현 옵션 이름을 `--phase <name>` (예: `MVP 4`)로 통일. plan 명령과 표현을 맞추기 위함.
- 원 문서: `--out <path>` → `--output <path>`로 통일(plan 명령과 같은 이름).
- 원 문서: `--scaffold` 사용 시 1개의 TASK 파일 골격 작성.  
  실제 구현: `--count <number>`(기본 8)를 둬 한 번에 여러 개의 placeholder TASK 파일을 만들 수 있다. 기존 TASK 번호를 스캔해 다음 번호부터 시작하고, 충돌 시 다음 사용 가능한 번호로 자동 건너뛴다. 기존 파일은 절대 덮어쓰지 않는다.
- 원 문서: AC에 15개 섹션 명시.  
  실제 구현: 사용자 요구에 따라 **18 섹션**(15개 + `Git Context` + `Notion Page` + `Review Notes`)을 강제한다. 본 라운드의 TASK-008 / TASK-009 에 추가한 `Git Context` 섹션, MVP 4 동기화용 `Notion Page` 섹션, 사람·Reviewer Agent용 `Review Notes` 섹션이 신규로 들어간다.

### 추가/변경 파일

- 신규: `src/lib/project-docs.ts` — `docs/project/*` 와 `.vibeops/brief/project-brief.md`를 슬롯 단위로 읽고, 옛 네이밍(`05-backlog.md` 등)이 남아 있는 저장소를 위해 legacy fallback 지도(`07-backlog.md ← 05-backlog.md`, `03-architecture.md ← 01-architecture.md`, 기타)를 둬 본 VibeOps 저장소 자신에게도 동작한다.
- 신규: `src/lib/task-generator.ts` — 다음 항목을 export.
  - `slugify(text, fallback)` — ASCII / lowercase / `-` join / NFKD diacritic 제거 / 빈 결과는 `task` 폴백.
  - `REQUIRED_TASK_SECTIONS` — 18 섹션 상수.
  - `buildTaskGeneratePrompt(inputs)` — Cursor Planner Agent에 붙여 넣을 단일 마크다운 빌더. Hard rules(코드 작성 금지, LLM·Cursor CLI·Notion·GitHub API 호출 금지), 진실 공급원 규칙(`docs/tasks/* = AI execution source of truth`, `Notion = human dashboard`), 입력 문서 인벤토리(`✓`/`·`), 권장 개수·페이즈 필터, 18 섹션 강제, 입력 문서 inline 코드 블록, 응답 형식(plan summary → TASK 블록 → changed file list → generated TASK summary → Assumptions) 포함.
- 신규: `src/lib/task-scaffold.ts` — `planScaffoldEntries`(번호 충돌 회피하며 N개 예약) + `renderScaffoldMarkdown`(18 섹션 placeholder skeleton) + `writeScaffoldFiles`(존재 시 건너뜀).
- 갱신: `src/lib/task.ts` — `highestTaskNumber(tasksDir)`, `nextTaskNumber(tasksDir)`, `formatTaskId(n, width=3)` 헬퍼 추가.
- 갱신: `src/commands/task-generate.ts` — stub 대체. `--from`(존재 확인 후 친절한 에러), `--output`, `--count`(>20이면 경고, 유효하지 않으면 8로 폴백 + 경고), `--phase`, `--scaffold`, `--dry-run`, `--cwd` 처리. 두 모드 분기. dry-run / 실제 모두 LLM·Cursor CLI·Notion·GitHub API·Git mutation 호출 0건.
- 갱신: `src/cli.ts` — `task generate`에 위 옵션 노출 + 한국어 설명.

### 기본 동작 흐름 (prompt 모드)

1. `docs/project/07-backlog.md` + `00 ~ 09` + `.vibeops/brief/project-brief.md` (+ `--from <path>`)를 읽는다. 누락 슬롯은 인벤토리에 `·` 표시.
2. `docs/tasks/TASK-*.md`의 최대 번호를 찾아 `nextTaskId`(예: `TASK-013`) 계산.
3. `count`(기본 8) + `phase`(있으면)를 반영한 Cursor 붙여넣기 프롬프트를 빌드.
4. `.vibeops/generated/task-generate-prompt.md` (또는 `--output <path>`)에 저장.
5. 터미널에는 인벤토리·계획·다음 액션(`Cursor에 붙여넣기` → `git diff` 검토 → `vibeops task start TASK-NNN`)을 출력.

### scaffold 모드 흐름

1. 기존 번호 스캔 후 다음 번호부터 `count`개 예약(이미 같은 번호 파일이 있으면 건너뛰며 다음 사용 가능한 번호로).
2. `--dry-run`이면 만들어질 파일 경로 목록 + 첫 항목의 skeleton preview만 출력하고 종료.
3. 실제 모드면 각 파일에 18 섹션 placeholder를 가진 markdown을 쓴다. 기존 파일은 덮어쓰지 않는다.

### 안전장치

- **VibeOps는 LLM/Cursor CLI/Notion/GitHub API/Git mutation 호출 0건.** prompt 모드는 `writeText`로 markdown 한 개만 디스크에 쓴다. scaffold 모드는 새 markdown만 만들고 기존 파일은 절대 안 건드린다.
- `--from <path>` 미존재 시 친절한 에러 + exit 1.
- `--count`가 정수가 아니면 8로 폴백 + 경고. `--count > 20`이면 경고만(중단하지 않음, "Planner Agent may push back").
- `--dry-run`은 prompt / scaffold 양쪽 모두 파일 변경 0건.
- `.vibeops/generated/`는 `.gitignore` 적용 대상이므로 생성된 prompt는 커밋되지 않는다.

## Test Result

- `pnpm typecheck` → exit 0.
- `pnpm build` → exit 0.
- `pnpm exec tsx src/cli.ts task generate --help` → 7개 옵션(`--from / --output / --count / --phase / --scaffold / --dry-run / --cwd`) 모두 노출.
- Sandbox(`/var/folders/.../vibeops-gen-XXXX/`) — `init` 후 TASK-001/002 fixture 추가하고 다음 11 케이스 검증:

  | # | 명령 | 결과 |
  | --- | --- | --- |
  | 1 | `task generate --dry-run` | next id `TASK-003`, 인벤토리 10 ✓ + brief 1 ·, "no LLM / Cursor / Notion / GitHub / Git call" 출력, `.vibeops/generated/` **미생성** |
  | 2 | `task generate` (real) | `.vibeops/generated/task-generate-prompt.md` 456줄 생성. 헤더에 schema=1, version=0.1.0, 18 섹션 모두 강제 명시 ✓ |
  | 3 | `task generate --count 5 --phase "MVP 4"` | `**5개 내외**`, `MVP Phase 필터: MVP 4`, `## MVP Phase 의 본문은 MVP 4`, `Notion Page (MVP 4 / TASK-011…)` 모두 프롬프트에 정확히 박힘 |
  | 4 | `task generate --output .vibeops/generated/test-task-prompt.md` | 지정한 경로로 출력 ✓ |
  | 5 | `task generate --scaffold --dry-run --count 2` | 파일 0건 생성, 첫 항목 skeleton preview 출력 |
  | 6 | `task generate --scaffold --count 2` | `TASK-003-planned-task.md`, `TASK-004-planned-task.md` 생성. **18 섹션 모두 포함 ✓** (Status / MVP Phase / Goal / Background / Scope / Out of Scope / Acceptance Criteria / Files to Inspect First / Expected Files to Change / Risks / Test Plan / Rollback Plan / Git Context / Notion Page / Implementation Plan / Result / Test Result / Review Notes) |
  | 7 | `task generate --scaffold --count 2` (재실행) | 충돌 회피 — `TASK-005 / TASK-006` 로 자동 진행. 기존 003/004 미변경 |
  | 8 | `task generate --from doesnotexist.md` | `✗ --from path not found: …` + exit 1, 파일 0건 |
  | 9 | `task generate --from my-backlog.md` | 인벤토리 첫 줄에 `Custom input (--from) **(primary)**` 추가, 프롬프트 본문에 `my-backlog.md` inline 블록 포함 |
  | 10 | `task generate --count 25 --dry-run` | `! --count 25 is large (soft cap 20). Continuing, but the Planner Agent may push back.` 경고, count=25로 진행 |
  | 11 | `task generate --count abc --dry-run` | `! --count must be a positive integer (got: "abc"). Falling back to default 8.` + count=8로 진행 |

- 라이브 저장소 read-only 검증: `node dist/cli.js task generate --dry-run --cwd /Users/hjhamm/goodtek/vibeops` → next id `TASK-013`(현재 최대 TASK-012의 +1), 인벤토리 10 ✓ + brief 1 ·, 파일 0건 생성. 명령 전/후 `git status --porcelain | wc -l` 동일.
- Sandbox 정리: `--scaffold`로 만든 TASK-003 ~ TASK-006-planned-task.md 4개 파일은 sandbox 임시 디렉터리(`/var/folders/...`)에서만 생성됐으며 라이브 저장소에는 만들지 않음. 라이브에서는 `--dry-run`만 실행.
- 본 라운드에서 LLM API · Cursor CLI · Notion API · GitHub API · Git mutation 호출 0건.
- 보류: vitest 자동 회귀(TASK-007까지 누적). polish 라운드에서 통합 예정.
