# 02 — Tech Stack

VibeOps itself is a **small CLI that runs locally**. It does not introduce a heavyweight runtime or backend service.

## Runtime / language

- **Node.js 20+ LTS** — widely available on user machines; behaves the same on macOS / Linux / WSL2.
- **TypeScript 5.x** — expresses the small types around `.vibeops/` / `docs/` files (config, TASK metadata, Notion schema) precisely.
- **Package manager**: **pnpm** — monorepo-friendly, disk-efficient. Distributed so users can install with `npm` or `pnpm` (`npm i -g vibeops`).

## CLI / core library candidates

> Concrete choices are finalised in TASK-001. This document records the direction only.

| Area                    | Candidates                                            | Why                                                                                 |
| ----------------------- | ----------------------------------------------------- | ----------------------------------------------------------------------------------- |
| CLI framework           | `commander` or `cac`                                  | Small dependency, natural sub-commands (`vibeops task start`).                       |
| Output                  | `picocolors` (or `kleur`)                             | Light, few dependencies.                                                             |
| Interactive prompts     | `@inquirer/prompts` (only where needed)               | For option selection in `plan` / `task generate`.                                    |
| File system / copy      | Node `fs/promises` + `fast-glob`                      | Template copy, existence checks.                                                     |
| Markdown frontmatter    | `gray-matter`                                         | Splits TASK file `---` header (metadata) from body.                                  |
| Git operations          | `simple-git` or `node:child_process` + `git` CLI      | Branch create, base commit recording, log, revert.                                   |
| Notion client           | `@notionhq/client` (official)                         | DB query / page create / update.                                                     |
| Environment variables   | `dotenv`                                              | Read `NOTION_TOKEN` etc. from `.vibeops.env`.                                        |
| Config file             | JSON (`.vibeops.json`)                                | Easy for users to edit by hand. TOML/YAML is not introduced.                         |

## Test / quality

- **vitest** — TypeScript-friendly, fast. Unit-focused.
- **prettier + eslint** — code style.
- **CI is optional in MVP 1**, but `pnpm run build`, `pnpm run test`, and the `vibeops --help` smoke test must always pass.

## Distribution

- Published to **npm registry** as a `vibeops` (or namespaced) package.
- Users invoke it with `pnpm dlx vibeops init` or `npm i -g vibeops`.
- No separate binary build (Node environment assumed).

## External dependencies / credentials

- **Notion**: `NOTION_TOKEN` (integration secret), Projects DB id, Tasks DB id (stored in `.vibeops.json`). The secret lives in `.vibeops.env`, which is gitignored.
- **Git**: relies on the user's `git` CLI.
- **Cursor**: not called directly. VibeOps only emits text prompts for the user to paste into Cursor.

## Explicit non-adoptions

- Direct LLM calls / OpenAI / Anthropic SDK — code generation is Cursor's job.
- A web server / hosted dashboard.
- A database (including SQLite) — state in plain files (`.vibeops/state/**.json`) is enough.
- Monorepo workspace tooling / nx / turbo (only considered in a future dedicated TASK).
