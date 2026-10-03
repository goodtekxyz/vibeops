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

Consumers run several `git worktree` checkouts of one repo in parallel. Git refuses to check out a branch another worktree has, and worktrees share `refs/stash` and the git common dir. Therefore: (1) VibeOps never requires checking out the integration branch — task branches start from `<remote>/<integration>` after a fetch; the local integration ref is updated only via `merge --ff-only` where it is checked out, else via `git fetch . refs/remotes/<remote>/<b>:refs/heads/<b>` so git itself refuses non-fast-forward and checked-out-elsewhere updates (reported, not failed); leaving a task branch detaches at `<remote>/<integration>` when the integration branch is owned elsewhere. Nothing is forced. (2) Mutating lifecycle steps run under one O_EXCL lock file in the git common dir (stale = dead pid on this host, or older than `lock.staleSeconds` from another host). (3) Governance changes are set aside by stash SHA (`stash create` / `store` / `apply <sha>` / drop that entry), never `stash pop`; untracked files are not stashed. (4) TASK id = 1 + max over local, integration-tree and every-worktree `docs/tasks` and generated-form task branches (local + fetched remote) that contain their TASK file; an unreachable remote refuses `task add`, and `task ship` re-checks the remote for a same-number branch right before pushing (fail closed). Counting only generated-form branches with TASK-file evidence keeps unrelated names (`task/2026-q4-plan`) from inflating ids; uncommitted TASK files are still covered by the every-worktree scan. Lock implementation (no new dependency): the lock file is created atomically with content (temp file + `link`, EEXIST if held); stale = dead pid on this host or older than `lock.staleSeconds` on any host (future timestamps respected); every removal — release and stale takeover — runs under a breaker file and re-checks inode + token before `unlink`, because "read, judge, unlink" without it let two of eight concurrent waiters hold the lock. `proper-lockfile` was considered: it fits the MIT policy but adds three transitive dependencies to a CLI that keeps a minimal dependency set, relies on a periodic mtime heartbeat during the hold, and records no pid/host for the "who holds it" error; the breaker design gives the same atomic takeover with those diagnostics. The git common dir must be on a local filesystem (network filesystems unsupported). All git output VibeOps parses is produced with `LC_ALL=C` / `LANG=C`.

<!--
Add subsequent decisions in the `D-NNN · one-line summary` form.
Keep each entry short — one paragraph of "why" and "consequence" only.
-->
