# Changelog

All notable changes to VibeOps are documented here.

## Unreleased

## 2.1.3 - 2026-06-08

### Changed

- **MR/PR resolution:** `task merge`, `status`, and `task sync` resolve the open PR by **`(taskBranch, baseBranch)`** via `gh` / `glab` (host is source of truth).
- **`task ship` / `task reship`:** no longer write `Merge Request` or `Pushed At` into TASK md after PR creation — **single push, clean working tree**, CI once per PR.
- **`task reship`:** archives the current open PR URL into `Previous Merge Requests` (from host lookup) in the reship metadata commit.
- **Legacy TASK files** that still have `Merge Request:` in Git Context remain supported as a fallback.

## 2.1.2 - 2026-06-08

### Changed

- **`task ship`** / **`task reship`**: commit ship/reship metadata **before** push and MR/PR creation so the branch is pushed once (avoids duplicate `pull_request` CI runs on `opened` + `synchronize`).

## 2.1.1 - 2026-06-08

### Added

- **`vibeops task reship [TASK-NNN]`** — follow-up on a **Shipped** TASK: integrate develop, archive prior MR, new MR/PR; Status stays **Shipped**.

### Changed

- **Docs:** living markdown, templates, and Cursor rules aligned with 2.1 lifecycle (`task reship`, two-status model, sync does not edit TASK md).
- **`task sync` CLI help:** description no longer says "mark Done".

## 2.1.0 - 2026-06-03

### Changed

- **TASK md status:** only **In Progress** → **Shipped** (`task ship`). Merge (CLI/UI) and **`task sync`** do not edit the TASK file.
- **`task sync`**: Git cleanup only (integration pull, delete `task/*` branches).
- **`task add`**: blocks only another **In Progress** TASK (not **Shipped**).
- Legacy statuses (Review, Done, Merged, Planned, …) normalize to **In Progress** or **Shipped** when read.

## 2.0.0 - 2026-06-03

### Breaking

- **TASK lifecycle commands renamed and split:** `task done` removed. Use **`task ship`** (submit: commit, push, PR, Status → Review), **`task merge`** (merge PR into integration), **`task sync`** (integration pull, Status → Done, branch cleanup), **`task release`** (integration → production PR).
- Daily commands: `init`, `task add`, `task ship`, `task merge`, `task sync`, `status`, `llm`. Optional: `task release`.

### Added

- **`vibeops task merge`** — default `gh pr merge` / `glab mr merge` (squash unless `--merge` / `--rebase`); `--dry-run`.
- **`vibeops task release`** — develop → main (or configured branches) release PR + merge; noop when trunk policy.

### Changed

- **`task ship`** replaces `task done`: Review on the task branch at ship; **Done** is derived from merged MR (see Unreleased — sync no longer writes TASK md).
- **`status`** next hints: ship → merge → sync.
- Templates and Cursor rules reference ship / merge / sync (rule file `03-docs-before-ship.mdc`).

## 1.1.3 - 2026-06-03

### Added

- **`vibeops task sync [TASK-NNN]`** — after the MR is merged on the host: `git fetch --prune`, fast-forward the integration branch (e.g. `develop`), delete the local task branch (`-d`, or `-D` with `--force`), and optionally delete the remote task branch (`--no-remote-delete` to skip). Resolves the task branch from the current `task/*` checkout, the latest Done TASK, or an explicit ref.

## 1.1.2 - 2026-06-03

### Fixed

- **`task done` two-phase close:** after push/MR, writes Status Done and Git Context (`doneAt`, MR URL from the prior step), commits closure metadata (`docs(task-nnn): close task metadata`), and pushes again so the remote task branch matches the TASK file instead of leaving governance changes uncommitted locally.

## 1.1.1 - 2026-05-27

### Fixed

- Removed dead `task-merge.ts` (local merge no longer used).
- `task add` checks out integration branch from `origin/<branch>` when only remote exists.
- `task done` sets Status **Done** only after push/MR succeed; skips duplicate PR when URL exists.
- Re-init creates missing integration branch on existing repos.
- `status` shows branch policy and MR/PR URL.

## 1.1.0 - 2026-05-27

### Breaking

- **`task done` no longer merges locally.** It pushes the task branch and opens a **pull/merge request** to the integration branch (`gh` / `glab`). Merge and deploy happen on the host (CI).
- **`init` requires a git remote** (`origin`) unless `--allow-no-remote` (smoke/CI).
- **`.vibeops.json` gains a `git` block** (integration/production branches, host). Re-run `vibeops init` on older projects.

### Added

- **Branch policy at init:** GitFlow lite (`develop` + `main`) or trunk (`main` only); `--git-policy`, `--integration-branch`, `--production-branch`.
- **`task add`** branches from the configured **integration** branch, not arbitrary HEAD.
- **LLM-generated MR/PR** title and body on `task done`; URL stored in TASK **Git Context**.
- **`--no-pr`** on `task done` to push only.

