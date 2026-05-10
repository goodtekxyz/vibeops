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

# 2) 아이디어를 받아 docs/project 골격과 백로그 계획 프롬프트 생성
vibeops plan

# 3) 백로그에서 첫 TASK 생성
vibeops task generate

# 4) TASK 시작 → Cursor에 붙여넣을 프롬프트 출력 → 검증 → 완료
vibeops task start TASK-001
vibeops task prompt TASK-001 --agent builder
vibeops task check TASK-001
vibeops task done TASK-001

# 5) (옵션) Notion 운영판과 동기화
vibeops notion init
vibeops notion test
vibeops notion sync
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
| `vibeops plan`                                | 2   | 아이디어 → docs/project 계획 프롬프트                       |
| `vibeops task generate`                       | 2   | 백로그에서 TASK 파일 생성/생성용 프롬프트                  |
| `vibeops task start TASK-NNN`                 | 3   | base branch·commit·task branch 기록, task branch 생성       |
| `vibeops task prompt TASK-NNN --agent <name>` | 3   | Cursor 붙여넣기 프롬프트 출력                              |
| `vibeops task check TASK-NNN`                 | 3   | Acceptance Criteria/Test Plan vs Git 상태 비교 보고         |
| `vibeops task done TASK-NNN`                  | 3   | Status·Result·Test Result 검증 + 머지 가이드               |
| `vibeops task rollback TASK-NNN`              | 3   | 안내가 기본, `--confirm` 시에만 파괴적 Git 작업             |
| `vibeops notion init`                         | 4   | `.vibeops.env` 작성 안내                                   |
| `vibeops notion test`                         | 4   | API 접근·DB 스키마 검증                                    |
| `vibeops notion sync`                         | 4   | Git docs → Notion (메타 푸시)                              |
| `vibeops task pull`                           | 4   | Notion → docs/tasks 메타 정합                              |

모든 변경 명령은 가능한 한 `--dry-run`을 지원한다.

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
