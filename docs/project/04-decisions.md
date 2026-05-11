# 04 — Decisions

이미 내려진 결정. 충돌하는 새 제안은 별도 TASK로 재논의한 뒤에만 바뀐다.

## D-001 · VibeOps는 “바이브 코딩 부트스트래퍼 + 워크플로 레일”이다

- VibeOps는 새 프로젝트에 **Cursor 기반 바이브 코딩**을 체계적으로 수행할 운영 구조를 설치·생성하는 **로컬 CLI**다.
- VibeOps 자체는 코드를 만들지 않는다. 코드는 Cursor가 `docs/tasks/TASK-*.md` 기준으로 짠다.
- 결과: 웹 UI, 호스팅 대시보드, 자체 LLM 호출은 MVP 밖이다.

## D-002 · Source of Truth는 Git, Notion은 대시보드

- AI 실행 기준: `docs/tasks/*.md`
- 프로젝트 설계/현재 상태 기준: `docs/project/*.md`
- 변경 이력·롤백 기준: Git commits / branches
- 사람이 보는 운영판: Notion
- 기준이 **아님**: 채팅(Cursor 히스토리, Slack)
- Notion에는 **상세 본문이 아니라 요약·상태·우선순위·브랜치·docs path·결과 요약 메타**만 둔다.

## D-003 · 한 번에 하나의 TASK

- Cursor는 한 세션에서 한 TASK만 진행한다.
- TASK의 Scope / Acceptance Criteria 밖은 하지 않는다.
- 대규모 리팩터링은 별도 TASK가 있을 때만 한다.

## D-004 · 기술 스택: Node.js 20+ / TypeScript / pnpm

- 사용자 머신에 흔하고 macOS/Linux/WSL에서 동일 동작.
- 자체 DB·서버 도입 X. 상태는 평문 파일(`.vibeops.json`, `.vibeops/state/**.json`).
- 설정 포맷: **JSON**. TOML/YAML은 도입하지 않는다(편집·검증 단순화).

## D-005 · 단일 CLI 진입점 `vibeops`

- sub-command 구조: `vibeops <group> <action> [args]` (예: `vibeops task start TASK-001`).
- 모든 변경 명령은 `--dry-run`을 우선 제공한다(또는 동등 옵션).

## D-006 · `init`은 idempotent, 기본은 “덮어쓰지 않음”

- 이미 있는 파일은 건너뛴다. `--force` 시에만 덮어쓴다.
- `--dry-run`은 어떤 파일이 만들어질지 표시한다.

## D-007 · Rollback은 안내가 기본, 파괴적 작업은 `--confirm` 필요

- `vibeops task rollback TASK-NNN`은 어떤 브랜치/커밋을 어떻게 되돌릴 수 있는지 **출력만** 한다.
- 실제 `git branch -D` / `git reset` / `git revert`는 `--confirm`이 있을 때만 수행한다.

## D-008 · TASK Lifecycle은 `start → prompt → check → done`(+ `rollback`)

- `start`: base branch / base commit / task branch를 `.vibeops/state/tasks/TASK-NNN.json`에 기록.
- `prompt`: 에이전트 + TASK + docs 컨텍스트로 Cursor 붙여넣기 프롬프트를 출력.
- `check`: Acceptance Criteria·Test Plan과 Git 상태 비교 보고.
- `done`: TASK 파일의 Status=`done`, Result/Test Result 채워졌는지 검증. 자동 머지는 하지 않는다.

## D-009 · 에이전트는 파일로 정의한다

- 에이전트는 `.vibeops/agents/<name>.md`에 역할·프롬프트가 정의된 마크다운 파일이다.
- `vibeops agent list/show/prompt` 명령으로 노출한다.
- MVP에서 제공하는 기본 에이전트: `planner`, `builder`, `reviewer`, `releaser`. (수는 늘릴 수 있으나 MVP에서는 이 4개로 시작.)

## D-010 · Notion은 사람이 본다, 양방향 실시간 동기화 아님

- `vibeops notion sync`: Git docs → Notion (메타 푸시)
- `vibeops task pull`: Notion → docs/tasks 메타 정합(예: 우선순위·상태 정도)
- Webhook·실시간·자동 polling은 MVP 밖.

## D-011 · VibeOps 자신을 만들 때도 같은 규칙을 적용한다

- VibeOps 저장소 자체에 `AGENTS.md`·`.cursor/rules/`·`docs/`가 있다.
- 자기 자신의 TASK도 `docs/tasks/TASK-*.md`로 만들고, 한 TASK씩 처리한다.

## D-012 · 문서 갱신은 구현과 동시에 한다

- 구현 완료 시 **반드시** 함께 갱신: `docs/project/03-current-state.md`, 해당 TASK 파일의 Result/Test Result, `docs/logs/YYYY-MM-DD.md`.
- 세 가지를 갱신하지 않으면 TASK는 완료로 치지 않는다.

## D-013 · `vibeops plan`은 대화형 Q&A를 1순위로 한다

- `vibeops plan`은 자유 텍스트 한 덩어리만 받지 않는다. **20개 짧은 질문**을 `input` · `select` · `checkbox` · `confirm`을 섞어서 받는다.
- 키 입력 규약: select·checkbox 둘 다 방향키, checkbox는 스페이스 토글 + 엔터 확정, confirm은 엔터로 default 사용. checkbox는 다중 default 허용.
- `select` / `checkbox`에서 `Other`를 고르면 곧바로 follow-up `input` 질문을 띄우고, 결과는 표준 옵션 라벨 ∪ `Custom: <text>` 형식으로 정규화한다.
- 결과는 **정규화된 `ProjectBrief`(JSON, `schemaVersion=1`)** 로 `.vibeops/plan/brief.json`에 저장한다. Cursor 프롬프트는 항상 이 brief를 입력으로 빌드한다.
- 인터랙티브 흐름이 막힐 환경(non-TTY, CI, 파이프)에서는 진입을 거부하고 `--brief <path>`를 요구한다. CI에서 미리 만든 brief.json을 재사용할 수 있게 한다.
- `vibeops plan`은 `docs/project/` 10개 중 8개(00, 01, 02, 04, 06, 07, 08, 09)만 채운다. `03-architecture`는 `architect` 에이전트가, `05-current-state`는 init·TASK lifecycle이 책임진다.
- VibeOps는 여전히 LLM을 직접 호출하지 않는다. brief를 가지고 채우는 작업은 Cursor가 한다. 이 결정은 D-001과 D-002에 정합한다.
