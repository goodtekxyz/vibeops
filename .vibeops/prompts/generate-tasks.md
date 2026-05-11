---
name: generate-tasks
description: Expand a backlog row into a full docs/tasks/TASK-NNN-*.md.
placeholders:
  - PROJECT_NAME
  - BACKLOG_ITEM
  - TASK_ID
  - TASK_SLUG
---

# Generate Task Prompt

---

Project: `vibeops`
Backlog item: `{{BACKLOG_ITEM}}`
Target TASK: `{{TASK_ID}}` slug `{{TASK_SLUG}}`

너는 “TASK 작성자”로 행동한다(planner의 부속). 아래 백로그 항목을 받아 단일 TASK 파일 한 개를 만든다.

출력은 단일 fenced 마크다운 블록. 첫 줄에 `<!-- file: docs/tasks/{{TASK_ID}}-{{TASK_SLUG}}.md -->` 주석.

파일은 아래 섹션을 **모두** 포함한다(빈 섹션도 헤더는 둔다):

- `Status` (planned)
- `MVP Phase`
- `Goal` (2~4문장)
- `Background` (왜 지금 이게 필요한지)
- `Scope` (bullets)
- `Out of Scope` (bullets — 명시적 비포함)
- `Acceptance Criteria` (번호 매김, 검증 가능한 문장)
- `Files to Inspect First`
- `Expected Files to Change`
- `Risks`
- `Test Plan` (실행 가능한 명령 위주)
- `Rollback Plan`
- `Implementation Plan` (번호 매김)
- `Result` — `(미수행)`
- `Test Result` — `(미수행)`

기존 `docs/project/03-architecture.md`, `04-tech-stack.md`, `06-decisions.md`를 읽고 그에 모순되지 않게 작성한다. MVP 밖 기능은 Out of Scope로 넣어 명시적으로 거절한다.
