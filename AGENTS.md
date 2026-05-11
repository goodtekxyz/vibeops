# vibeops — AI 에이전트 운영 지침

> 이 파일은 **VibeOps**가 설치했다. 이 프로젝트의 모든 AI 에이전트(Cursor 포함)는 코드를 만지기 전 이 문서를 먼저 읽는다.

## 목적

이 프로젝트는 **Cursor 기반 바이브 코딩**을 체계적으로 굴린다. 채팅이 아니라 **`docs/tasks/TASK-*.md`**가 작업 입력이다.

## 코딩 전에 읽을 문서

아래를 **구현 시작 전**에 읽는다. 순서는 위에서 아래로.

| 문서                                       | 이유                                     |
| ------------------------------------------ | ---------------------------------------- |
| `docs/project/05-current-state.md`         | 지금 어디까지 왔는지, 다음 무엇을 할지     |
| `docs/project/00-overview.md`              | 비전·용어·MVP 경계                       |
| `docs/project/02-mvp-scope.md`             | 무엇이 MVP 안/밖인지                     |
| `docs/project/03-architecture.md`          | 시스템·폴더·데이터 흐름                  |
| `docs/project/04-tech-stack.md`            | 어떤 도구로 만드는지                     |
| `docs/project/06-decisions.md`             | 이미 내려진 결정(충돌 방지)              |
| `docs/project/07-backlog.md`               | TASK 순서·완료 정의                      |
| **현재 TASK 파일** `docs/tasks/TASK-NNN-*` | 이번 작업의 Scope · Acceptance Criteria  |

`docs/project/01-requirements.md`, `08-env.md`, `09-deployment.md`는 필요 시 참고. **현재 TASK 파일은 반드시 전체를 읽는다.**

## 진실 공급원

| 무엇                | 어디                            |
| ------------------- | ------------------------------- |
| AI 실행 기준        | Git `docs/tasks/*.md`           |
| 프로젝트 설계·상태  | Git `docs/project/*.md`         |
| 변경 이력·롤백 기준 | Git commits / branches          |
| 사람용 운영판       | Notion (메타만, 본문 X)         |
| 기준이 **아님**     | 채팅 (Cursor 히스토리, Slack)   |

## TASK 기반 개발 규칙

1. **한 번에 하나의 TASK**만 구현한다.
2. TASK의 **Scope / Acceptance Criteria** 밖은 하지 않는다.
3. 새 코드 추가 전 **검색**으로 기존 구현·패턴을 확인하고 **중복**을 만들지 않는다.
4. **모든 변경 명령**은 가능하면 **`--dry-run`**으로 부작용 없이 미리 보여 줄 수 있게 설계한다.
5. **대규모 리팩터링**은 해당 내용이 **별도 TASK**에 있을 때만 한다.
6. **Notion·Git 연동**은 그 책임이 **명시된 TASK**에서만 구현한다.
7. 작업이 끝나면 [작업 완료 후 보고 형식](#작업-완료-후-보고-형식)과 `.cursor/rules/04-docs-update.mdc`에 따라 문서를 갱신한다.

세부는 `.cursor/rules/`를 따른다.

## 에이전트 역할

이 프로젝트에는 `.vibeops/agents/*.md`에 8개 에이전트가 정의되어 있다.

- `orchestrator` — 다음 TASK를 정하고 다른 에이전트에게 위임한다.
- `planner` — 아이디어를 `docs/project/{00,01,02,07}`로 펼친다.
- `architect` — `docs/project/{03,04}`(아키텍처·기술 스택)를 채운다.
- `builder` — 단일 TASK를 받아 코드를 변경한다.
- `reviewer` — 변경 diff와 Acceptance Criteria를 비교한다.
- `tester` — Test Plan을 실행하고 Test Result를 채운다.
- `docs` — `05-current-state.md` / TASK Result / `docs/logs/`를 갱신한다.
- `recovery` — 롤백 옵션을 진단한다(파괴적 작업은 `--confirm`).

## 금지사항

- 채팅만을 근거로 요구사항을 바꾸거나 “대충” 구현하기
- **현재 TASK 파일을 읽지 않고** 코드·설정 변경하기
- 한 세션에서 **여러 TASK를 섞기**, TASK 없이 **임의로 `src/` 등 대규모 구조** 추가하기
- TASK **Scope 밖** 기능, MVP **밖** 기능
- **검색 없이** 유사 모듈을 또 만들기
- **대규모 리팩터링**을 별도 TASK 없이 수행하기
- TASK에 없는 **Notion·Git 연동** 추가
- 구현 후 **`05-current-state.md` / TASK 파일 / `docs/logs/YYYY-MM-DD.md`** 갱신을 생략하고 TASK를 완료로 칭하기

## Cursor 규칙 파일

| 파일                                                  | 내용                                              |
| ----------------------------------------------------- | ------------------------------------------------- |
| `.cursor/rules/00-project-governance.mdc`             | 진실 공급원, 한 TASK 원칙, MVP 범위               |
| `.cursor/rules/01-agent-orchestration.mdc`            | 8개 에이전트의 역할과 협업 흐름                   |
| `.cursor/rules/02-task-workflow.mdc`                  | 한 TASK 시작·진행·완료 규칙, dry-run 우선         |
| `.cursor/rules/03-git-safety.mdc`                     | 브랜치·롤백 안전장치, force-push 금지              |
| `.cursor/rules/04-docs-update.mdc`                    | 구현 완료 후 문서 갱신 의무                       |

## 작업 완료 후 보고 형식

TASK 구현을 끝낼 때 채팅 답변에 최소한 다음을 포함한다.

1. **TASK ID** (예: `TASK-001`)
2. **요약** — 무엇을 달성했는지 2~4문장
3. **변경 파일** — 주요 경로 목록
4. **검증** — 실행한 명령과 결과
5. **문서 반영** — `05-current-state.md`, 해당 TASK Result/Test Result, `docs/logs/YYYY-MM-DD.md`를 갱신했는지 명시

이 보고를 생략하고 “끝”이라고만 하지 않는다.

## VibeOps 메타

- Project name: `vibeops`
- Bootstrapped by: VibeOps `0.1.0`
- Created at: `2026-05-11T01:53:45.788Z`
