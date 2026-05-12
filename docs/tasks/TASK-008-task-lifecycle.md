# TASK-008 · Task lifecycle — `start / prompt / check / done`

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

Express the **start to completion** of one TASK as commands.

- `vibeops task start TASK-NNN` — record base branch / base commit / task branch and create the task branch.
- `vibeops task prompt TASK-NNN --agent <name>` — print a Cursor paste prompt built from agent + TASK + docs context.
- `vibeops task check TASK-NNN` — compare Acceptance Criteria / Test Plan against the Git state and report pass / miss.
- `vibeops task done TASK-NNN` — verify Status / Result / Test Result of the TASK file + print a merge guide (no auto-merge).

`rollback` is split into [TASK-009](TASK-009-rollback-safety.md) for separation of safety concerns.

## Background

This is the body of VibeOps's "rail". Both humans and AI check and update TASK progress through the same commands. Every command is read-only by default where possible, and state changes are explicit.

## Scope

### State file

`.vibeops/state/tasks/TASK-NNN.json` schema:

```jsonc
{
  "id": "TASK-NNN",
  "slug": "...",
  "baseBranch": "main",
  "baseCommit": "abc1234",
  "taskBranch": "task/TASK-NNN-slug",
  "startedAt": "2026-05-11T...",
  "doneAt": null
}
```

### Per-command behaviour

- `start`
  - Verify the current Git state is clean (refuse if dirty; `--allow-dirty` bypasses).
  - Record `baseBranch` / `baseCommit`; create / check out `task/TASK-NNN-<slug>`.
  - Update the TASK file's frontmatter `Status` to `in_progress` (if present).
  - `--dry-run`: print only the "plan" of the actions above.
- `prompt`
  - In addition to the output of `vibeops agent prompt <name>`, bundle the full TASK file + `docs/project/03-current-state.md` + relevant items from `04-decisions.md` as context.
- `check`
  - Extract Acceptance Criteria and Test Plan items from the TASK file.
  - Report current branch / change count / last commit message / match against "Expected Files to Change".
  - Show missing items as a checklist (no automatic pass judgement).
- `done`
  - Verify TASK file `Status` is `done` and `Result` / `Test Result` bodies are non-empty.
  - Record `doneAt` in `.vibeops/state/tasks/TASK-NNN.json`.
  - Print a "merge guide" (e.g. `git switch main && git merge task/...`) plus a `git log baseCommit..HEAD` summary.
  - **Never auto-merges or pushes.**

### Options

- All commands: `--cwd`, `--json` (machine-readable).
- `start --allow-dirty`, `start --dry-run`.
- `prompt --context <path>...`.
- `check --strict` (exit code ≠ 0 when items are missing).
- `done --dry-run`.

## Out of Scope

- Destructive rollback (→ TASK-009).
- Notion-side status change (→ TASK-011).
- Running multiple TASKs in parallel.

## Acceptance Criteria

1. `vibeops task start TASK-001` creates `task/TASK-001-cli-bootstrap` and writes the state file in a clean repo. Dirty repos are refused.
2. `vibeops task prompt TASK-001 --agent builder` prints a single markdown blob combining "agent definition + TASK body + project context".
3. `vibeops task check TASK-001` displays Acceptance Criteria / Test Plan items as a checklist and shows how well the current changes match "Expected Files to Change" (% or match table).
4. `vibeops task done TASK-001` verifies Status / Result / Test Result of the TASK file. If empty, it prints "fill Result/Test Result first" and exits 1.
5. On a successful `done`, the state file records `doneAt` and the merge guide is printed, but **0 auto-merge / push**.
6. All commands have `--dry-run` (or read-only nature), and that mode produces zero file / Git changes.

## Files to Inspect First

- `src/agent/*` (TASK-005).
- `src/tasks/scanner.ts`, `src/tasks/schema.ts` (TASK-004).
- `src/config/projectConfig.ts`.

## Expected Files to Change

- new: `src/commands/task/{start,prompt,check,done}.ts`.
- new: `src/lifecycle/state.ts` (state file read / write).
- new: `src/lifecycle/git.ts` (branch / commit / dirty checks).
- new: `src/lifecycle/check.ts` (Acceptance Criteria vs Git).
- new: `tests/lifecycle.test.ts` (fake Git repo or stubs).
- update: `src/commands/agent.ts` (share the `prompt` builder).
- update: this TASK's Result / Test Result, `docs/project/03-current-state.md`, `docs/logs/YYYY-MM-DD.md`.

## Risks

- Running real `git` in tests is environment-dependent → use `simple-git` + create a small repo in a tmpdir. Assume `git` exists in CI.
- Updating TASK frontmatter from a command may damage the user's notes → use `gray-matter` and update only the frontmatter region.

## Test Plan

- vitest: build a small git repo + a fake `docs/tasks/TASK-001-*.md` fixture in a tmpdir and assert:
  - `start` succeeds on clean, fails on dirty.
  - `prompt` output contains agent · TASK · project context.
  - `check` output is a checklist.
  - `done` fails on empty Result, succeeds after filling.
