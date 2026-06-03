# Workflow · Task Lifecycle

A TASK from start to finish (v4).

## 0. Pick

Run `vibeops status` for the active TASK and next hint.

## 1. Add

```bash
vibeops task add
```

- Creates `docs/tasks/TASK-NNN-<slug>.md`, task branch from integration, Status **In Progress**.

## 2. Plan and build (HIL)

In Cursor: refine the TASK file, implement, run tests. Agents do not run `task ship` or `task merge` unless asked.

## 3. Ship

```bash
vibeops task ship TASK-NNN
```

- Fills Result / Test Result (LLM optional), commits, pushes, opens MR/PR.
- Status → **Review** on the task branch.

## 4. Merge

```bash
vibeops task merge TASK-NNN
```

- Merges the TASK MR/PR into the integration branch (default squash).
- Or merge in GitHub/GitLab UI, then continue.

## 5. Sync

```bash
vibeops task sync TASK-NNN
```

- Fetches, checks out integration, fast-forward pull.
- Status → **Done** on integration; deletes local/remote `task/*` branch.

## 6. Next slice

```bash
vibeops task add
```

## Release (occasional)

```bash
vibeops task release
```

- Opens and merges integration → production (GitFlow). Not tied to a single TASK.
