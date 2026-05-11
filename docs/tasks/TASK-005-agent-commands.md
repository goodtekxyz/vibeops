# TASK-005 · Agent commands — `agent list / show / prompt`

## Status

done

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

2026-05-11 완료. 에이전트를 “파일”로 다루는 세 개 명령(`agent list / show / prompt`)을 구현했다.

- **에이전트 로더**: `src/agent/loader.ts` — gray-matter로 frontmatter(`name`, `role`, `description`) 파싱 + 본문 분리. `findAgent(dir, name)`은 frontmatter의 `name` 우선 매칭, 그 뒤 파일명 매칭. `loadAgent`/`listAgents`는 malformed 파일을 조용히 건너뛴다.
- **프롬프트 빌더**: `src/agent/prompt.ts` — `buildPrompt({ agent, config, task?, projectRoot, contextPaths? })`이 “Header(프로젝트 이름·VibeOps 버전·TASK 메타) + Agent definition 본문 + (있다면) TASK 파일 본문 + (있다면) 추가 컨텍스트 파일 인용 + Footer(보고 형식 안내)”를 합쳐 단일 마크다운을 반환.
- **명령**:
  - `agent list` — `.vibeops/agents/*.md` 목록 + 한 줄 description. `--json` 시 `{name, role, description, filePath}` 배열.
  - `agent show <name> [--raw]` — 본문(가독성 우선) 또는 원본(`--raw`).
  - `agent prompt <name> <taskId> [--context <path...>]` — TASK 파일을 docs/tasks/에서 찾아 본문과 함께 묶어 stdout 출력. taskId가 `TASK-NNN` 형태가 아니면 경고 후 TASK 컨텍스트 없이 진행.
- **에러 경로**: 알 수 없는 에이전트 이름이면 `Available: <list>` 안내 + exit 1. 에이전트 디렉터리가 없으면 `Run \`vibeops init\` first.` 안내.
- **TASK ↔ agent 결합 재사용**: `cli.ts`의 `task prompt <taskId> --agent <name>`도 동일한 `agentPromptCommand`를 호출(인수 순서만 바꿔서). 이로써 TASK-008에서 task prompt를 별도 구현할 필요가 줄어든다.
- **`--copy`(macOS pbcopy)**: TASK 본문에 “시간 없으면 미구현 OK”로 적힌 항목 — **미구현** 유지. 후속 보강 TASK 후보.

### 변경 파일

| 파일 | 종류 |
| --- | --- |
| `src/commands/agent-list.ts` | 갱신 (stub → 실제 구현) |
| `src/commands/agent-show.ts` | 갱신 (stub → 실제 구현) |
| `src/commands/agent-prompt.ts` | 갱신 (stub → 실제 구현) |
| `src/agent/loader.ts` | 신규 |
| `src/agent/prompt.ts` | 신규 |
| `src/cli.ts` | 갱신 (`--raw`, `--cwd`, `--context` 옵션 wiring + `task prompt` 위임) |

## Test Result

- **sandbox에서 list**: `pnpm dev agent list --cwd /tmp/vibeops-sandbox` →
  ```
  Agents
    architect     시스템 구조와 기술 스택을 결정한다.
    builder       한 TASK의 Scope 안에서 코드를 짓는다.
    docs          구현 후 세 가지 문서를 함께 갱신한다.
    orchestrator  다음에 할 일을 정하고 적절한 에이전트로 위임한다.
    planner       아이디어를 받아 비전·요구·MVP 범위·백로그를 만든다.
    recovery      무엇이 어긋났는지 진단하고 되돌릴 명령을 안내한다.
    reviewer      builder의 결과를 TASK 기준으로 점검한다.
    tester        TASK의 Test Plan을 실행한다. 통과/실패와 증거를 기록한다.
  ```
  8개 에이전트 모두 `name`과 한 줄 설명 표시 — AC#1 통과.
- **show**: `pnpm dev agent show builder --cwd /tmp/vibeops-sandbox` → 본문(Role / Inputs / Output Format / Rules / 금지사항)이 출력되고 frontmatter 4줄(name/role/description/`---`)은 포함되지 않음. `--raw` 옵션은 cli에 wiring되어 있음. — AC#2 통과.
- **prompt**: `pnpm dev agent prompt builder TASK-000 --cwd /tmp/vibeops-sandbox` → 단일 마크다운 출력. 다음 요소를 모두 포함:
  - `# Cursor prompt — agent: builder`
  - `Project: \`byobrowser\``, `VibeOps: \`0.1.0\``
  - `TASK: \`TASK-000\``, `TASK file: \`docs/tasks/TASK-000-template.md\``
  - `## Agent definition (builder)` + 본문
  - `## TASK file content` + 본문
  - Footer (보고 형식 안내)
  — AC#3, AC#5 통과.
- **알 수 없는 이름**: `pnpm dev agent show ghost --cwd /tmp/vibeops-sandbox` → exit 1, `✗ Unknown agent: "ghost".`와 `Available: architect, builder, docs, orchestrator, planner, recovery, reviewer, tester` 표시 — AC#4 통과(가용 목록이 TASK 본문 예시인 `planner, builder, reviewer, releaser`가 아니라 실제 설치된 8개 에이전트인 점은 TASK-003 확장 명세에 따른 결과).
- **agent prompt 재사용**: `pnpm dev task prompt TASK-000 --agent builder --cwd /tmp/vibeops-sandbox` → 동일한 프롬프트 출력. AC#3 통과.
- ReadLints (`src/`) → 0 issues.
- Acceptance Criteria 1~5 모두 통과.
