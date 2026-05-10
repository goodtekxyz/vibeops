# 05 — Backlog

TASK 순서와 완료 정의. 위에서 아래로 진행한다. 한 TASK가 끝나기 전 다음으로 넘어가지 않는다.

## MVP 1 · Project Bootstrapper

| ID       | 제목                                                       | 상태    |
| -------- | ---------------------------------------------------------- | ------- |
| TASK-001 | CLI bootstrap (`vibeops --version`, `vibeops --help`)      | planned |
| TASK-002 | `init` command — install VibeOps project system            | planned |
| TASK-003 | Templates — rules, agents, prompts, workflows, docs        | planned |
| TASK-004 | `status` command                                           | planned |
| TASK-005 | Agent commands — `agent list / show / prompt`              | planned |

**MVP 1 완료 정의**

- 새 빈 디렉터리에서 `vibeops init`을 실행하면 `AGENTS.md`, `.cursor/rules/*`, `docs/project/*`, `docs/tasks/`(예시 1개), `.vibeops/agents/*`, `.vibeops/prompts/*`, `.vibeops/workflows/*`, `.vibeops.json`, `.vibeops.env.example`이 생긴다.
- `vibeops status`가 설치 상태와 TASK 카운트를 보여준다.
- `vibeops agent list/show/prompt`가 동작한다.
- 모든 변경 명령에 `--dry-run`이 있다.

## MVP 2 · Project Planner

| ID       | 제목                                | 상태    |
| -------- | ----------------------------------- | ------- |
| TASK-006 | `plan` command                      | planned |
| TASK-007 | `task generate` command             | planned |

**MVP 2 완료 정의**

- `vibeops plan` 실행 시 프로젝트 아이디어를 입력받아 `docs/project/00-overview·02-tech-stack·05-backlog`를 채울 Cursor 붙여넣기 프롬프트를 출력한다. `--apply` 옵션이 있으면 docs 골격을 갱신한다.
- `vibeops task generate`로 백로그에서 TASK 파일을 만들거나, 생성용 프롬프트를 출력한다.

## MVP 3 · Git Task Lifecycle

| ID       | 제목                                | 상태    |
| -------- | ----------------------------------- | ------- |
| TASK-008 | Task lifecycle — `start / check / done` (+ `prompt`) | planned |
| TASK-009 | Rollback safety — `task rollback`   | planned |

**MVP 3 완료 정의**

- `vibeops task start TASK-NNN`이 base branch, base commit, task branch를 `.vibeops/state/tasks/TASK-NNN.json`에 기록하고 task branch를 만든다.
- `vibeops task prompt TASK-NNN --agent builder`가 에이전트 + TASK + docs 컨텍스트로 Cursor 붙여넣기 프롬프트를 출력한다.
- `vibeops task check TASK-NNN`이 Acceptance Criteria/Test Plan과 Git 상태를 비교 보고한다.
- `vibeops task done TASK-NNN`이 Status·Result·Test Result를 검증하고 머지 가이드를 안내한다(자동 머지 금지).
- `vibeops task rollback TASK-NNN`은 기본 안내만, `--confirm` 시에만 파괴적 Git 작업을 수행한다.

## MVP 4 · Notion Dashboard Sync

| ID       | 제목                                | 상태    |
| -------- | ----------------------------------- | ------- |
| TASK-010 | `notion init` and `notion test`     | planned |
| TASK-011 | `notion sync` and `task pull`       | planned |

**MVP 4 완료 정의**

- `vibeops notion init`이 `.vibeops.env`에 어떤 키들이 필요한지 안내·작성 보조한다.
- `vibeops notion test`가 Notion API 접근/DB 스키마(필수 필드)를 검증한다.
- `vibeops notion sync`가 `docs/tasks/*.md`와 `docs/project/03-current-state.md`의 메타(요약·상태·우선순위·브랜치·docs path·결과 요약)를 Notion에 푸시한다.
- `vibeops task pull`이 Notion의 메타 변경(우선순위·상태 등)을 `docs/tasks/*.md` 메타로 정합한다.
- 상세 본문은 절대 Notion으로 푸시하지 않는다.

## 마무리

| ID       | 제목                                | 상태    |
| -------- | ----------------------------------- | ------- |
| TASK-012 | Package polish and README           | planned |

**완료 정의**

- `npm i -g vibeops`(또는 `pnpm dlx vibeops`) 사용 안내가 README에 있다.
- 사용 예시, 명령어 표, MVP별 가능한 일을 README가 보여준다.
- `package.json`의 `bin`, `files`, `keywords`, `engines`, `license`가 정리되어 있다.

## 명시적 비목표

[00-overview.md “명시적 비목표(Out of MVP)”](00-overview.md#명시적-비목표-out-of-mvp)에 둔다. 백로그는 그 안에서만 늘어난다.
