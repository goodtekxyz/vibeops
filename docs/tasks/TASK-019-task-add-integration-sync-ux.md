# TASK-019 · task add integration sync UX

## Status

In Progress

## Goal

Make `vibeops task add` fail clearly when integration cannot be fast-forwarded, avoid half-created TASKs, and resume incomplete adds.

## Scope

- Diagnose ff-only failure: dirty / ahead / diverged / pull_failed with copy-paste fixes
- Preflight sync **before** writing TASK markdown
- Resume: In Progress without task branch / Git Context → `task add` finishes branch setup
- Share diagnosis with `vibeops pull`

## Out of Scope

- Auto `reset --hard` or auto-rebase
- Changing ff-only policy

## Acceptance Criteria

1. Diverged develop prints ahead/behind and recovery commands; no opaque "Resolve manually"
2. New `task add` does not create a TASK file when preflight sync fails
3. Incomplete TASK (file, no branch) resumes on next `task add`
4. Smoke still works with `--allow-no-remote`

## Result

- Added `src/lib/git-integration-sync.ts` (`diagnoseIntegrationSync`, `ensureIntegrationSynced`)
- `task-add` preflight + incomplete resume; `task-start` uses shared sync helper
- `pull` prints the same diagnosis on ff-only failure
- Tests: `tests/git-integration-sync.test.mjs`

## Test Result

- `pnpm smoke` OK
- `node --test tests/git-integration-sync.test.mjs` — 3 pass
