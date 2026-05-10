# TASK-005 · Agent commands — `agent list / show / prompt`

## Status

planned

## MVP Phase

MVP 1 · Project Bootstrapper

## Goal

에이전트를 “파일”로 다루는 명령을 추가한다.

- `vibeops agent list` — 설치된 에이전트 목록.
- `vibeops agent show <name>` — 에이전트 정의(`.vibeops/agents/<name>.md`) 출력.
- `vibeops agent prompt <name>` — 에이전트 + 컨텍스트로 Cursor 붙여넣기용 프롬프트를 stdout에 출력.

본 TASK는 `--task TASK-NNN`이 없을 때의 **에이전트 단독 프롬프트 출력**까지 다룬다. `vibeops task prompt TASK-NNN --agent <name>` 형태(특정 TASK 컨텍스트와 결합)는 [TASK-008](TASK-008-task-lifecycle.md)에서 다룬다.

## Background

에이전트 정의가 마크다운 파일이라는 점을 외부에서도 명령으로 확인·재생산 가능하게 하면, 사용자가 에이전트를 수정하거나 새로 추가했을 때 즉시 활용할 수 있다. 또한 `prompt` 출력은 **Cursor에 그대로 붙여 넣을 텍스트**라는 계약을 만든다.

## Scope

- `src/commands/agent.ts` — sub-command 그룹 `list / show / prompt`
- `src/agent/loader.ts` — `.vibeops/agents/*.md`를 읽어 frontmatter 메타(예: `id`, `role`, `inputs`, `outputs`)와 본문 분리
- `src/agent/prompt.ts` — 에이전트 + 옵션 컨텍스트(파일 경로 목록 등)로 Cursor 프롬프트 빌드
- 옵션:
  - `agent list --json`
  - `agent show <name> --raw` (frontmatter 포함 원본)
  - `agent prompt <name> --context <path>...` (추가 컨텍스트 파일 경로)
  - `agent prompt <name> --copy` (macOS면 `pbcopy`, Linux면 안내) — 선택, 시간 없으면 미구현 OK

## Out of Scope

- TASK와의 결합 프롬프트(`vibeops task prompt TASK-NNN --agent`) — TASK-008
- 에이전트 실행(LLM 호출) — 영구 비스코프

## Acceptance Criteria

1. `vibeops agent list`가 `.vibeops/agents/*.md` 파일에서 추출한 `name`과 한 줄 설명을 보여준다.
2. `vibeops agent show planner`가 해당 파일의 본문(가독성 위주)을 출력한다. `--raw`는 frontmatter 포함.
3. `vibeops agent prompt builder`가 다음을 포함하는 프롬프트 텍스트를 stdout에 출력한다.
   - 에이전트 본문(`role`, `input contract`, `output format`, `금지사항`)
   - 사용자가 추가한 `--context` 파일 본문 인용 또는 경로 안내
   - 현재 프로젝트 이름·VibeOps 버전(`.vibeops.json`에서)
4. 알 수 없는 에이전트 이름에는 “Available: planner, builder, reviewer, releaser” 안내와 exit code 1.
5. 출력은 **Cursor 채팅창에 그대로 붙여 넣을 수 있는 단일 마크다운**이다(추가 가공 불필요).

## Files to Inspect First

- `templates/.vibeops/agents/*.md` (TASK-003에서 채워짐)
- `src/config/projectConfig.ts`
- `src/cli.ts`

## Expected Files to Change

- 신규: `src/commands/agent.ts`, `src/agent/loader.ts`, `src/agent/prompt.ts`
- 신규: `tests/agent.test.ts`
- 갱신: 본 TASK Result/Test Result, `docs/project/03-current-state.md`, `docs/logs/YYYY-MM-DD.md`

## Risks

- 에이전트 frontmatter 스키마를 너무 엄격하게 잡으면 사용자가 직접 추가한 에이전트가 막힐 수 있음 → 필수는 `name`, `role` 정도, 나머지는 optional.
- `--copy`는 OS 의존성. MVP에서는 미구현이 안전.

## Test Plan

- vitest fixture로 `.vibeops/agents/builder.md`를 만든 뒤 list/show/prompt 동작 검증.
- 알 수 없는 이름 시 exit code 1 검증.
- 수동: 본 저장소에서 `vibeops agent prompt builder | head -50`로 출력 확인.

## Rollback Plan

- 브랜치 폐기. 읽기 전용.

## Implementation Plan

1. `agent/loader.ts`에 gray-matter 사용해 메타+본문 파싱.
2. `agent/prompt.ts`에 “에이전트 본문 + 프로젝트 메타 + 사용자 컨텍스트”를 합치는 빌더.
3. `commands/agent.ts`에 sub-command 등록(`list / show / prompt`).
4. tests.
5. 문서 갱신.

## Result

(미수행)

## Test Result

(미수행)
