# TASK-021 · worktree-safe lifecycle

## Status

In Progress

## Goal

Make `vibeops task add` / `task sync` (and every other lifecycle step) work when the integration branch is checked out in another `git worktree`, and allocate TASK ids that never collide with ids held by other worktrees or unmerged task branches.

## Scope

- Never require checking out the integration branch: `task add` fetches `<remote> <integration>` and creates `task/NNN-slug` with `--no-track` from `<remote>/<integration>`
- Local integration ref: `merge --ff-only` where checked out here, else `git fetch . refs/remotes/<remote>/<b>:refs/heads/<b>` (git refuses non-ff / checked-out-elsewhere → reported as left for the owning worktree); never forced
- `task sync`: fetch → verify merge → leave the task branch (switch, or detach at `<remote>/<integration>` when owned elsewhere) → safe fast-forward → delete local + remote task branch
- `task del`, `task ship --new-cycle` branch recreate, `vibeops pull` follow the same rule; `task merge` / `task release` do not check out branches
- Repository lock `<git-common-dir>/vibeops-task.lock` (atomic create via temp file + `link`, pid/host/start/operation/cwd; stale: dead pid on this host or older than `lock.staleSeconds`; takeover and release under a breaker with inode + token re-check; wait `lock.waitSeconds`) around id allocation → TASK file → branch creation and every branch-switching / stashing command
- `LC_ALL=C` / `LANG=C` for all git commands; local filesystem required for the git common dir
- Stash by SHA (`stash create` / `store` / `apply <sha>` / drop that entry); untracked governance files not stashed
- Collision-free ids: 1 + max over local / integration-tree / every-worktree `docs/tasks` and generated-form task branches (local + fetched remote) that contain their TASK file; unreachable remote → refuse; `task ship` re-checks `ls-remote` for a same-number branch right before pushing
- Full SHA for Git Context `baseCommit`
- Tests with real temp repos (bare remote + 2–3 worktrees, concurrent processes); README, CHANGELOG, D-006, version 3.1.0

## Out of Scope

- `init` branch setup (bootstraps a fresh repo; not a parallel-worktree flow)
- Reserving ids on the remote (push-based locking); the ship-time remote check is the cross-machine guard
- npm publish

## Acceptance Criteria

1. `task add` succeeds while `develop` is checked out in another worktree; the task branch starts at the fetched `origin/develop` tip and has no upstream
2. The other worktree is untouched (branch, HEAD, clean status); the log says its `develop` was left unchanged
3. `task sync` in that situation succeeds: worktree detached at `origin/develop`, task branch deleted locally and on the remote, other worktree untouched
4. `task sync` verifies the merge before moving HEAD; an unmerged task leaves HEAD on the task branch
5. Local integration updates: owned elsewhere → left; non-ff (stale value) → left, never forced; unowned and behind → fast-forwarded
6. Two concurrent `task add` processes in two worktrees get distinct ids; a live lock holder gives a clear error and no TASK file; a dead-pid lock on this host is removed; 8 concurrent processes taking over one stale lock never overlap (max simultaneous holders = 1)
7. Governance stash restores this worktree's changes by SHA and leaves another worktree's stash entry alone; untracked files are not stashed
8. TASK ids skip ids held by remote-only and local-only task branches (with their TASK file), other worktrees' uncommitted `docs/tasks`, and `docs/tasks` on `origin/develop`; `task/2026-q4-plan` and generated-form branches without their TASK file are ignored
9. Unreachable remote → `task add` exits 1 and creates no TASK file; `task ship` refuses to push when the remote has a different branch with the same TASK number
10. `task del` and `task ship --new-cycle --recreate-branch` work while `develop` is checked out elsewhere
11. Git Context `baseCommit` is a full SHA
12. Single checkout: `task add` fast-forwards `develop` and branches from its tip; `task sync` returns to `develop`; `vibeops pull` refuses (exit 1, names the worktree) when `develop` is owned elsewhere
13. `pnpm typecheck`, `pnpm test`, `pnpm smoke` pass

## Test Plan

- `pnpm typecheck`, `pnpm build`
- `pnpm test` (`tests/worktree-lifecycle.test.mjs`: real bare remote + worktrees, concurrent processes, fake `gh`/`glab`)
- `pnpm smoke`
- Reproduce the original failure with the installed 3.0.0; rerun the reviewer's race script

## Result

- New `src/lib/git-worktree.ts`: `parseWorktreePorcelain`, `listWorktrees`, `branchCheckedOutElsewhere`, `resolveIntegrationBaseRef`, `fastForwardLocalIntegration` (`merge --ff-only` / `fetch .` refspec), `leaveTaskBranch`
- New `src/lib/task-lock.ts`: `acquireTaskLock` (atomic link-create, breaker-guarded removal with inode + token check), `withTaskLock`, `runUnderTaskLock`, `staleReason`, `parseTaskLockConfig` (`lock.waitSeconds` 60, `lock.staleSeconds` 600)
- `src/lib/git.ts`: `gitEnv()` — `LC_ALL=C` / `LANG=C` for every git call
- New `src/lib/task-id-allocation.ts`: `allocateTaskId` (generated form + TASK-file evidence), `GENERATED_TASK_BRANCH_RE`, `assertTaskIdFreeOnRemote`
- `src/lib/git.ts`: stash by SHA (`stashGovernanceIfBlocking` returns the SHA; `restoreGovernanceStashAfterSwitch` applies it and drops exactly that entry); `gitCheckoutNewBranch(..., { noTrack })`
- `src/lib/git-integration-sync.ts`: no branch switch; returns `baseRef`
- `src/lib/task-start.ts`, `src/lib/task-reship.ts`: branch from `baseRef`, full-SHA `baseCommit`
- `src/commands/task-add.ts`: locked preflight; unlocked prompt / draft with provisional id; locked allocate → file → branch
- `src/commands/task-sync.ts`, `task-del.ts`, `pull.ts`, `src/lib/task-new-cycle.ts`: lock + worktree-safe branch handling
- `src/lib/task-push-pr.ts`, `src/commands/task-ship.ts`: remote same-id check before push
- Docs: README "Worktrees" / "Repository lock" / "TASK ids", CHANGELOG 3.1.0, D-006, `05-current-state.md`, daily log

## Test Result

- Before (installed 3.0.0, develop checked out in worktree `a`, `task add` in `b`): `fatal: 'develop' is already used by worktree at '…/a'`
- Reviewer race script (two concurrent `task add`, remote `task/2026-q4-plan`): now `TASK-002` and `TASK-003`, both exit 0, the second waited for the lock
- `pnpm typecheck` OK, `pnpm build` OK
- Reviewer lock script (`lock.mjs`): dead pid / pid reuse (old) / other host old / no-token dead pid → acquired; other host future timestamp and fresh empty file → respected; 8 in-process contenders → max simultaneous holders 1 (was 2)
- `pnpm test` ×3 — 88 pass, 0 fail each run (28 in `tests/worktree-lifecycle.test.mjs`, incl. 8-process stale takeover with O_EXCL holder marker: 0 violations)
- `pnpm smoke` OK
