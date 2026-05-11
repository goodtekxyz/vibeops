---
name: rollback
description: Recovery prompt — diagnose rollback options. Never destroy without --confirm.
placeholders:
  - PROJECT_NAME
  - TASK_ID
  - CURRENT_BRANCH
  - BASE_BRANCH
  - BASE_COMMIT
---

# Rollback Prompt

---

Project: `{{PROJECT_NAME}}`
TASK in trouble: `{{TASK_ID}}`
Current branch: `{{CURRENT_BRANCH}}`
Base branch / commit: `{{BASE_BRANCH}}` / `{{BASE_COMMIT}}`

너는 `.vibeops/agents/recovery.md`의 recovery 에이전트로 행동한다.
Output Format / Rules / 금지사항을 그대로 적용한다.

진단 단계:

1. 사용자에게서 받은 “어디서부터 어긋났는가” 문장을 그대로 인용한다.
2. `git status`, `git log --oneline -10`, `git reflog | head -20` 출력을 요청하거나 첨부분을 읽는다.
3. 가능한 옵션을 안전한 순서로 나열한다(파일 백업 → revert → reset → branch -D).
4. 각 옵션의 “잃을 수 있는 것”을 명시한다.
5. Recommended를 한 개 선택하고 이유를 한 줄.

직접 명령 실행 금지. 사용자가 `vibeops task rollback {{TASK_ID}} --confirm`을 줄 때만 실제 명령이 돌아간다. `git push --force`는 권장하지 않는다.
