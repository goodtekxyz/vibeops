# TASK-014 · Init Git bootstrap UX

## Status

Review

## MVP Phase

후속 (post-MVP 4)

## Goal

`vibeops init` 단계에서 Git 초기화와 초기 커밋까지 선택적으로 처리할 수 있게 한다. 또한 최초 커밋 전 Git 상태를 `vibeops status` 에서 detached 로 오해하지 않도록 unborn branch 로 정확히 표시한다.

## Background

새 프로젝트에서 사용자는 현재 `vibeops init` 후 `git init`, `git branch -M main`, `git add .`, `git commit ...` 을 직접 수행해야 한다. 최초 커밋 전에는 `HEAD` 가 없어서 기존 `vibeops status` 가 branch 를 `(detached?)` 처럼 표시해 혼란을 준다.

## Scope

- `vibeops init` interactive Git setup 추가:
  - Initialize Git repository? 기본 Yes.
  - Use `main` as default branch? 기본 Yes.
  - Create initial commit? 기본 Yes.
  - Initial commit message 기본 `chore: initialize vibeops project`.
- `vibeops init` 옵션 추가:
  - `--git`
  - `--no-git`
  - `--initial-commit`
  - `--no-initial-commit`
  - `--default-branch <name>` (기본 `main`)
  - `--commit-message <message>` (기본 `chore: initialize vibeops project`)
- Git 안전 규칙:
  - 이미 Git repo 면 `git init` skip.
  - 이미 커밋이 있으면 initial commit skip/warn.
  - initial commit 전 포함 파일 수를 보여준다.
  - `--dry-run` 에서는 Git 명령 0건.
  - 자동 push 0건.
  - 기존 remote 변경 0건.
- `src/lib/git.ts` helper 확장:
  - `isGitRepository(cwd)`
  - `hasAnyCommit(cwd)`
  - `currentBranchOrUnborn(cwd)`
  - `gitInit(cwd)`
  - `gitSetDefaultBranch(cwd, branch)`
  - `gitAddAll(cwd)`
  - `gitCommit(cwd, message)`
- `vibeops status` Git 표시 개선:
  - `git symbolic-ref --short HEAD` 로 branch 가 읽히면 branch 이름 표시.
  - `git rev-parse --verify HEAD` 실패 시 `unborn` 으로 판단.
  - detached 와 unborn 구분.

## Out of Scope

- 원격 remote 생성/수정/push.
- GitHub 연동 변경 (`vibeops github` 는 TASK-013 범위).
- Git commit author 설정.
- 기존 repo history rewrite.
- Git hooks 우회 옵션 추가.

## Acceptance Criteria

1. `vibeops init --git --initial-commit` 이 새 폴더에서 Git repo 를 만들고 `main` 브랜치에 초기 커밋을 만든다.
2. `vibeops init --git --no-initial-commit` 후 `vibeops status` 가 `main (unborn, no commits yet)` / `dirty` / first commit hint 를 출력한다.
3. `vibeops init --dry-run` 은 Git 명령을 실행하지 않고 계획만 출력한다.
4. interactive Yes/No 는 `yesNoSelect` helper 를 사용한다. `confirm` prompt / `y/n` 강제 없음.
5. 기존 Git repo 에서 `--git` 은 안전하게 skip 하고 remote 를 건드리지 않는다.
6. 기존 커밋이 있으면 initial commit 은 skip/warn 한다.
7. `status` JSON 에서 unborn/detached 를 구분할 수 있다.

## Files to Inspect First

- `AGENTS.md`
- `docs/project/03-current-state.md`
- `docs/project/00-overview.md`
- `docs/project/01-architecture.md`
- `docs/project/04-decisions.md`
- `src/commands/init.ts`
- `src/status/collector.ts`
- `src/status/format.ts`
- `src/lib/git.ts`
- `src/cli.ts`

## Expected Files to Change

