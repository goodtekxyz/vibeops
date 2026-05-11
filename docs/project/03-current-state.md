# 03 — Current State

> 이 문서는 **사실만** 기록한다. 계획은 [05-backlog.md](05-backlog.md)에 둔다.

## 단계

- **현재 단계**: MVP 2 · Project Planner **부분 진입**.
  - MVP 1(Project Bootstrapper)은 TASK-002 / 003 / 004 / 005로 종료.
  - MVP 2 첫 번째 TASK인 **TASK-006 (`vibeops plan`) 완료** — 20문항 대화형 흐름으로 `.vibeops/brief/project-brief.md` + `.vibeops/generated/plan-prompt.md` 생성.
- `vibeops init` / `status` / `agent {list, show, prompt}` / `plan`이 동작한다.
- 나머지 도메인 명령(`task {generate, start, check, done, rollback, pull}`, `notion *`)은 여전히 stub.

## 갖춰진 것

| 항목                           | 위치                                            | 비고                                                                 |
| ------------------------------ | ----------------------------------------------- | -------------------------------------------------------------------- |
| 제품 정의                      | `docs/project/00-overview.md` ~ `05-backlog.md` | 2026-05-11 업데이트                                                  |
| 운영 지침                      | `AGENTS.md`, `.cursor/rules/*.mdc`              | VibeOps 저장소 자신의 규칙                                           |
| TASK 목록                      | `docs/tasks/TASK-001 ~ TASK-012`                | TASK-001~006 done, 007~012 planned                                   |
| 로그                           | `docs/logs/YYYY-MM-DD.md`                       | `2026-05-11.md` 세 항목                                              |
| **CLI 패키지 골격**            | `package.json`, `tsconfig.json`, `.gitignore`   | Node 20+, ESM, bin=`dist/cli.js`, scripts: `build / dev / typecheck` |
| **CLI 진입점**                 | `src/cli.ts`, `src/version.ts`                  | commander v12 기반                                                   |
| **공통 유틸**                  | `src/lib/{config,filesystem,git,logger,paths,task,brief,prompt-builder,inquirer-helpers}.ts`, `src/types/{config,task,brief}.ts` | 모든 도메인이 공유                                                   |
| **Bootstrap 엔진**             | `src/bootstrap/{manifest,installer,substitute}.ts` | 템플릿 walk + idempotent 복사 + placeholder 치환                     |
| **Status 수집·포맷**           | `src/status/{collector,format}.ts`              | 사람/JSON 양쪽                                                       |
| **Agent 로더·프롬프트**        | `src/agent/{loader,prompt}.ts`                  | gray-matter 사용                                                     |
| **Plan 엔진**                  | `src/lib/brief.ts`, `src/lib/prompt-builder.ts`, `src/lib/inquirer-helpers.ts`, `src/types/brief.ts` | 20문항 대화형 + brief markdown + Cursor planning prompt. UX 라운드(2026-05-11): 선택지 다이어트, 기본 스택 `Next.js / NestJS / PostgreSQL / Drizzle / pnpm`, projectType 스마트 디폴트, select·checkbox에 `loop: false` + `pageSize: 8` |
| **본체 구현된 명령 (6개)**     | `init`, `status`, `agent list / show / prompt`, `plan` (+ `task prompt` 위임) | 나머지 stub                                                          |
| **템플릿 콘텐츠 (36개)**       | `templates/**`                                  | AGENTS.md / 5 rules / 8 agents / 6 prompts / 4 workflows / 10 project docs / TASK-000 / logs README |

### 등록된 명령 트리

```
vibeops
├─ init [--dry-run] [--force] [--cwd <path>] [--name <projectName>]   ✓ 구현
├─ status [--json] [--cwd <path>]                                      ✓ 구현
├─ plan [--idea <text>] [--from <path>] [--output <path>] [--non-interactive] [--cwd <path>]   ✓ 구현
├─ agent
│  ├─ list [--json] [--cwd <path>]                                     ✓ 구현
│  ├─ show <name> [--raw] [--cwd <path>]                               ✓ 구현
│  └─ prompt <name> <taskId> [--context <path...>] [--cwd <path>]      ✓ 구현
├─ task
│  ├─ generate                                                         stub  (TASK-007)
│  ├─ start <taskId>                                                   stub  (TASK-008)
│  ├─ prompt <taskId> --agent <name>                                   ✓ 구현 (agent-prompt 위임)
│  ├─ check <taskId>                                                   stub  (TASK-008)
│  ├─ done <taskId>                                                    stub  (TASK-008)
│  ├─ rollback <taskId>                                                stub  (TASK-009)
│  └─ pull                                                             stub  (TASK-011)
└─ notion
   ├─ init                                                             stub  (TASK-010)
   ├─ test                                                             stub  (TASK-010)
   └─ sync                                                             stub  (TASK-011)
```

### 8개 에이전트 (확장 명세)

원래 TASK-003은 4개 에이전트(planner/builder/reviewer/releaser)를 가정했지만, 본 라운드 사용자 지시로 8개로 확장 채택했다.

| Agent          | 역할                                                |
| -------------- | --------------------------------------------------- |
| `orchestrator` | 다음 TASK 선택, 적절한 에이전트로 위임              |
| `planner`      | 아이디어 → `docs/project/{00,01,02,07}`             |
| `architect`    | `docs/project/{03,04}` (아키텍처·기술 스택)         |
| `builder`      | 단일 TASK 코드 변경                                 |
| `reviewer`     | diff vs Acceptance Criteria                        |
| `tester`       | Test Plan 실행 → Test Result                        |
| `docs`         | `05-current-state` / TASK Result / `docs/logs` 갱신 |
| `recovery`     | 롤백 진단(파괴적 작업은 `--confirm`)                |

## 아직 없는 것

- `task generate` / `task start / check / done / rollback` / `notion *` 본체 구현
- Planner Agent 응답을 `docs/project/*`에 분배하는 `plan --apply` (별도 TASK 후보)
- vitest 통합 (TASK-001~006 AC의 스모크 테스트는 본 라운드 사용자 스코프에서 제외 — 후속 보강 TASK 후보)
- ESLint / Prettier 설정
- `--copy` 옵션 (`agent prompt --copy`) — 후속 보강 TASK 후보

## 다음 TASK

**TASK-007 — `vibeops task generate` 본체 구현**.
목표: `docs/project/07-backlog.md`(또는 `vibeops plan`이 만든 brief)를 입력으로 `docs/tasks/TASK-NNN-*.md` 파일을 생성하거나, Cursor에 붙여넣을 TASK 생성용 프롬프트를 출력한다. 본 명령도 LLM을 직접 호출하지 않는다.

## 진행 규칙 (간단 요약)

- 한 번에 **한 TASK**만 진행한다.
- 모든 변경 명령은 가능한 `--dry-run`을 갖는다.
- 구현이 끝나면 이 문서, 해당 TASK 파일, `docs/logs/YYYY-MM-DD.md`를 함께 갱신한다.
