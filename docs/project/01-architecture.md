# 01 — Architecture

## 큰 그림

```
                       ┌──────────────────────────────┐
                       │            사용자             │
                       │   (Cursor 안 + 터미널 안)     │
                       └───────────────┬──────────────┘
                                       │ 자연어 / CLI
              ┌────────────────────────┼────────────────────────┐
              │                        │                        │
              ▼                        ▼                        ▼
       ┌─────────────┐         ┌──────────────┐         ┌──────────────┐
       │   Cursor    │◀────────│   VibeOps    │────────▶│    Notion    │
       │  (Builder)  │  reads  │    (Rail)    │  syncs  │ (Dashboard)  │
       └─────┬───────┘         └──────┬───────┘         └──────────────┘
             │ writes code            │ reads/writes
             ▼                        ▼
        ┌────────────────────────────────────────┐
        │            프로젝트 저장소              │
        │  AGENTS.md  .cursor/rules/  docs/      │
        │  .vibeops/  .vibeops.json  src/ ...    │
        │  (Git source of truth)                 │
        └────────────────────────────────────────┘
```

- **VibeOps**는 저장소 안의 파일들을 읽고/쓰는 **로컬 CLI**다. LLM을 직접 호출하지 않는다.
- **Cursor**는 `AGENTS.md` + `.cursor/rules/` + `docs/tasks/TASK-*.md`를 읽고 코드를 만든다.
- **Notion**은 사람이 보는 대시보드일 뿐, 실행 기준이 아니다.

## VibeOps가 프로젝트 안에 설치하는 구조

```
<project-root>/
├─ AGENTS.md                       # 모든 에이전트의 운영 지침 진입점
├─ .cursor/
│  └─ rules/
│     ├─ 00-vibeops-governance.mdc
│     ├─ 01-ai-workflow.mdc
│     └─ 02-docs-update.mdc
├─ docs/
│  ├─ project/
│  │  ├─ 00-overview.md
│  │  ├─ 01-architecture.md
│  │  ├─ 02-tech-stack.md
│  │  ├─ 03-current-state.md
│  │  ├─ 04-decisions.md
│  │  └─ 05-backlog.md
│  ├─ tasks/
│  │  └─ TASK-001-*.md
│  └─ logs/
│     └─ YYYY-MM-DD.md
├─ .vibeops/
│  ├─ agents/
│  │  ├─ planner.md
│  │  ├─ builder.md
│  │  ├─ reviewer.md
│  │  └─ releaser.md
│  ├─ prompts/
│  │  ├─ plan.md
│  │  ├─ task-generate.md
│  │  └─ task-builder.md
│  └─ workflows/
│     ├─ task-lifecycle.md
│     └─ notion-sync.md
├─ .vibeops.json                   # VibeOps 자체 설정(버전, notion db id 등)
└─ .vibeops.env.example            # NOTION_API_KEY 자리 등
```

`.vibeops/` 안의 파일들은 **VibeOps의 행동을 정의**하고, `docs/`와 `AGENTS.md`·`.cursor/rules/`는 **Cursor의 행동을 정의**한다. 둘이 분리되어 있어야 “설치된 도구” vs “프로젝트 콘텐츠” 경계가 흐려지지 않는다.

## 데이터 흐름

### Bootstrap (`vibeops init`)

```
사용자 ── vibeops init ──▶ VibeOps CLI
                              │
                              ├─ 템플릿(.vibeops/templates/**)을 프로젝트 루트로 복사
                              ├─ .vibeops.json 생성(프로젝트 이름·버전 등)
                              ├─ .vibeops.env.example 생성
                              └─ 이미 존재하는 파일은 건너뛰거나 --force 시 덮어씀
```

### Plan (`vibeops plan`, `vibeops task generate`)

