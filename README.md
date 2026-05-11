# VibeOps

> **Cursor 기반 바이브 코딩을 체계적으로 굴리기 위한 로컬 CLI.**
> 새 프로젝트에 문서 구조 · Cursor Rules · `AGENTS.md` · 에이전트 정의 · TASK 템플릿 · Git 작업 흐름 · Notion 운영판 동기화 구조를 한 번에 설치하고, TASK 단위로 작업을 굴린다.

VibeOps 자신은 코드를 짜지 않는다. 코드는 **Cursor**가 `docs/tasks/TASK-*.md` 기준으로 짠다. VibeOps는 그 위에서 작업이 흩어지지 않게 잡아주는 **레일(rail)**이다.

---

## 왜 필요한가

바이브 코딩은 빠르지만 곧 다음 문제를 만든다.

- 무엇을 만들지에 대한 **단일 진실 공급원**이 없다(채팅은 사라진다).
- 에이전트가 같은 일을 **다르게 반복**하거나, 범위 밖 작업을 **임의로** 한다.
- 어떤 커밋이 어떤 결정에 대응되는지 **추적 불가**.
- 다른 사람(또는 미래의 나)이 상태를 볼 **운영판**이 없다.
- 새 프로젝트마다 위 구조를 **수작업**으로 다시 세팅한다.

VibeOps는 이걸 **부트스트랩 + TASK 라이프사이클 + Notion 운영판 동기화** 한 묶음으로 해결한다.

---

## 사용 예시 — BYOBrowser

“**BYOBrowser**라는 브라우저 자동화 SaaS를 만들고 싶다”는 아이디어를 입력하면:

```bash
# 1) 새 프로젝트 디렉터리에 운영 구조 설치
vibeops init

# 2) 20개 짧은 질문(select·checkbox·confirm·input)으로 ProjectBrief를 만들고
#    docs/project 골격을 채울 Cursor 프롬프트 생성
vibeops plan

# 3) 백로그에서 첫 TASK 생성
vibeops task generate

# 4) TASK 시작 → Cursor에 붙여넣을 프롬프트 출력 → 검증 → 완료
vibeops task start TASK-001
vibeops task prompt TASK-001 --agent builder
vibeops task check TASK-001
vibeops task done TASK-001

# 5) (옵션) Notion 운영판과 동기화
vibeops notion init            # .vibeops.json notion 섹션 + .vibeops.env 안내
vibeops notion test            # 토큰·DB 스키마 (read-only)
vibeops notion sync --dry-run  # Notion mutation 없이 plan 미리 보기
vibeops notion sync            # Projects/Tasks DB 메타 upsert
vibeops task pull --dry-run    # Notion에 새로 만든 TASK 만 스캔 (file 생성 0)
vibeops task pull              # Notion → docs/tasks/TASK-NNN-slug.md skeleton 생성
```

그 다음 실제 개발은 그 프로젝트 안에서 Cursor가 `docs/tasks/TASK-*.md` 기준으로 단계별로 수행한다.

---

## 핵심 역할

1. **Project Bootstrapper** — 새 프로젝트에 VibeOps 운영 구조를 1회 설치.
2. **Project Planner** — 아이디어를 받아 `docs/project/*`와 백로그·초기 TASK 골격용 프롬프트를 생성.
3. **Agent-Orchestrated Workflow** — `.vibeops/agents/*`의 역할(planner / builder / reviewer / releaser)을 TASK에 묶어 Cursor 붙여넣기 프롬프트로 출력.
4. **Docs as Source of Truth** — `docs/project/*`와 `docs/tasks/*`가 AI·사람 모두의 기준.
5. **Task Lifecycle** — `start → prompt → check → done`(+`rollback`).
6. **Git Branch / Commit / Rollback Safety** — TASK 시작 시 base branch·base commit·task branch를 기록. rollback은 안내가 기본, 파괴적 작업은 `--confirm`.
7. **Notion as Human Dashboard** — 사람이 보는 운영판. 상세 실행 기준은 `docs/tasks/*.md`에 둔다.
8. **Cursor as Builder, VibeOps as Workflow Rail** — 코드는 Cursor가 짓고, VibeOps는 그 위에 레일을 깐다.

