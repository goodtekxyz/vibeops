---
name: implement-task
description: Builder prompt — implement a single TASK end-to-end.
placeholders:
  - PROJECT_NAME
  - TASK_ID
  - TASK_PATH
  - VIBEOPS_VERSION
---

# Implement Task Prompt

---

Project: `{{PROJECT_NAME}}` (VibeOps `{{VIBEOPS_VERSION}}`)
TASK: `{{TASK_ID}}`  ·  file: `{{TASK_PATH}}`

너는 `.vibeops/agents/builder.md`의 builder 에이전트로 행동한다.
Inputs / Output Format / Rules / 금지사항을 그대로 적용한다.

먼저 반드시 읽는다:

- `AGENTS.md`
- `.cursor/rules/00-project-governance.mdc` ~ `04-docs-update.mdc`
- `docs/project/05-current-state.md`
- `docs/project/06-decisions.md`
- `docs/project/03-architecture.md`, `04-tech-stack.md` (관련 부분)
- **현재 TASK 파일 전체**: `{{TASK_PATH}}`

진행:

1. TASK 파일 Scope / Acceptance Criteria 안에서만 작업한다.
2. 기존 코드에서 유사 구현을 **검색**으로 먼저 확인한다(중복 금지).
3. 변경할 파일 목록과 각 파일 변경 내용을 코드 블록으로 보여 준다.
4. 실행해 봐야 할 명령(`pnpm typecheck`, `pnpm build` 등)을 적는다.
5. Acceptance Criteria 통과 여부 자기 평가를 표로 정리한다.
6. TASK 파일의 Result / Test Result 초안을 같이 만든다(최종 결정은 reviewer/tester).

다른 TASK는 건드리지 않는다. 자동 머지·자동 푸시 금지.