`vibeops plan`은 **자유 텍스트 한 덩어리를 받지 않는다.** 20개 짧은 질문(input · select · checkbox · confirm) 흐름으로 답을 모으고, 결과를 **`ProjectBrief`(정규화된 JSON)** 으로 만든 뒤, 그 brief를 바탕으로 **Cursor 붙여넣기 프롬프트**를 출력한다. 코드 생성은 여전히 Cursor가 한다.

```
프로젝트 아이디어 ─▶ vibeops plan (interactive Q&A · 20문항)
                       │
                       ├─ input        : 프로젝트명, one-line idea, core problem, success criteria 등
                       ├─ select       : project type, frontend, backend, DB, ORM, package manager, agent level
                       ├─ checkbox     : target users, MVP must-have, out-of-scope, deploy, auth, integrations, risks
                       ├─ confirm      : Notion dashboard 동기화?, Git task branch 사용?
                       └─ "Other" 선택 시 follow-up input → "Custom: <text>" 라벨로 저장
                       │
                       ▼
              .vibeops/plan/brief.json   (ProjectBrief, schemaVersion=1)
                       │
                       ├─ stdout / --out : Cursor 붙여넣기 프롬프트 (8개 docs/project/* 채우기용)
                       │   채울 파일: 00-overview, 01-requirements, 02-mvp-scope, 04-tech-stack,
                       │              06-decisions, 07-backlog, 08-env, 09-deployment
                       │   채우지 않음: 03-architecture (architect 에이전트), 05-current-state (자동)
                       │
                       └─ --apply <Cursor 응답> : docs/project/* 8개에 분배 (*.bak 백업 후 덮어쓰기)
                                                  --dry-run 시 변경 미리보기만, 실제 변경 0건

다른 진입점:
- vibeops plan --brief <path>    : 대화형 건너뛰고 외부 brief 재사용
- vibeops plan --resume          : .vibeops/plan/draft.json 이어서

non-TTY (파이프·CI)에서는 한 줄 안내 후 exit 1 — interactive 또는 --brief를 요구한다.

백로그 결정 ───▶ vibeops task generate
                       │
                       ├─ docs/tasks/TASK-NNN-*.md 파일 생성 또는
                       └─ TASK 생성용 프롬프트 출력
```

ProjectBrief 스키마(요약): `projectName`, `oneLineIdea`, `projectType`, `targetUsers[]`, `coreProblem`, `mvpMustHave[]`, `outOfScope[]`, `techStack{frontend, backend, database, ormLayer, packageManager}`, `deploymentTargets[]`, `authRequirements[]`, `externalIntegrations[]`, `workflow{useNotionDashboard, useGitTaskBranch, agentWorkflowLevel}`, `riskAreas[]`, `successCriteria`, `meta{vibeopsVersion, createdAt, schemaVersion}`. 상세는 `docs/tasks/TASK-006-plan-command.md` 참조.

### Task Lifecycle (`task start / prompt / check / done / rollback`)

```
vibeops task start TASK-NNN
   ├─ base branch / base commit 기록 (.vibeops/state/tasks/TASK-NNN.json)
   ├─ task branch 생성 (예: task/TASK-NNN-slug)
   └─ TASK 파일의 Status를 'in_progress'로

vibeops task prompt TASK-NNN --agent builder
   └─ .vibeops/agents/builder.md + TASK 파일 + docs 컨텍스트로
      Cursor에 붙여넣을 단일 프롬프트를 stdout으로 출력

vibeops task check TASK-NNN
   └─ Acceptance Criteria / Test Plan 체크리스트와
      현재 Git 상태(브랜치, 변경 파일, 커밋 수)를 비교해 보고

vibeops task done TASK-NNN
   ├─ TASK 파일의 Status='done', Result/Test Result 비어있는지 확인
   └─ 안내(병합 가이드)만 출력. 자동 머지는 하지 않는다

vibeops task rollback TASK-NNN
   ├─ 기본: 어떤 브랜치/커밋을 어떻게 되돌릴 수 있는지 안내만 출력
   └─ --confirm 시에만: task branch 삭제 / base commit으로 되돌리기 등 파괴적 작업
```

