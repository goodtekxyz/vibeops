# TASK-013 · GitHub repository setup

## Status

Review

## MVP Phase

Follow-on (post-MVP 4)

## Goal

Let the VibeOps project connect interactively to a GitHub repository, or create one when none exists. The core commands are `vibeops github init` / `vibeops github status`.

## Background

Once MVP 1–4 are done, the user connects to GitHub via one of two flows:

1. Take a pre-existing repo URL, attach it with `git remote add`, and manually edit `package.json`'s `repository` / `homepage` / `bugs`.
2. Visit the GitHub web UI, create an empty repo, copy the SSH/HTTPS URL, then do step 1.

To stay true to VibeOps's identity as a CLI rail, both flows should be expressible as commands. That said, **GitHub integration is a follow-on feature separate from the core MVP 1–4** and therefore lives in its own TASK.

## Scope

### `vibeops github status`

Read-only inspection:

- Whether the `gh` CLI is installed.
- `gh auth status` authentication state.
- The `origin` URL from `git remote -v`.
- Whether `origin` is a GitHub URL (`parseGitHubRemote`).
- The `github` section in `.vibeops.json`.
- `repository` / `homepage` / `bugs` in `package.json`.
- Print the result in ~6 readable lines.

### `vibeops github init` (interactive)

Runs in this order; every Yes/No is `yesNoSelect` (loop:false, pageSize:2).

A. **`gh` CLI installed?** — when missing, guide `brew install gh` and exit.

B. **`gh auth status`** — when unauthenticated, guide `Run gh auth login first`. If the user says Yes to `Run gh auth login now?`, child-process `gh auth login`; otherwise exit.

C. **Current git remote** — if `origin` exists, "Use this remote?" Yes → extract owner/repo + update the `.vibeops.json github section` + (optional) update `package.json`. If `origin` is missing, branch on "Create a new GitHub repo?" Yes / No.

D. **Create a new repo** — `gh api user --jq .login` for the default owner, default repo name from package.json `name` or directory name, default description from package.json `description`, public/private select. `gh repo create <owner>/<repo> --public|--private --source=. --remote=origin --description "..."`. Do not push.

E. **Connect to an existing repo** — user-entered URL or `owner/repo` slug → validate via `parseGitHubRemote` → `git remote add origin <url>`. If `origin` already exists, ask separately whether to change it (default No).

F. **Update package.json** — `repository.url`, `homepage`, `bugs.url`. Only when the user said Yes; re-confirm overwriting when prior values exist.

G. **Update .vibeops.json** — `github.enabled = true`, `github.mode = "gh-cli"`, `github.owner`, `github.repo`, `github.remote = "origin"`, `github.visibility`, `github.url`.

### Options

- `--dry-run` — 0 command executions / 0 file edits. Plan only.
- `--yes` — proceed with safe defaults (skip interactive).
- `--owner <owner>` / `--repo <repo>` / `--public` / `--private` — directly specify visibility / repo info.
- `--remote <name>` — use a remote name other than origin.
- `--connect <owner/repo or url>` — connect to an existing repo without creating a new one.
- `--no-package-update` — do not modify `package.json`.
- `--cwd <path>` — run from another directory.

### gh helper (`src/lib/github-cli.ts`)

- `isGhInstalled()`.
- `ghAuthStatus()` — authenticated? + (when applicable) the username.
- `ghCurrentUser()` — output of `gh api user --jq .login`.
- `ghRepoExists(owner, repo)` — exit code of `gh repo view <owner>/<repo>`.
- `ghCreateRepo({ owner, repo, visibility, source, remote, description, dryRun })`.
- `ghAuthLoginInteractive()` — run `gh auth login` with stdio inherited.
- `parseGitHubRemote(url)` — supports ssh / https / `owner/repo` slug.
- `gitRemoteList(cwd)` / `gitRemoteAdd(cwd, name, url)` / `gitRemoteSetUrl(cwd, name, url)` (read-only / mutation aligned in one module).
- All `child_process` calls split into args arrays so shell injection is blocked. Never print tokens to stdout.

### package.json helper (`src/lib/package-json.ts`)

- `readPackageJson(cwd)` — returns `null` when missing.
- `updatePackageRepositoryFields(cwd, { owner, repo, dryRun })` — returns the list of changed fields and the write result.

