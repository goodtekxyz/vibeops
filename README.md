# VibeOps

> Minimal CLI rails for TASK-driven vibe coding (Cursor, Claude Code, Codex).

[![npm version](https://img.shields.io/npm/v/@goodtek/vibeops.svg)](https://www.npmjs.com/package/@goodtek/vibeops)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

VibeOps bootstraps an **agent-friendly repo**, starts numbered **TASK** files on Git branches, and closes them while updating **project memory** in Git. You plan and implement in your chosen agent; the CLI handles files, Git, and short LLM assists.

## Commands

| Command | Purpose |
|---------|---------|
| `vibeops init` | Core docs + agent packs (cursor / claude / codex) |
| `vibeops task add` | New `TASK-NNN` file + task branch |
| `vibeops task done` | LLM summary, push branch, open MR/PR (no local merge) |
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
# Plan / build using your agent and the current TASK file

vibeops task done
vibeops status
```

If a TASK is **In Progress**, `task add` exits with a guide — it does not auto-run `task done`.

## LLM (optional)

For **`task add`** / **`task done`** only (not for coding in the IDE):

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
- **`task done`**: `--dry-run`, `--no-pr` (push only)
- **`status`**: `--json`

## Git

- **Init** records branch policy in `.vibeops.json` (`integrationBranch`, `productionBranch`, `host`).
- **`task add`**: branch `task/<slug>` from the **integration** branch (e.g. `develop`).
- **`task done`**: commit implementation → `git push` → `gh pr create` / `glab mr create` → commit TASK closure (Status Done, Git Context) → push again. **You merge on GitHub/GitLab**; CI deploys.
- Commit messages: `feat(task-nnn): …`
- No force-push to shared branches

## License

MIT
