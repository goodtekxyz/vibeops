# 01 — Architecture

> **Current lifecycle (2.1+):** `task add` → Cursor → `task ship` → `task merge` → optional `task sync`; Shipped follow-up via `task reship`. TASK md status: **In Progress** → **Shipped** only. See `docs/project/v3-scope.md` and `docs/project/05-current-state.md`. Sections below include **historical MVP 1–4** design (plan, notion, `task start/done`) retained for reference.

## Task lifecycle (v4 — current)

```
vibeops task add
  └─ TASK file + task branch, Status In Progress

Cursor (Ask + Agent)
  └─ plan + implement per docs/tasks/TASK-NNN-*.md

vibeops task ship TASK-NNN
  └─ Result/Test + commit + push + MR/PR, Status Shipped

vibeops task merge TASK-NNN   (or host UI)
  └─ merge MR into integration — TASK md unchanged

vibeops task sync TASK-NNN   (optional)
  └─ integration pull + delete task branch — TASK md unchanged

vibeops task reship TASK-NNN   (optional, same TASK after merge)
  └─ integrate develop + new MR/PR, Status stays Shipped
```

## Big picture

```
                       ┌──────────────────────────────┐
                       │             User             │
                       │   (inside Cursor + terminal) │
                       └───────────────┬──────────────┘
                                       │ natural language / CLI
              ┌────────────────────────┼────────────────────────┐
              │                        │                        │
              ▼                        ▼                        ▼
       ┌─────────────┐         ┌──────────────┐         ┌──────────────┐
       │   Cursor    │◀────────│   VibeOps    │────────▶│    Notion    │
       │  (Builder)  │  reads  │    (Rail)    │  syncs  │ (Dashboard)  │
       └─────┬───────┘         └──────┬───────┘         └──────────────┘
             │ writes code            │ reads/writes
             ▼                        ▼
        ┌────────────────────────────────────────┐
        │           Project repository           │
        │  AGENTS.md  .cursor/rules/  docs/      │
        │  .vibeops/  .vibeops.json  src/ ...    │
        │  (Git source of truth)                 │
        └────────────────────────────────────────┘
```

- **VibeOps** is a **local CLI** that reads/writes files in the repository. It does not call LLMs.
- **Cursor** reads `AGENTS.md` + `.cursor/rules/` + `docs/tasks/TASK-*.md` and writes the code.
- **Notion** is only the human dashboard; it is not the execution baseline.

## Structure VibeOps installs inside a project

```
<project-root>/
├─ AGENTS.md                       # entry point of operating guidance for all agents
├─ .cursor/
│  └─ rules/
│     ├─ 00-vibeops-governance.mdc
│     ├─ 01-ai-workflow.mdc
│     └─ 02-docs-update.mdc
├─ docs/
│  ├─ project/
│  │  ├─ 00-overview.md
│  │  ├─ 01-architecture.md
│  │  ├─ 02-tech-stack.md
│  │  ├─ 03-current-state.md
│  │  ├─ 04-decisions.md
│  │  └─ 05-backlog.md
│  ├─ tasks/
│  │  └─ TASK-001-*.md
│  └─ logs/
│     └─ YYYY-MM-DD.md
├─ .vibeops/
│  ├─ agents/
│  │  ├─ planner.md
│  │  ├─ builder.md
│  │  ├─ reviewer.md
│  │  └─ releaser.md
│  ├─ prompts/
│  │  ├─ plan.md
│  │  ├─ task-generate.md
│  │  └─ task-builder.md
│  └─ workflows/
│     ├─ task-lifecycle.md
│     └─ notion-sync.md
├─ .vibeops.json                   # VibeOps's own config (version, notion db ids, ...)
└─ .vibeops.env.example            # slot for NOTION_TOKEN, etc.
```

Files under `.vibeops/` **define VibeOps's behaviour**; `docs/`, `AGENTS.md`, and `.cursor/rules/` **define Cursor's behaviour**. Keeping the two separate preserves the boundary between "the installed tool" and "the project content".

## Data flow

### Bootstrap (`vibeops init`)

```
user ── vibeops init ──▶ VibeOps CLI
                              │
                              ├─ copy templates (.vibeops/templates/**) to project root
                              ├─ create .vibeops.json (project name, version, ...)
                              ├─ create .vibeops.env.example
                              └─ skip existing files unless --force overwrites them
```

### Plan (`vibeops plan`, `vibeops task generate`)

`vibeops plan` **does not accept one free-form blob.** It collects answers through 20 short questions (input · select · checkbox · confirm), turns them into a **`ProjectBrief` (normalised JSON)**, and emits a **Cursor paste prompt** based on that brief. Code generation is still done by Cursor.

```
project idea ─▶ vibeops plan (interactive Q&A · 20 questions)
                   │
                   ├─ input        : project name, one-line idea, core problem, success criteria, ...
                   ├─ select       : project type, frontend, backend, DB, ORM, package manager, agent level
                   ├─ checkbox     : target users, MVP must-have, out-of-scope, deploy, auth, integrations, risks
                   ├─ confirm      : sync to Notion dashboard?, use Git task branches?
                   └─ on "Other": follow-up input → stored as "Custom: <text>" label
                   │
                   ▼
              .vibeops/plan/brief.json   (ProjectBrief, schemaVersion=1)
                   │
                   ├─ stdout / --out : Cursor paste prompt (used to fill the 8 docs/project/* files)
                   │   files filled: 00-overview, 01-requirements, 02-mvp-scope, 04-tech-stack,
                   │                 06-decisions, 07-backlog, 08-env, 09-deployment
                   │   not filled:   03-architecture (architect agent), 05-current-state (automatic)
                   │
                   └─ --apply <Cursor response> : distribute into the 8 docs/project/* files
                                                  (write *.bak backup, then overwrite;
                                                  --dry-run shows the diff with zero actual changes)

Other entry points:
- vibeops plan --brief <path>    : skip the interactive Q&A and reuse an external brief
- vibeops plan --resume          : continue from .vibeops/plan/draft.json

In non-TTY (pipes / CI) it prints a single-line hint and exits 1 — requires interactive or --brief.

backlog decisions ───▶ vibeops task generate
                          │
                          ├─ create docs/tasks/TASK-NNN-*.md files, or
                          └─ print the TASK-generation prompt
```

