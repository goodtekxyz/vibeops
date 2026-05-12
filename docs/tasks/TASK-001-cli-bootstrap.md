# TASK-001 · CLI bootstrap

## Status

done

## MVP Phase

MVP 1 · Project Bootstrapper

## Goal

Build the **minimum skeleton** of the VibeOps CLI package. After `pnpm install && pnpm run build`, `vibeops --version` and `vibeops --help` must work — nothing more. Functional commands (`init`, `plan`, …) are not wired up yet.

## Background

The VibeOps repository contains no code yet (not even a `package.json`). Every later TASK rides on top of this skeleton, so TASK-001 focuses purely on producing a **buildable starting point**: the command-routing framework and package metadata, nothing more.

## Scope

- `package.json` (name: `vibeops`, `bin.vibeops`, `engines.node >= 20`, `type: module`, `private: false` (may stay `true` during development), `scripts: build/dev/test/lint`).
- `tsconfig.json` (ES2022 modules, strict, `outDir: dist`).
- `src/cli.ts` — CLI entry point, sub-command routing library (`commander` recommended).
- `src/commands/help.ts` — default help (or commander's default).
- `src/version.ts` — re-export the version read from `package.json`.
- `.gitignore` (`node_modules/`, `dist/`, `.vibeops.env`).
- `.prettierrc`, `.eslintrc.cjs` (minimal config).
- Generate `pnpm-lock.yaml`.

## Out of Scope

- Real implementation of `vibeops init` (→ TASK-002).
- Any template files (→ TASK-003).
- All domain commands such as Notion or Git lifecycle.
- Real test cases beyond integrating the test runner (one smoke only).

## Acceptance Criteria

1. After `pnpm install`, `pnpm run build` emits artifacts in `dist/`.
2. `node dist/cli.js --version` prints the version from `package.json`.
3. `node dist/cli.js --help` shows the available command groups (`init`, `status`, `agent`, `plan`, `task`, `notion`) **at least by name**. Unimplemented commands may print a "not implemented yet" notice.
4. `package.json`'s `bin.vibeops` points to `dist/cli.js`.
5. `pnpm run test` passes at least one vitest smoke test (e.g. `cli.ts` prints the expected string for `--version`).

## Files to Inspect First

- (none — empty repository).
- `docs/project/01-architecture.md` — command ↔ component mapping table.
- `docs/project/02-tech-stack.md` — library candidates.

## Expected Files to Change

- new: `package.json`, `tsconfig.json`, `.gitignore`, `.prettierrc`, `.eslintrc.cjs`.
- new: `src/cli.ts`, `src/version.ts`.
- new: `src/commands/*.ts` (stubs for each command group — no implementation, just a "not implemented" line).
- new: `tests/cli.smoke.test.ts`.
- update: `docs/project/03-current-state.md`, this TASK's Result / Test Result, `docs/logs/YYYY-MM-DD.md`.

## Risks

- Node ESM configuration plus commander/TS compatibility tends to produce long boilerplate → keep the config minimal.
- With `bin` pointing at `dist/cli.js`, a shebang (`#!/usr/bin/env node`) is required → put it on the first line of `cli.ts`.

## Test Plan

- `pnpm install`.
- `pnpm run build`.
- `node dist/cli.js --version` → version string is shown.
- `node dist/cli.js --help` → the 6 command groups are visible.
- `pnpm run test` → vitest smoke passes.

## Rollback Plan

- Work happens on a single task branch (`task/TASK-001-cli-bootstrap`). Discarding the branch before merge fully reverts the change.

## Implementation Plan

1. `pnpm init` → write the `package.json` baseline; set name / bin / scripts / engines.
2. Install TypeScript / commander / vitest / tsx / prettier / eslint.
3. Add `tsconfig.json` (ES2022, NodeNext, strict, outDir).
4. Write `src/cli.ts`: shebang + commander bootstrap + register the command-group stubs.
5. Add stubs in `src/commands/*.ts` that print `[vibeops] not implemented yet: <cmd>`.
6. Verify `--version` / `--help` behaviour with `tests/cli.smoke.test.ts`.
7. Confirm `pnpm run build` and `pnpm run test` pass.
8. Update docs: `03-current-state.md` ("CLI skeleton works"), this TASK's Result / Test Result, and the daily log.

## Result

Completed 2026-05-11. The minimum runnable skeleton of the VibeOps CLI is in place.

- **Package metadata**: `package.json` (`name: vibeops`, `version: 0.1.0`, `type: module`, `bin.vibeops: dist/cli.js`, `engines.node: >=20`, scripts: `build / dev / typecheck / start`).
- **TypeScript**: `tsconfig.json` (ES2022, NodeNext, strict, `outDir: dist`, `rootDir: src`).
- **CLI entry point**: `src/cli.ts` — commander v12-based sub-command routing. `--version` is exposed by `src/version.ts`, which reads `package.json` directly.
- **Command structure (16)**: `init`, `status`, `plan`, `agent {list, show <name>, prompt <name> <taskId>}`, `task {generate, start <taskId>, prompt <taskId> --agent <name>, check <taskId>, done <taskId>, rollback <taskId>, pull}`, `notion {init, test, sync}`.
- **Command stubs**: 15 stub files under `src/commands/` (`init.ts`, `status.ts`, `plan.ts`, `agent-list.ts`, `agent-show.ts`, `agent-prompt.ts`, `task-generate.ts`, `task-start.ts`, `task-check.ts`, `task-done.ts`, `task-rollback.ts`, `task-pull.ts`, `notion-init.ts`, `notion-test.ts`, `notion-sync.ts`). Every stub prints `[vibeops] not implemented yet: <cmd>` plus a reference to the follow-up TASK. `task prompt` reuses `agent-prompt.ts` via inline delegation in `cli.ts`.
- **Out of scope**: real init file copy, Notion API calls, Git branch creation, rollback execution, and plan AI generation are all left to follow-up TASKs.
- **Deferred**: Acceptance Criteria #5 (one vitest smoke) — by user direction, removed from this round. Will be added in a follow-up or a dedicated polish TASK.

### Changed files

| File | Kind |
| --- | --- |
| `package.json` | new |
| `tsconfig.json` | new |
| `.gitignore` | new |
| `pnpm-lock.yaml` | new (auto-generated by pnpm) |
| `src/version.ts` | new |
| `src/cli.ts` | new |
| `src/commands/init.ts` | new |
| `src/commands/status.ts` | new |
| `src/commands/plan.ts` | new |
| `src/commands/agent-list.ts` | new |
| `src/commands/agent-show.ts` | new |
| `src/commands/agent-prompt.ts` | new |
| `src/commands/task-generate.ts` | new |
| `src/commands/task-start.ts` | new |
| `src/commands/task-check.ts` | new |
| `src/commands/task-done.ts` | new |
| `src/commands/task-rollback.ts` | new |
| `src/commands/task-pull.ts` | new |
| `src/commands/notion-init.ts` | new |
| `src/commands/notion-test.ts` | new |
| `src/commands/notion-sync.ts` | new |
| `docs/project/03-current-state.md` | update |
| `docs/tasks/TASK-001-cli-bootstrap.md` | update (Status / Result / Test Result) |

## Test Result

- `pnpm install` → resolved 35, packages +10 (commander, tsx, typescript, @types/node, …), 1.9s, exit 0.
- `pnpm typecheck` → `tsc --noEmit` zero errors, exit 0.
- `pnpm build` → `dist/cli.js` (shebang preserved), `dist/version.js`, 15 files under `dist/commands/*.js`. exit 0.
- `pnpm dev --help` → all 6 command groups (`init`, `status`, `plan`, `agent`, `task`, `notion`) exposed. exit 0.
- `node dist/cli.js --version` → `0.1.0` (matches `package.json`). exit 0.
- `node dist/cli.js task --help` → all 7 task sub-commands registered (`generate / start / prompt / check / done / rollback / pull`).
- `node dist/cli.js agent --help` → all 3 agent sub-commands registered (`list / show / prompt`).
- `node dist/cli.js notion --help` → all 3 notion sub-commands registered (`init / test / sync`).
- Stub-execution smoke: `node dist/cli.js init`, `agent prompt builder TASK-001`, `task prompt TASK-001 --agent builder`, `task rollback TASK-001` all correctly emit the `[vibeops] not implemented yet: ...` message.
- Acceptance Criteria #1, #2, #3, #4 pass. #5 (vitest) deferred this round per user direction.