## 1.0.0 - 2026-05-27

### Added

- **`vibeops init --clients`**: choose **cursor**, **claude**, **codex** (≥1 required). Installs core + per-client rules/skills (`CLAUDE.md`, `.agents/skills/`, etc.).
- **Re-init guard**: existing projects prompt before overwriting templates; `docs/tasks/TASK-*.md` are preserved. Use `--yes` for non-interactive re-init.
- **`vibeops llm`**: `connect`, `status`, `use` for task add/done LLM providers.

### Breaking

- **Four commands only:** `init`, `task add`, `task done`, `status`.
- **Removed:** `plan`, `start`, `next`, `rollback`, `notion`, `github`, `task generate`, `task check`, `task prompt`, `task pull`, `agent`, and separate `task status`.
- **Removed Notion:** no `@notionhq/client`, no Notion config in `.vibeops.json`.
- **Single TASK model:** `TASK-NNN-<slug>.md` only (no `TASK-mvp` workflow).
- **`task add`:** if a TASK is In Progress, **guide only** and exit 1 — no auto `task done`.
- **Templates:** no `.vibeops/agents`, workflows, or prompts; slim `docs/project/` set.

### Added

- **`task add`** creates TASK file, task branch, and In Progress status in one step (replaces `start`).
- **`task done`** LLM assist for Result/Test Result and patches to `05-current-state`, `06-decisions`, `03-architecture`, daily log.
- **Unified `status`** briefing without Notion/GitHub sections.
- v3 Cursor rules (3) and optional skills (`plan-task`, `implement-task`).

### Fixed

- Governance stash **pop** after branch switch so new TASK files stay on disk.

## 0.7.22 - 2026-05-16

### Fixed

- **Branch switch after `task add` / `start`**: governance-only stash (`docs/tasks/`, `.vibeops/`) is **restored with `git stash pop`** after `git switch`, so a newly created TASK file is not left off-disk (ENOENT on `updateInlineStatus`).

## 0.7.21 - 2026-05-16

### Added

- **`vibeops task status`** — human briefing (or `--json`) for the active TASK: backlog counts, Goal/Result/Test Result, Git branch alignment, Cursor artifact paths, and the same **next step** hint as `vibeops next` (without the menu).

## 0.7.20 - 2026-05-16

### Changed

- **`vibeops task add`** is **interactive by default** (no required flags):
  - If a TASK is **In Progress**, asks whether to **`vibeops done`** it first (commit + merge + clean).
  - **Just create task** — short prompt, LLM-named `TASK-NNN` file, `start`, branch checkout, **In Progress**.
  - **Create plan using LLM** — Q&A → full TASK + `.vibeops/generated/task-build-TASK-NNN.md` for Cursor.
- CI: `--non-interactive` and optional `--idea`; `--dry-run` for smoke.

## 0.7.19 - 2026-05-16

### Added

- **`vibeops task add --idea "…"`** — writes the next `TASK-NNN-<slug>.md` as a **work-now slice** (links to the current In Progress TASK in Background when present). Does not edit `07-backlog.md`. Optional `--start`, `--parent`, `--phase`, `--dry-run`.

## 0.7.18 - 2026-05-16

### Fixed

- **Branch switch** stashes only **tracked** governance paths; **untracked** `.vibeops/generated/*` uses `stash -u` or is skipped so `git switch` does not fail on “did not match any file(s) known to git”.

## 0.7.17 - 2026-05-16

### Changed

- **`vibeops start`**, **`done`**, **`rollback`** with no task ref: use **TASK-mvp** when present; otherwise the **active / next backlog** TASK (`pickActiveTask`) — legacy projects without `TASK-mvp` no longer require `vibeops plan` first.

## 0.7.16 - 2026-05-16

### Changed

- **`vibeops next`** shows **Prepare git before TASK-NNN** when `start` would fail (dirty app files on `main`, etc.) instead of a failing **Start** loop.
- **`vibeops start`** prints clearer options (`commit`, `stash`, `--allow-dirty`, TASK-009 hint).

## 0.7.15 - 2026-05-16

### Fixed

- **Post-done cleanup** no longer runs `git switch -c` while a **merge is in progress**; auto-resolves `.vibeops/` / docs merge conflicts when possible and prompts `git commit` to finish the merge.

## 0.7.14 - 2026-05-16

### Fixed

- **`vibeops next`**: when Result/Test are filled and only **`.vibeops/` / docs** are dirty, shows **Finish** (`vibeops done`) instead of a stuck **Commit** loop; manual advance to Finish is preserved; Commit hints no longer say `git add -A`.