```json
{
  "repository": { "type": "git", "url": "git+https://github.com/<owner>/<repo>.git" },
  "homepage": "https://github.com/<owner>/<repo>#readme",
  "bugs": { "url": "https://github.com/<owner>/<repo>/issues" }
}
```

### `.vibeops.json` schema extension

```ts
interface GithubConfig {
  enabled: boolean;
  mode: "gh-cli";
  owner: string;
  repo: string;
  remote: string;       // "origin"
  visibility: "public" | "private" | "";
  url: string;
}
```

## Out of Scope

- GitHub Actions / CI workflow creation.
- Direct REST API calls using `GITHUB_TOKEN` — this TASK centres on the `gh` CLI; a fallback is a future candidate.
- Automatic `git push`. The user pushes themselves.
- Multi-remote management.
- Auto PR / issue / label sync.
- Behavioural changes to MVP 1–4 commands.

## Acceptance Criteria

1. `vibeops github status` prints a short 6-line result and is read-only.
2. `vibeops github init --dry-run` prints the plan only, with no file / command changes.
3. `vibeops github init` asks every Yes/No through `select` only (no `y/n` typing).
4. The `--connect <owner/repo or url>` flow plans only `git remote add origin <url>` and does not call `gh repo create`.
5. `--no-package-update` blocks any change to `package.json`.
6. When `--public` / `--private` is present, the visibility question is omitted.
7. `parseGitHubRemote` parses all three: ssh / https / `owner/repo` slug.
8. The `github` section in `.vibeops.json` merges safely without touching the existing `notion` section.
9. When `gh` is absent or unauthenticated, exit cleanly with clear guidance.
10. Even when `--dry-run` + `--yes` are combined, zero mutations occur.

## Files to Inspect First

- `AGENTS.md`
- `README.md`
- `package.json`
- `.vibeops.json`
- `docs/project/00-overview.md`
- `docs/project/01-architecture.md`
- `docs/project/03-current-state.md`
- `docs/project/04-decisions.md`
- `src/cli.ts`
- `src/lib/config.ts`
- `src/lib/git.ts`

## Expected Files to Change

- new: `src/lib/github-cli.ts`, `src/lib/package-json.ts`, `src/commands/github-status.ts`, `src/commands/github-init.ts`, `docs/tasks/TASK-013-github-repository-setup.md`.
- update: `src/cli.ts`, `src/types/config.ts`, `src/lib/config.ts`, `README.md`, `docs/project/03-current-state.md`, `docs/logs/2026-05-11.md`.

## Risks

- `gh repo create` is a real mutation, so `--dry-run` / interactive confirmation are essential.
- `git remote add` is also a mutation and needs a dry-run gate.
- Preserve existing `package.json#repository` values (the placeholder URL set by TASK-012).
- `gh auth login` occupies the user's TTY via a child process → never auto-execute under `--dry-run` / `--yes` / non-TTY.
- `gh` output parsing can vary by version — the core signals are the exit code and the single-line `gh api user --jq .login` output.

## Test Plan

- `pnpm typecheck`
- `pnpm build`
- `node dist/cli.js github --help`
- `node dist/cli.js github status`
- `node dist/cli.js github init --dry-run`
- `node dist/cli.js github init --dry-run --owner goodtek --repo vibeops --public`
- `node dist/cli.js github init --dry-run --connect goodtek/vibeops`
- `node dist/cli.js github init --dry-run --connect https://github.com/goodtek/vibeops.git`
- `node dist/cli.js github init --dry-run --no-package-update --connect goodtek/vibeops`
- (Optional) actual repo create / connect is done by a human separately.

## Rollback Plan

- Revert code via git revert or branch-delete.
- If origin is misconfigured by accident, recover with `git remote remove origin`.
- If `gh repo create` runs by mistake, delete the repo via the GitHub web UI and `git remote remove origin`.

## Git Context

(populated during the run — `task start TASK-013` records base branch / base commit / task branch automatically)

## Notion Page

(none — TASK-013 is a target of Notion sync, but only its docs path is synced)

## Implementation Plan

