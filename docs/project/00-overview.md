# 00 — Overview

## 한 줄 정의

**VibeOps**는 새 프로젝트를 시작할 때 **Cursor 기반 바이브 코딩**을 체계적으로 수행할 수 있도록, 프로젝트 내부에 **문서 구조, Cursor Rules, AGENTS.md, 에이전트 정의, TASK 템플릿, Git 작업 흐름, Notion 운영판 동기화 구조**를 설치·생성하는 **로컬 CLI**다.

VibeOps 자신은 코드를 생성하지 않는다. 코드는 Cursor가 `docs/tasks/TASK-*.md` 기준으로 작성한다. VibeOps는 그 위에서 작업이 **흩어지지 않게 잡아주는 레일(rail)**이다.

## 해결하려는 문제

바이브 코딩(Cursor에 자연어로 시켜서 코드를 만드는 방식)은 빠르지만 곧 다음 문제를 만든다.

1. 무엇을 만들지에 대한 **단일 진실 공급원**이 없다. 채팅이 사라지면 맥락이 사라진다.
2. 에이전트가 같은 일을 **다르게 반복**하거나, 범위 밖 작업을 **임의로** 한다.
3. 기능을 모았는데 **어떤 커밋이 어떤 결정에 대응되는지** 추적할 수 없다.
4. 다른 사람(또는 미래의 나)이 프로젝트 상태를 볼 **운영판**이 없다.
5. 새 프로젝트를 시작할 때마다 위 구조를 **수작업**으로 다시 세팅한다.

VibeOps는 이걸 **프로젝트 부트스트랩 + TASK 라이프사이클 + Notion 운영판 동기화** 한 묶음으로 해결한다.

## 사용 예시 — BYOBrowser

사용자가 “**BYOBrowser**라는 브라우저 자동화 SaaS를 만들고 싶다”는 아이디어를 입력하면, VibeOps는 새 빈 디렉터리(또는 기존 프로젝트)에 다음을 설치·생성한다.

1. `AGENTS.md`, `.cursor/rules/*.mdc` — Cursor가 따를 규칙
2. `docs/project/00-overview.md` ~ `05-backlog.md` — 비전·아키텍처·기술 스택·현재 상태·결정·백로그
3. `docs/tasks/TASK-001-*.md` 등 — Cursor가 실행할 작업 단위
4. `.vibeops/agents/*.md`, `.vibeops/prompts/*.md`, `.vibeops/workflows/*.md` — 에이전트 정의·프롬프트 템플릿·워크플로
5. `.vibeops.json`, `.vibeops.env.example` — VibeOps 자체 설정과 Notion 연동용 환경 변수 자리

그 다음 실제 개발은 그 프로젝트 안에서 Cursor가 `docs/tasks/TASK-*.md` 기준으로 단계별로 수행한다. 사람과 PM은 Notion 대시보드로 같은 TASK 상태를 본다.

## VibeOps의 핵심 역할

1. **Project Bootstrapper** — 새 프로젝트에 VibeOps 운영 구조를 1회 설치한다.
2. **Project Planner** — 아이디어를 받아 `docs/project/*`와 백로그·초기 TASK들의 골격을 채울 **계획 프롬프트**를 만든다.
3. **Agent-Orchestrated Workflow** — `.vibeops/agents/*`에 정의된 에이전트 역할(예: planner, builder, reviewer, releaser)을 TASK에 묶어 Cursor에 붙여 넣을 프롬프트를 출력한다.
4. **Docs as Source of Truth** — `docs/project/*`와 `docs/tasks/*`가 AI와 사람 모두의 기준이다.
5. **Task Lifecycle** — `start → prompt → check → done`(과 필요 시 `rollback`)으로 한 TASK의 생애를 명령으로 표현한다.
6. **Git Branch / Commit / Rollback Safety** — TASK 시작 시 base branch/commit과 task branch를 기록하고, rollback은 기본적으로 안내만 출력한다.
7. **Notion as Human Dashboard** — Notion은 사람이 보는 운영판이고, 상세 실행 기준은 `docs/tasks/*.md`에 둔다.
8. **Cursor as Builder, VibeOps as Workflow Rail** — 코드는 Cursor가 짓고, VibeOps는 그 작업이 흩어지지 않게 레일을 깐다.

## Source of Truth 규칙

| 무엇                    | 어디                                  | 누구를 위한 것              |
| ----------------------- | ------------------------------------- | --------------------------- |
| AI 실행 기준            | Git `docs/tasks/*.md`                 | Cursor, 에이전트            |
| 프로젝트 설계/현재 상태 | Git `docs/project/*.md`               | 모든 사람                   |
| 변경 이력·롤백 기준     | Git commits / branches                | 개발자, VibeOps rollback    |
| 사람이 보는 운영판      | Notion Project / Task DB              | 본인, 동료, PM, 외부 이해자 |
| 기준이 **아님**         | 채팅(Cursor 히스토리, Slack, 메신저) | —                           |

채팅은 신뢰하지 않는다. 채팅과 문서가 어긋나면 **문서를 먼저** 맞춘 뒤 구현한다.

## 용어

- **VibeOps 프로젝트**: VibeOps로 부트스트랩되어 `AGENTS.md`, `.cursor/rules/`, `docs/`, `.vibeops/`를 갖춘 디렉터리.
- **TASK**: `docs/tasks/TASK-NNN-*.md`로 표현된 하나의 작업 단위. Cursor가 한 번에 한 개만 실행한다.
- **Agent**: `.vibeops/agents/<name>.md`로 정의된 역할 + 프롬프트 묶음(예: builder, reviewer).
- **Backlog**: `docs/project/05-backlog.md`의 TASK 순서. 완료 정의 포함.
- **Notion 운영판**: 사람이 상태·우선순위·브랜치·docs path·결과 요약을 보는 대시보드.

## MVP 경계

| MVP | 무엇이 들어가나                                                                                                                                                                            |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Project Bootstrapper — `vibeops init`, `vibeops status`, Cursor Rules / AGENTS.md / `docs/project` / `docs/tasks` 템플릿 / `.vibeops/agents` / `.vibeops/prompts` / `.vibeops/workflows` 설치, `.vibeops.json`·`.vibeops.env.example` 생성 |
| 2   | Project Planner — `vibeops plan`, `vibeops task generate`. 아이디어 → 계획 프롬프트 → docs/project·docs/tasks 골격                                                                          |
| 3   | Git Task Lifecycle — `task start / prompt / check / done / rollback`, base branch·commit·task branch 기록, rollback 안전장치(`--confirm`)                                                  |
| 4   | Notion Dashboard Sync — `notion init / test / sync`, `task pull`. Notion은 source of truth가 아니라 human dashboard                                                                        |

각 MVP의 자세한 TASK는 [05-backlog.md](05-backlog.md)를 본다.

## 명시적 비목표 (Out of MVP)

- 웹 UI / 대시보드 호스팅
- GitHub API 직접 호출(PR 자동 생성 등)
- Notion Webhook / 실시간 양방향 동기화
- VibeOps가 직접 LLM을 호출하는 자동 코드 생성(코드는 Cursor가 만든다)
- 다중 프로젝트 동시 관리 / 멀티 워크스페이스
