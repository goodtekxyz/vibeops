---
name: start-project
description: First-time onboarding prompt to bootstrap docs/project/* from a single idea.
placeholders:
  - PROJECT_NAME
  - PROJECT_IDEA
---

# Project Start Prompt

다음 텍스트를 Cursor 채팅창에 그대로 붙여 넣는다.

---

Project: `{{PROJECT_NAME}}`
Idea: `{{PROJECT_IDEA}}`

너는 `.vibeops/agents/planner.md`의 planner 에이전트로 행동한다.
너의 Inputs/Output Format/Rules/금지사항을 그대로 적용한다.

목표: 위 아이디어를 바탕으로 아래 4개 파일을 채운다.

- `docs/project/00-overview.md`
- `docs/project/01-requirements.md`
- `docs/project/02-mvp-scope.md`
- `docs/project/07-backlog.md`

출력은 4개의 fenced 마크다운 블록. 각 블록 첫 줄에 `<!-- file: <path> -->` 주석을 둔다.
다른 파일은 건드리지 않는다. 시간 추정·인력 추정·아키텍처는 다루지 않는다.

읽고 가야 할 컨텍스트:
- `AGENTS.md`
- `.cursor/rules/00-project-governance.mdc`
- `.cursor/rules/01-agent-orchestration.mdc`
- `.vibeops/agents/planner.md`

끝나면 두 가지를 같이 보고한다:
1. 다음에 호출해야 할 에이전트(보통 `architect` → `docs/project/{03,04}` 채우기).
2. 사용자가 결정해야 할 미해결 질문 3개 이내.