## 0.7.13 - 2026-05-16

### Fixed

- **`vibeops start`** / branch switch: when only governance paths are dirty (e.g. `.vibeops/state/guide.json`), auto-**stash** them before `git switch` so checkout does not fail.

## 0.7.12 - 2026-05-16

### Fixed

- **`vibeops start`** resumes an **existing** task branch (`git switch`) instead of failing with "Task branch already exists".
- **`vibeops next`** shows **Resume … branch** when the task branch exists but HEAD is elsewhere (e.g. stuck on `chore/vibeops-post-mvp-*`).

## 0.7.11 - 2026-05-16

### Fixed

- **Post-done cleanup** no longer runs `git add -A` on `node_modules/`, `.next/`, etc.; lists excluded paths and suggests `.gitignore`.
- **`runGit`** uses a larger `maxBuffer` and `git commit -q` to avoid `ERR_CHILD_PROCESS_STDIO_MAXBUFFER` on huge commits.
- **`vibeops done`** auto-commit uses the same safe path filter (not `git add -A`).

## 0.7.10 - 2026-05-16

### Fixed

- **`vibeops next`** stays on the current **`task/*` branch** until **`vibeops done`** (merge / Notion) — no longer jumps to the next Planned TASK when the TASK file is already **Done** but the branch is not merged.
- **Close out** step when Status is Done but you are still on the task branch; blocks starting another TASK from the manual Next flow.

## 0.7.9 - 2026-05-16

### Added

- **`vibeops next`** when **Result** / **Test Result** are empty or placeholders: writes **`.vibeops/generated/cursor-implement-<task>.md`** and tells you to **@-mention** that file in Cursor (ready-made implement prompt).

## 0.7.8 - 2026-05-16

### Fixed

- **`vibeops next`** treats `Pending.` / `TBD` / `TODO` in **Result** / **Test Result** as placeholders (no longer jumps to **Finish** right after **start**); **Implement** comes before **Commit** when sections are still empty.
- **`vibeops start`** for backlog TASKs points at the TASK file, not `mvp-build.md`.

## 0.7.7 - 2026-05-16

### Fixed

- **`vibeops start`** (and merge dirty checks) treat **`.vibeops/generated/`** (e.g. `next-task-suggestion.md`, done summaries) and other **`.vibeops/**`** paths like governance docs, so a dirty tree with only VibeOps artifacts no longer blocks starting the next TASK.

## 0.7.6 - 2026-05-16

### Fixed

- **`vibeops next`** no longer pins the guide to a stale `implement` step from `.vibeops/state/guide.json`; it re-detects from TASK + git (e.g. **Review** with Result/Test filled → **Finish** / `vibeops done`).
- **Next** on manual steps: re-checks the repo and offers **`vibeops done`** when ready; menu label distinguishes run vs advance.

## 0.7.5 - 2026-05-16

### Changed

- **`vibeops next`** on existing projects without `TASK-mvp`: picks the active backlog TASK (`in_progress` / `review` / next `planned`) or, when all numbered TASKs are **Done**, shows **Continue after MVP** (last TASK + `last-done-summary.md` / `next-task-suggestion.md`) instead of greenfield “run plan first”.
- **`next`** runnable steps use the resolved TASK id (`vibeops start TASK-017`, `vibeops done TASK-017`) for backlog work.

## 0.7.4 - 2026-05-16

### Changed

- **`vibeops done`** LLM auto-fill and next-task suggestion use the same providers as **`vibeops plan`**: **Codex OAuth** (`~/.codex/auth.json`), **Cursor Agent CLI**, then **OpenAI API key** — not only `OPENAI_API_KEY`.

## 0.7.3 - 2026-05-16

### Changed

- **`vibeops done`** auto-fills **Result** and **Test Result** in the TASK file (from git + optional LLM; placeholders like `(not yet)` are replaced). Use `--refresh-task-sections` to overwrite existing text, `--skip-summary` to skip.

## 0.7.2 - 2026-05-16

### Added

- **`vibeops done`** always writes **`.vibeops/generated/last-done-summary.md`** (plus dated archive under `done-summaries/`): TASK Result/Test Result, git log/stat, file list, patch excerpt, optional LLM narrative (`OPENAI_API_KEY`).
- **`vibeops plan`** and **`vibeops next`** include that summary when starting the next iteration (TASK-mvp + `mvp-build.md` + next-task suggestion).

## 0.7.1 - 2026-05-16

### Added

- **`vibeops done`** now runs **`vibeops notion sync` automatically** when Notion is enabled (`--no-notion-sync` to skip).
- **Post-done follow-up:** if the working tree is still dirty, offers a cleanup branch → commit → merge to `main`; when clean, writes **`.vibeops/generated/next-task-suggestion.md`** via OpenAI (when `OPENAI_API_KEY` is set).

