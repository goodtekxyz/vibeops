# VibeOps

> Workflow rails for Cursor-based vibe coding projects.

VibeOps is a local CLI that installs and operates the project structure needed to run Cursor-based vibe coding as reproducible TASKs: `AGENTS.md`, Cursor rules, project docs, TASK files, agents/prompts/workflows, Git lifecycle helpers, and optional Notion dashboard sync.

VibeOps does not write product code for you. Cursor is the builder. VibeOps keeps the workflow on rails.

## What Is VibeOps?

VibeOps is a **local CLI** for turning an idea into a repository that Cursor agents can work on safely and repeatably.

It gives a project:

- `docs/project/*` for product and architecture context.
- `docs/tasks/TASK-*.md` as the AI execution source of truth.
- `.cursor/rules/*` and `AGENTS.md` so Cursor knows how to behave.
- `.vibeops/agents`, `.vibeops/prompts`, `.vibeops/workflows` for reusable agent instructions.
- Git task lifecycle commands for start/check/done/rollback.
- Notion metadata sync for a human dashboard.

## Why It Exists

Vibe coding is fast, but chat history is a weak source of truth. Without a durable workflow, agents repeat work, drift outside scope, lose decision history, and leave teammates without a dashboard. VibeOps moves the durable context into Git files and uses CLI commands to keep each TASK bounded.

## Core Philosophy

- **VibeOps = workflow rail**: it structures the work, validates state, and prints prompts.
- **Cursor = builder**: Cursor reads the docs/TASKs and writes application code.
- **Git `docs/tasks` = AI execution source of truth**: TASK markdown beats chat memory.
- **Notion = human dashboard**: Notion shows metadata and progress, not canonical task bodies.

| What | Source of truth |
| --- | --- |
| AI execution input | Git `docs/tasks/*.md` |
| Project design/status | Git `docs/project/*.md` |
| Change and rollback evidence | Git commits/branches |
| Human dashboard | Notion Projects/Tasks DB |
| Not a source of truth | Cursor chat, Slack, memory |

## Installation

VibeOps requires Node.js 20+.

```bash
npm install -g vibeops
vibeops --help
```

For local development from this repository:

```bash
pnpm install
pnpm build
node dist/cli.js --help
```

## Quick Start

```bash
# 1. Install VibeOps workflow files into the current project.
vibeops init

# 2. Answer 20 short planning questions and generate a Cursor planning prompt.
vibeops plan

# 3. Generate a TASK prompt or scaffold TASK markdown.
vibeops task generate --dry-run

# 4. Start one TASK at a time.
vibeops task start TASK-001
vibeops task prompt TASK-001 --agent builder

# 5. Review and move to human review.
vibeops task check TASK-001
vibeops task done TASK-001

# 6. Optional Notion dashboard sync.
vibeops notion init
vibeops notion test
vibeops notion sync --dry-run
```

## BYOBrowser Example Flow

Suppose the idea is: “Build **BYOBrowser**, a browser automation SaaS.”

```bash
mkdir byobrowser
cd byobrowser

vibeops init --name BYOBrowser
vibeops plan --idea "BYOBrowser: browser automation SaaS"
vibeops task generate --dry-run

vibeops task start TASK-001
vibeops task prompt TASK-001 --agent builder
# Paste the prompt into Cursor and let Cursor implement the TASK.
vibeops task check TASK-001
vibeops task done TASK-001
```

If Notion is used as a dashboard:

```bash
vibeops notion init
vibeops notion test
vibeops notion sync --dry-run
vibeops notion sync
```

## Full Command Flow