- Manual: smoke `vibeops task start TASK-001 --dry-run` etc. on this repo.

## Rollback Plan

- Code changes revert by discarding the working branch.
- User side: if a created task branch is unwanted, handle it with `git switch <base> && git branch -D task/...` (or TASK-009's `task rollback`).

## Implementation Plan

1. `lifecycle/state.ts` for state file read / write.
2. `lifecycle/git.ts` for branch / dirty / log / show.
3. `lifecycle/check.ts` to extract Acceptance Criteria / Test Plan and match against the Git state.
4. Implement `commands/task/start.ts` ~ `done.ts`.
5. Reuse the `agent/prompt.ts` builder for `prompt` output.
6. Tests + doc updates.

## Result

Completed 2026-05-11 (awaiting review). Implemented the 4 commands of MVP 3 Git Task Lifecycle (`task start / prompt / check / done`). The user's updated requirements — Status flow is **Planned → In Progress → Review → Done**, Git state is recorded inline in the TASK markdown's **`## Git Context`** section instead of a separate JSON, and `task done` transitions to `Review` by default rather than `Done` — are honoured.

### Added / extended files

- new: `src/lib/task-prompt.ts` — helper `buildTaskPromptString` that builds a single Cursor paste-prompt markdown from agent definition + TASK + project context. Shared by `task start` and `task check`.
- extended: `src/types/task.ts` — added `"review"` to `TaskStatus`, added `TaskCounts.review`, and added the `GitContext` interface.
- extended: `src/lib/task.ts` — `findTaskFile`, `parseTaskFilename` / `branchNameForTaskFile`, section helpers (`readSection` / `hasNonEmptySection` / `findExpectedFiles` / `findAcceptanceCriteria`), inline-update helpers (`updateInlineStatus` / `upsertGitContext` / `readGitContext`). Status display goes through `statusDisplay`.
- extended: `src/lib/git.ts` — `runGit`, `gitHeadCommit`, `gitBranchExists`, `gitCreateBranch`, `gitCheckout`, `gitCheckoutNewBranch`, `gitDeleteBranch`, `gitResetHard`, `gitDiffNameOnly`, `gitLogOneline`, `gitCommitsAhead`, `detectDefaultBranch`. The existing `readGitInfo` is preserved. **2026-05-11 follow-up patch**: added `gitStatusPorcelain` + a porcelain parser (`?? / R  old -> new` aware) + 6 read-only helpers (`gitWorkingTreeChangedFiles`, `gitStagedChangedFiles`, `gitUntrackedFiles`, `gitCommittedChangedFilesSince`, `gitAllChangedFilesSinceTaskStart` returning `ChangedFilesSummary`). The aggregation helpers deduplicate via `Set`.
- new: `src/commands/task-start.ts` — clean check (`--allow-dirty` bypass) → record base branch / HEAD → create `task/<slug>` branch + check out → update the TASK markdown's `## Status` / `## Git Context` → print the builder-agent prompt. `--dry-run` produces zero file / Git changes.
- new: `src/commands/task-check.ts` — read-only. Reports current branch / dirty / Git Context / Expected Files vs actual change matching % / Acceptance Criteria checklist / existence check for `docs/project/0[35]-current-state.md` and today's `docs/logs/YYYY-MM-DD.md` / placeholder check on Result · Test Result + a reviewer-agent prompt. `--strict` exits 1 when any item is missing.
  - **2026-05-11 follow-up patch**: fixed a bug where change detection only inspected the `baseCommit..HEAD` commit diff. Now sums working tree (unstaged + staged + untracked) ∪ committed via Set-dedup and reports `working tree changed files / committed changed files / total changed files` in three lines. `Expected Files to Change` matching uses the `total` (merged) basis. `git status --porcelain` is parsed directly to catch renames (`R  old -> new` → `new`) and untracked (`??`).
- new: `src/commands/task-done.ts` — Result / Test Result placeholder check (exits 1 on `Failed`) → default `Status → Review` (`--finalize` for `Done`) → recommend commit message + print merge guide → suggest next-TASK candidates + print the Notion-sync TODO. Zero automatic git commit / merge / push.
- new: `src/commands/task-rollback.ts` (real implementation; see TASK-009 for details).
- update: `src/cli.ts` — exposes all start / check / done / rollback options (`--dry-run`, `--allow-dirty`, `--agent`, `--strict`, `--finalize`, `--confirm`, `--confirm-destructive`, `--strategy`, `--keep-branch`, `--cwd`).
- update: `src/status/format.ts` — `vibeops status` Tasks line now also shows the `review` count.

### User requirement vs the original TASK-008 doc

- Original doc: store baseBranch / baseCommit / taskBranch in `.vibeops/state/tasks/TASK-NNN.json`.
  Actual implementation: store the same information inline in the **TASK markdown's `## Git Context` section** (per user update). No state JSON is created.
- Original doc: if Status is `done` and Result / Test Result are non-empty, record `doneAt`.
  Actual implementation: Status flow is `Planned → In Progress → Review → Done` (per user update). `task done` defaults to `Review`; a human reviews and then sends it to `Done` with `--finalize`. The `doneAt` field exists in the `GitContext` type but is not auto-recorded in this TASK (kept for future Notion sync).
- Original doc: Acceptance Criteria matching is "% or match table".
  Actual implementation: `Expected Files to Change` ↔ `git diff --name-only baseCommit..HEAD` is shown as both a table and a %. AC items themselves are listed as a checklist without an automatic pass judgement (the human decides).

### Safeguards (user-emphasised)

- `task start`: refuses on dirty (`--allow-dirty` bypass). Refuses if a task branch already exists.
- `task done`: exits 1 when Result / Test Result are placeholders; zero file / Git changes. No auto-commit. No Notion calls.
- `task check`: read-only. Zero file / Git changes under any option.
- `task start`, `task done`, and `task rollback` all support `--dry-run` or are read-only by nature.

## Test Result

- `pnpm typecheck` → tsc --noEmit, zero errors, exit 0.
- `pnpm build` → 38 artifacts including `dist/cli.js` / `dist/commands/task-*.js` / `dist/lib/task.js`, exit 0.
- `pnpm exec tsx src/cli.ts task --help` → start / prompt / check / done / rollback all listed with options.
- Real-git sandbox (`/var/folders/.../vibeops-mvp3-XXXX/`) — after `vibeops init` and a TASK-001 fixture, verified the following sequence:
  1. `task start TASK-001 --dry-run` → no branch created, Status remains `done` (file unchanged), only the plan is printed.
  2. `task start TASK-001` → checks out `task/001-cli-bootstrap`, sets Status `In Progress`, populates the `## Git Context` section correctly (`Base Branch: main`, `Base Commit: c217fbd`, `Task Branch: task/001-cli-bootstrap`, `Started At: 2026-05-11T01:27:56.869Z`), prints the builder-agent prompt to stdout.
  3. `task prompt TASK-001 --agent builder` / `--agent reviewer` → prints a single markdown blob combining the agent definition + TASK body.
  4. `task check TASK-001` → prints branch / dirty / Git Context / commits ahead / changed files / Expected Files match (0 of 5) / 5 AC checklist / 5 docs checks / Result · Test Result `✓` / reviewer-agent prompt. exit 0.
  5. `task done TASK-001 --dry-run` → no Status change, only a "would perform" notice.
  6. `task done TASK-001` → Status transitions to `Review`, prints recommended commit (`feat(task-001): CLI bootstrap`) + merge guide + next-TASK candidate (TASK-000) + Notion TODO.
  7. `task done TASK-001 --finalize` → Status `Done`.
  8. Placeholder-only-Result `TASK-099-fake.md` with `task done TASK-099` → "2 required section(s) still empty" + exit 1.
- Live-repo read-only check: `node dist/cli.js task check TASK-008 --cwd /Users/hjhamm/goodtek/vibeops` → Status `Planned`, missing-Git-Context notice, 6 AC checklist items, Result / Test Result placeholders detected, 3 missing-item notices, reviewer-agent-not-installed notice. Zero file / Git changes.
- **2026-05-11 follow-up patch verification** — changed-files detection bug fix:
  - In the live repo (`git status --porcelain` shows 13 modified + 17 untracked = 30 changed files, 0 staged, 0 committed-since-base), `node dist/cli.js task check TASK-008 --cwd /Users/hjhamm/goodtek/vibeops`:
    - `working tree changed files 30`, `committed changed files 0`, `total changed files 30`.
    - In "Expected Files to Change vs current diff", `docs/project/03-current-state.md` matches `✓` (previously 0% because it was unstaged).
    - Prints `basis: working tree(30) ∪ committed(0) = total(30) files` to make the merge basis explicit.
    - Before / after `git status --porcelain | wc -l` are both 30 — read-only guarantee.
  - In a clean sandbox, created all categories simultaneously (committed `committed-file.ts` 1 + unstaged `docs/tasks/TASK-001-cli-bootstrap.md` + staged add `staged-file.ts` + staged rename `committed-file.ts -> renamed-file.ts` + untracked `untracked-file.ts`) and ran `task check TASK-001`:
    - Output: `working tree changed files 4 / committed changed files 2 / total changed files 5`.
    - 5 = working set {`docs/...md`, `renamed-file.ts`, `staged-file.ts`, `untracked-file.ts`} ∪ committed set {`docs/...md`, `committed-file.ts`} = 5 unique paths (Set-dedup removes one duplicate `docs/...md`).
    - Renames are captured at the new path (`renamed-file.ts`); untracked (`untracked-file.ts`) is also summed.
- This round: zero automatic commit / push / Notion calls (principle honoured).
- Deferred: vitest auto-regressions (the cumulative deferred item since TASK-001; TASK-012 polish round or a separate TASK).