- `src/lib/git.ts`
- `src/commands/init.ts`
- `src/status/format.ts`
- `src/cli.ts`
- `README.md`
- `docs/project/03-current-state.md`
- `docs/logs/2026-05-11.md`
- `docs/tasks/TASK-014-init-git-bootstrap-ux.md`

## Risks

- `git commit` 은 사용자 머신의 Git author 설정이 없으면 실패할 수 있다. 실패 시 명확한 메시지를 출력하고 사용자가 수동 commit 할 수 있어야 한다.
- 새 프로젝트에 기존 파일이 많으면 initial commit 이 예상보다 클 수 있다. commit 전 파일 수를 표시해 인지시킨다.
- `git branch -M main` 은 기존 repo 에서 불필요한 branch rename 을 만들 수 있으므로 새 repo 또는 unborn/no-commit 상태에서만 수행한다.

## Test Plan

- `pnpm typecheck`
- `pnpm build`
- `node dist/cli.js init --dry-run`
- 새 임시 폴더:
  - `node dist/cli.js init --git --initial-commit`
  - `git branch --show-current` → `main`
  - `git status --short` → empty
  - `node dist/cli.js status` → branch `main`, status `clean`
- 새 임시 폴더:
  - `node dist/cli.js init --git --no-initial-commit`
  - `node dist/cli.js status` → `main (unborn, no commits yet)`, `dirty`, hint 출력
- 기존 Git repo:
  - `node dist/cli.js init --git --initial-commit`
  - 기존 커밋이 있으면 initial commit skip 또는 안전 안내

## Rollback Plan

- 코드 변경은 branch discard 또는 revert.
- 테스트 중 만든 임시 폴더는 삭제.
- 실수로 초기 커밋을 만든 로컬 테스트 repo 는 해당 임시 repo 삭제로 복구.

## Git Context

(작업 중 채워진다)

## Notion Page

(없음)

## Implementation Plan

1. Git helper 확장.
2. `init` 옵션/interactive flow 추가.
3. `status` Git 표시와 JSON 개선.
4. README / current-state / log / TASK 결과 갱신.
5. typecheck/build/임시 폴더 smoke 검증.

## Result

TASK-014 범위 내에서 `vibeops init` 에 선택적 Git bootstrap UX 를 추가했다. 새 프로젝트는 interactive 질문 또는 non-interactive flags 로 `git init`, default branch 설정, initial commit 생성까지 한 번에 처리할 수 있다. 또한 최초 커밋 전 `vibeops status` 가 unborn branch 를 detached 로 오해하지 않도록 Git 상태 모델을 확장했다.

### 변경 요약

- `src/lib/git.ts`
  - `GitInfo.state: "none" | "normal" | "unborn" | "detached"` 추가.
  - `GitInfo.hasCommits` 추가.
  - `isGitRepository`, `hasAnyCommit`, `currentBranchOrUnborn`, `gitInit`, `gitSetDefaultBranch`, `gitAddAll`, `gitCommit` 추가.
  - `readGitInfo` 가 `git symbolic-ref --short HEAD` 와 `git rev-parse --verify HEAD` 를 조합해 normal / unborn / detached 를 구분.
- `src/commands/init.ts`
  - interactive Git setup 추가:
    - Initialize Git repository?
    - Use `main` as default branch?
    - Create initial commit?
    - Initial commit message
  - Yes/No 는 `askYesNo` → `yesNoSelect` 경로만 사용. `confirm` prompt 추가 없음.
  - `--git`, `--no-git`, `--initial-commit`, `--no-initial-commit`, `--default-branch <name>`, `--commit-message <message>` 지원.
  - `--git` 기본 동작은 Git init + initial commit. commit 생략은 `--no-initial-commit`.
  - 이미 Git repo 면 `git init` skip.
  - 이미 커밋이 있으면 default branch 변경과 initial commit skip/warn.
  - initial commit 전에 `git status --porcelain` 기준 포함 파일 수 출력.
  - `--dry-run` 에서는 Git 명령 실행 0건, 계획만 출력.
  - 자동 push / remote 변경 0건.
