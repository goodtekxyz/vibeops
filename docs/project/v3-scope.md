# VibeOps v3 — Product Scope

> **Status:** Implemented in `@goodtek/vibeops@1.1.0` (Git/PR workflow).  
> **Replaces:** v1 multi-command surface + v2 `TASK-mvp` / `plan` / Notion / `next` as the default product.  
> **Package:** `@goodtek/vibeops` — **1.1.x** (`task done` = push + MR/PR, no local merge).

## One-line definition

**VibeOps v3** is a small CLI that **bootstraps a Cursor-friendly repo**, **starts numbered TASKs on Git branches**, and **closes them while updating project memory files** — so Cursor always reads durable context from Git, not chat.

Cursor plans and implements. VibeOps does **files + Git + short LLM assists**. **No Notion.**

---

## Design principles

1. **Four commands only** for daily use: `init`, `task add`, `task done`, `status`.
2. **Files are the API** between CLI and Cursor — no “copy prompt from terminal” workflow.
3. **LLM in CLI only where Git/files need it:** scaffold on add, summarize + doc patches on done.
4. **Planning and coding happen in Cursor** (Ask / Agent + `@docs/tasks/TASK-NNN.md`).
5. **In-progress TASK handoff is guide-only** — CLI does not auto-run `task done` during `task add`.
6. **One TASK model:** `TASK-NNN-<slug>.md` only (no `TASK-mvp`, no dual `resolveCommandTask` paths).

---

## User workflow (target)

```text
vibeops init                    # once per repo

vibeops task add                # interactive: check state → guide if busy → new TASK + branch

  Cursor (Ask)                  # refine TASK md: Goal, Scope, AC, Test Plan
  Cursor (Agent)                # implement per TASK md

vibeops task done [TASK-NNN]    # LLM fills Result/Test + push + MR/PR (merge on host)

vibeops status                  # briefing: active TASK, branch, doc health, next hint
```

### Step detail

