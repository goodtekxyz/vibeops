# TASK-017 · Public release polish

## Status

Review

## MVP Phase

Follow-on (post-MVP 4, public release)

## Goal

Polish VibeOps into an open-source CLI that can actually be published to npm publicly. Change the npm package name to `@goodtekxyz/vibeops`, keep the brand name `VibeOps` and the CLI command `vibeops` as-is. Unify the README · CHANGELOG · in-program logs / help / error messages into a single English tone suitable for public release.

> ID collision note: TASK-016 · Notion env template cleanup on the same date is already in Review, so this work bumps to TASK-017. The user referenced "TASK-016 · Public release polish" in conversation, but per the ID-preservation policy (identical to 011 / 012 / 015 / 016 follow-up patterns), we move to the next number.

## Background

TASK-012 completed the basic npm packaging skeleton, but at that point the package name was the unscoped `vibeops` and the README still embedded an internal fictional example (`BYOBrowser`) and MVP-phase labels. An actual public release needs (a) publishing under the goodtek organisation scope and (b) cleaning the internal-development scars so external readers can engage without friction. Program output is also a mix of Korean and English — not friendly to a global audience.

## Scope

- `package.json`
  - Rename `name` to `@goodtekxyz/vibeops`.
  - Keep / verify `bin`, `repository`, `homepage`, `bugs`, `author`, `license`.
  - Add `publishConfig: { access: "public" }` — avoids the scoped-package private-by-default trap.
- `LICENSE` stays MIT (no change; verified).
- `CHANGELOG.md`
  - Add a new `0.2.0 - 2026-05-12` entry: package rename · English unification of README/CHANGELOG/CLI text · Acme Automator example · Support contacts, etc.
  - Rewrite the existing `0.1.0` entry without `MVP 1 / 2 / 3 / 4` phase labels in a feature-bundle tone.
- `README.md`
  - Replace the "BYOBrowser Example Flow" section with "Quick Tutorial: Acme Automator".
  - Remove every BYOBrowser remnant (e.g. `BYOBrowser-style scaffolded directory`).
  - `MVP Features` → `Features`. Drop the internal MVP1~4 labels.
  - Clean Runner Modes wording like `not implemented in the MVP` / `future maybe`.
  - Clean `post-MVP`, `MVP boundaries`, `No planned MVP support for ...` from GitHub Setup, Roadmap, Documentation.
  - Remove internal numeric references like "TASK-007 through TASK-011" from Roadmap — meaningless to outsiders.
  - Install instruction `npm install -g vibeops` → `npm install -g @goodtekxyz/vibeops`.
  - Add a new "Support" section:
    - Bugs / setup issues / usage questions → support@goodtek.xyz.
    - Collaboration / feedback → hello@goodtek.xyz.
- `src/cli.ts`
  - Unify all `.description()` / `.option()` text to English. Drop internal labels like "(MVP 1)" / "(TASK-010)" / "(post-MVP 4)".
- `src/commands/*.ts`
  - Localise every user-facing Korean message in `log.info` / `log.warn` / `log.error` / `log.ok` / `throw new Error(...)` to English.
- `src/lib/*.ts`
  - Same. Focus on user-displayed strings in prompt-builder, brief, notion-* — code comments (mixed English/Korean) can stay.
- `src/types/config.ts`
  - Replace the comment `BYOBrowser-style scaffolded directory` with a generic example like `Acme Automator-style scaffolded directory` to remove the BYOBrowser remnant.
- `templates/.vibeops/agents/planner.md`
  - Replace the one-line `BYOBrowser` example with a generic example.
- Verification
  - `pnpm typecheck` / `pnpm build` / `pnpm smoke` pass.
  - `pnpm publish --dry-run --access public --no-git-checks` passes under `@goodtekxyz/vibeops` and the package contents only include intended files.
- Doc updates
  - `docs/project/03-current-state.md` / this TASK file's Result / Test Result.

## Out of Scope

- Actual `npm publish` — dry-run only.
- GitHub release creation / git tag.
- Behavioural code changes. Functional regression must be zero.
- Full Korean → English translation of template markdown bodies (e.g. `templates/AGENTS.md`, `templates/.cursor/rules/*.mdc`, `templates/docs/project/00-overview.md`, …). The "in-program logs / help / errors" definition in this TASK only covers CLI / src code output. Template-body localisation is a follow-up.
- Removing MVP phrasing from vibeops's own design docs under `docs/project/` — these are not packaged in npm (not in `package.json#files`) and remain historical records; current facts are owned by `03-current-state.md`.

## Acceptance Criteria