- `src/status/format.ts`
  - unborn branch 출력:

    ```text
    Git
      branch  main (unborn, no commits yet)
      status  dirty
      hint    create the first commit or run `vibeops init --git --initial-commit`
    ```

  - detached HEAD 와 unborn branch 를 분리 표시.
- `src/cli.ts`
  - `init` 옵션 추가: `--git`, `--no-git`, `--initial-commit`, `--no-initial-commit`, `--default-branch <name>`, `--commit-message <message>`.
- `scripts/smoke.mjs`
  - `init --dry-run --git --initial-commit` smoke 추가.
- `README.md`
  - Quick Start 에 interactive Git bootstrap / `vibeops init --git --initial-commit` 안내 추가.
  - Full Command Flow 의 `init` 옵션 갱신.
  - `Init Git Bootstrap` 섹션 추가.
- `docs/project/03-current-state.md`, `docs/logs/2026-05-11.md`
  - TASK-014 구현 상태/검증 결과 반영.

### 변경 파일

- `src/lib/git.ts`
- `src/commands/init.ts`
- `src/status/format.ts`
- `src/cli.ts`
- `scripts/smoke.mjs`
- `README.md`
- `docs/project/03-current-state.md`
- `docs/logs/2026-05-11.md`
- `docs/tasks/TASK-014-init-git-bootstrap-ux.md`

## Test Result

### 정적 / 빌드

- `pnpm typecheck` ✅ exit 0.
- `pnpm build` ✅ exit 0.
- `node dist/cli.js init --help` ✅ `--git`, `--no-git`, `--initial-commit`, `--no-initial-commit`, `--default-branch`, `--commit-message` 노출.

### CLI smoke

- `node dist/cli.js init --dry-run` ✅
  - Git 명령 실행 0건.
  - `Git setup: skipped Git initialization` + `vibeops init --git --initial-commit` hint 출력.
- `scripts/smoke.mjs` 에 `init --dry-run --git --initial-commit` 케이스 추가.

### 새 임시 폴더 — initial commit

명령:

```bash
node dist/cli.js init --git --initial-commit --cwd <tmp>
git -C <tmp> branch --show-current
git -C <tmp> status --short
node dist/cli.js status --cwd <tmp>
```

결과:

- `git branch --show-current` → `main` ✅
- `git status --short` → empty ✅
- `vibeops status` → `branch main`, `status clean` ✅
- init 출력에 `initial commit files <n> files will be included` 표시 ✅

### 새 임시 폴더 — no initial commit / unborn

명령:

```bash
node dist/cli.js init --git --no-initial-commit --cwd <tmp>
node dist/cli.js status --cwd <tmp>
```

결과:

- `branch  main (unborn, no commits yet)` ✅
- `status  dirty` ✅
- `hint    create the first commit or run \`vibeops init --git --initial-commit\`` ✅
- `node dist/cli.js status --json --cwd <tmp>` → `git.state = "unborn"`, `git.hasCommits = false`, `git.branch = "main"` ✅

### 기존 Git repo with commits

명령:

```bash
node dist/cli.js init --git --initial-commit --cwd <tmp-existing-repo>
```

결과:

- `skipped git init (already a git repository)` ✅
- `skipped default branch change (repository already has commits)` ✅
- `skipped initial commit (repository already has commits)` ✅

### 남은 위험 요소

- Git author (`user.name` / `user.email`) 미설정 환경에서는 `git commit` 이 실패할 수 있다. VibeOps 는 이 경우 에러와 수동 commit 힌트를 출력한다.
- initial commit 포함 파일 수는 `.gitignore` 적용 후 `git status --porcelain` 기준이다.
- TASK-014는 `Review` 상태다. 실제 사용자 머신에서 interactive prompt 4개를 한 번 수동 검증한 뒤 finalize 권장.

## Review Notes

- Reviewer 는 `--dry-run` 에서 Git mutation 0건, 기존 repo 에서 remote 변경 0건, initial commit skip 조건을 확인한다.