| Step | Who | What |
|------|-----|------|
| 1 Init | CLI | Install minimal tree (below). |
| 2 Task add | CLI | See [task add](#vibeops-task-add). Ends on task branch, **In Progress**. |
| 3 Plan | Cursor | User opens `@docs/tasks/TASK-NNN-*.md` in **Ask**; edits sections in place. |
| 4 Build | Cursor | **Agent** (or Agent + optional project Skill) implements; no CLI `start`. |
| 5 Task done | CLI | See [task done](#vibeops-task-done). |
| 6 Status | CLI | Anytime snapshot; no interactive menu. |

---

## Commands in scope

### `vibeops init`

**Purpose:** One-time project bootstrap — **canonical minimum tree only**.

**Creates (v3 template set):**

| Path | Role |
|------|------|
| `AGENTS.md` | One page: source of truth, read order, four CLI commands. |
| `.cursor/rules/` | **3 rules max**, each &lt; ~50 lines, `alwaysApply` where needed. |
| `.cursor/skills/` | **Optional in v3.0:** 0–2 skills (`plan-task`, `implement-task`); may ship in template or docs-only examples. |
| `docs/tasks/TASK-000-template.md` | Section template for new TASKs. |
| `docs/project/05-current-state.md` | Facts: stage, active TASK, next step. |
| `docs/project/06-decisions.md` | Append-only decision log. |
| `docs/project/03-architecture.md` | Living architecture (updated only when structure changes). |
| `docs/logs/README.md` | Convention for daily log files. |
| `.vibeops.json` | Project name, version metadata (no Notion block). |
| `.gitignore` | Sensible defaults if missing. |

**Does not create:**

- `.vibeops/agents/*` (8 agents) — **removed**
- `.vibeops/workflows/*`, `.vibeops/prompts/*` bulk — **removed**
- `docs/project/00-overview.md` … `07-backlog.md` full set — **not required at init** (may add stub links in AGENTS.md only)
- Notion env / DB ids — **removed**

**Flags:** `--dry-run`, `--cwd`, `--name`, Git bootstrap flags (`--git`, `--no-git`, `--initial-commit`, …) as today if low cost to keep.

---

### `vibeops task add`

**Purpose:** Start the **next slice of work now** — one new `TASK-NNN`, file on disk, task branch checked out.

**Interactive flow (default):**

1. **Current state**
   - Load actionable tasks from `docs/tasks/`.
   - If any TASK is **In Progress** (or HEAD is on a `task/*` branch with matching open TASK — same briefing rules as today’s `pickActiveTask`):
     - **Do not** auto-run `task done`.
     - **Guide only:** print TASK id, title, branch; tell user to run `vibeops task done <id>` (or finish manually), then run `task add` again.
     - **Exit non-zero** (or exit 0 with clear “aborted” — implementer choice; prefer **exit 1** so scripts fail loud).
   - If clean → continue.

2. **What are you doing?**
   - Single short prompt (one line idea).
   - **LLM (required provider):** derive `title`, `slug`, minimal TASK markdown (Status: Planned → will become In Progress at end of command).
   - If LLM unavailable: minimal template from idea (warn once).

3. **Allocate number**
   - Next `TASK-NNN` = max(existing numeric ids) + 1 (exclude `TASK-000` template).
   - **Does not** edit `07-backlog.md` or pre-plan future tasks.

4. **Write files**
   - `docs/tasks/TASK-NNN-<slug>.md`
   - Optional: `.vibeops/generated/task-build-TASK-nnn.md` one-liner pointer (“implement per TASK file”) — **nice-to-have**, not required for v3.0.

5. **Git**
   - Create `task/<slug>` from current HEAD (document: prefer **default branch** if dirty policy allows; v3 may require clean tree or governance-only dirty like today).
   - `git switch -c` / resume existing branch.
   - Stash governance paths **only if needed**, then **stash pop** after switch (regression fix from 0.7.22).
   - Set TASK **In Progress** + **Git Context** in file.

6. **End message**
   - “Open `@docs/tasks/TASK-NNN-….md` in Cursor Ask to plan, then Agent to build. Run `vibeops task done` when finished.”

**Removed from add (vs 0.7.x):**

- “Create plan using LLM” multi-turn CLI interview → **Cursor Ask** on TASK file.
- `--parent`, `--phase`, `--start` flags (start is always implied).
- Auto-close in-progress TASK via embedded `done`.

**Flags:** `--dry-run`, `--non-interactive` + `--idea` (CI/smoke only).

---

### `vibeops task done [taskRef]`

**Purpose:** Close one TASK and refresh **project memory** so the next Cursor session sees current facts.

**Default task ref:** Only TASK in **In Progress**, else TASK on current `task/*` branch, else error with hint.

**Steps:**

1. **Validate**
   - TASK file exists; on correct branch (warn if not).
   - **Result** and **Test Result** must be non-placeholder (LLM may fill first).

2. **LLM assist (same provider stack as today: Codex OAuth → Cursor Agent CLI → OpenAI API)**
   - From `git diff` + TASK body: write **Result**, **Test Result** (facts: paths, commands).
   - Propose **patches** (not full regen) for:
     - `docs/project/05-current-state.md`
     - `docs/project/06-decisions.md` (new bullets only, if decisions were made)
     - `docs/project/03-architecture.md` (**only if** structure/paths changed)
     - `docs/logs/YYYY-MM-DD.md` (append short entry, local date)
   - User-facing log: which files were updated vs skipped.

3. **Git**
   - Commit safe paths on task branch (no `node_modules` / `.next`).
   - `git push` task branch; open **MR/PR** to integration branch via `gh` / `glab` (LLM title/body).
   - Record MR/PR URL in Git Context. **No local merge** — human merges on host; CI deploys.
   - Set Status **Done** + `doneAt` only after push/MR step succeeds (or existing MR URL).

4. **No Notion sync.**

**Flags:** `--dry-run`, `--no-pr` (push only), `--cwd`.

**Removed:** `next` follow-up, `next-task-suggestion.md` generation (optional later), Notion, MVP-only `TASK-mvp` defaults.

---

### `vibeops status`

**Purpose:** Single **briefing** command (replaces separate `task status` + heavy project `status`).

**Shows:**

- VibeOps project yes/no, package version.
- Active / In Progress TASK(s) — if multiple In Progress, list all (warn).
- Focus TASK (branch-aligned), file path, Status.
- Goal excerpt; Result / Test Result filled or empty.
- Git: branch, clean/dirty, on task branch?, task branch exists?
- **Next hint** (guide only): e.g. `task done`, `task add`, or `@TASK file in Cursor`.

**Flags:** `--json`, `--cwd`.

**Removed from status:** Notion token/DB, GitHub `gh` section, Package repo fields (optional one line: `vibeops 1.x` only).

---

## LLM scope (v3)

| When | LLM does | LLM does not |
|------|----------|----------------|
| `task add` | Title, slug, minimal TASK sections | Multi-turn product interview |
| `task done` | Result/Test + memory file patches | Implement code |
| Cursor | Plan, edit TASK, write code | — |

**Providers (keep):** Codex OAuth (`~/.codex/auth.json`), Cursor Agent CLI, `OPENAI_API_KEY`.

**Remove:** `vibeops plan` session, `gatherBriefViaLlm`, MVP brief → `TASK-mvp` pipeline, done-follow-up “next task suggestion”.

---

## Cursor integration (not CLI commands)

Documented in `AGENTS.md` + rules:

| Activity | Where |
|----------|--------|
| Plan / edit TASK | Cursor **Ask**, `@docs/tasks/TASK-NNN-*.md` |
| Implement | Cursor **Agent**, same file + Scope/AC |
| Rules | `.cursor/rules/` — one TASK, git safety, update docs on done |
| Skills | Optional `.cursor/skills/` — team adds as needed |

**No** `vibeops agent`, `vibeops task prompt`, paste loops.

---

## Explicitly out of scope (delete in v3)

### CLI commands

- `plan`
- `start` (merged into `task add`)
- `next`
- `rollback` (or keep advisory one-pager in docs only — **default: delete**)
- `notion` (`init`, `test`, `sync`)
- `github` (`status`, `init`)
- `task generate`, `task pull`, `task check`, `task prompt` (v1)
- Top-level duplicate: merge into `status` / drop `task status` subcommand

### Code / dependencies (target removal)

- `src/commands/notion-*.ts`, `src/lib/notion-*.ts`
- `src/commands/github-*.ts`, `src/lib/github-*.ts`
- `src/commands/plan.ts`, `src/lib/plan-llm-*`, `src/lib/brief.ts`, `src/lib/mvp-artifacts.ts` (MVP path)
- `src/commands/next.ts`, `src/lib/workflow-guide.ts`, `src/lib/guide-state.ts` (or shrink to small “hint” helper for `status` only)
- `src/lib/notion-sync.ts`, task-pull, etc.
- `@notionhq/client` dependency
- Self-dependency `"@goodtek/vibeops"` in `package.json` if still present

### Templates

- Remove from `templates/`: `.vibeops/agents/*`, `.vibeops/workflows/*`, most `.vibeops/prompts/*`
- Trim `templates/docs/project/*` to v3 set or stop shipping unused stubs

### Installed project docs

- Notion references in `AGENTS.md`, rules, `08-env.md` — strip in v3 templates

---

## TASK file shape (v3)

**Required sections** (fewer than v1 18):

1. Status  
2. Goal  
3. Scope  
4. Out of Scope  
5. Acceptance Criteria  
6. Test Plan  
7. Git Context (CLI-maintained)  
8. Result  
9. Test Result  

Optional: MVP Phase (legacy compat — ignore in new TASKs), Implementation Plan (user fills in Cursor).

`TASK-000-template.md` updated to match.

---

## Git conventions (unchanged)

- Branch: `task/<slug>` from `parseTaskFilename`.
- Commit message: `feat(task-nnn): <short title>`.
- No force-push; `task done` pushes and opens MR/PR (merge on host).
- Governance paths: `.vibeops/**`, `docs/**` — stash/pop on branch switch when needed.

---

## Migration from 0.7.x

| User situation | Action |
|----------------|--------|
| goodtek-web numbered TASKs | Keep files; drop Notion config from `.vibeops.json`; use v3 CLI only. |
| Repos with `TASK-mvp` | One-time: finish or archive MVP TASK; use numbered `task add` going forward. |
| `node /path/to/cli.js` | `npm i -g @goodtek/vibeops@1` |
| Notion dashboard | Export/archive separately; not supported in v3. |

**Breaking:** 1.0.0 removes commands; scripts calling `vibeops plan` / `notion sync` must be deleted or pinned to `0.7.x`.

---

## Success criteria (definition of done for v3 implementation)

1. `pnpm smoke` passes with only: `init`, `task add` (non-interactive), `task done` (dry-run), `status`.
2. Fresh `vibeops init` tree matches [init](#vibeops-init) table; **no** `.vibeops/agents`.
3. `task add` with In Progress TASK **exits with guide**; does not call `done` internally.
4. `task add` on clean tree creates `TASK-001`, branch, file survives branch switch (stash pop).
5. `task done` updates `05-current-state` + TASK Result/Test; merge optional via flag.
6. `status` output fits one screen; no Notion/GitHub sections.
7. Package publishes without `@notionhq/client`; README documents 4 commands only.

---

## Implementation phases (suggested)

| Phase | Deliverable |
|-------|-------------|
| **P0** | This document + CHANGELOG “v3 planned”. |
| **P1** | Strip Notion/GitHub/plan/next; slim `cli.ts`; v3 templates + installer manifest. |
| **P2** | `task add` guide-only + simplified LLM scaffold; remove `start`. |
| **P3** | `task done` memory-file writer; slim `status`. |
| **P4** | README, 1.0.0 publish, goodtek-web dogfood note. |

---

## Open questions (defer unless blocking)

1. **`rollback`:** delete vs one-page `docs/rollback.md` — default **delete**.
2. **`task-build-*.md`:** keep as optional generated file vs drop — default **drop in v3.0**.
3. **Init Git:** keep interactive `init --git` — **yes**, low cost.

---

## Related docs

- Cursor rules/skills authoring: user’s `create-rule` / `create-skill` skills (not shipped by VibeOps).
- Historical MVP boundaries: `00-overview.md`, `02-mvp-scope.md` (pre-v3).