## 0.7.0 - 2026-05-16

### Changed (breaking)

- **CLI surface reduced to the v2 MVP flow:** `init` · `plan` · `start` · `done` · `next` · `status`, plus optional `notion *`, `github *`, and `rollback`.
- **Removed:** `task *`, `agent *`, `plan --apply-planner`, legacy 20-question wizard, multi-TASK `generate` / `pull` / `add`, and agent paste prompts. Implementation is **drag `.vibeops/generated/mvp-build.md` into Cursor** only.
- **`plan`** always writes brief + `TASK-mvp` + `mvp-build.md` (no `--no-mvp`).
- **`next`** guide is MVP-only (start → implement → finish → optional Notion).

### Removed (code)

- `src/commands/task-*.ts`, `src/commands/agent-*.ts`, `src/lib/{plan-apply-planner,prompt-builder,task-generator,task-scaffold,task-prompt,task-pull,task-add-cursor,project-docs,plan-post-apply-setup}.ts`, `src/agent/*`.

## 0.6.0 - 2026-05-16

### Added (v2 MVP workflow — recommended)

- **`vibeops plan`** now writes **`docs/tasks/TASK-mvp-*.md`** and **`.vibeops/generated/mvp-build.md`** (orchestration prompt to **drag into Cursor**). Skip with **`--no-mvp`**.
- Top-level **`vibeops start`** (default **TASK-mvp**) and **`vibeops done`** (Result/Test Result, optional git summary, merge to main, delete task branch).
- **`vibeops status`** / **`vibeops next`** prefer the MVP flow when **TASK-mvp** is active.

### Note

- Legacy **`task *`**, **`--apply-planner`**, and eight-agent paste flows remain for existing projects; new work should use **plan → start → mvp-build.md in Cursor → done → next**.

## 0.5.0 - 2026-05-16

### Added

- **`vibeops next`**: interactive workflow guide for the active TASK — shows current step, your to-dos, suggested commands, and a **Next / Prev** menu with **Yes/No** (↑/↓). Runs `task start`, `task check`, `task done`, **`merge` (push + direct `git merge` into main + branch cleanup by default)**, `task done --finalize`, and `notion sync` when appropriate. Optional **`--merge-via-pr`** uses `gh pr create` + `gh pr merge`. Cursor implementation remains manual. Session history for Prev is in `.vibeops/state/guide.json`. Flags: `--non-interactive`, `--execute`, `--dry-run`, `--allow-dirty`, optional `[taskId]`.

## 0.4.0 - 2026-05-13

### Changed

- **Interactive plan LLM (`questionType`)**: system prompt prefers **`multi`** (checkbox, Space toggles) whenever several options can apply; reserve **`single`** for mutually exclusive choices. **`multi` vs `single` terminal behavior** is spelled out for the model.
- **Plan JSON parsing**: if `questionType` is missing or invalid and **two or more** `options` are present, default to **`multi`** so users get multi-select instead of a hard error or accidental single-only flow.

## 0.3.0 - 2026-05-13

### Changed

- **`vibeops plan` requires `vibeops init`**: exits early if `.vibeops.json` is missing so partial `.vibeops/` trees are not created outside a full VibeOps project.
- **Interactive LLM planning** (default): OpenAI API key, **Codex (ChatGPT OAuth)** via `~/.codex/auth.json`, or **Cursor Agent CLI**; always lists all three providers; live model catalogs (`/v1/models`, Codex `/models` with `client_version`, `agent models`); **`--model`** skips the picker. Codex uses ChatGPT-account models (default **`gpt-5.4`**); **`VIBEOPS_CODEX_CLIENT_VERSION`** / `codex --version` / bundled default for `client_version`.
- **Planning dialogue UX**: terminal **language picker** after model; **one question per turn**; **wrap up early** (`wrap` / `enough` or picker row) → `confirm` only; **go back** on pickers / `back` for text; **rough progress + ETA** line per question; **`confirm` then terminal Yes** before **`done`** ProjectBrief.
- **`--apply-planner`**: second LLM pass from `plan-prompt.md`, parses `<!-- file: docs/... -->` fences, writes **`docs/project/*`** and **`docs/tasks/*`**; interactive **commit → optional `github init` before push → push → Notion sync** prompts; **`--apply-dry-run`**, **`--no-git-commit`**, **`--push`**, **`--no-notion-sync`**; optional **`git init`**, **`notion init`**, same flow as **`vibeops github init`** when setup is missing.
- **LLM protocol / system prompt**: product-first pacing; session rule for wrap-up → `confirm` only.
- **`vibeops task start`**: allows a dirty tree when changes are limited to governance doc paths (`docs/tasks/`, `docs/project/`, `docs/logs/`, `.vibeops/state/`).

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
