# TASK-014 · Init Git bootstrap UX

## Status

Review

## MVP Phase

Follow-on (post-MVP 4)

## Goal

Let `vibeops init` optionally handle Git initialisation and the first commit. Also make `vibeops status` represent the pre-first-commit Git state as an unborn branch instead of mistaking it for "detached".

## Background

On a new project, users currently have to run `git init`, `git branch -M main`, `git add .`, `git commit ...` themselves after `vibeops init`. Before the first commit, `HEAD` does not exist and the previous `vibeops status` displayed the branch as `(detached?)`, which is confusing.

## Scope

- Add interactive Git setup to `vibeops init`:
  - Initialize Git repository? (default Yes).
  - Use `main` as default branch? (default Yes).
  - Create initial commit? (default Yes).
  - Initial commit message (default `chore: initialize vibeops project`).
- Add `vibeops init` options:
  - `--git`
  - `--no-git`
  - `--initial-commit`
  - `--no-initial-commit`
  - `--default-branch <name>` (default `main`).
  - `--commit-message <message>` (default `chore: initialize vibeops project`).
- Git safety rules:
  - Skip `git init` when already a Git repo.
  - Skip / warn the initial commit when commits already exist.
  - Show the file count to be included before the initial commit.
  - Zero Git commands under `--dry-run`.
  - Zero auto-push.
  - Zero changes to existing remotes.
- Extend `src/lib/git.ts` helpers:
  - `isGitRepository(cwd)`
  - `hasAnyCommit(cwd)`
  - `currentBranchOrUnborn(cwd)`
  - `gitInit(cwd)`
  - `gitSetDefaultBranch(cwd, branch)`
  - `gitAddAll(cwd)`
  - `gitCommit(cwd, message)`
- Improve `vibeops status` Git display:
  - When `git symbolic-ref --short HEAD` reads a branch, show the branch name.
  - When `git rev-parse --verify HEAD` fails, classify as `unborn`.
  - Distinguish detached from unborn.

## Out of Scope

