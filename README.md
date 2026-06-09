# VibeOps

> Minimal CLI rails for TASK-driven vibe coding (Cursor, Claude Code, Codex).

[![npm version](https://img.shields.io/npm/v/@goodtek/vibeops.svg)](https://www.npmjs.com/package/@goodtek/vibeops)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

VibeOps bootstraps an **agent-friendly repo**, starts numbered **TASK** files on Git branches, and runs a clear GitFlow lifecycle. You plan and implement in your chosen agent; the CLI handles files, Git, and short LLM assists.

## Commands

| Command | Purpose |
|---------|---------|
| `vibeops init` | Core docs + agent packs (cursor / claude / codex) |
| `vibeops task add` | New `TASK-NNN` file + task branch |
| `vibeops task ship` | LLM summary, commit, push, open MR/PR (Status → **Shipped**) |
| `vibeops task reship` | Shipped follow-up: move uncommitted work to task branch, commit, new MR/PR (Status stays Shipped) |
| `vibeops task merge` | Merge TASK MR/PR into integration branch (default: squash) |
| `vibeops task sync` | After merge: ff-only integration pull, delete task branches (no TASK md edits) |
| `vibeops task release` | Release PR: integration → production (GitFlow) |
| `vibeops pull` | Fetch remote + update integration branch (e.g. develop) |
| `vibeops status` | Briefing: TASK, Git, LLM, clients |
| `vibeops llm` | Connect LLM providers (`connect` · `status` · `use`) |

## Init

```bash
# Interactive: pick agents (≥1), then Git
vibeops init

# Non-interactive (GitFlow: develop + main, origin required unless CI)
vibeops init --clients cursor,claude,codex --git --initial-commit --git-policy gitflow

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
# Follow-up on same TASK (after merge):
vibeops task reship TASK-NNN
vibeops task merge
vibeops task sync
vibeops task add
```

Occasionally (GitFlow release to production):

```bash
vibeops task release
```

Only one TASK **In Progress** at a time (`task add` blocks otherwise). **Shipped** slices do not block the next add; merge on the host or with `task merge`, then optional `task sync`.

## LLM (optional)

For **`task add`** / **`task ship`** / **`task reship`** only (not for coding in the IDE):

```bash
vibeops llm connect
vibeops llm use auto   # auto | codex-oauth | cursor-agent | openai
```

## Installation

Node.js 20+.

```bash
npm install -g @goodtek/vibeops
```

Development:

```bash
pnpm install && pnpm build && pnpm smoke
```

## Flags (common)

- **`init`**: `--clients`, `--yes`, `--dry-run`, `--force`, `--git`, `--initial-commit`, `--git-policy gitflow|trunk`, `--integration-branch`, `--production-branch`, `--allow-no-remote`, `--cwd`
- **`task add`**: `--dry-run`, `--non-interactive --idea "…"`
- **`task ship`**: `--dry-run`, `--no-pr`
- **`task reship`**: `--dry-run`, `--no-pr`, `--no-integrate`, `--recreate-branch`, `--skip-llm`, `--allow-open-mr`
- **`task merge`**: `--dry-run`, `--merge`, `--rebase`
- **`task sync`**: `--dry-run`, `--no-remote-delete`, `--force`
- **`task release`**: `--dry-run`, `--no-merge`, `--merge`, `--rebase`
- **`pull`**: `--dry-run`
- **`status`**: `--json`

## Git

- **Init** records branch policy in `.vibeops.json` (`integrationBranch`, `productionBranch`, `host`).
- **`task add`**: `task/<slug>` from **integration** (e.g. `develop`).
- **`task ship`**: commit implementation + ship metadata (Status **Shipped**) → push once → MR/PR (URL on host; `task merge` resolves by branch).
- **`task reship`**: Shipped TASK follow-up — carries uncommitted work onto the task branch (creates it from integration when missing after sync), integrates `develop`, commit → push → **new** PR.
- **`task merge`**: merge MR/PR into integration (CLI or host UI; TASK md unchanged).
- **`task sync`**: integration ff-only pull → delete `task/*` branches (TASK md unchanged).
- **`pull`**: fetch + switch to integration branch + `git pull --ff-only` (one command).
- **`task release`**: integration → production PR + merge (skipped on trunk policy).
- No force-push to shared branches.

## License

MIT