ProjectBrief schema (summary): `projectName`, `oneLineIdea`, `projectType`, `targetUsers[]`, `coreProblem`, `mvpMustHave[]`, `outOfScope[]`, `techStack{frontend, backend, database, ormLayer, packageManager}`, `deploymentTargets[]`, `authRequirements[]`, `externalIntegrations[]`, `workflow{useNotionDashboard, useGitTaskBranch, agentWorkflowLevel}`, `riskAreas[]`, `successCriteria`, `meta{vibeopsVersion, createdAt, schemaVersion}`. Full details: `docs/tasks/TASK-006-plan-command.md`.

### Task lifecycle (`task start / prompt / check / done / rollback`)

```
vibeops task start TASK-NNN
   ├─ record base branch / base commit (.vibeops/state/tasks/TASK-NNN.json)
   ├─ create task branch (e.g. task/TASK-NNN-slug)
   └─ flip TASK file Status to 'in_progress'

vibeops task prompt TASK-NNN --agent builder
   └─ stitch .vibeops/agents/builder.md + the TASK file + docs context
      into a single paste-ready prompt printed to stdout

vibeops task check TASK-NNN
   └─ compare Acceptance Criteria / Test Plan checklist with the current
      Git state (branch, changed files, commit count) and report

vibeops task done TASK-NNN
   ├─ check that the TASK file Status='done' and Result/Test Result are non-empty
   └─ print merge guidance only. Never auto-merges.

vibeops task rollback TASK-NNN
   ├─ default: print guidance — which branch / commit could be rolled back, how
   └─ --confirm only: destructive operations (delete task branch, reset to base commit, ...)
```

### Notion sync (`notion init / test / sync`, `task pull`)

```
vibeops notion init   Configure NOTION_TOKEN + projects/tasks data source ids in .vibeops.env / .vibeops.json
vibeops notion test   Verify Notion API access + DB schema
vibeops notion sync   docs/tasks/*.md, docs/project/03-current-state.md → Notion (summary, status, priority, branch, docs path, result summary only)
vibeops task pull     Notion → docs/tasks/*.md metadata reconciliation (id, status, priority — metadata only)
```

VibeOps does **not** push the detailed body (Scope, Acceptance Criteria, long prose) to Notion. The detailed body lives only in `docs/tasks/*.md`.

## Components (source-code perspective)

> Concrete implementation is defined from TASK-001 onward. This document fixes intent only.

| Component       | Responsibility                                                                          |
| --------------- | --------------------------------------------------------------------------------------- |
| `cli/`          | CLI entry point and command registration (`init`, `status`, `plan`, `task ...`, `agent ...`, `notion ...`) |
| `bootstrap/`    | template copy, idempotent install, `--dry-run`, `--force` handling                      |
| `templates/`    | actual file originals to install (Cursor rules, AGENTS.md, docs/project, docs/tasks templates, agents, prompts, workflows) |
| `planner/`      | prompt builder for `plan` / `task generate` and writer of docs skeletons                |
| `lifecycle/`    | TASK state files (`.vibeops/state/tasks/*.json`), Git helpers (branch, base commit record/verify), check/done logic |
| `rollback/`     | rollback guidance printer and the destructive-op gate behind `--confirm`                |
| `notion/`       | Notion API client, DB schema verification, sync/pull mappers                            |
| `config/`       | read/write `.vibeops.json` and `.vibeops.env`                                            |
| `agent/`        | load `.vibeops/agents/*.md`, used by `agent list/show/prompt`                            |

## Command ↔ MVP ↔ component mapping

| Command                          | MVP | Component                          |
| -------------------------------- | --- | ---------------------------------- |
| `vibeops init`                   | 1   | bootstrap, templates, config       |
| `vibeops status`                 | 1   | config, lifecycle, notion (read)   |
| `vibeops agent list/show/prompt` | 1   | agent                              |
| `vibeops plan`                   | 2   | planner, templates                 |
| `vibeops task generate`          | 2   | planner, templates                 |
| `vibeops task start`             | 3   | lifecycle (Git)                    |
| `vibeops task prompt`            | 3   | agent + lifecycle                  |
| `vibeops task check`             | 3   | lifecycle                          |
| `vibeops task done`              | 3   | lifecycle                          |
| `vibeops task rollback`          | 3   | rollback                           |
| `vibeops notion init/test`       | 4   | notion, config                     |
| `vibeops notion sync`            | 4   | notion                             |
| `vibeops task pull`              | 4   | notion + lifecycle                 |

## Side-effect safeguards

- **Every mutating command** supports `--dry-run` where possible. The default is to print guidance / plan only; real changes happen only with explicit options or `--apply` / `--confirm`.
- `init` by default **skips existing files** instead of overwriting them; only `--force` overwrites.
- `task rollback` prints guidance by default; destructive Git operations run only with `--confirm`.
- Notion sync only pushes **metadata fields**, never the detailed body.
