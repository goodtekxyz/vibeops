# Project — AI Agent Guide

> Installed by VibeOps. Read before coding.

## TASK workflow

```bash
vibeops task add
# Plan / build in your agent (@docs/tasks/TASK-NNN-*.md)

vibeops task ship
vibeops task merge
vibeops task sync
```

Optional release to production: `vibeops task release`.

```bash
vibeops llm connect   # optional — task add / task ship
```

## Rules

- One TASK at a time; scope from `docs/tasks/TASK-NNN-*.md`.
- Fill **Result** and **Test Result** before `vibeops task ship`.
- Agents do not merge or sync unless the human asks.
