# TASK-003 · Templates — rules, agents, prompts, workflows, docs

## Status

done

## MVP Phase

MVP 1 · Project Bootstrapper

## Goal

Write the **real template content** that `vibeops init` will copy: Cursor rules, `AGENTS.md`, `docs/project/*` skeletons, `docs/tasks/` template, `.vibeops/agents/*`, `.vibeops/prompts/*`, `.vibeops/workflows/*`. The copier built in TASK-002 stays as is; this TASK focuses on filling in the content.

## Background

The value VibeOps provides depends entirely on "how good is the content that gets bootstrapped". This content becomes Cursor's operating guidance and per-TASK input.

## Scope

### `AGENTS.md` template

- Same structure as VibeOps's own `AGENTS.md`: reading order, source of truth, single-TASK rule, dry-run, completion report format.
- Project name is a placeholder, substituted by `init` from the `name` in `.vibeops.json`.

### `.cursor/rules/*.mdc`

- `00-vibeops-governance.mdc`: source of truth, single-TASK principle, refactor / integration limits.
- `01-ai-workflow.mdc`: reading before starting, no duplicate implementations, `--dry-run` first.
- `02-docs-update.mdc`: after implementation, update `03-current-state.md` / TASK / `docs/logs/` together.

### `docs/project/*` 6 skeletons

- `00-overview.md` ~ `05-backlog.md`. **Empty section headers** plus "what goes in this section" guide comments (Cursor will fill them via `vibeops plan`).

### `docs/tasks/TASK-000-example.md`

- An example (or `_template.md`) with the same sections as the TASK files in this repository.

### `docs/logs/.keep`

- An empty file (or a directory README).

### `.vibeops/agents/*.md` (4 files)

- `planner.md` — role: idea → docs/project skeleton + backlog. Output-format rules.
- `builder.md` — role: take one TASK and change code. No scope violation; doc-update obligation.
- `reviewer.md` — role: inspect the diff for Acceptance Criteria pass/fail.
- `releaser.md` — role: guide commit / merge. Explicitly states "no auto-merge".

### `.vibeops/prompts/*.md`

- `plan.md` — Cursor paste-prompt template used as the body of `vibeops plan`.
- `task-generate.md` — prompt template that turns a backlog item into a TASK-file skeleton.
- `task-builder.md` — base skeleton for `vibeops task prompt ... --agent builder` output.

### `.vibeops/workflows/*.md`

- `task-lifecycle.md` — explanation of the `start → prompt → check → done` flow.
- `notion-sync.md` — what gets synced and what does not (metadata only).

## Out of Scope

- Changes to the `init` command logic (assumes TASK-002 done).
- Implementation of domain commands (`plan`, `task ...`, `notion ...`).

## Acceptance Criteria

1. Running `vibeops init` in an empty directory produces every file listed above with **real written content**, not placeholders.
2. The generated `AGENTS.md` and `.cursor/rules/*` alone clearly state the rules: single-TASK principle, dry-run first, three-way doc update after implementation.
3. `docs/project/00-overview.md` ~ `05-backlog.md` skeletons contain **section headers + guide comments**; the body is empty for `vibeops plan` to fill.
4. The 4 `.vibeops/agents/*.md` files clearly document **role · inputs · output format · forbidden actions**.
5. The 3 `.vibeops/prompts/*.md` files define **substitution placeholders** such as `{{TASK_ID}}`, `{{TASK_PATH}}`, `{{PROJECT_NAME}}`.
6. The "installed file count" from `vibeops init` grows compared to the TASK-002 result, and every file has content.

## Files to Inspect First

- `templates/**` (the skeleton built in TASK-002).
- `src/bootstrap/manifest.ts`.
- This repository's `AGENTS.md`, `.cursor/rules/*.mdc`, `docs/project/*`, `docs/tasks/*` — reference originals.

## Expected Files to Change

- new / update: `templates/AGENTS.md`.
- new / update: `templates/.cursor/rules/{00-vibeops-governance,01-ai-workflow,02-docs-update}.mdc`.
- new / update: `templates/docs/project/{00..05}-*.md`.
- new / update: `templates/docs/tasks/TASK-000-example.md`.
- new / update: `templates/.vibeops/agents/{planner,builder,reviewer,releaser}.md`.
- new / update: `templates/.vibeops/prompts/{plan,task-generate,task-builder}.md`.
- new / update: `templates/.vibeops/workflows/{task-lifecycle,notion-sync}.md`.
- update: `src/bootstrap/manifest.ts` (remove placeholder entries or fix paths).
- update: `docs/project/03-current-state.md`, this TASK's Result / Test Result, `docs/logs/YYYY-MM-DD.md`.

## Risks

- Templates may end up sounding like "VibeOps itself" instead of a generic project → keep the wording generic; project name stays a placeholder.
- Introducing tokens (`{{PROJECT_NAME}}`) means `installer` needs to know token replacement → if TASK-002 did not have it, add a light placeholder-replace utility here.

## Test Plan

- Use vitest to run `init` in a tmpdir → assert each expected file exists and contains no leftover placeholder strings (e.g. `{{PROJECT_NAME}}` was substituted).
- Grep each `.vibeops/agents/*.md` for the "role / inputs / output format / forbidden" headers.
- Manual: install with `vibeops init --name test-proj` in a fresh directory and inspect with `tree`.

## Rollback Plan

- Discarding the working branch is enough.

## Implementation Plan

1. Build the same skeleton inside `templates/` from this repo's `AGENTS.md` / `.cursor/rules/` / `docs/project/` (only the tone is generalised, repo-self vs user-project).
2. Fill role / inputs / output-format / forbidden into the 4 `.vibeops/agents/*.md` files.
3. Define substitution placeholders in the 3 `.vibeops/prompts/*.md` files.
4. Write the 2 `.vibeops/workflows/*.md` files.
5. Add a simple placeholder-substitute utility to `installer` (replaces with values from `.vibeops.json` at install time).
6. Update tests.
7. Update docs.