- `package.json` has `name = "@goodtekxyz/vibeops"`, `bin.vibeops = "dist/cli.js"`, `publishConfig.access = "public"`.
- `pnpm publish --dry-run --access public --no-git-checks` exits 0, with output confirming `name: @goodtekxyz/vibeops`.
- `pnpm typecheck` / `pnpm build` / `pnpm smoke` all exit 0.
- `node dist/cli.js --help` output contains 0 Korean characters (`[\uac00-\ud7a3]`).
- `node dist/cli.js init --help` / `task generate --help` / `notion test --help` / `github init --help` outputs contain 0 Korean characters.
- README contains 0 occurrences of `BYOBrowser` / `MVP 1` / `MVP 2` / `MVP 3` / `MVP 4`.
- README contains `support@goodtek.xyz` and `hello@goodtek.xyz` at least once each.
- CHANGELOG contains 0 occurrences of `MVP 1` / `MVP 2` / `MVP 3` / `MVP 4`.
- `src/cli.ts` contains 0 Korean characters.
- `src/types/config.ts` contains 0 `BYOBrowser`.
- `templates/.vibeops/agents/planner.md` contains 0 `BYOBrowser`.
- `pnpm smoke` passes on the new command output without regression.

## Files to Inspect First

- `package.json`, `CHANGELOG.md`, `LICENSE`, `README.md`
- `src/cli.ts`, `src/commands/**`, `src/lib/**`, `src/status/format.ts`
- `src/types/config.ts`
- `templates/.vibeops/agents/planner.md`

## Expected Files to Change

- `package.json`, `CHANGELOG.md`, `README.md`
- `src/cli.ts`
- `src/commands/{init,status,plan,task-*,notion-*,github-*,agent-*}.ts` (user-facing strings)
- `src/lib/{brief,prompt-builder,task-generator,task-scaffold,task-summary,project-docs,notion-{schema,sync,target,client,env,discovery},task-pull,github-cli,package-json,inquirer-helpers}.ts` (user-facing strings)
- `src/agent/prompt.ts`
- `src/types/config.ts`
- `templates/.vibeops/agents/planner.md`
- `docs/project/03-current-state.md`
- `docs/tasks/TASK-017-public-release-polish.md` (this file)

## Risks

- Broad string substitution → regex matching mistakes can affect functionality. Mitigation: detect regression at every step via typecheck + build + smoke (8 cases).
- `pnpm publish --dry-run --access public` depends on the npm registry's scoped-package behaviour. Actual publish requires identity policy / 2FA, so a dry-run pass does not guarantee an actual publish success.
- `MVP Phase` is a Notion DB property name and must stay as-is (user-data compatibility). Schema / sync / status / template all keep the `MVP Phase` key. The README's "remove MVP phrasing" rule explicitly carves out this one exception.
- Replacing BYOBrowser → Acme Automator can momentarily break external searches / links. Impact is small because the package is not yet public.

## Test Plan

- `pnpm typecheck`
- `pnpm build`
- `pnpm smoke`
- `node dist/cli.js --help` / `node dist/cli.js init --help` / `node dist/cli.js task generate --help` / `node dist/cli.js notion test --help` / `node dist/cli.js github init --help` — confirm 0 Korean characters in output via grep.
- README · CHANGELOG · src/cli.ts grep for residue strings (`BYOBrowser`, `MVP 1`, …) returning 0.
- `pnpm publish --dry-run --access public --no-git-checks` exits 0 + package name `@goodtekxyz/vibeops` confirmed.

## Rollback Plan

`package.json` name change + `src/cli.ts` translation + README/CHANGELOG edits are all text changes, so a Git revert fully restores them. No side effects beyond dry-run publish.

## Git Context

- Branch: directly on main.
- Touched paths: `package.json`, `CHANGELOG.md`, `README.md`, `src/**`, `templates/.vibeops/agents/planner.md`, `docs/**`.

## Notion Page

Not connected.

## Implementation Plan

1. `package.json` name → `@goodtekxyz/vibeops`, add `publishConfig.access`.
2. Tidy `CHANGELOG.md` 0.1.0 tone + add the new 0.2.0 entry.
3. Full rewrite of `README.md`: BYOBrowser → Acme Automator example / remove MVP labels / add Support section / install command uses the scoped name.
4. Unify `src/cli.ts` to English — description / option text + remove "(MVP 1)" / "(TASK-010)" / "(post-MVP 4)" labels.
5. Generalise the BYOBrowser comment in `src/types/config.ts`.
6. Replace the BYOBrowser example in `templates/.vibeops/agents/planner.md`.
7. Unify user output strings to English in `src/commands/*.ts` + `src/lib/*.ts` (file by file).
8. Verify typecheck / build / smoke pass.
9. Verify `pnpm publish --dry-run --access public --no-git-checks` passes.
10. Update `03-current-state.md` / this TASK file's Result / Test Result.

## Result

