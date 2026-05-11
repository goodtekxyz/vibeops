# TASK-009 · Rollback safety — `task rollback`

## Status

Review

## Git Context

- Base Branch: `main`
- Base Commit: `940d255`
- Task Branch: `task/008-task-lifecycle`
- Started At: `2026-05-11T01:18:00Z`

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

2026-05-11 완료(Review 대기). `vibeops task rollback <taskId>` 를 안전장치와 함께 구현했다. 본 TASK는 TASK-008과 같은 라운드(branch `task/008-task-lifecycle`)에서 함께 구현됐다.

### 사용자 요구사항 vs 원 TASK-009 문서

- 원 문서: 파괴적 게이트가 `--confirm` 한 단계.  
  실제 구현: 사용자 갱신 요구에 따라 **2단계 confirm**으로 분리한다.
  - 기본(아무 옵션 없음) → 파일·Git 변경 0건. 현재 브랜치/dirty/`## Git Context`(TASK markdown에서 읽음)와 가능한 전략 3개(`branch-delete` / `reset-base` / `revert-merge`)와 각각의 위험·명령을 출력. 안내만.
  - `--confirm` → **비파괴** rollback만 허용. 기본 전략은 `branch-delete`. `git switch <baseBranch>` 후 `git branch -D <taskBranch>`. dirty면 거부, task branch에 체크아웃돼 있으면 먼저 base로 스위치.
  - `--confirm-destructive` → **파괴적** rollback 허용. `reset-base` 전략에서 `git reset --hard <baseCommit>` 실행. dirty여도 진행(사용자가 위험 명시 수락). `--confirm`만으로는 reset-base는 거부된다.
  - `--strategy revert-merge` → 어느 옵션에서도 자동 실행하지 않고 명령만 안내(merge SHA를 사람이 찾아 `git revert -m 1 <sha>` 실행).
- 원 문서: `.vibeops/state/tasks/TASK-NNN.json`에서 상태 로드.  
  실제 구현: TASK markdown의 `## Git Context` 섹션에서 로드(TASK-008과 같은 inline 정책).
- 원 문서: 별도 `src/rollback/planner.ts` + `src/rollback/executor.ts` 분리.  
  실제 구현: 명령 양이 적어 `src/commands/task-rollback.ts` 단일 파일에 `strategyCommands` / `strategyRisk` 헬퍼로 정리. `src/lib/git.ts`에 공용 `gitDeleteBranch` / `gitResetHard` 추가(TASK-008 git 헬퍼와 공유).

### 안전장치 (사용자 강조 사항)

- 기본 실행은 **안내만**. 어떤 옵션도 없으면 파일·Git 변경 0건.
- `--confirm` 만으로는 `reset --hard` 거부 → `--confirm-destructive` 가 명시적으로 필요.
- `--confirm` + dirty + `branch-delete`도 dirty면 거부(사용자에게 commit/stash 먼저 안내). `--confirm-destructive`만 dirty 통과.
- `--dry-run`은 `--confirm` / `--confirm-destructive`와 조합해도 git 명령 0건. 실행될 명령만 출력.
- `--keep-branch` → `branch-delete` 전략에서 base로 스위치만 하고 task branch는 남긴다.
- `revert-merge`는 자동 실행 대상이 아니다. 사용자가 직접 머지 SHA를 찾아야 한다.
- **force-push는 어떤 옵션 조합으로도 발생하지 않는다.** `git push` 자체를 호출하지 않는다.

## Test Result

- 실제 git sandbox 시퀀스(TASK-008과 같은 sandbox에서):
  1. `task rollback TASK-001` (옵션 없음) → 안내만 출력, `task/001-cli-bootstrap` 브랜치/파일 변경 0건. Git Context를 TASK markdown에서 올바르게 파싱.
  2. `task rollback TASK-001 --confirm --strategy reset-base` → `✗ reset-base는 파괴적 작업이다. --confirm 만으로는 실행할 수 없다. --confirm-destructive 가 필요하다.` + exit 1, git 변경 0건.
  3. dirty 상태에서 `task rollback TASK-001 --confirm --strategy branch-delete --dry-run` → `Working tree is dirty. Commit / stash first, or rerun with --confirm-destructive` + exit 1, git 변경 0건.
  4. clean 상태에서 `task rollback TASK-001 --confirm --strategy branch-delete --dry-run` → “dry-run — would run for strategy=branch-delete: git switch main / git branch -D task/001-cli-bootstrap” 출력만, 브랜치 그대로.
  5. clean 상태에서 `task rollback TASK-001 --confirm --strategy branch-delete` → 현재 브랜치였던 `task/001-cli-bootstrap`을 base(`main`)로 스위치 후 `-D`로 삭제. 브랜치 목록에서 사라짐. ✓.
  6. 새 TASK-002로 동일하게 `task start` 후 임의 commit(`experiment.txt`) 추가 → `task rollback TASK-002 --confirm-destructive --strategy reset-base` → 브랜치가 base commit으로 hard reset, `experiment.txt` 사라짐, log이 base 시점으로 복구. exit 0.
- `git push` 호출은 어떤 케이스에서도 발생하지 않음(소스 검색으로 확인 — `git.ts`에 `push` 명령 없음).
- 보류: vitest 자동 회귀 테스트(TASK-008과 같이 polish 라운드로 이관).
