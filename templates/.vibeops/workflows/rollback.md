# Workflow · Rollback

“이 TASK는 잘못됐다. 되돌리자.” 의 표준 흐름.

## 1. 진단 먼저

```bash
vibeops task rollback TASK-NNN
```

기본은 **안내만**. 다음을 표시한다.

- 현재 브랜치 / dirty 여부
- `.vibeops/state/tasks/TASK-NNN.json`에서 읽은 base branch / base commit / task branch
- 가능한 전략 3개

## 2. 가능한 전략

| 전략              | 설명                                                          | 잃을 수 있는 것                     |
| ----------------- | ------------------------------------------------------------- | ----------------------------------- |
| `branch-delete`   | task branch 폐기                                              | 머지되지 않은 모든 변경              |
| `reset-base`      | 현재 브랜치를 base commit으로 hard reset                      | 현재 변경 (스태시 권장)             |
| `revert-merge`    | 이미 머지된 경우 merge commit을 revert                        | 커밋 히스토리에 revert가 남는다(OK) |

## 3. 실행 (파괴적, `--confirm` 필요)

```bash
vibeops task rollback TASK-NNN --strategy branch-delete --confirm
vibeops task rollback TASK-NNN --strategy reset-base --confirm
vibeops task rollback TASK-NNN --strategy revert-merge --confirm
```

`--dry-run`과 `--confirm`을 같이 주면 “돌릴 명령”만 출력하고 실행하지 않는다.

## 4. 절대 하지 않는 일

- **`git push --force`**: 공유 브랜치에서 절대 금지. 본인 task 브랜치라도 “필요하다”는 이유가 명확하지 않으면 안 한다.
- 자동 reflog 청소.
- 사용자 동의 없는 stash drop.

## 5. 끝나면

- `docs/tasks/TASK-NNN-*.md`의 Status를 `planned` 또는 `blocked`로 되돌리고 사유를 Result에 적는다.
- `docs/project/05-current-state.md` 갱신.
- `docs/logs/YYYY-MM-DD.md`에 “Rollback: TASK-NNN — 이유”를 한 줄 추가.
