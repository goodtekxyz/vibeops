# TASK-021 · worktree-safe lifecycle

## Status

In Progress

## Goal

Make `vibeops task add` / `task sync` (and every other lifecycle step) work when the integration branch is checked out in another `git worktree`, and allocate TASK ids that never collide with ids held by other worktrees or unmerged task branches.

## Scope

- Never require checking out the integration branch: `task add` fetches `<remote> <integration>` and creates `task/NNN-slug` with `--no-track` from `<remote>/<integration>` (governance stash kept)
- Fast-forward the local integration ref only where safe (here: `merge --ff-only`; unowned: guarded `update-ref`; owned by another worktree: leave + log); never force
- `task sync`: fetch → verify merge → leave the task branch (switch to integration, or `switch --detach <remote>/<integration>` when owned elsewhere) → fast-forward where safe → delete local + remote task branch
- Audit: `task del`, `task ship --new-cycle` branch recreate, `vibeops pull` follow the same rule; `task merge` / `task release` do not check out branches
- Collision-free ids: 1 + max over local / integration-tree / every-worktree `docs/tasks` and local / remote-tracking / `ls-remote` `task/NNN-*` branches; unlistable remote → refuse
- Tests with real temp repos (bare remote + 2 worktrees); README, CHANGELOG, D-006, version 3.1.0

## Out of Scope

- `init` branch setup (bootstraps a fresh repo; not a parallel-worktree flow)
- Reserving ids on the remote (push-based locking)
- npm publish

## Acceptance Criteria

1. `task add` succeeds while `develop` is checked out in another worktree; the task branch starts at the fetched `origin/develop` tip and has no upstream
2. The other worktree is untouched (branch, HEAD, clean status); the log says its `develop` was left unchanged
3. `task sync` in that situation succeeds: worktree detached at `origin/develop`, task branch deleted locally and on the remote, other worktree untouched
4. `task sync` verifies the merge before moving HEAD; an unmerged task leaves HEAD on the task branch
5. A local `develop` checked out nowhere is fast-forwarded by guarded ref update
6. TASK ids skip ids held by remote-only task branches, local-only task branches, other worktrees' uncommitted `docs/tasks`, and `docs/tasks` on `origin/develop`
7. Unreachable remote → `task add` exits 1 and creates no TASK file
8. Single checkout: `task add` fast-forwards `develop` and branches from its tip; `task sync` returns to `develop` (not detached)
9. `vibeops pull` refuses (exit 1, names the worktree) instead of failing inside git
10. `pnpm typecheck`, `pnpm test`, `pnpm smoke` pass

## Test Plan

- `pnpm typecheck`, `pnpm build`
- `pnpm test` (new `tests/worktree-lifecycle.test.mjs`: real bare remote + 2 worktrees, fake failing `gh`/`glab`)
- `pnpm smoke`
- Reproduce the original failure with the installed 3.0.0

## Result

- New `src/lib/git-worktree.ts`: `parseWorktreePorcelain`, `listWorktrees`, `branchCheckedOutElsewhere`, `resolveIntegrationBaseRef`, `fastForwardLocalIntegration`, `leaveTaskBranch`
- New `src/lib/task-id-allocation.ts`: `allocateTaskId`, `taskNumberFromBranch`, `taskNumberFromFilename`, `TaskIdAllocationError`
- `src/lib/git-integration-sync.ts`: `ensureIntegrationSynced` no longer switches branches; returns `baseRef`; missing local integration branch is OK
- `src/lib/task-start.ts`: task branch from `baseRef` with `--no-track`; Git Context base commit = base ref
- `src/commands/task-add.ts`: global id allocation (fail closed on unlistable remote)
- `src/commands/task-sync.ts`: guard first, then `leaveTaskBranch` + safe fast-forward
- `src/lib/task-del.ts`, `src/lib/task-reship.ts`, `src/commands/pull.ts`: same rules
- `src/lib/git.ts`: `gitCheckoutNewBranch(..., { noTrack })`
- Docs: README "Worktrees" / "TASK ids", CHANGELOG 3.1.0, D-006, `05-current-state.md`, daily log

## Test Result

- Before (installed 3.0.0, develop checked out in worktree `a`, `task add` in `b`): `fatal: 'develop' is already used by worktree at '…/a'`
- `pnpm typecheck` OK, `pnpm build` OK
- `pnpm test` — 74 pass, 0 fail (14 in `tests/worktree-lifecycle.test.mjs`)
- `pnpm smoke` OK
