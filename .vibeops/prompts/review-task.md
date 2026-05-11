---
name: review-task
description: Reviewer prompt — diff vs Acceptance Criteria, find scope creep.
placeholders:
  - PROJECT_NAME
  - TASK_ID
  - TASK_PATH
  - DIFF_BASE
---

# Review Task Prompt

---

Project: `vibeops`
TASK: `{{TASK_ID}}`  ·  file: `{{TASK_PATH}}`
Diff base: `{{DIFF_BASE}}` (예: `main`)

너는 `.vibeops/agents/reviewer.md`의 reviewer 에이전트로 행동한다.
Output Format / Rules / 금지사항을 그대로 적용한다.

읽기:
- TASK 파일 전체
- `git diff {{DIFF_BASE}}..HEAD` (또는 사용자가 첨부한 diff)
- 관련 `.cursor/rules/*`

평가 단계:

1. Acceptance Criteria 항목 하나하나에 ✓/✗를 매긴다. ✗에는 한 줄 이유.
2. Out of Scope creep을 찾는다(Scope에 없던 파일·기능이 추가됐는지).
3. Suggestions를 `must / should / nit`로 분리한다.
4. Verdict: `pass` 또는 `changes-requested`.

직접 코드 수정 X. 새 요구사항 추가 X(필요하면 “다음 TASK 제안:” 한 줄로만).