```text
vibeops
├─ init [--dry-run] [--force] [--cwd <path>] [--name <projectName>]
├─ status [--json] [--cwd <path>]
├─ plan [--idea <text>] [--from <path>] [--output <path>] [--non-interactive] [--cwd <path>]
├─ agent
│  ├─ list [--json] [--cwd <path>]
│  ├─ show <name> [--raw] [--cwd <path>]
│  └─ prompt <name> <taskId> [--context <path...>] [--cwd <path>]
├─ task
│  ├─ generate [--from <path>] [--output <path>] [--count <n>] [--phase <name>] [--scaffold] [--dry-run] [--cwd <path>]
│  ├─ start <taskId> [--dry-run] [--allow-dirty] [--agent <name>] [--cwd <path>]
│  ├─ prompt <taskId> --agent <name> [--context <path...>] [--cwd <path>]
│  ├─ check <taskId> [--strict] [--agent <name>] [--cwd <path>]
│  ├─ done <taskId> [--dry-run] [--finalize] [--cwd <path>]
│  ├─ rollback <taskId> [--confirm | --confirm-destructive] [--strategy <name>] [--keep-branch] [--dry-run] [--cwd <path>]
│  └─ pull [--dry-run] [--json] [--status <list>] [--limit <n>] [--cwd <path>] [--verbose]
├─ notion
│  ├─ init [--dry-run] [--enable] [--projects-db <id>] [--tasks-db <id>] [--non-interactive] [--cwd <path>]
│  ├─ test [--json] [--debug-shape] [--cwd <path>]
│  └─ sync [--dry-run] [--json] [--only-tasks] [--only-project] [--cwd <path>]
└─ github
   ├─ status [--json] [--cwd <path>]
   └─ init [--dry-run] [--yes] [--owner <user>] [--repo <name>] [--public|--private]
           [--remote <name>] [--connect <owner/repo or url>] [--no-package-update] [--cwd <path>]
```

Run any command with `--help` for the option details.

## MVP Features

### Project Bootstrapper

`vibeops init` installs a project operating system: `AGENTS.md`, `.cursor/rules`, `docs/project`, `docs/tasks`, `.vibeops/agents`, `.vibeops/prompts`, `.vibeops/workflows`, `.vibeops.json`, and `.vibeops.env.example`. It is idempotent by default and only overwrites when `--force` is used.

### Interactive Planner

`vibeops plan` asks 20 short questions and produces a normalized brief plus a Cursor planning prompt. Non-interactive mode is available for safe placeholder output.

### Task Generator

`vibeops task generate` builds a Cursor prompt for generating TASK files. With `--scaffold`, it creates placeholder TASK markdown directly. It does not call an LLM.

### Git Task Lifecycle

`task start`, `task prompt`, `task check`, and `task done` keep one TASK moving through `Planned → In Progress → Review → Done`. `task done` defaults to `Review`; use `--finalize` only after human review.

### Rollback Safety

`task rollback` prints recovery options by default. Destructive Git actions require explicit confirmation (`--confirm` or `--confirm-destructive`) and should be reviewed before use.

### Notion Dashboard Sync

`notion init/test/sync` and `task pull` keep Notion as a metadata dashboard. VibeOps syncs project/task metadata only and never updates Notion page bodies.

## Runner Modes

- **Prompt mode (default)**: VibeOps prints Cursor-ready prompts. Cursor executes the code changes.
- **cursor-cli (future)**: not implemented in the MVP. A future runner may hand prompts to Cursor CLI explicitly.
- **direct-llm (future)**: not implemented in the MVP. VibeOps currently does not call LLM APIs directly.

## Notion Setup

Notion is optional. If enabled:

- `NOTION_TOKEN` lives in `.vibeops.env` (gitignored).
- Target IDs live in `.vibeops.json`.
- `projectsTargetId` / `tasksTargetId` are preferred resolved **data_source** IDs.
- `projectsDatabaseId` / `tasksDatabaseId` remain legacy/container fallbacks.
- `notion init` uses data_source-first discovery. If no data sources are found, it can search accessible pages, scan 1-depth inline database blocks, then resolve child databases to data source IDs.

Required Projects DB properties:

| Property | Type |
| --- | --- |
| `Name` | `title` |
| `Project ID` | `rich_text` |
| `Status` | `status` |
| `Local Path` | `rich_text` |
| `Git Repo` | `rich_text` or `url` |
| `Current Phase` | `select` |
| `Docs Path` | `rich_text` |
| `Summary` | `rich_text` |

Required Tasks DB properties:

| Property | Type |
| --- | --- |
| `Name` | `title` |
| `Task ID` | `rich_text` |
| `Project ID` | `rich_text` |
| `Status` | `status` |
| `Priority` | `select` |
| `MVP Phase` | `select` |
| `Git Branch` | `rich_text` |
| `Docs Path` | `rich_text` |
| `Summary` | `rich_text` |
| `Result Summary` | `rich_text` |

Required Status options:

- Projects DB: `Building`, `Planning`, `Paused`, `Done`, `Archived`
- Tasks DB: `Planned`, `In Progress`, `Review`, `Done`, `Blocked`

VibeOps validates these options in `notion test` and `notion sync --dry-run`, but it never creates or mutates Notion schema.

## GitHub Setup