---

## Source of Truth

| 무엇                    | 어디                                  |
| ----------------------- | ------------------------------------- |
| AI 실행 기준            | Git `docs/tasks/*.md`                 |
| 프로젝트 설계/현재 상태 | Git `docs/project/*.md`               |
| 변경 이력·롤백 기준     | Git commits / branches                |
| 사람이 보는 운영판      | Notion Project / Task DB              |
| 기준이 **아님**         | 채팅(Cursor 히스토리, Slack, 메신저) |

---

## MVP 단계

| MVP | 들어가는 것                                                                                                          |
| --- | -------------------------------------------------------------------------------------------------------------------- |
| 1   | Project Bootstrapper — `init` / `status` / 템플릿(Cursor Rules, `AGENTS.md`, `docs/`, `.vibeops/`) / `agent` 명령    |
| 2   | Project Planner — `plan` / `task generate`                                                                          |
| 3   | Git Task Lifecycle — `task start / prompt / check / done / rollback` + 안전장치                                     |
| 4   | Notion Dashboard Sync — `notion init / test / sync`, `task pull`                                                    |

세부는 [`docs/project/05-backlog.md`](docs/project/05-backlog.md)와 [`docs/tasks/`](docs/tasks/)를 본다.

---

## 설치 (예정 — TASK-001 이후)

> 아직 npm에 배포되지 않았다. TASK-012 이후 사용 가능.

```bash
# 글로벌 설치
npm i -g vibeops

# 또는 일회성 실행
pnpm dlx vibeops init
```

---

## 명령어 요약 (예정)

| 명령                                          | MVP | 설명                                                       |
| --------------------------------------------- | --- | ---------------------------------------------------------- |
| `vibeops init`                                | 1   | 현재 디렉터리에 VibeOps 운영 구조 설치                     |
| `vibeops status`                              | 1   | 설치 상태, TASK 현황, Notion 연결 여부                     |
| `vibeops agent list / show / prompt`          | 1   | 에이전트 목록·내용·프롬프트 출력                            |
| `vibeops plan`                                | 2   | 20개 대화형 질문 → ProjectBrief → docs/project 계획 프롬프트 |
| `vibeops task generate`                       | 2   | 백로그에서 TASK 파일 생성/생성용 프롬프트                  |
| `vibeops task start TASK-NNN`                 | 3   | base branch·commit·task branch 기록, task branch 생성       |
| `vibeops task prompt TASK-NNN --agent <name>` | 3   | Cursor 붙여넣기 프롬프트 출력                              |
| `vibeops task check TASK-NNN`                 | 3   | Acceptance Criteria/Test Plan vs Git 상태 비교 보고         |
| `vibeops task done TASK-NNN`                  | 3   | Status·Result·Test Result 검증 + 머지 가이드               |
| `vibeops task rollback TASK-NNN`              | 3   | 안내가 기본, `--confirm` 시에만 파괴적 Git 작업             |
| `vibeops notion init`                         | 4   | `.vibeops.json` notion 섹션 + `.vibeops.env.example` 정합  |
| `vibeops notion test`                         | 4   | API 접근·DB 스키마 검증 (read-only)                        |
| `vibeops notion sync`                         | 4   | docs/project · docs/tasks → Notion (메타 푸시; `--dry-run` / `--json` / `--only-tasks` / `--only-project`) |
| `vibeops task pull`                           | 4   | Notion → `docs/tasks/TASK-NNN-slug.md` skeleton 생성 (`--dry-run` / `--json` / `--status <list>` / `--limit <n>`) |

모든 변경 명령은 가능한 한 `--dry-run`을 지원한다.

---

## Notion sync / task pull

VibeOps는 **Git이 source of truth**, **Notion은 사람이 보는 dashboard** 라는 비대칭을 유지한다. 따라서 동기화는 **메타만** 다룬다.

### 사전 준비 (한 번)

