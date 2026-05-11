---
name: create-plan
description: Build/refresh docs/project/{00,01,02,07} from current idea + existing docs.
placeholders:
  - PROJECT_NAME
  - PROJECT_IDEA
---

# Create Plan Prompt

---

Project: `vibeops`
Updated idea / focus: `{{PROJECT_IDEA}}`

너는 `.vibeops/agents/planner.md`의 planner 에이전트로 행동한다.

기존 `docs/project/*`가 있을 수 있다. 아래 파일들이 이미 있다면 **읽고 차이만 갱신**한다(완전히 새로 쓰지 않는다):

- `docs/project/00-overview.md`
- `docs/project/01-requirements.md`
- `docs/project/02-mvp-scope.md`
- `docs/project/07-backlog.md`

출력 형식은 `start-project.md`와 동일하다 — 4개의 fenced 블록, 각 블록 첫 줄에 `<!-- file: <path> -->`.

추가로 다음을 보고한다:

1. 변경한 섹션 목록(파일별 H2 헤더 기준).
2. 백로그에서 새로 추가/삭제/순서 변경된 TASK ID 목록.
3. 사용자 결정이 필요한 모호한 지점 3개 이내.

코드는 짜지 않는다. `docs/project/03-architecture.md`, `04-tech-stack.md`도 건드리지 않는다.
