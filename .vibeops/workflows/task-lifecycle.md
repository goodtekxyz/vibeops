# Workflow · Task Lifecycle

A TASK from start to finish (v4).

## 0. Pick

Run `vibeops status` for NOW / NEXT (focus TASK and next command).

## 1. Add

```bash
vibeops task add
```

- Creates `docs/tasks/TASK-NNN-<slug>.md`, task branch from integration, Status **In Progress**.

## 2. Plan and build (HIL)

In Cursor: refine the TASK file, implement, run tests. Agents do not run `task ship` / `task merge` unless asked.

## 3. Ship

```bash
vibeops task ship TASK-NNN
```

- Fills Result / Test Result (LLM optional), commits, pushes, opens MR/PR.
- Status → **Shipped** on the task branch.
- Re-run `ship` while the PR is open to push updates (same PR).

## 4. Merge

```bash
vibeops task merge TASK-NNN
```

- Merges the TASK MR/PR into the integration branch (default squash).
- Or merge in GitHub/GitLab UI, then continue.

## 4b. Pull (refresh integration)

```bash
vibeops pull
```

- Fetches remote and fast-forwards **develop** (or your integration branch). Run after merge, before a new PR cycle or `task add`.

## 5. Sync (optional)

```bash
vibeops task sync TASK-NNN
```

- Fetches, checks out integration, fast-forward pull.
- Deletes local/remote `task/*` branch; TASK md stays **Shipped**.

## 6. Follow-up (same TASK, optional)

```bash
vibeops task ship --new-cycle
vibeops task merge TASK-NNN
```

- Edit on **develop or task branch** (uncommitted is fine). After merge, `ship` (confirm or `--new-cycle`) moves work onto the task branch, creates it from integration when missing (after sync), integrates develop, **new MR/PR**; Status stays **Shipped**.

## 7. Next slice

```bash
vibeops task add
```

## Release (occasional)

```bash
vibeops task release
```

- Opens and merges integration → production (GitFlow). Not tied to a single TASK.