- Creating / modifying / pushing remotes.
- GitHub integration changes (`vibeops github` is TASK-013's scope).
- Git commit author configuration.
- Rewriting existing repo history.
- Options to bypass Git hooks.

## Acceptance Criteria

1. `vibeops init --git --initial-commit` creates a Git repo on a fresh folder and makes an initial commit on the `main` branch.
2. After `vibeops init --git --no-initial-commit`, `vibeops status` prints `main (unborn, no commits yet)` / `dirty` / a first-commit hint.
3. `vibeops init --dry-run` prints the plan only and does not run Git commands.
4. Interactive Yes/No uses the `yesNoSelect` helper. No `confirm` prompts / no forced `y/n` typing.
5. In an existing Git repo, `--git` skips safely and does not touch remotes.
6. When commits already exist, the initial commit is skipped/warned.
7. The `status` JSON distinguishes unborn from detached.

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
- `docs/tasks/TASK-014-init-git-bootstrap-ux.md`

## Risks

- `git commit` can fail when the user's machine has no Git author set. On failure, print a clear message and let the user commit manually.
- A new project with many existing files can produce an oversized initial commit. Show the file count to be included before committing.
- `git branch -M main` can rename a branch unnecessarily in an existing repo — perform it only on a new repo or an unborn/no-commit state.

## Test Plan

- `pnpm typecheck`
- `pnpm build`
- `node dist/cli.js init --dry-run`
- New temp folder:
  - `node dist/cli.js init --git --initial-commit`.
  - `git branch --show-current` → `main`.
  - `git status --short` → empty.
  - `node dist/cli.js status` → branch `main`, status `clean`.
- New temp folder:
  - `node dist/cli.js init --git --no-initial-commit`.
  - `node dist/cli.js status` → `main (unborn, no commits yet)`, `dirty`, hint shown.
- Existing Git repo:
  - `node dist/cli.js init --git --initial-commit`.
  - When commits exist, initial commit is skipped or safely guided.

## Rollback Plan

- Code reverted by discarding the branch or `git revert`.
- Delete temp folders made during testing.
- An accidental initial commit on a local test repo can be undone by removing the temp repo.

## Git Context

(populated during the run)

## Notion Page

(none)

## Implementation Plan

1. Extend Git helpers.
2. Add `init` options / interactive flow.
3. Improve `status` Git display and JSON.
4. Update README / current-state / log / TASK result.
5. typecheck/build/smoke on a temp folder.

## Result

Within the TASK-014 scope, an optional Git bootstrap UX was added to `vibeops init`. A new project can now go through `git init`, default-branch setup, and the initial commit in one go via interactive questions or non-interactive flags. The Git-state model was also extended so that, before the first commit, `vibeops status` no longer mistakes an unborn branch for "detached".

### Summary of changes

- `src/lib/git.ts`
  - Added `GitInfo.state: "none" | "normal" | "unborn" | "detached"`.
  - Added `GitInfo.hasCommits`.
  - Added `isGitRepository`, `hasAnyCommit`, `currentBranchOrUnborn`, `gitInit`, `gitSetDefaultBranch`, `gitAddAll`, `gitCommit`.
  - `readGitInfo` combines `git symbolic-ref --short HEAD` and `git rev-parse --verify HEAD` to distinguish normal / unborn / detached.
- `src/commands/init.ts`
  - Adds interactive Git setup:
    - Initialize Git repository?
    - Use `main` as default branch?
    - Create initial commit?
    - Initial commit message.
  - Yes/No uses only the `askYesNo` → `yesNoSelect` path. No new `confirm` prompts.
  - Supports `--git`, `--no-git`, `--initial-commit`, `--no-initial-commit`, `--default-branch <name>`, `--commit-message <message>`.
  - `--git` defaults to Git init + initial commit. To skip the commit, use `--no-initial-commit`.
  - Skips `git init` in an existing Git repo.
  - Skips / warns the default-branch change and initial commit when commits already exist.
  - Before the initial commit, prints the file count from `git status --porcelain`.
  - Zero Git command executions under `--dry-run`; plan only.
  - Zero auto-push / remote changes.
- `src/status/format.ts`
  - Unborn-branch output:

    ```text
    Git
      branch  main (unborn, no commits yet)
      status  dirty
      hint    create the first commit or run `vibeops init --git --initial-commit`
    ```

  - Displays detached HEAD and unborn branch separately.
- `src/cli.ts`
  - Adds `init` options: `--git`, `--no-git`, `--initial-commit`, `--no-initial-commit`, `--default-branch <name>`, `--commit-message <message>`.
- `scripts/smoke.mjs`
  - Adds the `init --dry-run --git --initial-commit` smoke case.
- `README.md`
  - Quick Start now documents interactive Git bootstrap / `vibeops init --git --initial-commit`.
  - Updates the `init` options in Full Command Flow.
  - Adds the `Init Git Bootstrap` section.
- `docs/project/03-current-state.md`
  - Reflects TASK-014's implementation status / verification.

### Changed files

- `src/lib/git.ts`
- `src/commands/init.ts`
- `src/status/format.ts`
- `src/cli.ts`
- `scripts/smoke.mjs`
- `README.md`
- `docs/project/03-current-state.md`
- `docs/tasks/TASK-014-init-git-bootstrap-ux.md`

## Test Result

### Static / build

- `pnpm typecheck` ✅ exit 0.
- `pnpm build` ✅ exit 0.
- `node dist/cli.js init --help` ✅ exposes `--git`, `--no-git`, `--initial-commit`, `--no-initial-commit`, `--default-branch`, `--commit-message`.

### CLI smoke

- `node dist/cli.js init --dry-run` ✅
  - 0 Git command executions.
  - Prints `Git setup: skipped Git initialization` + the `vibeops init --git --initial-commit` hint.
- Added the `init --dry-run --git --initial-commit` case to `scripts/smoke.mjs`.

### New temp folder — initial commit

Commands:

```bash
node dist/cli.js init --git --initial-commit --cwd <tmp>
git -C <tmp> branch --show-current
git -C <tmp> status --short
node dist/cli.js status --cwd <tmp>
```

Results:

- `git branch --show-current` → `main` ✅
- `git status --short` → empty ✅
- `vibeops status` → `branch main`, `status clean` ✅
- init output shows `initial commit files <n> files will be included` ✅

### New temp folder — no initial commit / unborn

Commands:

```bash
node dist/cli.js init --git --no-initial-commit --cwd <tmp>
node dist/cli.js status --cwd <tmp>
```

Results:

- `branch  main (unborn, no commits yet)` ✅
- `status  dirty` ✅
- `hint    create the first commit or run \`vibeops init --git --initial-commit\`` ✅
- `node dist/cli.js status --json --cwd <tmp>` → `git.state = "unborn"`, `git.hasCommits = false`, `git.branch = "main"` ✅

### Existing Git repo with commits

Command:

```bash
node dist/cli.js init --git --initial-commit --cwd <tmp-existing-repo>
```

Results:

- `skipped git init (already a git repository)` ✅
- `skipped default branch change (repository already has commits)` ✅
- `skipped initial commit (repository already has commits)` ✅

### Remaining risks

- On environments without a Git author (`user.name` / `user.email`), `git commit` can fail. VibeOps prints the error and a manual-commit hint.
- The initial-commit file count is `.gitignore`-applied via `git status --porcelain`.
- TASK-014 is in `Review`. Recommend finalising after one manual pass through all four interactive prompts on a real user machine.

## Review Notes

- The reviewer should confirm: 0 Git mutations under `--dry-run`, 0 remote changes on an existing repo, and the initial-commit skip conditions.
