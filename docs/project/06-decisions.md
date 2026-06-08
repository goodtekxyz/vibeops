# 06 — Decisions

Decisions already made. A conflicting new proposal can only change them after being raised as a separate TASK.

## D-001 · The source of truth is `docs/` in Git

Chat is not trusted. When they conflict, fix the docs first, then implement.

## D-002 · One TASK at a time

Large refactors are not done without their own TASK.

## D-003 · Notion is a human dashboard (metadata only)

No body sync. No realtime.

## D-004 · TASK md status is In Progress → Shipped only (2.1+)

- **`task ship`** and **`task reship`** set Status **Shipped**.
- **`task merge`**, **`task sync`**, and host UI merge do **not** edit TASK markdown.
- Legacy Review/Done/Merged/Planned normalize when read.
- Same-TASK follow-up after merge: **`task reship`**, not a new TASK id.

<!--
Add subsequent decisions in the `D-NNN · one-line summary` form.
Keep each entry short — one paragraph of "why" and "consequence" only.
-->
