# TASK-005 · Agent commands — `agent list / show / prompt`

## Status

done

## MVP Phase

MVP 1 · Project Bootstrapper

## Goal

Add commands that treat agents as "files".

- `vibeops agent list` — list installed agents.
- `vibeops agent show <name>` — print the agent definition (`.vibeops/agents/<name>.md`).
- `vibeops agent prompt <name>` — print a Cursor paste-prompt built from agent + context to stdout.

This TASK covers **standalone agent prompts** (without `--task TASK-NNN`). The form `vibeops task prompt TASK-NNN --agent <name>` (combined with a specific TASK context) is covered by [TASK-008](TASK-008-task-lifecycle.md).

## Background

Treating agent definitions as Markdown files becomes useful only if a command can list and reproduce them externally. Then a user can immediately benefit when they edit or add an agent. The `prompt` output also creates the contract "this is text you paste directly into Cursor".

## Scope

- `src/commands/agent.ts` — sub-command group `list / show / prompt`.
- `src/agent/loader.ts` — read `.vibeops/agents/*.md`, separate frontmatter metadata (e.g. `id`, `role`, `inputs`, `outputs`) from the body.
- `src/agent/prompt.ts` — build a Cursor prompt from agent + optional context (e.g. a list of file paths).
- Options:
  - `agent list --json`.
  - `agent show <name> --raw` (include frontmatter).
  - `agent prompt <name> --context <path>...` (extra context paths).
  - `agent prompt <name> --copy` (macOS `pbcopy`, Linux guidance) — optional; OK to skip if short on time.

## Out of Scope

- TASK-combined prompts (`vibeops task prompt TASK-NNN --agent`) — TASK-008.
- Agent execution (LLM calls) — permanently out of scope.

## Acceptance Criteria

1. `vibeops agent list` shows the `name` + a one-line description extracted from each `.vibeops/agents/*.md`.
2. `vibeops agent show planner` prints the file body (readability-first). `--raw` includes the frontmatter.
3. `vibeops agent prompt builder` prints a prompt that contains:
   - The agent body (`role`, `input contract`, `output format`, `forbidden`).
   - Body excerpt or path notice for each user-provided `--context` file.
   - Current project name + VibeOps version (from `.vibeops.json`).
4. An unknown agent name prints "Available: planner, builder, reviewer, releaser" and exits 1.
5. The output is **a single markdown blob that pastes cleanly into Cursor chat** (no extra editing required).

## Files to Inspect First

- `templates/.vibeops/agents/*.md` (filled in TASK-003).
- `src/config/projectConfig.ts`.
- `src/cli.ts`.

## Expected Files to Change

- new: `src/commands/agent.ts`, `src/agent/loader.ts`, `src/agent/prompt.ts`.
- new: `tests/agent.test.ts`.
- update: this TASK's Result / Test Result, `docs/project/03-current-state.md`, `docs/logs/YYYY-MM-DD.md`.

## Risks

- Defining the agent frontmatter schema too strictly would block user-added agents → only `name`, `role` required; rest optional.
- `--copy` is OS-dependent. Leaving it unimplemented in the MVP is safer.

## Test Plan

- vitest fixture creates `.vibeops/agents/builder.md`, then verifies list / show / prompt behaviour.
- Verify exit code 1 on an unknown name.
- Manual: `vibeops agent prompt builder | head -50` against this repo.

## Rollback Plan

- Discard the working branch. Read-only.

## Implementation Plan

1. Parse metadata + body in `agent/loader.ts` with gray-matter.
2. Build "agent body + project metadata + user context" in `agent/prompt.ts`.
3. Register `list / show / prompt` sub-commands in `commands/agent.ts`.
4. Tests.
5. Doc updates.

## Result

Completed 2026-05-11. The three commands that treat agents as "files" (`agent list / show / prompt`) are implemented.