### Notion Sync (`notion init / test / sync`, `task pull`)

```
vibeops notion init   .vibeops.env 에 NOTION_API_KEY, NOTION_PROJECT_DB, NOTION_TASK_DB 항목 안내
vibeops notion test   Notion API 접근/DB 스키마 검증
vibeops notion sync   docs/tasks/*.md, docs/project/03-current-state.md → Notion (요약·상태·우선순위·브랜치·docs path·결과 요약만)
vibeops task pull     Notion → docs/tasks/*.md 메타데이터 정합 (id, status, priority 등 메타만 동기화)
```

Notion에는 **상세 본문**(Scope, Acceptance Criteria 등 긴 본문)을 동기화하지 않는다. 상세는 `docs/tasks/*.md`에만 둔다.

## 컴포넌트 (소스 코드 관점)

> 구체 구현은 TASK-001 이후에서 정의한다. 이 문서는 의도만 고정한다.

| 컴포넌트       | 책임                                                                                  |
| -------------- | ------------------------------------------------------------------------------------- |
| `cli/`         | CLI 진입점, 명령어 등록(`init`, `status`, `plan`, `task ...`, `agent ...`, `notion ...`) |
| `bootstrap/`   | 템플릿 복사, idempotent 설치, `--dry-run`, `--force` 처리                              |
| `templates/`   | 설치될 실제 파일 원본(Cursor Rules, AGENTS.md, docs/project, docs/tasks 템플릿, agents, prompts, workflows) |
| `planner/`     | `plan`·`task generate`에서 사용할 프롬프트 빌더와 docs 골격 작성기                     |
| `lifecycle/`   | TASK 상태 파일(.vibeops/state/tasks/*.json), Git 헬퍼(branch, base commit 기록·검증), check·done 로직 |
| `rollback/`    | rollback 안내 출력기와 `--confirm` 시의 파괴적 작업 게이트                              |
| `notion/`      | Notion API 클라이언트, DB 스키마 검증, sync/pull 매퍼                                  |
| `config/`      | `.vibeops.json`, `.vibeops.env` 읽기/쓰기                                              |
| `agent/`       | `.vibeops/agents/*.md` 로딩, `agent list/show/prompt` 명령에서 사용                     |

## 명령 ↔ MVP ↔ 컴포넌트 매핑

| 명령                          | MVP | 컴포넌트                          |
| ----------------------------- | --- | --------------------------------- |
| `vibeops init`                | 1   | bootstrap, templates, config      |
| `vibeops status`              | 1   | config, lifecycle, notion(read)   |
| `vibeops agent list/show/prompt` | 1 | agent                             |
| `vibeops plan`                | 2   | planner, templates                |
| `vibeops task generate`       | 2   | planner, templates                |
| `vibeops task start`          | 3   | lifecycle (Git)                   |
| `vibeops task prompt`         | 3   | agent + lifecycle                 |
| `vibeops task check`          | 3   | lifecycle                         |
| `vibeops task done`           | 3   | lifecycle                         |
| `vibeops task rollback`       | 3   | rollback                          |
| `vibeops notion init/test`    | 4   | notion, config                    |
| `vibeops notion sync`         | 4   | notion                            |
| `vibeops task pull`           | 4   | notion + lifecycle                |

## 부작용 안전장치

- **모든 변경 명령**은 가능한 한 `--dry-run`을 지원한다. 기본은 안내·계획 출력, 실제 변경은 명시적 옵션 또는 `--apply`/`--confirm` 시에만.
- `init`은 기본적으로 기존 파일을 **덮어쓰지 않고** 건너뛰며, `--force`가 있을 때만 덮어쓴다.
- `task rollback`은 기본 안내만, `--confirm` 시에만 파괴적 Git 작업을 수행한다.
- Notion 동기화는 **상세 본문이 아니라 메타 필드**만 푸시한다.
