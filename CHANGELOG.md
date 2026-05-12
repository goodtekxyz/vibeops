# Changelog

All notable changes to VibeOps are documented here.

## Unreleased

### Changed

- `vibeops plan` (interactive default): verifies an LLM provider — **OpenAI** (`OPENAI_API_KEY`), **Codex (ChatGPT OAuth)** via `~/.codex/auth.json` from `codex login` (refresh at `https://auth.openai.com/oauth/token` with the same public `client_id` as Hermes / OpenClaw `openai-codex`; requests use `POST …/backend-api/codex/responses` with `store:false` and `stream:true`), or **Cursor Agent CLI** (`agent login`). Then runs the adaptive JSON-protocol planning loop until the model emits a full `ProjectBrief`. Env: `VIBEOPS_CODEX_MODEL`, `VIBEOPS_CODEX_BASE_URL`. `--provider openai|codex-oauth|cursor-agent` forces one path when available. `--legacy-wizard` restores the fixed 20-question flow; `--non-interactive` and `--from` do not call an LLM.

- `vibeops task start`: if the working tree is dirty only under `docs/tasks/`, `docs/project/`, `docs/logs/`, or `.vibeops/state/`, the command proceeds with a warning instead of exiting. Uncommitted changes outside those paths still require a clean tree or `--allow-dirty`. This avoids blocking the next TASK after `task done` / `--finalize` left TASK or project docs uncommitted on `main`.

## 0.2.0 - 2026-05-12

Public release polish.

- Rename the npm package to `@goodtek/vibeops`. The CLI command is still `vibeops`.
- Publish as a public scoped package (`publishConfig.access = "public"`).
- Rewrite the README for public release: replace the internal walkthrough example with `Acme Automator`, remove internal phase labels, add a Support section (`support@goodtek.xyz`, `hello@goodtek.xyz`), and update the install command to `npm install -g @goodtek/vibeops`.
- Normalize CLI help, command descriptions, and program log/error messages to English so the output is consistent for international users.
- Replace the leftover internal example reference inside `src/types/config.ts` and the planner agent template with a generic project name.

No behavior changes — every command produces the same files and Git/Notion side effects as 0.1.0, only the user-facing text and packaging metadata changed.

## 0.1.0 - 2026-05-11

Initial release candidate.

- Project Bootstrapper: `vibeops init` installs Cursor rules, `AGENTS.md`, agents/prompts/workflows, project docs, and a TASK template into a project; `vibeops status` summarizes installation, tasks, Git, Notion, GitHub, and package state.
- Interactive Planner: `vibeops plan` runs 20 short questions and produces a normalized ProjectBrief plus a Cursor planning prompt.
- Task Generator: `vibeops task generate` builds a Cursor prompt for generating TASK files or, with `--scaffold`, writes placeholder TASK markdown directly.
- Git Task Lifecycle: `task start`, `task prompt`, `task check`, `task done`, and `task rollback` keep one TASK moving through `Planned → In Progress → Review → Done` with dry-run and read-only defaults and explicit rollback confirmation.
- Notion Dashboard Sync: `notion init`, `notion test`, `notion sync`, and `task pull` provide data-source-first discovery and resolution, schema and status-option validation, metadata-only sync, and local TASK skeleton pull.
- GitHub Integration: `github status` and `github init` use the `gh` CLI to connect or create a GitHub repository without storing `GITHUB_TOKEN` and without auto-pushing.
- Init Git Bootstrap: `vibeops init --git --initial-commit` optionally initializes Git and creates the first commit, and `vibeops status` distinguishes unborn / detached / normal HEAD states.
- Packaging: npm package metadata, MIT license, smoke checks, and publish dry-run workflow.
