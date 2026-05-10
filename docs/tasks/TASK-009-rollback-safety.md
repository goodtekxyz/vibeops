# TASK-009 · Rollback safety — `task rollback`

## Status

planned

## MVP Phase

MVP 3 · Git Task Lifecycle

## Goal

`vibeops task rollback TASK-NNN`을 구현한다. 기본 동작은 **안내 출력만**(어떤 브랜치/커밋을 어떻게 되돌릴 수 있는지). 실제 파괴적 Git 작업(브랜치 삭제, reset, revert)은 `--confirm`이 있을 때만 수행한다.

## Background

VibeOps의 가치 중 하나는 “롤백 가능성”이다. TASK 시작 시 `baseCommit`/`baseBranch`/`taskBranch`를 기록해 두었으므로, 이 정보를 바탕으로 깔끔한 되돌리기 절차를 제시할 수 있다. 그러나 자동으로 파괴적 작업을 하면 사용자의 미푸시 변경을 날릴 수 있어 **기본은 안내**, 명시적 confirm 게이트가 있어야 한다.

## Scope

- `src/commands/task/rollback.ts`
- `src/rollback/planner.ts` — state 파일과 현재 Git 상태로 “되돌리기 옵션” 목록을 생성
- `src/rollback/executor.ts` — `--confirm` 시에만 실제 git 호출
- 옵션:
  - `--confirm` — 파괴적 작업 허용 (없으면 안내만)
  - `--strategy <branch-delete | reset-base | revert-merge>` — 어떤 전략을 쓸지 명시
  - `--keep-branch` — branch 삭제는 하지 않음
  - `--dry-run` — `--confirm`이 있어도 실행은 하지 않고 “실제로 돌릴 명령”만 stdout 출력

## Out of Scope

- 자동 머지된 변경을 푸시한 다음의 원격 rollback — `revert-merge` 안내만 출력, force-push는 하지 않음
- Notion 측 상태 복구(→ TASK-011 동기화 시 사람이 본다)

## Acceptance Criteria

1. `vibeops task rollback TASK-001` (인수 없음)은 **파일·Git을 변경하지 않고** 다음을 출력한다.
   - 현재 브랜치 / dirty 여부
   - state 파일에서 읽은 `baseBranch` / `baseCommit` / `taskBranch`
   - 가능한 전략 3개와 각각의 위험 안내
     - `branch-delete`: task branch 폐기 (머지되지 않은 변경은 모두 사라짐)
     - `reset-base`: 현재 브랜치를 `baseCommit`으로 hard reset (현재 변경 사라짐)
     - `revert-merge`: 머지된 커밋을 revert (이미 머지된 경우)
2. `--confirm --strategy branch-delete`로 호출 시 task branch가 실제로 삭제된다. dirty/현재 브랜치라면 거부.
3. `--confirm --dry-run` 조합은 실행하지 않고 “돌릴 명령” 목록만 보여준다.
4. `--confirm`이 없으면 어떤 옵션 조합에서도 파일·Git 변경 0건.
5. force-push는 어떤 옵션 조합으로도 발생하지 않는다(원격이 있든 없든).

## Files to Inspect First

- `src/lifecycle/state.ts` (TASK-008)
- `src/lifecycle/git.ts` (TASK-008)
- 본 저장소 `docs/project/04-decisions.md` § D-007

## Expected Files to Change

- 신규: `src/commands/task/rollback.ts`, `src/rollback/planner.ts`, `src/rollback/executor.ts`
- 신규: `tests/rollback.test.ts`
- 갱신: 본 TASK Result/Test Result, `docs/project/03-current-state.md`, `docs/logs/YYYY-MM-DD.md`

## Risks

- 사용자가 `--confirm`을 무심코 켤 위험 → 표준 출력에 “This will run the following git commands:” 후 명령을 모두 나열하고 5초 대기·확인 입력을 옵션으로 둘 수도 있다(MVP에서는 명령 나열까지만).
- `branch-delete`가 현재 체크아웃된 브랜치를 지우려 하면 git이 거부. 그 경우 “먼저 `git switch <baseBranch>` 후 다시 시도하라”는 안내.

## Test Plan

- vitest tmpdir + 작은 git repo로:
  - `rollback`(인수 없음) → stdout이 3개 전략과 위험 안내 포함, 파일·Git 변경 0건
  - `--confirm --strategy branch-delete` → 다른 브랜치에 있을 때 task branch 삭제 성공
  - `--confirm --strategy reset-base` → 현재 브랜치가 base로 reset 됨
  - `--confirm --dry-run` → 실제 변경 0건
  - dirty 상태에서 `--confirm --strategy reset-base` → 거부 + 안내
- 수동: 자기 자신 저장소에서 `vibeops task rollback TASK-001` 안내 출력 확인.

## Rollback Plan

- 본 명령 자체가 “rollback”이지만, 그 안전장치(D-007)를 본 TASK가 보장한다.
- 코드 작업 자체는 task branch 폐기로 되돌릴 수 있다.

## Implementation Plan

1. `rollback/planner.ts`에서 state + git 상태로 전략 목록 생성.
2. `rollback/executor.ts`에 각 전략의 git 명령을 정의. 옵션 없으면 호출하지 않는다.
3. `commands/task/rollback.ts`에 옵션 처리.
4. tests + 문서 갱신.

## Result

(미수행)

## Test Result

(미수행)
