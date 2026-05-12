# 04 — Decisions

Decisions already made. A conflicting new proposal can only change them after being raised as a separate TASK.

## D-001 · VibeOps is a "vibe-coding bootstrapper + workflow rail"

- VibeOps is a **local CLI** that installs/generates an operating structure for **Cursor-based vibe coding** in a new project.
- VibeOps itself does not write code. Cursor writes the code from `docs/tasks/TASK-*.md`.
- Consequence: web UI, hosted dashboard, and self-hosted LLM calls are out of MVP.

## D-002 · Git is the source of truth; Notion is the dashboard

- AI execution baseline: `docs/tasks/*.md`.
- Project design / current state baseline: `docs/project/*.md`.
- Change history / rollback baseline: Git commits / branches.
- Human dashboard: Notion.
- **Not** a baseline: chat (Cursor history, Slack).
- Notion stores **metadata only** (summary, status, priority, branch, docs path, result summary) — never the detailed body.

## D-003 · One TASK at a time

- Cursor runs only one TASK per session.
- Stay within the TASK's Scope / Acceptance Criteria.
- Large refactors require their own TASK.

## D-004 · Tech stack: Node.js 20+ / TypeScript / pnpm

- Common on user machines; identical behaviour on macOS / Linux / WSL.
- No bundled DB or server. State lives in plain files (`.vibeops.json`, `.vibeops/state/**.json`).
- Config format: **JSON**. TOML / YAML are not introduced (simpler editing / validation).

## D-005 · Single CLI entry point `vibeops`

- Sub-command structure: `vibeops <group> <action> [args]` (e.g. `vibeops task start TASK-001`).
- Every mutating command offers `--dry-run` first (or an equivalent option).

## D-006 · `init` is idempotent; default is "do not overwrite"

- Existing files are skipped. Only `--force` overwrites.
- `--dry-run` prints which files would be created.

## D-007 · Rollback guides by default; destructive operations require `--confirm`

- `vibeops task rollback TASK-NNN` **only prints** which branch / commit could be rolled back, how.
- Real `git branch -D` / `git reset` / `git revert` only runs with `--confirm`.

## D-008 · TASK lifecycle is `start → prompt → check → done` (+ `rollback`)

- `start`: record base branch / base commit / task branch in `.vibeops/state/tasks/TASK-NNN.json`.
- `prompt`: print a Cursor paste-prompt built from agent + TASK + docs context.
- `check`: compare Acceptance Criteria / Test Plan against the current Git state and report.
- `done`: verify TASK file Status = `done` and Result / Test Result are non-empty. Never auto-merges.

## D-009 · Agents are defined as files

- An agent is a markdown file at `.vibeops/agents/<name>.md` describing role + prompt.
- Exposed via `vibeops agent list/show/prompt`.
- Default agents shipped in the MVP: `planner`, `builder`, `reviewer`, `releaser`. (More can be added later; the MVP starts with these four.)

## D-010 · Notion is for humans; no realtime two-way sync

- `vibeops notion sync`: Git docs → Notion (metadata push).
- `vibeops task pull`: Notion → `docs/tasks` metadata reconciliation (e.g. priority / status only).
- Webhooks / realtime / automatic polling are out of MVP.

## D-011 · VibeOps itself follows the same rules

- The VibeOps repository has its own `AGENTS.md` / `.cursor/rules/` / `docs/`.
- Its own TASKs live in `docs/tasks/TASK-*.md` and are handled one at a time.

## D-012 · Doc updates happen alongside implementation

- When implementation completes, **all three** must be updated together: `docs/project/03-current-state.md`, the TASK file's Result / Test Result, and `docs/logs/YYYY-MM-DD.md`.
- Without those three updates, the TASK is not considered done.

## D-013 · `vibeops plan` prefers interactive Q&A

- `vibeops plan` does not accept a single free-form blob. It asks **20 short questions** mixing `input` · `select` · `checkbox` · `confirm`.
- Key conventions: select / checkbox use arrow keys, checkbox toggles with Space and confirms with Enter, confirm accepts default with Enter. Checkboxes allow multiple defaults.
- On `Other` in `select` / `checkbox`, a follow-up `input` is presented immediately, and the result is normalised as the standard option label ∪ `Custom: <text>`.
- The result is stored at `.vibeops/plan/brief.json` as a **normalised `ProjectBrief` (JSON, `schemaVersion=1`)**. The Cursor prompt is always built from this brief.
- In non-TTY / CI / pipe environments, interactive entry is refused; `--brief <path>` is required. CI can reuse a pre-built `brief.json`.
- `vibeops plan` fills 8 of 10 `docs/project/` files (00, 01, 02, 04, 06, 07, 08, 09). `03-architecture` is owned by the `architect` agent; `05-current-state` is owned by `init` and TASK lifecycle.
- VibeOps still does not call LLMs directly. Cursor fills the docs from the brief. This decision is consistent with D-001 and D-002.