GitHub integration is a post-MVP convenience that lives on top of the GitHub CLI (`gh`). VibeOps never stores `GITHUB_TOKEN` — authentication is owned by `gh auth login`.

1. Install `gh`:

   ```bash
   brew install gh
   # or follow https://cli.github.com/
   ```

2. Authenticate:

   ```bash
   gh auth login
   ```

3. Probe state:

   ```bash
   vibeops github status
   ```

4. Connect or create a repo interactively:

   ```bash
   # plan only — no gh / git / file mutation
   vibeops github init --dry-run

   # plan a new public repo
   vibeops github init --dry-run --owner <user> --repo <name> --public

   # connect to an existing repo by slug or URL
   vibeops github init --dry-run --connect <owner>/<repo>
   vibeops github init --dry-run --connect https://github.com/<owner>/<repo>.git
   vibeops github init --dry-run --connect git@github.com:<owner>/<repo>.git
   ```

`vibeops github init` applies four things in sequence:

- (optional) `gh repo create <owner>/<repo> --public|--private --source=. --remote=origin` for new repos.
- `git remote add origin <url>` (or `git remote set-url`) for the `--connect` path. Existing remotes are never silently overwritten — VibeOps asks first and defaults to No.
- Updates `package.json` `repository.url`, `homepage`, `bugs.url` (skip with `--no-package-update`).
- Writes the `github` section of `.vibeops.json`: `enabled`, `mode = "gh-cli"`, `owner`, `repo`, `remote`, `visibility`, `url`.

VibeOps never runs `git push`. Push your branch manually with `git push -u <remote> <branch>`.

## Git Rollback Safety

- `task start` records base branch, base commit, and task branch in task state.
- `task check` is read-only and reports working tree + committed changes.
- `task done` validates TASK Result/Test Result and moves to Review by default.
- `task rollback` is advisory unless explicit confirmation flags are supplied.

## Agent Workflow

Agents are Markdown files under `.vibeops/agents`. Use:

```bash
vibeops agent list
vibeops agent show builder
vibeops task prompt TASK-001 --agent builder
```

The default project template includes agents such as `orchestrator`, `planner`, `architect`, `builder`, `reviewer`, `tester`, `docs`, and `recovery`.

## Packaging / npm Usage

This package exposes the `vibeops` binary:

```json
{
  "bin": {
    "vibeops": "dist/cli.js"
  }
}
```

Package contents are limited by `package.json#files` to built output, templates, and top-level docs/license files. `dist/` is generated by `pnpm build` / `prepack` and is not committed.

Useful maintainer commands:

```bash
pnpm typecheck
pnpm build
pnpm smoke
pnpm pack
pnpm publish --dry-run
```

Actual `npm publish` is a manual release action and is not performed by this repository workflow.

## Security Notes

- `.vibeops.env` is gitignored and must contain secrets such as `NOTION_TOKEN`.
- VibeOps masks tokens in CLI output.
- Notion test/debug output is token-safe.
- `notion sync --dry-run` performs no mutation.
- `task pull --dry-run` performs no file or Notion mutation.
- Notion page bodies are never synced.
- Git destructive rollback paths require explicit confirmation.
- `github init` uses `gh` CLI auth — VibeOps never stores `GITHUB_TOKEN`.
- `github init --dry-run` runs zero `gh` / `git remote` / file mutations and produces only a plan.

## Roadmap

- Human review and `task done --finalize` for TASK-007 through TASK-011.
- Optional Vitest/ESLint/Prettier setup.
- `agent prompt --copy`.
- `plan --apply` and `task generate --apply`.
- Optional `--fix-docs-path` for explicitly repairing Notion Docs Path mismatches.
- Future runner modes: Cursor CLI and direct LLM integrations.
- No planned MVP support for hosted web UI, GitHub API automation, Notion webhooks, or real-time bidirectional sync.

## Documentation

- [`AGENTS.md`](AGENTS.md) — agent operating guide.
- [`docs/project/00-overview.md`](docs/project/00-overview.md) — vision and MVP boundaries.
- [`docs/project/01-architecture.md`](docs/project/01-architecture.md) — CLI/config/data flow.
- [`docs/project/03-current-state.md`](docs/project/03-current-state.md) — current implementation state.
- [`docs/project/04-decisions.md`](docs/project/04-decisions.md) — decisions already made.
- [`docs/project/05-backlog.md`](docs/project/05-backlog.md) — task order.
- [`docs/tasks/`](docs/tasks/) — TASK files used by Cursor.

## License

MIT © VibeOps contributors
