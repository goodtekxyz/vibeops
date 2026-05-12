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

Implement `vibeops task rollback TASK-NNN`. The default behaviour is **guidance only** (which branch / commit could be rolled back, how). Actual destructive Git operations (branch delete, reset, revert) run only with `--confirm`.

## Background

"Rollback feasibility" is one of VibeOps's values. Because `baseCommit` / `baseBranch` / `taskBranch` are recorded at TASK start, that information can present a clean rollback procedure. But running destructive operations automatically could wipe unpushed changes, so **the default must be guidance**, behind an explicit confirm gate.

## Scope

- `src/commands/task/rollback.ts`.
- `src/rollback/planner.ts` — produce a list of "rollback options" from the state file + current Git state.
- `src/rollback/executor.ts` — only call git with `--confirm`.
- Options:
  - `--confirm` — allow destructive work (guidance only otherwise).
  - `--strategy <branch-delete | reset-base | revert-merge>` — pick which strategy.
  - `--keep-branch` — do not delete the branch.
  - `--dry-run` — even with `--confirm`, do not execute; only print the "actual commands".

## Out of Scope

- Remote rollback after a merged change was pushed — `revert-merge` only prints guidance; no force-push.
- Notion-side recovery (→ humans look at it during TASK-011 sync).

## Acceptance Criteria

1. `vibeops task rollback TASK-001` (no args) **without changing any file / Git state** prints:
   - Current branch / dirty status.
   - `baseBranch` / `baseCommit` / `taskBranch` read from the state file.
   - The 3 strategies and their risks:
     - `branch-delete`: discard the task branch (any unmerged change is lost).
     - `reset-base`: hard-reset the current branch to `baseCommit` (current changes are lost).
     - `revert-merge`: revert a merged commit (when already merged).
2. With `--confirm --strategy branch-delete`, the task branch is actually deleted. Refused if dirty or it is the current branch.
3. With `--confirm --dry-run`, do not execute; only print the "would run" commands.
4. Without `--confirm`, any option combination yields zero file / Git changes.
5. Force-push never happens under any option combination (regardless of remote presence).

## Files to Inspect First

- `src/lifecycle/state.ts` (TASK-008).
- `src/lifecycle/git.ts` (TASK-008).
- This repo's `docs/project/04-decisions.md` § D-007.

## Expected Files to Change

- new: `src/commands/task/rollback.ts`, `src/rollback/planner.ts`, `src/rollback/executor.ts`.
- new: `tests/rollback.test.ts`.
- update: this TASK's Result / Test Result, `docs/project/03-current-state.md`, `docs/logs/YYYY-MM-DD.md`.

## Risks

- Risk of the user toggling `--confirm` carelessly → print "This will run the following git commands:" to stdout and list all the commands; optionally wait 5 seconds for confirmation (MVP only lists the commands).
- If `branch-delete` targets the currently checked-out branch, git refuses. Show "switch with `git switch <baseBranch>` first, then retry".

## Test Plan

- vitest in a tmpdir + small git repo:
  - `rollback` (no args) → stdout contains the 3 strategies and risks; zero file / Git changes.
  - `--confirm --strategy branch-delete` → succeed when not on the task branch.
  - `--confirm --strategy reset-base` → current branch reset to base.
  - `--confirm --dry-run` → zero changes.
  - Dirty + `--confirm --strategy reset-base` → refuse + guide.
- Manual: confirm the guidance output of `vibeops task rollback TASK-001` against this repo.

## Rollback Plan

- This command itself is "rollback"; its safeguards (D-007) are what this TASK guarantees.
- Code itself can be reverted by discarding the working branch.

## Implementation Plan

1. In `rollback/planner.ts`, generate the strategy list from state + git state.
2. In `rollback/executor.ts`, define the git commands per strategy. Do not call them without the option.
3. Wire options in `commands/task/rollback.ts`.
4. Tests + doc updates.

## Result