1. Add the `GithubConfig` type and `DEFAULT_GITHUB_CONFIG` to `src/types/config.ts`.
2. Add `parseGithubSection`, `mergeGithubConfig` to `src/lib/config.ts`.
3. Write `src/lib/github-cli.ts` — gh / git remote helpers.
4. Write `src/lib/package-json.ts` — read package.json / update repository fields.
5. Write `src/commands/github-status.ts` — read-only inspection output.
6. Write `src/commands/github-init.ts` — interactive flow + flag support + dry-run.
7. Register `github status` / `github init` in `src/cli.ts`.
8. Update README / 03-current-state / logs / TASK-013 Result / Test Result.
9. Run typecheck + build + the verification commands above.

## Result

Within the TASK-013 scope, VibeOps can now interactively connect to a GitHub repository or create a fresh one. Every mutation can be previewed with `--dry-run`, the tool does not store `GITHUB_TOKEN`, and zero automatic `git push` calls occur.

### Summary of changes

- `src/types/config.ts`: added `GithubConfig` / `GithubVisibility` / `DEFAULT_GITHUB_CONFIG`. Added the optional `VibeopsConfig.github?: GithubConfig` field.
- `src/lib/config.ts`: added `parseGithubSection` + `mergeGithubConfig(base, patch)`. Empty strings preserve prior values; boolean / enum overwrites; same safe-merge pattern as the Notion section. The existing `notion` section is not touched.
- New `src/lib/github-cli.ts`:
  - `runGh(args)` — every call uses `execFile` with an args array (blocks shell injection).
  - `isGhInstalled` / `ghAuthStatus` (extracts username + hosts; masks gh tokens) / `ghCurrentUser` (`gh api user --jq .login`) / `ghRepoExists` / `ghCreateRepo` / `buildGhCreateRepoArgs` (for the dry-run preview).
  - `ghAuthLoginInteractive` — `spawn` `gh auth login` with stdio:inherit. The caller is responsible for the dry-run / non-TTY / `--yes` guards.
  - `parseGitHubRemote` — handles four shapes: ssh (`git@github.com:owner/repo.git`), https (`https://github.com/owner/repo`), `git+https`, and the `owner/repo` slug.
  - `gitRemoteList` / `gitRemoteAdd` / `gitRemoteSetUrl` — helpers delegating to `runGit`.
- New `src/lib/package-json.ts`:
  - `readPackageJson(cwd)` — returns `null` on JSON-parse failure / missing file. Preserves the raw string too.
  - `buildRepositoryFieldsPatch({ owner, repo })` produces the canonical pattern.
  - `updatePackageRepositoryFields(...)` — updates only `repository` / `homepage` / `bugs`, preserves other fields, keeps existing indent (2-space / tab). No write when nothing changes.
- New `src/commands/github-status.ts`:
  - Read-only 6 lines (`gh installed / gh authenticated / git remote origin / config enabled / package repo`).
  - Marks non-GitHub origin / non-github package.json yellow. Ends with one recommended-command line.
  - `--json` for a machine-readable JSON. exit code 0 — CI-probe safe.
- New `src/commands/github-init.ts`:
  - Interactive: `yesNoSelect` based (0 `y/n` typing).
  - Stages A/B (gh install / auth) — in `--dry-run`, prints warnings and continues planning. In real mode, when unauthenticated, asks `Run gh auth login now?`; on Yes, child-process spawn.
  - Path decision: one of `use-existing` / `create-new` / `connect-existing`. When `--connect` is set, force connect-existing.
  - Stage F: when `package.json#repository` exists, ask a separate overwrite confirmation (default No). In non-interactive mode, overwriting requires `--yes`. `--no-package-update` blocks everything.
  - Stage G: `.vibeops.json#github` merge — preserves the existing `notion` section.
- `src/cli.ts`: `vibeops github` group + `status` / `init`. Handles `--no-package-update`.
- `scripts/smoke.mjs`: added 2 cases — `github status` / `github init --dry-run --connect goodtek/vibeops`.
- `README.md`: "GitHub Setup" section + Command Flow tree update + a Security Notes line.
- `docs/project/03-current-state.md`: refreshed stage / components / command tree / next TASK / what's missing.

### Changed files

