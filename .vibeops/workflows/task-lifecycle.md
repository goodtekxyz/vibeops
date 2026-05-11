# Workflow · Task Lifecycle

한 TASK의 시작부터 완료까지.

## 0. 선택

`vibeops status`로 다음 진행할 TASK를 확인한다. 보통 in_progress → planned 순.

## 1. Start

```bash
vibeops task start TASK-NNN
```

- 현재 작업 폴더가 dirty면 거부(`--allow-dirty`로 우회 가능, 권장 X).
- base branch / base commit / task branch를 `.vibeops/state/tasks/TASK-NNN.json`에 기록.
- `task/NNN-<slug>` 브랜치 생성·체크아웃.
- TASK 파일 Status를 `in_progress`로.

## 2. Prompt

```bash
vibeops task prompt TASK-NNN --agent builder
```

출력된 단일 마크다운을 Cursor 채팅창에 붙여 넣는다. Cursor는 builder 에이전트로 작동.

다른 에이전트도 같은 방식.
- `--agent reviewer` : 변경 diff 점검
- `--agent tester` : Test Plan 실행
- `--agent docs` : 문서 세 가지 갱신

## 3. Check

```bash
vibeops task check TASK-NNN
```

- Acceptance Criteria 항목별 ✓/✗
- “Expected Files to Change”와 실제 변경 파일 매칭
- 현재 브랜치·dirty·커밋 수 요약

## 4. Done

```bash
vibeops task done TASK-NNN
```

- TASK 파일의 Status=`done`, Result/Test Result 본문 검증
- `.vibeops/state/tasks/TASK-NNN.json`에 `doneAt` 기록
- **머지 가이드** 출력 (자동 머지 금지)

머지는 사람이 직접:

```bash
git switch main
git merge --ff-only task/NNN-<slug>
git branch -d task/NNN-<slug>
```

## 5. (옵션) Notion sync

```bash
vibeops notion sync
```

TASK 메타(요약·상태·우선순위·브랜치·docs path·결과 요약)가 Notion에 푸시된다.

## 비상시: Rollback

[`rollback.md`](rollback.md) 참고.
