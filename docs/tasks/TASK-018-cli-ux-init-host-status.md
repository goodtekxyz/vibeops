# TASK-018 · CLI UX: init host + ship-only + status Now/Next

## Status

In Progress

## MVP Phase

Follow-on

## Goal

Improve init remote UX (ask host, create/connect, soft-gate missing CLI), remove `task reship` in favor of state-aware `task ship`, and redesign `vibeops status` as a readable Now / Next card.

## Scope

- Init: interactive host + create/connect; brew install only with consent; manual URL / skip escapes.
- Remove `task reship` CLI; keep `ship --new-cycle` (+ hidden `--reship`).
- Status human printer: NOW / NEXT / details footer; hints use ship not reship.
- Shared host CLI hints on ship/merge/release.
- Docs: README, AGENTS, templates, Cursor rules, CHANGELOG, current-state, daily log.

## Out of Scope

- Separate `vibeops github init` command.
- Auto-install on Windows without consent tools.
- Renaming internal `task-reship.ts` module.

## Acceptance Criteria

1. Interactive init asks GitHub/GitLab/Skip then Create/Connect (when no origin).
2. Missing CLI shows install hints; optional brew with consent; URL or skip works.
3. `vibeops task reship` is not a registered command; `task ship --new-cycle` works.
4. `vibeops status` prints NOW and NEXT sections; next lines do not mention reship.
5. typecheck, tests, and smoke pass.

## Git Context

- Base branch: `main`
- Task branch: `task/task-018-cli-ux-init-host-status`

## Result

- Init remote: ask GitHub/GitLab/Skip → Create/Connect; soft-gate for missing `gh`/`glab` (hints, optional brew with consent, URL, or skip). Module: `src/lib/git-host-cli.ts`, rewrite `src/lib/git-remote.ts`; init next-steps skip redundant push when bootstrap already ran.
- Removed `task reship` CLI (`src/commands/task-reship.ts`); `ship --new-cycle` + hidden `--reship`. User-facing docs/rules/templates/workflows updated to ship-only.
- `vibeops status` human layout: NOW / NEXT / details footer (`src/commands/status.ts`); `NextHint` `task-ship-followup` replaces `task-reship`.
- Shared host CLI hints on ship/merge/release via `formatHostCliHint`.
- Tests: `tests/git-host-cli.test.mjs`. Smoke no longer calls `task reship`.

## Test Result

- `pnpm smoke` — typecheck, build, 14 tests pass, smoke OK.
- `node dist/cli.js task --help` — no `reship` command; `task reship` → unknown command.
- `node dist/cli.js status` — prints NOW / NEXT / footer.
- npm: `@goodtek/vibeops@2.5.0` published; `npm view` reports `2.5.0`.
