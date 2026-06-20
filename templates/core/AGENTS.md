# Project — AI Agent Guide

> Installed by VibeOps. Read before coding.

## TASK workflow

```bash
vibeops task add
# Plan / build in your agent (@docs/tasks/TASK-NNN-*.md)

vibeops task ship           # state-aware: new PR / update open PR / new cycle
vibeops task merge          # CLI or host UI
vibeops task sync           # optional — branch cleanup only

# Same TASK, before merge — just re-run ship to update the open PR:
vibeops task ship -m "address review"
# Same TASK, after merge — start a new PR cycle:
vibeops task ship --new-cycle
vibeops task merge
```

Optional release to production: `vibeops task release`.

## TASK status (markdown)

Only two values in `## Status`:

| Status | Meaning |
|--------|---------|
| **In Progress** | Active slice (`task add`) |
| **Shipped** | Submitted (`task ship`) |

Merge and sync do **not** change the TASK file.

```bash
vibeops llm connect   # optional — task add / ship
```

## Rules

- One **In Progress** TASK at a time; **Shipped** does not block `task add`.
- Fill **Result** and **Test Result** before `vibeops task ship` (warned, not blocked, when updating an open PR).
- `ship` is state-aware: re-run it to update an open PR; after merge it needs `--new-cycle` (or a confirm) to start a new PR cycle. `task reship` still works as a deprecated alias for `task ship --new-cycle`.
- Agents do not run `task merge` or `task sync` unless the human asks.