## Result

Completed 2026-05-11. Filled in real content for the 36 templates `vibeops init` installs.

**Expansion vs the original TASK body**: per explicit user request, the content scope was expanded as follows. This Result records the expanded spec.

| Area                       | Original TASK body                                  | Actual implementation                                                                       |
| -------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `.cursor/rules/*`          | 3 files                                              | 5 files (`00-project-governance` · `01-agent-orchestration` · `02-task-workflow` · `03-git-safety` · `04-docs-update`) |
| `.vibeops/agents/*`        | 4 files (planner/builder/reviewer/releaser)         | **8 files** (`orchestrator`, `planner`, `architect`, `builder`, `reviewer`, `tester`, `docs`, `recovery`) |
| `.vibeops/prompts/*`       | 3 files                                              | 6 files (`start-project`, `create-plan`, `generate-tasks`, `implement-task`, `review-task`, `rollback`) |
| `.vibeops/workflows/*`     | 2 files                                              | 4 files (`project-start`, `task-lifecycle`, `rollback`, `notion-sync`)                       |
| `docs/project/*`           | 6 files                                              | 10 files (`00-overview`, `01-requirements`, `02-mvp-scope`, `03-architecture`, `04-tech-stack`, `05-current-state`, `06-decisions`, `07-backlog`, `08-env`, `09-deployment`) |

**File structure**:
- `templates/AGENTS.md` — project-name placeholder + guidance for the 8 agents + completion-report format.
- `templates/.cursor/rules/*.mdc` — each file has frontmatter (`description`, `alwaysApply: true`) + a short, clear policy body.
- `templates/.vibeops/agents/*.md` — frontmatter (`name`, `role`, `description`) + body (`Role / Inputs / Output Format / Rules / Forbidden`).
- `templates/.vibeops/prompts/*.md` — frontmatter (`name`, `description`, `placeholders` list) + body to paste directly into Cursor chat (defines placeholders such as `{{PROJECT_NAME}}`, `{{TASK_ID}}`, `{{TASK_PATH}}`, `{{VIBEOPS_VERSION}}`, `{{CREATED_AT}}`).
- `templates/.vibeops/workflows/*.md` — step-by-step "when and how do I use this workflow".
- `templates/docs/project/*` — section headers + guide comments (slots for `planner` / `architect`).
- `templates/docs/tasks/TASK-000-template.md` — the same 15 section headers as the TASK files in this repository.
- `templates/docs/logs/README.md` — explanation of the daily-log pattern (YYYY-MM-DD.md).

**Substitution engine**: `src/bootstrap/substitute.ts` substitutes 3 placeholders (`{{PROJECT_NAME}}`, `{{VIBEOPS_VERSION}}`, `{{CREATED_AT}}`) for `.md/.mdc/.txt/.json/.yaml/.yml/.env/.example` extensions. The installer applies it just before writing.

**Difference vs the original spec**: TASK-003's body assumed 4 agents (planner/builder/reviewer/**releaser**), but per user direction `releaser` was dropped in favour of a finer-grained 8-agent lineup. Merge / release guidance is split across the `docs` agent + the "merge guide" step of the `task-lifecycle` workflow.

### Changed files

A total of 36 new files in `templates/**`. Full list:

```
templates/AGENTS.md
templates/.cursor/rules/{00-project-governance,01-agent-orchestration,02-task-workflow,03-git-safety,04-docs-update}.mdc
templates/.vibeops/agents/{orchestrator,planner,architect,builder,reviewer,tester,docs,recovery}.md
templates/.vibeops/prompts/{start-project,create-plan,generate-tasks,implement-task,review-task,rollback}.md
templates/.vibeops/workflows/{project-start,task-lifecycle,rollback,notion-sync}.md
templates/docs/project/{00-overview,01-requirements,02-mvp-scope,03-architecture,04-tech-stack,05-current-state,06-decisions,07-backlog,08-env,09-deployment}.md
templates/docs/tasks/TASK-000-template.md
templates/docs/logs/README.md
```

In addition, `src/bootstrap/substitute.ts` handles placeholder substitution.

## Test Result

- Template file count check: `find templates -type f | wc -l` → **36** (AC#1 pass).
- Install check (sandbox): `pnpm dev init --cwd /tmp/vibeops-sandbox --name byobrowser` → 36 templates + `.vibeops.json` + `.vibeops.env.example` + `.gitignore` = **39 created**, 0 skipped. Every file has real content, not placeholder.
- Placeholder substitution check: the installed `AGENTS.md` no longer contains `{{PROJECT_NAME}}` and has been replaced with `byobrowser` (`grep '{{PROJECT_NAME}}' /tmp/vibeops-sandbox/AGENTS.md` → no match).
- Agent-definition structure check: `pnpm dev agent list --cwd /tmp/vibeops-sandbox` → all 8 agents (architect, builder, docs, orchestrator, planner, recovery, reviewer, tester) displayed with `name` + a one-line description — AC#4 pass.
- Body-structure check: `pnpm dev agent show builder --cwd /tmp/vibeops-sandbox` → all `Role / Inputs / Output Format / Rules / Forbidden` headers present.
- `docs/project/*` skeletons: each file has H2 section headers and HTML guide comments "what to fill in this section", with empty bodies clearly left for `planner` / `architect` — AC#3 pass.
- ReadLints (`src/`) → 0 issues.
- Acceptance Criteria 1, 2, 3, 4, 5, 6 all pass (note that agent / prompt counts follow the user-expanded spec, not the original TASK body).
