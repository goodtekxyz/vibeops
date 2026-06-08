# Project — AI Agent Guide

> Installed by VibeOps. Read before coding.

## TASK workflow

```bash
vibeops task add
# Plan / build in your agent (@docs/tasks/TASK-NNN-*.md)

vibeops task ship
vibeops task merge          # CLI or host UI
vibeops task sync           # optional — branch cleanup only

# Same TASK follow-up (after merge):
vibeops task reship TASK-NNN
vibeops task merge
```

Optional release to production: `vibeops task release`.

## TASK status (markdown)

Only two values in `## Status`:

| Status | Meaning |
|--------|---------|
| **In Progress** | Active slice (`task add`) |
| **Shipped** | Submitted (`task ship` or `task reship`) |

Merge and sync do **not** change the TASK file.

```bash
vibeops llm connect   # optional — task add / ship / reship
```

## Rules

- One **In Progress** TASK at a time; **Shipped** does not block `task add`.
- Fill **Result** and **Test Result** before `vibeops task ship` (or before `task reship` for follow-ups).
- Agents do not run `task merge`, `task sync`, or `task reship` unless the human asks.
