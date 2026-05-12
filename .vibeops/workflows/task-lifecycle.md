# Workflow · Task Lifecycle

A TASK from start to finish.

## 0. Pick

Run `vibeops status` to identify the next TASK. Typically run `in_progress` items before `planned` ones.

## 1. Start

```bash
vibeops task start TASK-NNN
```

- A dirty working tree is refused unless changes are limited to governance docs (`docs/tasks/`, `docs/project/`, `docs/logs/`, `.vibeops/state/`); then `task start` warns and continues. Use `--allow-dirty` only when non-doc paths are dirty intentionally.
- Records base branch / base commit / task branch in `.vibeops/state/tasks/TASK-NNN.json`.
- Creates and checks out the `task/NNN-<slug>` branch.
- Sets the TASK file's Status to `in_progress`.

## 2. Prompt

```bash
vibeops task prompt TASK-NNN --agent builder
```

Paste the single markdown output directly into the Cursor chat. Cursor takes on the builder agent role.

Other agents work the same way:
- `--agent reviewer` — review the diff.
- `--agent tester` — run the Test Plan.
- `--agent docs` — update the three docs.

## 3. Check

```bash
vibeops task check TASK-NNN
```

- Score Acceptance Criteria items with ✓ / ✗.
- Match `Expected Files to Change` against actual changes.
- Summarize current branch / dirty / commit count.

## 4. Done

```bash
vibeops task done TASK-NNN
```

- Validates the TASK file's Status, Result, Test Result bodies.
- Records `doneAt` in `.vibeops/state/tasks/TASK-NNN.json`.
- Prints **merge guidance** (no automatic merge).

A human merges:

```bash
git switch main
git merge --ff-only task/NNN-<slug>
git branch -d task/NNN-<slug>
```

## 5. (Optional) Notion sync

```bash
vibeops notion sync
```

Pushes TASK metadata (summary, status, priority, branch, docs path, result summary) to Notion.

## When things go wrong: Rollback

See [`rollback.md`](rollback.md).
