# Workflow · Rollback

The standard "this TASK went wrong, let's undo it" flow.

## 1. Diagnose first

```bash
vibeops task rollback TASK-NNN
```

The default is **guidance only**. It shows:

- Current branch / dirty state.
- Base branch / base commit / task branch as read from `.vibeops/state/tasks/TASK-NNN.json`.
- Three possible strategies.

## 2. Available strategies

| Strategy          | Description                                                  | What you could lose                  |
| ----------------- | ------------------------------------------------------------ | ------------------------------------ |
| `branch-delete`   | Discard the task branch                                      | Every unmerged change on the branch  |
| `reset-base`      | Hard-reset the current branch to the base commit              | Your current changes (stash first)   |
| `revert-merge`    | If already merged, revert the merge commit                    | Adds a revert commit to history (OK) |

## 3. Execute (destructive, `--confirm` required)

```bash
vibeops task rollback TASK-NNN --strategy branch-delete --confirm
vibeops task rollback TASK-NNN --strategy reset-base --confirm
vibeops task rollback TASK-NNN --strategy revert-merge --confirm
```

Combining `--dry-run` with `--confirm` prints the commands that would run without executing them.

## 4. Things you never do

- **`git push --force`**: never on shared branches. Even on your own task branch, do not run it unless the reason is unambiguous.
- Automatic reflog cleanup.
- Dropping stashes without explicit user consent.

## 5. After rollback

- Reset `docs/tasks/TASK-NNN-*.md` Status to `planned` or `blocked` and record the reason in Result.
- Update `docs/project/05-current-state.md`.
- Append a one-line entry to `docs/logs/YYYY-MM-DD.md`: "Rollback: TASK-NNN — reason".