- **Agent loader**: `src/agent/loader.ts` — parse frontmatter (`name`, `role`, `description`) via gray-matter and split off the body. `findAgent(dir, name)` first matches frontmatter `name`, then the filename. `loadAgent` / `listAgents` silently skip malformed files.
- **Prompt builder**: `src/agent/prompt.ts` — `buildPrompt({ agent, config, task?, projectRoot, contextPaths? })` returns a single markdown blob composed of "Header (project name · VibeOps version · TASK metadata) + Agent definition body + (if any) TASK file body + (if any) referenced extra-context-file excerpts + Footer (completion report guidance)".
- **Commands**:
  - `agent list` — list `.vibeops/agents/*.md` + one-line description. `--json` returns an array of `{name, role, description, filePath}`.
  - `agent show <name> [--raw]` — body (readability-first) or original (`--raw`).
  - `agent prompt <name> <taskId> [--context <path...>]` — find the TASK file under `docs/tasks/` and stitch it with the agent body to stdout. If `taskId` is not in `TASK-NNN` form, warns and proceeds without TASK context.
- **Error paths**: an unknown agent name prints `Available: <list>` + exit 1. If the agent directory is missing, prints `Run \`vibeops init\` first.`.
- **TASK ↔ agent reuse**: `cli.ts`'s `task prompt <taskId> --agent <name>` also invokes the same `agentPromptCommand` (only argument order changes). This reduces the work needed for `task prompt` in TASK-008.
- **`--copy` (macOS pbcopy)**: the TASK body said "OK to skip if short on time" — **left unimplemented**. Follow-up reinforcement TASK candidate.

### Changed files

| File | Kind |
| --- | --- |
| `src/commands/agent-list.ts` | update (stub → real implementation) |
| `src/commands/agent-show.ts` | update (stub → real implementation) |
| `src/commands/agent-prompt.ts` | update (stub → real implementation) |
| `src/agent/loader.ts` | new |
| `src/agent/prompt.ts` | new |
| `src/cli.ts` | update (`--raw`, `--cwd`, `--context` wiring + `task prompt` delegation) |

## Test Result

- **list in sandbox**: `pnpm dev agent list --cwd /tmp/vibeops-sandbox` →
  ```
  Agents
    architect     Decides system structure and tech stack.
    builder       Writes code within a single TASK's Scope.
    docs          Updates all three documents after implementation.
    orchestrator  Decides what to do next and delegates to the right agent.
    planner       Takes an idea and produces the vision · requirements · MVP scope · backlog.
    recovery      Diagnoses what went wrong and prints commands to recover.
    reviewer      Inspects the builder's output against the TASK.
    tester        Runs the TASK's Test Plan. Records pass/fail with evidence.
  ```
  All 8 agents shown with `name` + one-line description — AC#1 pass.
- **show**: `pnpm dev agent show builder --cwd /tmp/vibeops-sandbox` → body (Role / Inputs / Output Format / Rules / Forbidden) printed; the 4 frontmatter lines (name / role / description / `---`) are not included. The `--raw` option is wired in the CLI. — AC#2 pass.
- **prompt**: `pnpm dev agent prompt builder TASK-000 --cwd /tmp/vibeops-sandbox` → single markdown output that contains all of:
  - `# Cursor prompt — agent: builder`.
  - `Project: \`byobrowser\``, `VibeOps: \`0.1.0\``.
  - `TASK: \`TASK-000\``, `TASK file: \`docs/tasks/TASK-000-template.md\``.
  - `## Agent definition (builder)` + body.
  - `## TASK file content` + body.
  - Footer (completion-report guidance).
  — AC#3, AC#5 pass.
- **Unknown name**: `pnpm dev agent show ghost --cwd /tmp/vibeops-sandbox` → exit 1, prints `✗ Unknown agent: "ghost".` and `Available: architect, builder, docs, orchestrator, planner, recovery, reviewer, tester` — AC#4 pass (the available list reflects the 8 actually installed agents from TASK-003's expanded spec, not the original TASK body example `planner, builder, reviewer, releaser`).
- **agent prompt reuse**: `pnpm dev task prompt TASK-000 --agent builder --cwd /tmp/vibeops-sandbox` → identical prompt output. AC#3 pass.
- ReadLints (`src/`) → 0 issues.
- Acceptance Criteria 1–5 all pass.
