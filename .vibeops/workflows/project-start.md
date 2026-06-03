# Workflow · Project Start

The first hour of a new project.

## 0. Prepare

- Start in an empty directory.
- The user has a one-to-two-paragraph **idea**.

## 1. Bootstrap

```bash
vibeops init --name <project-name>
git init && git add . && git commit -m "chore: bootstrap vibeops"
```

What gets created:
- `AGENTS.md`, `.cursor/rules/*`, `docs/project/*`, `docs/tasks/`, `docs/logs/`
- `.vibeops/agents/*`, `.vibeops/prompts/*`, `.vibeops/workflows/*`
- `.vibeops.json`, `.vibeops.env.example`

## 2. Plan

```bash
vibeops plan --idea "<one-paragraph idea>"
```

Paste the resulting prompt into Cursor. Cursor takes on the `planner` agent role and fills in four files.

- `docs/project/00-overview.md`
- `docs/project/01-requirements.md`
- `docs/project/02-mvp-scope.md`
- `docs/project/07-backlog.md`

Next, invoke `architect` to fill in `03-architecture.md` and `04-tech-stack.md`.

## 3. Backlog → TASKs

For each backlog item:

```bash
vibeops task generate --from-backlog TASK-NNN
```

A `docs/tasks/TASK-NNN-*.md` file appears.

## 4. First TASK

```bash
vibeops task start TASK-001
vibeops task prompt TASK-001 --agent builder
# paste into Cursor and let it work
vibeops task check TASK-001
vibeops task ship TASK-001
```

Read the merge guidance, then merge and push manually.

## 5. (Optional) Notion

```bash
vibeops notion init      # interactive .vibeops.env setup
vibeops notion test      # validate API access and DB schemas
vibeops notion sync      # push docs/tasks metadata to Notion
```

## 6. Daily

```bash
vibeops status           # check where you are in one second
```

Add one entry per decision or step to `docs/logs/YYYY-MM-DD.md` each day.