1. Notion에서 두 DB를 사람이 직접 만든다. 각 DB가 가져야 할 속성은 `vibeops notion test` 가 친절하게 알려 준다.
   - **Projects DB (8 속성)**: `Name (title)` · `Project ID (rich_text)` · `Status (status)` · `Local Path (rich_text)` · `Git Repo (rich_text 또는 url)` · `Current Phase (select)` · `Docs Path (rich_text)` · `Summary (rich_text)`
   - **Tasks DB (10 속성)**: `Name (title)` · `Task ID (rich_text)` · `Project ID (rich_text)` · `Status (status)` · `Priority (select)` · `MVP Phase (select)` · `Git Branch (rich_text)` · `Docs Path (rich_text)` · `Summary (rich_text)` · `Result Summary (rich_text)`
   - `Status` 는 반드시 Notion **status** 타입 (select 아님).
   - **Status property option 필수값** (Notion `Status` → `Edit options` 에서 추가). VibeOps 는 옵션을 자동 생성하지 않는다 — 누락된 옵션은 `vibeops notion test` 가 `status-options-missing` 위반으로 잡고 추가해야 할 항목을 직접 알려 준다.
     - Projects DB Status options: `Building`, `Planning`, `Paused`, `Done`, `Archived`
     - Tasks DB Status options: `Planned`, `In Progress`, `Review`, `Done`, `Blocked`
2. 두 DB 페이지 우측 상단 ⋯ → Connections 로 Notion integration 을 추가해 토큰이 접근할 수 있게 만든다.
3. 로컬에서 `vibeops notion init` 을 실행한다. `NOTION_TOKEN` 을 입력하면 VibeOps가 API-first 방식으로 접근 가능한 data source를 찾는다.
   - 먼저 `/v1/search` `object=data_source` 로 직접 접근 가능한 data source를 찾는다.
   - 검색 결과가 없으면 `/v1/search` `object=page` 로 접근 가능한 부모 page를 보여 주고, 선택한 page의 `/v1/blocks/{page_id}/children` 에서 inline `child_database`를 스캔한다.
   - 찾은 `child_database` block id를 `/v1/databases/{id}` 로 조회하고, `database.data_sources[]` 에서 실제 `data_source` id를 뽑아 `/v1/data_sources/{id}` 의 `properties` 로 schema를 미리 검사한다.
   - 성공하면 `.vibeops.json` 에는 `notion.projectsTargetId` / `notion.tasksTargetId` 로 resolved data source id를 우선 저장한다. 기존 `projectsDatabaseId` / `tasksDatabaseId` 는 container/debug fallback으로 유지한다.
   - data source를 API로 찾지 못할 때만 마지막 fallback으로 data source id를 수동 입력한다.
4. `NOTION_TOKEN` 은 `.vibeops.env` (gitignored) 에만 넣는다.
5. `vibeops notion test` 가 모두 ✓ 가 되는지 확인한다. 문제 진단에는 `vibeops notion test --debug-shape` 를 사용한다.

### `vibeops notion sync`

`docs/project/00-overview.md` (Summary), `docs/project/{05,03}-current-state.md` (Current Phase 추론), `docs/tasks/*.md` (Goal / Result Summary / Status / Priority / MVP Phase / Git Branch / Docs Path) 를 읽어 Notion 의 Projects 1 행 + Tasks N 행을 **upsert** 한다.

