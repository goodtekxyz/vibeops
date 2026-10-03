# 06 — Decisions

Decisions already made. A conflicting new proposal can only change them after being raised as a separate TASK.

## D-001 · The source of truth is `docs/` in Git

Chat is not trusted. When they conflict, fix the docs first, then implement.

## D-002 · One TASK at a time

Large refactors are not done without their own TASK.

## D-003 · Notion is a human dashboard (metadata only)

No body sync. No realtime.

## D-004 · TASK md status is In Progress → Shipped only (2.1+)

- **`task ship`** sets Status **Shipped** (including new PR cycles via `--new-cycle`).
- **`task merge`**, **`task sync`**, and host UI merge do **not** edit TASK markdown.
- Legacy Review/Done/Merged/Planned normalize when read.
- Same-TASK follow-up after merge: **`task ship --new-cycle`** (or interactive confirm), not a new TASK id.

## D-005 · `task merge` is a fail-closed CI gate (2.6+)

Hosts without enforceable branch protection (e.g. private GitHub repos on the free plan) cannot require checks, so `task merge` / `task release` enforce them: any failed, unknown or missing check refuses the merge; pending checks wait (bounded) then refuse. No `--force` override on merge (the human can still merge in the host UI, outside VibeOps). Required check names live only in the consumer's `.vibeops.json` (`merge.requiredChecks`), never in VibeOps code.

<!--
Add subsequent decisions in the `D-NNN · one-line summary` form.
Keep each entry short — one paragraph of "why" and "consequence" only.
-->