- `src/types/config.ts`
- `src/lib/config.ts`
- `src/lib/github-cli.ts` (new)
- `src/lib/package-json.ts` (new)
- `src/commands/github-status.ts` (new)
- `src/commands/github-init.ts` (new)
- `src/cli.ts`
- `scripts/smoke.mjs`
- `README.md`
- `docs/project/03-current-state.md`
- `docs/tasks/TASK-013-github-repository-setup.md`

## Test Result

### Static / build

- `pnpm typecheck` ✅ exit 0.
- `pnpm build` ✅ exit 0.
- `ReadLints` (`src/cli.ts`, `src/lib/config.ts`, `src/lib/github-cli.ts`, `src/lib/package-json.ts`, `src/commands/github-init.ts`, `src/commands/github-status.ts`, `src/types/config.ts`) ✅ 0 warnings.

### CLI smoke

All ✅:

- `node dist/cli.js --help` — top-level `Commands` exposes the `github` group.
- `node dist/cli.js github --help` — exposes `status` / `init`.
- `node dist/cli.js github init --help` — exposes 9 options (`--dry-run / --yes / --owner / --repo / --public / --private / --remote / --connect / --no-package-update / --cwd`).
- `node dist/cli.js github status` — 6 lines + 1 recommendation line. Works even without gh installed.
- `node dist/cli.js github status --json` — machine-readable JSON.
- `node dist/cli.js github init --dry-run` exit 1 — friendly guidance (`--connect` or `--owner --repo` required).
- `node dist/cli.js github init --dry-run --owner goodtek --repo vibeops --public` — prints `Path: create-new` + `gh repo create goodtek/vibeops --public --source=<cwd> --remote=origin --description …` plan.
- `node dist/cli.js github init --dry-run --connect goodtek/vibeops` — `Path: connect-existing` + `git remote add origin https://github.com/goodtek/vibeops` plan.
- `node dist/cli.js github init --dry-run --connect https://github.com/goodtek/vibeops.git` — https url also fine.
- `node dist/cli.js github init --dry-run --connect git@github.com:goodtek/vibeops.git` — ssh url also fine.
- `node dist/cli.js github init --dry-run --no-package-update --connect goodtek/vibeops` — prints `--no-package-update — 0 package.json writes`.
- `node dist/cli.js github init --dry-run --connect goodtek/vibeops --remote myorigin` — plans `git remote add myorigin ...`.
- `pnpm smoke` — all 7 cases pass.

### Security / policy verification

- `--dry-run` mutation count is 0: `gh repo create` / `git remote add` / `git remote set-url` / `package.json` write / `.vibeops.json` write — none happens.
- Zero auto-runs of `gh auth login`. In any combination of `--dry-run` / `--yes` / non-TTY, the TTY child process is never forcibly seized.
- Zero `GITHUB_TOKEN` storage. Auth is handled by `gh auth`.
- Overwriting an existing origin remote is rejected by default — changes require an explicit Yes/No (default No).
- Zero auto-runs of `git push`. The Done message instructs the user to run `git push -u <remote> <branch>` themselves.
- Every `gh` child-process call uses an args array (`execFile`). Masks `gh*_…` token patterns / `Authorization: Bearer …`.

### Remaining risks

- The actual `gh repo create` / `git remote add` scenarios must be exercised by a human (the sandbox has no gh installed; only dry-runs are verified here). For a real run, the recommended order is (a) `gh auth login` for auth → (b) `vibeops github init --dry-run` to inspect the plan → (c) drop `--dry-run` and run.
- Variations in `gh` versions can change the `gh auth status` output format, which may make username extraction fail — `username: null` is the safe fallback, and the auth-state decision itself is guarded by the `Logged in to` pattern.
- `parseGitHubRemote` does not support enterprise GitHub (`github.example.com`). A polish round can extend it via a host argument.
- TASK-013 Status is `Review`. After a human / Reviewer Agent goes through one real `gh auth login` + actual-run scenario, finalise with `vibeops task done TASK-013 --finalize`.

## Review Notes

- This TASK sits outside the core MVP flow. The reviewer should confirm GitHub integration did not perturb existing commands (build / start / check / done / rollback, …).
- The `gh auth login` flow seizes the user's TTY via a child process. Verify it does not auto-run under CI / `--dry-run` / `--yes`.