- `package.json`: `name = "@goodtekxyz/vibeops"`, `version = "0.2.0"`, `publishConfig.access = "public"`. `bin`, `repository`, `homepage`, `bugs`, `author = "VibeOps contributors"`, `license = "MIT"` retained / verified.
- `CHANGELOG.md`: added new `0.2.0 - 2026-05-12` entry (Highlights / Added / Changed / Removed / Verification structure). Removed every `MVP 1 / 2 / 3 / 4` label from the existing `0.1.0` entry and rewrote it in feature bundles (Project bootstrap, Plan, Task generation, Git task lifecycle, Notion dashboard sync, Packaging).
- `README.md`: full rewrite. Removed the BYOBrowser example / "MVP Features" / internal phase labels / "future maybe" / "post-MVP". Introduced "Quick Tutorial: Acme Automator". Install command `npm install -g @goodtekxyz/vibeops`. New "Support" section (support@goodtek.xyz / hello@goodtek.xyz / issue tracker). One line in the Notion section notes `MVP Phase` is a compatibility-name free-form select. The status-output example was also updated to `@goodtekxyz/vibeops 0.2.0`.
- In-program strings translated to English (user output only; code comments preserved):
  - `src/cli.ts`: `--description`, every command/subcommand `description` text translated. Removed internal labels `(MVP 1)` / `(TASK-010)` / `(post-MVP 4)`.
  - `src/commands/notion-init.ts`, `notion-test.ts`, `notion-sync.ts`, `github-init.ts`, `github-status.ts`, `plan.ts`, `task-pull.ts`, `task-done.ts`, `task-rollback.ts`, `task-generate.ts`: every `log.info` / `log.warn` / `log.error` / `log.ok` / `throw new Error(...)` / guidance message localised.
  - `src/lib/brief.ts`, `prompt-builder.ts`, `task-generator.ts`, `task-summary.ts`, `task-scaffold.ts`, `notion-schema.ts`, `notion-sync.ts`, `notion-target.ts`, `inquirer-helpers.ts`, `task.ts`: user-facing strings translated. Brief markdown headers, placeholders in generated TASK files (`(not yet)` / `(unassigned)`), Notion schema descriptions, and generated TASK prompt body text all unified in English.
  - `src/agent/prompt.ts`: FOOTER translated (Role / Inputs / Output Format / Rules / Forbidden + completion-report guidance).
  - `src/types/config.ts`: replaced the comment `BYOBrowser-style scaffolded directory` with the generic "scaffolded directory that has not adopted Node tooling yet".
- Compatibility preserved:
  - `MVP Phase` Notion property name is preserved (user-data compatibility). README · schema · sync · template · status · CLI option labels keep `MVP Phase` / `MVP <n>`, but the README marks it as "free-form select; compatibility name".
  - The Korean placeholder regex in `src/lib/task.ts` (`/^\\(.*not yet.*\\)$/`) and the status-prefix regex (`/(new|update|...)/`) — kept and now recognise English patterns alongside, so existing Korean TASK markdown still parses correctly with the new CLI.
- `templates/.vibeops/agents/planner.md`: BYOBrowser one-liner replaced with Acme Automator. Other template bodies (Korean markdown) untouched per the Out-of-Scope policy.
- Updated `docs/project/03-current-state.md`. Status=Review + Result / Test Result filled in this TASK file.

## Test Result

- `pnpm typecheck` — exit 0.
- `pnpm build` — exit 0. `dist/` regenerated normally.
- `pnpm smoke` — exit 0. `node dist/cli.js --help` / `init --dry-run` / `init --dry-run --git --initial-commit` / `status` / `task generate --dry-run` / `notion init --dry-run` / `github status` / `github init --dry-run --connect goodtek/vibeops` 8 cases without regression.
- `pnpm publish --dry-run --access public --no-git-checks` — exit 0. Output header confirms `name: @goodtekxyz/vibeops`, `version: 0.2.0`, `total files: 93`, `Publishing to https://registry.npmjs.org/ with tag latest and public access (dry-run)`. No actual npm publish.
- Regression grep:
  - `node dist/cli.js --help` output contains 0 Korean characters.
  - `README.md` contains 0 occurrences of `BYOBrowser` / `MVP 1` / `MVP 2` / `MVP 3` / `MVP 4`. `support@goodtek.xyz` appears 1×; `hello@goodtek.xyz` appears 1×.
  - `CHANGELOG.md` contains 0 occurrences of `MVP 1` / `MVP 2` / `MVP 3` / `MVP 4`.
  - `src/cli.ts` contains 0 Korean characters.
  - `src/types/config.ts` contains 0 `BYOBrowser`.
  - `templates/.vibeops/agents/planner.md` contains 0 `BYOBrowser`.
  - Korean residue in `src/lib/task.ts` / `src/lib/task-summary.ts` is confined to the legacy placeholder/status regex (intentional backward compatibility).

## Review Notes

- npm publish is performed manually by the user via `pnpm publish --access public` (entering 2FA). This TASK stops at dry-run.
- Full Korean → English translation of template markdown bodies (`templates/AGENTS.md`, `templates/.cursor/rules/*.mdc`, `templates/docs/project/**`) is a follow-up TASK candidate. New-project users receiving Korean markdown still function correctly, but for global UX a future round is recommended.
- vibeops's own design docs under `docs/project/` are not part of the npm package and remain historical records. Latest facts are owned by `03-current-state.md`.
- The Notion property name `MVP Phase` is preserved for compatibility. Changing it later requires migrating the user's existing Notion DB schema.
