# 00 — Overview

> **Product (2.1+):** See `docs/project/v3-scope.md` — `task add` / `ship` / `reship` / `merge` / `sync`; TASK status **In Progress** → **Shipped**. The sections below describe the **original MVP vision** (plan, 8 agents, Notion sync) retained for history.

## One-line definition

**VibeOps** is a **local CLI** that, when a new project starts, installs an in-repo **doc structure, Cursor rules, AGENTS.md, agent definitions, TASK templates, Git task lifecycle, and Notion dashboard sync** so that **Cursor-based vibe coding** runs on rails.

VibeOps itself does not write code. Cursor writes the code from `docs/tasks/TASK-*.md`. VibeOps is the **rail** that keeps the work from drifting.

## Problem to solve

Vibe coding (steering Cursor in natural language to produce code) is fast, but it quickly accumulates these problems:

1. There is no **single source of truth** for what to build. When the chat history disappears, so does the context.
2. Agents repeat the same work **differently**, or wander **outside scope**.
3. Features ship without a clear link between **which commit corresponds to which decision**.
4. Other people (including future you) have no **dashboard** to see the project's state.
5. Every new project re-creates the same structure **by hand**.

VibeOps solves this as a single bundle: **project bootstrap + TASK lifecycle + Notion dashboard sync**.

## Usage example — Acme Automator

If a user says "I want to build **Acme Automator**, a marketing automation SaaS", VibeOps installs the following into an empty (or existing) directory:

1. `AGENTS.md`, `.cursor/rules/*.mdc` — rules Cursor must follow.
2. `docs/project/00-overview.md` ~ `05-backlog.md` — vision, architecture, tech stack, current state, decisions, backlog.
3. `docs/tasks/TASK-001-*.md` — work units Cursor will execute.
4. `.vibeops/agents/*.md`, `.vibeops/prompts/*.md`, `.vibeops/workflows/*.md` — agent definitions, prompt templates, workflows.
5. `.vibeops.json`, `.vibeops.env.example` — VibeOps's own config and the slot for the Notion integration token.

Then real development happens inside that project — Cursor runs TASK by TASK based on `docs/tasks/TASK-*.md`. Humans and PMs watch the same TASK state through the Notion dashboard.

## Core roles of VibeOps

1. **Project Bootstrapper** — install the VibeOps operating structure in a new project, once.
2. **Project Planner** — take an idea and produce a **planning prompt** that fills `docs/project/*` plus the backlog and initial TASK skeletons.
3. **Agent-Orchestrated Workflow** — bind agent roles defined in `.vibeops/agents/*` (e.g. planner, builder, reviewer, releaser) to a TASK and emit a paste-ready prompt for Cursor.
4. **Docs as Source of Truth** — `docs/project/*` and `docs/tasks/*` are the reference for both AI and humans.
5. **Task Lifecycle** — `start → prompt → check → done` (and `rollback` when needed) express the lifetime of one TASK as commands.
6. **Git Branch / Commit / Rollback Safety** — at TASK start, the base branch / commit and task branch are recorded; rollback prints guidance by default.
7. **Notion as Human Dashboard** — Notion is the dashboard humans look at; the execution baseline lives in `docs/tasks/*.md`.
8. **Cursor as Builder, VibeOps as Workflow Rail** — Cursor writes the code; VibeOps lays the rails so the work does not scatter.

## Source-of-truth rules

| What                            | Where                                  | For whom                          |
| ------------------------------- | -------------------------------------- | --------------------------------- |
| AI execution baseline           | Git `docs/tasks/*.md`                  | Cursor, agents                    |
| Project design / current state  | Git `docs/project/*.md`                | Everyone                          |
| Change history / rollback basis | Git commits / branches                 | Developers, VibeOps rollback      |
| Human dashboard                 | Notion Project / Task DB               | You, teammates, PMs, stakeholders |
| **Not** a baseline              | Chat (Cursor history, Slack, IM)       | —                                 |

Chat is not trusted. When chat and docs disagree, **fix the docs first** and then implement.

## Vocabulary

- **VibeOps project**: a directory bootstrapped by VibeOps that owns `AGENTS.md`, `.cursor/rules/`, `docs/`, `.vibeops/`.
- **TASK**: one work unit expressed in `docs/tasks/TASK-NNN-*.md`. Cursor runs only one at a time.
- **Agent**: a role + prompt bundle defined in `.vibeops/agents/<name>.md` (e.g. builder, reviewer).
- **Backlog**: the TASK order kept in `docs/project/05-backlog.md`, including definition of done.
- **Notion dashboard**: where humans see status, priority, branch, docs path, result summary.

## MVP boundaries

| MVP | What it includes                                                                                                                                                                            |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Project Bootstrapper — `vibeops init`, `vibeops status`, install Cursor rules / AGENTS.md / `docs/project` / `docs/tasks` templates / `.vibeops/agents` / `.vibeops/prompts` / `.vibeops/workflows`, generate `.vibeops.json` and `.vibeops.env.example` |
| 2   | Project Planner — `vibeops plan`, `vibeops task generate`. Idea → planning prompt → docs/project + docs/tasks skeleton                                                                       |
| 3   | Git Task Lifecycle — `task start / prompt / check / done / rollback`, record base branch / commit / task branch, rollback safeguards (`--confirm`)                                          |
| 4   | Notion Dashboard Sync — `notion init / test / sync`, `task pull`. Notion is the human dashboard, not the source of truth                                                                     |

For per-MVP TASKs, see [05-backlog.md](05-backlog.md).

## Non-goals (out of MVP)

- Web UI / hosted dashboard.
- Direct GitHub API calls (auto-creating PRs, etc.).
- Notion webhooks / realtime two-way sync.
- VibeOps calling LLMs itself to auto-generate code (Cursor writes the code).
- Multi-project orchestration / multi-workspace.