Completed 2026-05-11 (awaiting review). Implemented `vibeops task rollback <taskId>` with its safeguards. Built in the same round as TASK-008 (branch `task/008-task-lifecycle`).

### User requirement vs the original TASK-009 doc

- Original doc: destructive gate is one stage of `--confirm`.
  Actual implementation: per user update, split into a **two-stage confirm**:
  - Default (no option) → zero file / Git changes. Prints current branch / dirty / `## Git Context` (read from the TASK markdown) and the 3 strategies (`branch-delete` / `reset-base` / `revert-merge`) with their risks and commands. Guidance only.
  - `--confirm` → allows **non-destructive** rollback. Default strategy is `branch-delete`. `git switch <baseBranch>` then `git branch -D <taskBranch>`. Refuses on dirty; if on the task branch, switches to base first.
  - `--confirm-destructive` → allows **destructive** rollback. The `reset-base` strategy runs `git reset --hard <baseCommit>`. Proceeds even on dirty (the user has accepted the risk). `--confirm` alone refuses `reset-base`.
  - `--strategy revert-merge` → never executes automatically; only prints the command (the human finds the merge SHA and runs `git revert -m 1 <sha>`).
- Original doc: load state from `.vibeops/state/tasks/TASK-NNN.json`.
  Actual implementation: loaded from the TASK markdown's `## Git Context` section (same inline policy as TASK-008).
- Original doc: separate `src/rollback/planner.ts` + `src/rollback/executor.ts`.
  Actual implementation: small surface area, so consolidated into one file `src/commands/task-rollback.ts` with `strategyCommands` / `strategyRisk` helpers. `gitDeleteBranch` / `gitResetHard` were added to `src/lib/git.ts` (shared with TASK-008 git helpers).

### Safeguards (user-emphasised)

- Default execution is **guidance only**. With no option, zero file / Git changes.
- `--confirm` alone refuses `reset --hard` → `--confirm-destructive` is explicitly required.
- `--confirm` + dirty + `branch-delete` → refused on dirty (asks the user to commit / stash first). Only `--confirm-destructive` may pass on dirty.
- `--dry-run` combined with `--confirm` / `--confirm-destructive` yields zero git commands. Only the "would run" commands are printed.
- `--keep-branch` → in the `branch-delete` strategy, only switches to base and keeps the task branch.
- `revert-merge` is not subject to auto-execution. The user must find the merge SHA.
- **Force-push never happens under any option combination.** `git push` itself is never called.

## Test Result

- Real-git sandbox sequence (in the same sandbox as TASK-008):
  1. `task rollback TASK-001` (no option) → guidance only; zero changes to the `task/001-cli-bootstrap` branch / files. Git Context parsed correctly from the TASK markdown.
  2. `task rollback TASK-001 --confirm --strategy reset-base` → `✗ reset-base is destructive. --confirm alone cannot run it. --confirm-destructive is required.` + exit 1, zero git changes.
  3. Dirty + `task rollback TASK-001 --confirm --strategy branch-delete --dry-run` → `Working tree is dirty. Commit / stash first, or rerun with --confirm-destructive` + exit 1, zero git changes.
  4. Clean + `task rollback TASK-001 --confirm --strategy branch-delete --dry-run` → prints `dry-run — would run for strategy=branch-delete: git switch main / git branch -D task/001-cli-bootstrap`, branch unchanged.
  5. Clean + `task rollback TASK-001 --confirm --strategy branch-delete` → switches from the current branch `task/001-cli-bootstrap` to base (`main`) and deletes it via `-D`. The branch list no longer shows it. ✓.
  6. With a new TASK-002 similarly `task start`-ed and a random commit (`experiment.txt`) added → `task rollback TASK-002 --confirm-destructive --strategy reset-base` → the branch is hard-reset to the base commit; `experiment.txt` is gone; log restores to the base point. exit 0.
- No `git push` call occurs in any case (source-search confirms: `git.ts` has no `push` command).
- Deferred: vitest auto-regressions (moved to the polish round alongside TASK-008).
