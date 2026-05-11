# 03 — Current State

> 이 문서는 **사실만** 기록한다. 계획은 [05-backlog.md](05-backlog.md)에 둔다.

## 단계

- **현재 단계**: MVP 2 · Project Planner + MVP 3 · Git Task Lifecycle + MVP 4 · Notion Dashboard Sync **첫 단계 Review 대기**.
  - MVP 1(Project Bootstrapper)은 TASK-002 / 003 / 004 / 005로 종료.
  - MVP 2 — **TASK-006 (`vibeops plan`)** 완료 + **TASK-007 (`vibeops task generate`) Review 대기**.
  - MVP 3 — **TASK-008 (`task start / prompt / check / done`)** + **TASK-009 (`task rollback`)** Review 대기.
  - MVP 4 — **TASK-010 (`notion init / notion test`) Review 대기**. `notion sync` / `task pull` 본체(TASK-011)는 다음 단계.
- Status 흐름 `Planned → In Progress → Review → Done`, Git 상태는 TASK markdown의 `## Git Context` 섹션에 inline 기록.
- `vibeops init` / `status` / `agent {list, show, prompt}` / `plan` / `task {generate, start, prompt, check, done, rollback}` / `notion {init, test}` 가 동작한다.
- 남은 stub: `task pull` / `notion sync` (TASK-011), 패키지 마무리(TASK-012).

## 갖춰진 것

| 항목                           | 위치                                            | 비고                                                                 |
| ------------------------------ | ----------------------------------------------- | -------------------------------------------------------------------- |
| 제품 정의                      | `docs/project/00-overview.md` ~ `05-backlog.md` | 2026-05-11 업데이트                                                  |
| 운영 지침                      | `AGENTS.md`, `.cursor/rules/*.mdc`              | VibeOps 저장소 자신의 규칙                                           |
| TASK 목록                      | `docs/tasks/TASK-001 ~ TASK-012`                | TASK-001~006 done, **008·009 Review 대기**, 007·010~012 planned       |
| 로그                           | `docs/logs/YYYY-MM-DD.md`                       | `2026-05-11.md` 항목 누적                                            |
| **CLI 패키지 골격**            | `package.json`, `tsconfig.json`, `.gitignore`   | Node 20+, ESM, bin=`dist/cli.js`, scripts: `build / dev / typecheck` |
| **CLI 진입점**                 | `src/cli.ts`, `src/version.ts`                  | commander v12 기반                                                   |
| **공통 유틸**                  | `src/lib/{config,filesystem,git,logger,paths,task,task-prompt,brief,prompt-builder,inquirer-helpers}.ts`, `src/types/{config,task,brief}.ts` | `task.ts` · `git.ts`는 MVP 3에서 라이프사이클 헬퍼로 대폭 확장. `task-prompt.ts`는 agent + TASK + project 컨텍스트 합성. |
| **Bootstrap 엔진**             | `src/bootstrap/{manifest,installer,substitute}.ts` | 템플릿 walk + idempotent 복사 + placeholder 치환                     |
| **Status 수집·포맷**           | `src/status/{collector,format}.ts`              | 사람/JSON 양쪽. `review` 카운트 포함.                                  |
| **Agent 로더·프롬프트**        | `src/agent/{loader,prompt}.ts`                  | gray-matter 사용                                                     |
| **Plan 엔진**                  | `src/lib/brief.ts`, `src/lib/prompt-builder.ts`, `src/lib/inquirer-helpers.ts`, `src/types/brief.ts` | 20문항 대화형 + brief markdown + Cursor planning prompt. UX 라운드(2026-05-11): 선택지 다이어트, 기본 스택 `Next.js / NestJS / PostgreSQL / Drizzle / pnpm`, projectType 스마트 디폴트, select·checkbox에 `loop: false` + `pageSize: 8` |
| **Task Lifecycle 엔진**        | `src/commands/task-{start,check,done,rollback}.ts`, `src/lib/task.ts` (Git Context · Status 갱신 + `nextTaskNumber`/`highestTaskNumber`/`formatTaskId`), `src/lib/git.ts` (run/diff/log/branch/reset + porcelain 파서 + 6개 changed-files 헬퍼), `src/lib/task-prompt.ts` | TASK markdown의 `## Status` / `## Git Context` 섹션을 inline 갱신. Status 흐름 4단계(`Planned → In Progress → Review → Done`). 모든 명령에 `--dry-run` 또는 read-only. rollback은 2단계 confirm(`--confirm` 비파괴 / `--confirm-destructive` 파괴). `task check`는 working tree(unstaged+staged+untracked) ∪ committed를 Set-dedup으로 합산해 `working tree / committed / total` 3줄로 분해 표시(rename·untracked 인지). 자동 commit · 푸시 · Notion 호출 0건. |
| **Task Generation 엔진**       | `src/commands/task-generate.ts`, `src/lib/project-docs.ts`, `src/lib/task-generator.ts`, `src/lib/task-scaffold.ts` | 두 모드: (a) **prompt** — `docs/project/*` + brief + `--from <path>`를 합산해 `.vibeops/generated/task-generate-prompt.md` 생성. Planner Agent에게 18 섹션(Status / MVP Phase / Goal / Background / Scope / Out of Scope / Acceptance Criteria / Files to Inspect First / Expected Files to Change / Risks / Test Plan / Rollback Plan / **Git Context** / **Notion Page** / Implementation Plan / Result / Test Result / **Review Notes**)을 강제. (b) **scaffold** — `--scaffold --count N`으로 18 섹션 placeholder TASK 파일 N개를 다음 번호부터 생성(충돌 회피, 덮어쓰기 금지). 옵션: `--from / --output / --count / --phase / --scaffold / --dry-run / --cwd`. LLM·Cursor CLI·Notion·GitHub API·Git mutation 호출 0건. |
| **Notion 설정 + 검증 엔진**    | `src/commands/notion-{init,test}.ts`, `src/lib/notion-{env,schema,client}.ts`, `src/types/config.ts` (`NotionConfig`), `src/lib/config.ts` (`mergeNotionConfig`) | `notion init` 가 `.vibeops.json` 에 `notion.{ enabled, projectsDatabaseId, tasksDatabaseId }` 섹션을 안전 merge + `.vibeops.env.example` 에 `NOTION_TOKEN=` 한 줄 append (기존 키 보존). `notion test` 가 8 + 6 단계 pre-flight/API 검증을 `ok / fail / skip` 로 보고. `--json` 지원. Projects DB 8 속성 + Tasks DB 10 속성 (`Name / Task ID / Project ID / Status / Priority / MVP Phase / Git Branch / Docs Path / Summary / Result Summary`) 강제. `Status` 는 strict `status` 타입. `Git Repo` 만 `rich_text \| url` 둘 다 허용. `@notionhq/client` lazy import + 5s timeout. **`.vibeops.env` 자동 생성 0건, `NOTION_TOKEN` 평문 출력 0건, Notion mutation 0건 (`users.me` + `databases.retrieve` 만).** |
| **본체 구현된 명령 (13개)**    | `init`, `status`, `agent list / show / prompt`, `plan`, `task generate / start / prompt / check / done / rollback`, `notion init / test` | 나머지 stub: `task pull`, `notion sync` |
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
│  ├─ generate [--from <path>] [--output <path>] [--count <n>]
│  │           [--phase <name>] [--scaffold] [--dry-run] [--cwd <p>]    ✓ 구현 (TASK-007)
│  ├─ start <taskId> [--dry-run] [--allow-dirty] [--agent <name>]      ✓ 구현 (TASK-008)
│  ├─ prompt <taskId> --agent <name>                                   ✓ 구현 (agent-prompt 위임)
│  ├─ check <taskId> [--strict] [--agent <name>]                       ✓ 구현 (TASK-008)
│  ├─ done <taskId> [--dry-run] [--finalize]                           ✓ 구현 (TASK-008)
│  ├─ rollback <taskId> [--confirm | --confirm-destructive]
│  │                     [--strategy <branch-delete|reset-base|revert-merge>]
│  │                     [--keep-branch] [--dry-run]                   ✓ 구현 (TASK-009)
│  └─ pull                                                             stub  (TASK-011)
└─ notion
   ├─ init [--dry-run] [--enable] [--projects-db <id>] [--tasks-db <id>]
   │       [--cwd <path>]                                              ✓ 구현 (TASK-010)
   ├─ test [--json] [--cwd <path>]                                     ✓ 구현 (TASK-010)
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

