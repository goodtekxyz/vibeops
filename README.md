# VibeOps

> Minimal CLI rails for TASK-driven vibe coding (Cursor, Claude Code, Codex).

[![npm version](https://img.shields.io/npm/v/@goodtek/vibeops.svg)](https://www.npmjs.com/package/@goodtek/vibeops)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

VibeOps bootstraps an **agent-friendly repo**, starts numbered **TASK** files on Git branches, and runs a clear GitFlow lifecycle. You plan and implement in your chosen agent; the CLI handles files, Git, and short LLM assists.

**Current release:** [`@goodtek/vibeops@2.5.0`](https://www.npmjs.com/package/@goodtek/vibeops) — interactive init remote (GitHub/GitLab), state-aware `task ship` only (no `task reship`), `status` Now/Next card.

## Commands

| Command | Purpose |
|---------|---------|
| `vibeops init` | Core docs + agent packs; interactive Git host + create/connect remote |
| `vibeops task add` | New `TASK-NNN` file + task branch |
| `vibeops task del` | Cancel TASK before merge (md + branch + close open MR) |
| `vibeops task ship` | State-aware submit: new PR · update open PR · new PR cycle after merge (Status → **Shipped**) |
| `vibeops task merge` | Merge TASK MR/PR into integration branch (default: squash) |
| `vibeops task sync` | After merge: ff-only integration pull, delete task branches (no TASK md edits) |
| `vibeops task release` | Release PR: integration → production (GitFlow) |
| `vibeops pull` | Fetch remote + update integration branch (e.g. develop) |
| `vibeops status` | **Now / Next** card — focus TASK, checklist, what to run next |
| `vibeops llm` | Connect LLM providers (`connect` · `status` · `use`) |

## Installation

Node.js 20+.

```bash
npm install -g @goodtek/vibeops@2.5.0
# or latest: npm install -g @goodtek/vibeops
vibeops --version   # expect 2.5.0
```

If `vibeops --version` stays on an old release after install, check for a **shell alias** or **Volta** shim shadowing npm:

```bash
type -a vibeops
# alias → unalias vibeops (and remove from ~/.zshrc)
# ~/.volta/bin/vibeops → volta install @goodtek/vibeops@2.5.0
```

**Upgrading from before 2.5:** `task reship` was removed. Use `vibeops task ship` (re-run while the PR is open; after merge use confirm or `--new-cycle`).

Development:

```bash
pnpm install && pnpm build && pnpm smoke
```

## Init

Interactive init asks which agents to install, Git branch policy, then **where the remote lives** (GitHub / GitLab / skip) and whether to **create** or **connect** a repository. If `gh`/`glab` is missing, init prints install hints (optional `brew install` with consent) or accepts a URL — it does not block the rest of VibeOps.

```bash
# Interactive: pick agents (≥1), then Git + remote host
vibeops init

# Non-interactive (GitFlow: develop + main, origin required unless CI)
vibeops init --clients cursor,claude,codex --git --initial-commit --git-policy gitflow --allow-no-remote

# Re-init templates on an existing project
vibeops init --clients cursor --yes
```

| Pack | Installed |
|------|-----------|
| **core** (always) | `AGENTS.md`, `docs/tasks`, `docs/project`, `docs/logs` |
| **cursor** | `.cursor/rules/`, `.cursor/skills/` |
| **claude** | `CLAUDE.md`, `.claude/skills/` |
| **codex** | `.agents/skills/` |

Re-init **overwrites** templates (rules, skills, doc stubs). **`docs/tasks/TASK-*.md` are kept.**

## Workflow

```bash
vibeops init --clients cursor --git --initial-commit

vibeops task add
# Plan / build in Cursor (@docs/tasks/TASK-NNN-*.md)

vibeops task ship
vibeops task merge
vibeops pull
# Same TASK, before merge — edit, then just re-run ship (updates the open PR):
vibeops task ship -m "address review"
# Same TASK, after merge — start a new PR cycle:
vibeops task ship --new-cycle
vibeops task merge
vibeops task sync
vibeops task add
```

`ship` detects the TASK's PR state and does the right thing:

| State | `ship` does | Output |
|-------|-------------|--------|
| No PR yet | push + open a new PR | `Created PR #<n> → <url>` |
| PR open (unmerged) | commit + push the **same** branch (no new PR), CI re-runs | `Updated existing PR #<n> (pushed <sha>) — CI re-running` |
| PR merged | start a **new** PR cycle (needs confirm or `--new-cycle`) | `Started new PR cycle → PR #<n>` |
| No change | no-op | `Nothing to ship (working tree clean, PR #<n> up to date)` |

Occasionally (GitFlow release to production):

```bash
vibeops task release
```

Only one TASK **In Progress** at a time (`task add` blocks otherwise). **Shipped** slices do not block the next add; merge on the host or with `task merge`, then optional `task sync`.

`task add` fast-forward-pulls the integration branch first. If that fails (diverged / dirty / local-ahead), it prints the cause and fix commands and **does not** create a TASK file. If a previous run left a TASK file without a branch, rerun `task add` to resume.

## Status

```bash
vibeops status
```

Prints a short card:

- **NOW** — focus TASK, stage, Result/Test checklist, branch, PR
- **NEXT** — one primary action (copy-pasteable command)
- footer — project, task counts, LLM (dim)

```bash
vibeops status --json   # machine-readable
```

## LLM (optional)

For **`task add`** / **`task ship`** only (not for coding in the IDE). When `-m` is omitted, `ship` uses a connected provider to draft the commit subject:

```bash
vibeops llm connect
vibeops llm use auto   # auto | codex-oauth | cursor-agent | openai
```

## Flags (common)

- **`init`**: `--clients`, `--yes`, `--dry-run`, `--force`, `--git`, `--initial-commit`, `--git-policy gitflow|trunk`, `--integration-branch`, `--production-branch`, `--git-host github|gitlab`, `--allow-no-remote`, `--cwd`
- **`task add`**: `--dry-run`, `--non-interactive --idea "…"`
- **`task del`**: `--dry-run`, `--force`, `--no-remote-delete`, `--no-close-mr`
- **`task ship`**: `-m/--message`, `--new-cycle`, `--no-commit`, `--dry-run`, `--no-pr`, `--non-interactive`, `--allow-open-mr`, `--no-integrate`, `--recreate-branch`, `--skip-llm`
- **`task merge`**: `--dry-run`, `--merge`, `--rebase`
- **`task sync`**: `--dry-run`, `--no-remote-delete`, `--force`
- **`task release`**: `--dry-run`, `--no-merge`, `--merge`, `--rebase`
- **`pull`**: `--dry-run`
- **`status`**: `--json`

## Git

- **Init** records branch policy in `.vibeops.json` (`integrationBranch`, `productionBranch`, `host`). Interactive remote setup: ask GitHub/GitLab, create or connect; soft-gate when `gh`/`glab` is missing.
- **`task add`**: `task/<slug>` from **integration** (e.g. `develop`).
- **`task ship`** (state-aware): **no PR** → commit + ship metadata (Status **Shipped**) → push → open MR/PR; **open PR** → commit + push the same branch, CI re-runs, no new PR; **merged PR** → new PR cycle (carries uncommitted work onto the task branch, integrates `develop`, opens a **new** PR). Use `--new-cycle` in non-interactive mode. Commit messages are TASK-id-scoped (`feat(task-001): …`). Refuses when HEAD is not the task branch.
- **`task merge`**: merge MR/PR into integration (CLI or host UI; TASK md unchanged).
- **`task sync`**: integration ff-only pull → delete `task/*` branches (TASK md unchanged).
- **`pull`**: fetch + switch to integration branch + `git pull --ff-only` (one command).
- **`task release`**: integration → production PR + merge (skipped on trunk policy).
- **`status`**: Now / Next card — focus stage, checklist, PR, and the next command to run.
- No force-push to shared branches.

## License

MIT