- 매칭 키: Project 는 `Project ID`, Task 는 `(Project ID, Task ID)` 동시 일치. 없으면 create, 있으면 update.
- **본문은 절대 푸시하지 않는다.** Summary / Result Summary 만 1500자 한도로 잘라 푸시. 사용자가 Notion 안에서 작성한 page body 는 그대로 보존된다.
- `--dry-run` 은 query 만 호출하고 page mutation 은 **호출하지 않는다.** “create N / update M” 미리 보기만 출력.
- `--json` 은 동일한 plan + 결과를 stdout 으로 JSON.
- `--only-tasks` / `--only-project` 로 한 쪽만 sync.
- 친절한 에러: `notion-not-enabled` · `no-token` · `restricted_resource (DB 미공유)` · `unauthorized` · `schema (속성 누락 / 타입 불일치)` · timeout.
- target id 우선순위: `projectsTargetId/tasksTargetId`(data source) → `projectsDatabaseId/tasksDatabaseId`(legacy/container fallback). Sync/query도 resolved data source target을 우선 사용한다.
- Notion API 표면은 **2025-09-03 data_source 우선**: query 는 `data_sources/{id}/query`, page create 의 parent 는 `{ data_source_id }`, update 는 기존 `pages.update(page_id)`. dry-run 의 schema target 블록과 actual sync 가 같은 `data_source` id 를 쓴다는 사실을 `create parent  data_source_id <id>` / `query target  data_source <id>` 두 줄로 출력해 확인할 수 있다. 4xx 가 나면 `action=create-page, target=<id>, parent=data_source_id` 가 함께 표시되며, 404 일 때는 `vibeops notion test --debug-shape` 힌트가 따라붙는다. `NOTION_TOKEN` 은 어떤 출력에도 노출되지 않는다.
- **`TASK-000-template.md` 는 sync 대상에서 기본 제외.** 이 파일은 `task generate` 가 복제하는 템플릿이라 Notion row 가 생기면 안 된다. 향후 `--include-template` 옵션은 필요 시 별도 polish 라운드에서 추가.

### `vibeops task pull`

Notion Tasks DB 에서 현재 프로젝트의 `Status ∈ {Planned}` 행을 query 해, `Docs Path` 가 비어 있거나 로컬 파일이 없는 TASK 만 골라 `docs/tasks/TASK-NNN-slug.md` 18-섹션 skeleton 을 새로 만든다.

- `Task ID` 가 비어 있으면 자동으로 `docs/tasks` 의 가장 큰 번호 + 1 부터 할당.
- 새로 만든 파일의 `## Notion Page` 섹션에 `Page ID` 와 `Docs Path` 를 기록 → 다음 `notion sync` 가 같은 row 를 정확히 update.
- 빈 `Docs Path` 만 역방향 update (한 줄짜리). 다른 Notion 속성은 건드리지 않는다.
- **본문 덮어쓰기 0건**, 기존 로컬 파일 0건.
- `--dry-run` / `--json` / `--status <list>` (예: `--status Planned,Ready`) / `--limit <n>` (기본 20, 최대 100).

### 보안 / 안전

- `NOTION_TOKEN` 원본 값은 stdout 에 절대 노출되지 않는다 (`secr…last4 (len=N)` 로 마스킹).
- Notion mutation 은 `notion sync` (dry-run 아닐 때) 와 `task pull` (dry-run 아닐 때, 빈 Docs Path 만) 에만 일어난다. 그 외 모든 명령은 read-only.
- DB 자동 생성·page body block 동기화·Webhook·GitHub API·Cursor CLI·LLM API 호출은 본 라운드 범위 밖이며 정책상 금지.
- `@notionhq/client` 호출은 5 초 timeout — Notion 장애 시에도 명령이 매달리지 않는다.

---

## 명시적 비목표

- 웹 UI / 호스팅 대시보드
- GitHub API 직접 호출 (PR 자동 생성 등)
- Notion Webhook / 실시간 양방향 동기화
- VibeOps가 직접 LLM을 호출하는 자동 코드 생성
- 다중 프로젝트 / 멀티 워크스페이스 동시 관리

---

## 문서

- [`AGENTS.md`](AGENTS.md) — 모든 에이전트의 운영 지침
- [`docs/project/00-overview.md`](docs/project/00-overview.md) — 비전·용어·MVP 경계
- [`docs/project/01-architecture.md`](docs/project/01-architecture.md) — CLI·설정·데이터 흐름
- [`docs/project/02-tech-stack.md`](docs/project/02-tech-stack.md) — Node/TS/pnpm
- [`docs/project/03-current-state.md`](docs/project/03-current-state.md) — 지금 어디까지 왔는지
- [`docs/project/04-decisions.md`](docs/project/04-decisions.md) — 이미 내려진 결정
- [`docs/project/05-backlog.md`](docs/project/05-backlog.md) — TASK 순서·완료 정의
- [`docs/tasks/`](docs/tasks/) — Cursor가 단계별로 실행할 TASK 파일

---

## License

TBD (TASK-012에서 확정).
