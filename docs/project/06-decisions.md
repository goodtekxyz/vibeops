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

## D-005 · `task merge` is a fail-closed CI gate (3.0+)

Hosts without enforceable branch protection (e.g. private GitHub repos on the free plan) cannot require checks, so `task merge` / `task release` enforce them client-side: any failed, unknown or missing check, untrusted host output (missing/empty fields), or a PR with no checks at all refuses the merge; pending checks wait (bounded, configurable) then refuse; merges are pinned to the checked head SHA. No `--force` override on merge — the repo's `--force` convention (`task sync`, `task del`) bypasses local safety checks, not CI, and agents run these commands; humans keep the host UI. Repos without CI opt in explicitly with `merge.allowNoChecks: true` (one warning per such merge) — fail closed by default rather than silently merging unverified work. Because this refuses PRs that merged before, it shipped as a major version (3.0.0). Required check names and gate timing live only in the consumer's `.vibeops.json` `merge` block (strictly validated), never in VibeOps code. Server-side branch protection, where available, remains the final authority.

## D-006 · Worktree-safe lifecycle and global TASK ids (3.1+)

Consumers run several `git worktree` checkouts of one repo in parallel, and git refuses to check out a branch another worktree has. VibeOps therefore never requires checking out the integration branch: task branches start from `<remote>/<integration>` after a fetch; the local integration ref is fast-forwarded only where safe (here via `merge --ff-only`, unowned via guarded `update-ref`) and left untouched when another worktree owns it; leaving a task branch detaches at `<remote>/<integration>` when the integration branch is owned elsewhere. Nothing is forced. TASK ids are allocated as 1 + max over local, integration-tree, every-worktree `docs/tasks` and all local / remote-tracking / remote `task/NNN-*` branches; an unlistable remote refuses `task add` (fail closed) rather than risk a duplicate id.

<!--
Add subsequent decisions in the `D-NNN · one-line summary` form.
Keep each entry short — one paragraph of "why" and "consequence" only.
-->