- `notion sync` 본체 구현 — TASK-011
- `task pull` (Notion → docs/tasks 메타 정합) — TASK-011
- 패키지 마무리(README / 배포 점검) — TASK-012
- Planner Agent 응답을 `docs/project/*` / `docs/tasks/*` 에 자동 분배하는 `plan --apply` · `task generate --apply` (별도 TASK 후보)
- vitest 통합 (TASK-001 ~ 010 AC 스모크는 임시 sandbox 수동 시퀀스로 대체. polish 라운드 통합 후보)
- ESLint / Prettier 설정
- `--copy` 옵션 (`agent prompt --copy`) — 후속 보강 TASK 후보
- TASK-007 / 008 / 009 / 010 Result/Test Result 본 라운드에서 작성 → 사람 또는 Reviewer Agent 검토 후 `vibeops task done <id> --finalize`로 Done 처리 필요

## 다음 TASK

**TASK-011 — `notion sync` + `task pull`**. `docs/project/*` + `docs/tasks/*` 메타 → Notion Projects/Tasks DB 페이지 푸시(생성/upsert/archive). 반대 방향(`task pull`)은 Notion → docs/tasks/*.md 의 `Status` / `Priority` / `Notion Page` 메타만 풀백(코드/Acceptance 등 본문은 풀백 금지). TASK-010 이 만든 `notion test` 가 통과한 상태에서만 실행 가능. 본 라운드 이전까지의 규칙은 동일: Notion = human dashboard, Git docs/tasks = AI execution source of truth.

## 진행 규칙 (간단 요약)

- 한 번에 **한 TASK**만 진행한다.
- 모든 변경 명령은 가능한 `--dry-run`을 갖는다.
- 구현이 끝나면 이 문서, 해당 TASK 파일, `docs/logs/YYYY-MM-DD.md`를 함께 갱신한다.
