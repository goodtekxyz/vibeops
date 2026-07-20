# 05 — Current State

> Facts only. Updated when implementation or release milestones land.

## Stage

- **Package:** `@goodtek/vibeops` **2.5.2** (governance-only dirty no longer blocks `task add` sync).
- **CLI lifecycle:** `init` · `task add` · `task del` · **`task ship` (state-aware)** · `task merge` · `task sync` · `pull` · `task release` · **`status` (Now/Next)** · `llm`.
- **Breaking (2.5.0):** `task reship` removed — use `task ship` / `--new-cycle`.
- **2.5.1:** `task add` preflight + sync diagnosis + incomplete resume.
- **2.5.2:** `.vibeops.json` / governance dirt soft-pass on integration sync.

## Implementation (this repo)

| Area | Path | Notes |
|------|------|--------|
| Integration sync UX | `src/lib/git-integration-sync.ts`, `task-add.ts`, `git.ts` | Preflight; governance-only dirty OK |
| npm publish | `scripts/npm-publish.sh`, `scripts/infisical-run.sh` | Infisical / `.env` → temp npmrc |
| Init remote UX | `src/lib/git-remote.ts`, `src/lib/git-host-cli.ts` | Ask host → create/connect |
| Status Now/Next | `src/commands/status.ts` | Human layout |

## Next

- Consumers: `npm i -g @goodtek/vibeops@2.5.2` (or `volta install @goodtek/vibeops@2.5.2`).
- Maintainers: `pnpm publish:npm` (Infisical `NPM_TOKEN` or `.env`).

## Progress rules

- One TASK at a time in consumer repos.
- Docs before ship: Result, Test Result, `05-current-state.md`, daily log.
- `task sync` does not edit TASK markdown.
