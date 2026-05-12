# TASK-006 · `plan` command

## Status

done

## MVP Phase

MVP 2 · Project Planner

## Goal

Implement `vibeops plan` as an **interactive flow mixing free text + select + multi-select + confirm**. 20 short questions produce a normalised **ProjectBrief** (markdown) and a **Cursor Planner Agent planning prompt** (markdown). This TASK is responsible only up to that point — the actual filling of `docs/project/*` by the Planner Agent is triggered by the human in Cursor.

## Background

Right after `vibeops init`, the user has only the empty `docs/project/00-overview.md` ~ `09-deployment.md`. Asking them to write those by hand from scratch is daunting. `vibeops plan` collects answers through short questions answerable with arrow keys / Space / Enter in 1–2 minutes, and turns the result into both **a human-reviewable, editable brief markdown** and **a markdown prompt to paste into Cursor**. VibeOps still does not call LLMs directly.

## Scope

### 1) Interactive driver

- Based on `@inquirer/prompts` (v8, internal select/checkbox v5.1.5).
- 4 question types: `input` / `select` / `checkbox` / `confirm`.
- Key conventions:
  - select / checkbox use arrow keys; checkbox toggles with Space + confirms with Enter.
  - confirm accepts default with Enter.
- All `select` / `checkbox` use **`loop: false`** — pressing arrow-down past the last item does not jump to the top. Prevents the usability problem where users overshoot to the top in a long list.
- All `select` / `checkbox` use **`pageSize: 8`** — at most 8 rows on screen, controlling scroll cost for long lists.
- In non-TTY (pipes / CI), entering interactive mode prints a single-line hint and exits 1. CI must pass `--non-interactive` or `--from <brief.md>`.

### 2) 20-question schema

Defined library-independently in `src/types/brief.ts`. `Other` is **always last** in every option set.

| #  | Field                 | Type     | Options / notes                                                                                                                                       | Default                                                                                       |
| -- | --------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| 1  | `projectName`         | input    | -                                                                                                                                                     | `basename(cwd)`                                                                              |
| 2  | `oneLineIdea`         | input    | -                                                                                                                                                     | Derived from `--idea` (if provided).                                                          |
| 3  | `projectType`         | select   | SaaS / Web App / CLI Tool / Browser Automation / AI Agent / Internal Tool / Other                                                                    | `Browser Automation` if `idea` contains `browser`, otherwise `SaaS`.                          |
| 4  | `targetUsers`         | checkbox | Solo founders / Developers / Marketers / Small business owners / Internal team / Other                                                                | `[]`                                                                                          |
| 5  | `coreProblem`         | input    | -                                                                                                                                                     | (none)                                                                                        |
| 6  | `mvpFeatures`         | checkbox | Authentication / Dashboard / Project/workspace management / Task/job creation / Background worker / Browser automation / Scheduling / Execution logs / External integrations / Other | `[]`                                                                                          |
| 7  | `outOfScope`          | checkbox | Billing / Team workspace / Mobile app / Marketplace / Advanced analytics / Enterprise SSO / Public API / Real-time collaboration / Other              | `[]`                                                                                          |
| 8  | `frontend`            | select   | Next.js / React + Vite / None / CLI only / Not sure / Other                                                                                           | **`Next.js`**                                                                                 |
| 9  | `backend`             | select   | NestJS / Next.js API routes / Node.js Fastify / Hono / Python FastAPI / None / Not sure / Other                                                       | **`NestJS`**                                                                                  |
| 10 | `database`            | select   | PostgreSQL / SQLite / MySQL / Supabase / None / Not sure / Other                                                                                      | **`PostgreSQL`**                                                                              |
| 11 | `dbLayer`             | select   | Drizzle / Prisma / Kysely / Raw SQL / None / Not sure / Other                                                                                         | **`Drizzle`**                                                                                 |
| 12 | `packageManager`      | select   | pnpm / npm / yarn / bun                                                                                                                               | **`pnpm`**                                                                                    |
| 13 | `deploymentTargets`   | checkbox | VPS / Docker / Podman / Vercel / Cloudflare / AWS / Not sure / Other                                                                                  | `[]`                                                                                          |
| 14 | `authRequirements`    | checkbox | Email/password / Google login / GitHub login / Magic link / Admin-only / No auth for MVP / Not sure / Other                                           | `[]`                                                                                          |
| 15 | `integrations`        | checkbox | Notion / GitHub / Google Drive / Gmail / Slack / Stripe / OpenAI / Anthropic / Browser / Playwright / None / Other                                    | `[]`                                                                                          |
| 16 | `useNotion`           | confirm  | -                                                                                                                                                     | **`true`**                                                                                    |
| 17 | `useGitWorkflow`      | confirm  | -                                                                                                                                                     | **`true`**                                                                                    |
| 18 | `agentWorkflowLevel`  | select   | Simple / Standard / Advanced                                                                                                                          | **`Advanced: Orchestrator + Planner + Architect + Builder + Tester + Reviewer + Docs + Recovery`** |
| 19 | `risks`               | checkbox | Authentication/security / Browser automation reliability / Cost control / Scalability / Data privacy / Deployment complexity / Background jobs / AI hallucination / Other | `[]`                                                                                          |
| 20 | `successCriteria`     | input    | -                                                                                                                                                     | (none)                                                                                        |

### 2-1) Option diet (2026-05-11 round)

Removed for UX. Users add custom items via `Other → <text>` if needed.

- Project type: removed `Chrome Extension`, `API Service`, `Content Site`.
- Target users: removed `Creators`, `Agencies`, `Enterprise users`, `Consumers`.
- MVP must-have features: removed `User settings`, `Notifications`, `Billing`, `Admin panel`, `API endpoints`, `File upload`.
- Out of scope: removed `Multi-language`, `Chrome extension`.
- Frontend: removed `SvelteKit`, `Vue/Nuxt` (+ added `Other`).
- Backend: removed `Node.js Express`, `None / frontend only`; simplified to `None` (+ added `Other`).
- Database: removed `MongoDB` (+ added `Other`).
- DB Layer: removed `Supabase client` (+ added `Other`).
- Deployment target: removed `GCP`, `Azure`, `Railway`, `Render` (+ added `Other`).
- Auth requirement: removed `Passkey` (+ added `Other`).
- External integrations: removed `Google Calendar`, `Discord`. Moved `Other` after `None`.
- Risk areas: removed `Legal/compliance`, `Payment/billing`.

### 3) "Other" chain

- Selecting `Other` in select / checkbox triggers a follow-up `input`.
- Empty Enter → keeps the label `"Other"`.
- Text input → normalised to `"Other: <text>"`.
- In checkbox, comma-separated entries split into multiple values (`"Other: a, b"` → `"Other: a"`, `"Other: b"`).

### 4) `ProjectBrief` normalisation

`src/types/brief.ts`:

```ts
export interface ProjectBrief {
  projectName: string;
  oneLineIdea: string;
  projectType: string;          // standard label or "Other: ..."
  targetUsers: string[];
  coreProblem: string;
  mvpFeatures: string[];
  outOfScope: string[];
  frontend: string;
  backend: string;
  database: string;
  dbLayer: string;
  packageManager: string;
  deploymentTargets: string[];
  authRequirements: string[];
  integrations: string[];
  useNotion: boolean;
  useGitWorkflow: boolean;
  agentWorkflowLevel: string;
  risks: string[];
  successCriteria: string;
}
```

`BriefMeta`: `vibeopsVersion`, `generatedAt`, `source ("interactive" | "non-interactive" | "from-file")`, `schemaVersion=1`, `assumptions[]`.

### 5) Output files

| Path                                       | Content                                                                                |
| ------------------------------------------ | -------------------------------------------------------------------------------------- |
| `.vibeops/brief/project-brief.md`          | ProjectBrief serialised as human-reviewable markdown. Header has generated / source metadata. |
| `.vibeops/generated/plan-prompt.md` (default) | Prompt to paste directly into the Cursor Planner Agent.                                |

The prompt path can be overridden with `--output <path>`.

### 6) Plan-prompt body contract

The Cursor prompt built by prompt-builder contains:

- Planner Agent role (refers to `.vibeops/agents/planner.md`).
- Hard rules: "no code generation", "deliverables go only into `docs/**`", "source-of-truth rules", "one TASK at a time", "record assumptions".
- ProjectBrief summary (all 20 fields as markdown bullets).
- Output format: Plan Summary → 8 `docs/project/*` files (00 · 01 · 02 · 04 · 06 · 07 · 08 · 09) → initial backlog `docs/tasks/TASK-NNN-*` → changed file list → Assumptions.
- Mapping guide (brief field → docs file).
- Handling rules for Notion / Git / Agent workflow.

### 7) CLI options

| Option                | Meaning                                                                                       |
| --------------------- | --------------------------------------------------------------------------------------------- |
| (none)                | Interactive (TTY default).                                                                    |
| `--idea <text>`       | Default value for `oneLineIdea`. If in `Name: idea` form, projectName is extracted too.       |
| `--from <path>`       | Read an existing brief.md and regenerate the prompt only. Missing required fields are added (interactive) or filled with a placeholder (non-interactive). |
| `--output <path>`     | Prompt output path (default `.vibeops/generated/plan-prompt.md`).                             |
| `--non-interactive`   | Skip questions; use provided values + safe placeholders. Logged in Assumptions.               |
| `--cwd <path>`        | Run in a different directory.                                                                 |

### 8) Validation

- `projectName` and `oneLineIdea` are required in interactive mode (empty rejected).
- In non-interactive or `--from` mode, empty values are filled with placeholders (`"Unnamed Project"`, `"(no idea provided — Planner Agent must fill this in)"`) and recorded in `BriefMeta.assumptions`.

## Out of Scope

- Any flow where VibeOps calls LLMs itself — permanently out of scope.
- Cursor CLI calls.
- Notion API calls.
- `--apply` that distributes a Planner Agent response into `docs/project/*` (deferred to a separate TASK).
- Directly updating `03-architecture` / `05-current-state`.
- Automatic backlog prioritisation.
- Auto-installing dependencies based on answers.

## Acceptance Criteria

1. **Interactive flow**: in a TTY, `vibeops plan` asks the 20 questions in order. Each question renders with its defined type (input / select / checkbox / confirm).
2. **Other chain**: selecting `Other` in select / checkbox triggers a follow-up input; the brief stores it as `"Other: <text>"`. Empty input keeps `"Other"`.
3. **ProjectBrief saved**: `.vibeops/brief/project-brief.md` is produced per the schema above.
4. **Plan-prompt generated**: a single markdown is saved at `.vibeops/generated/plan-prompt.md` (or `--output`) that pastes directly into Cursor. The body satisfies § 6.
5. **`--idea "Name: idea"`**: projectName and oneLineIdea are auto-split into defaults.
6. **`--from <path>`**: reads an existing brief.md, re-serialises it, and regenerates the prompt only. Missing required fields are re-asked interactively; in non-interactive, placeholders + Assumptions.
7. **non-TTY guard**: outside a TTY, entering interactive mode prints a single-line hint and exits 1.
8. **`vibeops plan --help`**: shows all the options above.
9. **typecheck / build**: `pnpm typecheck`, `pnpm build` pass.
10. **Zero LLM / external API calls**: no fetch / Notion / OpenAI / Cursor API call anywhere in the code.

## Files to Inspect First

- `templates/.vibeops/prompts/create-plan.md`, `templates/.vibeops/agents/planner.md`.
- `templates/docs/project/00 ~ 09`.
- `src/agent/prompt.ts` (TASK-005) — prompt-builder pattern.
- `src/cli.ts` — option wiring convention.
- `package.json` — where dependencies are added.

## Expected Files to Change

- new: `src/types/brief.ts`.
- new: `src/lib/inquirer-helpers.ts`.
- new: `src/lib/brief.ts`.
- new: `src/lib/prompt-builder.ts`.
- update: `src/commands/plan.ts` (stub → real).
- update: `src/cli.ts` (option wiring).
- update: `package.json`, `pnpm-lock.yaml` (`@inquirer/prompts`).
- update: `docs/project/03-current-state.md`, this TASK's Result / Test Result, `docs/logs/YYYY-MM-DD.md`.

## Risks

- `@inquirer/prompts` key handling can misbehave in Windows / certain terminals → MVP targets macOS / Linux first.
- 20 questions is a lot — users may abandon midway → progress indicator (`Q n/20`) gives a completion sense. (Draft save / `--resume` is out of scope this TASK.)
- "Other" follow-up may be empty → normalise to keep the label `"Other"`.
- `--from` parsing may face broken markdown → missing fields fall back to empty string / empty array; required missing fields go through § 8 placeholder + Assumptions.
- The brief may contain sensitive info → the README (TASK-012) must warn that "this is committed in plaintext".

## Test Plan

- **Smoke 1**: `vibeops plan --non-interactive --idea "Acme Automator: marketing automation SaaS for solo founders"` → both brief / prompt generated; `projectName=Acme Automator`, `oneLineIdea=` (tail), `coreProblem` / `successCriteria` placeholder + Assumptions.
- **Smoke 2**: a manually filled brief.md → `vibeops plan --from <brief.md> --non-interactive` → re-serialises the brief and reflects all fields (including the Other chain) in the prompt.
- **Smoke 3**: `vibeops plan --non-interactive --idea "Foo: bar" --output <path>` → prompt at the specified path, brief at default.
- **Smoke 4**: `vibeops plan --cwd <sandbox> < /dev/null` → non-TTY guard triggers, exit 1.
- **Smoke 5**: `pnpm typecheck`, `pnpm build`, `pnpm dev plan --help`.

(vitest unit tests are out of scope here — consolidated in the TASK-012 polish round.)

## Rollback Plan

- Code changes are reverted by discarding the task branch.
- User-side: the produced `.vibeops/brief/project-brief.md` and `.vibeops/generated/plan-prompt.md` are pure data files; `rm` is enough. Any `docs/**` changes the Planner Agent makes are reverted via `git diff` / `reset`.

## Implementation Plan

1. **Add dependencies**: `pnpm add @inquirer/prompts` (picks 8.4.3).
2. **Types + option constants**: `src/types/brief.ts` — `ProjectBrief`, `BriefMeta`, and constants for every select / checkbox option.
3. **Interactive helpers**: `src/lib/inquirer-helpers.ts` — `askInput / askSelect / askCheckbox / askConfirm`. Each supports non-interactive mode and handles the Other chain for select / checkbox.
4. **Brief module**: `src/lib/brief.ts` — `gatherBrief()`, `briefToMarkdown()`, `parseBriefFromMarkdown()`, `findMissingRequired()`, `parseIdea()` (split `Name: idea`).
5. **Prompt builder**: `src/lib/prompt-builder.ts` — `buildPlanPrompt(brief, meta, briefRelativePath)`. Conforms to § 6.
6. **Command wiring**: `src/commands/plan.ts` handles options → flow: `--from` → `gatherBrief` → save `briefToMarkdown` → save `buildPlanPrompt` → print next-step guidance.
7. **CLI registration**: add `--idea / --from / --output / --non-interactive / --cwd` to `plan` in `src/cli.ts`.
8. **Smoke tests**: run the 5 cases above manually.
9. **Docs**: update TASK Result / Test Result, `03-current-state.md`, `docs/logs/2026-05-11.md`.

## Result

`vibeops plan` is implemented per this TASK and produces the following artifacts (UX improvement round merged: 2026-05-11):

- **`.vibeops/brief/project-brief.md`**: a 20-field ProjectBrief serialised into human-reviewable markdown. Header has `generatedAt · vibeopsVersion · source · schemaVersion=1`; body uses `## N. <title>` headings + values (scalar / list / yes·no); ends with `## Assumptions`.
- **`.vibeops/generated/plan-prompt.md`** (or `--output <path>`): a single prompt for the Cursor Planner Agent. Contains Role + Hard rules + ProjectBrief summary + output format (Plan Summary → fill 8 `docs/project/*` → backlog → changed file list → Assumptions) + mapping guide + Notion / Git / Agent workflow rules.

Additional facts:

- Added `@inquirer/prompts 8.4.3` to `dependencies`.
- The `Other` chain follows up with `input` in both select and checkbox; empty input keeps `"Other"`, text input becomes `"Other: <text>"`. Checkbox supports comma-separated entries.
- For `--idea "Name: idea"`, `parseIdea()` auto-splits (when the part before the colon is one word and < 40 chars) and uses it as projectName + oneLineIdea defaults.
- `--from <path>` parses brief.md (`parseBriefFromMarkdown`) → if required fields (`projectName`, `oneLineIdea`) are missing, asks just those interactively, or in non-interactive uses a placeholder + records Assumptions.
- In non-TTY, entering interactive mode prints `"vibeops plan requires a TTY..."` and exits 1.
- To avoid unsupported options like `--instructions` under ESM + NodeNext, the checkbox hint is inlined into the message as dim text.
- Zero external API calls (LLM / Cursor / Notion / GitHub etc.) anywhere in the code (`grep -r fetch src/commands/plan.ts src/lib/brief.ts src/lib/prompt-builder.ts src/lib/inquirer-helpers.ts` → 0 matches).

### UX improvement (2026-05-11 round)

- Trimmed options in 12 categories (§ 2-1 table). Total option count dropped by 24 (116 → 92). `Other` is last in every category.
- Default-stack defaults applied: `frontend=Next.js`, `backend=NestJS`, `database=PostgreSQL`, `dbLayer=Drizzle`, `packageManager=pnpm`.
- `projectType` smart default: if `--idea` (or seed `oneLineIdea`) matches `/browser/i`, `Browser Automation`; otherwise `SaaS`. Implemented in a single `deriveProjectTypeDefault()`.
- Applied **`loop: false`** to both `select` and `checkbox` after verifying `@inquirer/prompts 8.4.3` (internal select / checkbox v5.1.5) supports the option. Pressing arrow-down past the last item no longer wraps to top.
- Applied **`pageSize: 8`** to both `select` and `checkbox` — at most 8 rows on screen.
- `confirm` ignores `loop` / `pageSize`; same for `input`.

## Test Result

Manually executed in this repo + a temporary sandbox (`/tmp/vibeops-plan-XXXXXX`). All pass.

### 1) Build / typecheck

```
$ pnpm typecheck
> tsc -p tsconfig.json --noEmit
(exit 0)

$ pnpm build
> tsc -p tsconfig.json
(exit 0)
```

### 2) `plan --help`

```
$ pnpm dev plan --help
Usage: vibeops plan [options]
Generate a ProjectBrief + Cursor Planner prompt via 20 interactive questions (MVP 2)
Options:
  --idea <text>      default for the one-line idea (`Name: idea` form also extracts the name)
  --from <path>      read an existing brief markdown and regenerate the prompt
  --output <path>    Cursor planning prompt output path (default .vibeops/generated/plan-prompt.md)
  --non-interactive  skip questions; use provided values + safe placeholders
  --cwd <path>       run in a different directory
  -h, --help         display help for command
```

### 3) `plan --non-interactive --idea "Acme Automator: marketing automation SaaS for solo founders"` (sandbox)

- `.vibeops/brief/project-brief.md` 1.4 KB created: projectName=`Acme Automator`, oneLineIdea=`marketing automation SaaS for solo founders`, useNotion=`yes`, useGitWorkflow=`yes`, agentWorkflowLevel=`Advanced: ...`, packageManager=`pnpm`; other select / checkbox values default (`Not sure` / `[]`).
- `.vibeops/generated/plan-prompt.md` 5.7 KB created: all of § 6 present (ProjectBrief summary, mapping guide, output format).
- Assumptions records missing `coreProblem`, `successCriteria`.
- stdout/stderr non-interleaved.

### 4) `plan --from <hand-edited brief.md> --non-interactive` (sandbox)

- Used a manually completed 20-field brief (with `Target users` including `Other: Marketing automation engineers`) as input.
- `.vibeops/brief/project-brief.md` re-serialises the same brief, preserves `source: from-file` metadata.
- `.vibeops/generated/plan-prompt.md`'s "ProjectBrief summary" reflects every field (nested indent, Other label included).

### 5) `plan --non-interactive --idea "Foo: bar" --output <custom-path>` (sandbox)

- Brief is saved at the default `.vibeops/brief/project-brief.md`; prompt is saved at the user-specified `<custom-path>`.

### 6) `plan --cwd <sandbox> < /dev/null` (non-TTY)

```
✗ vibeops plan requires a TTY. In CI / pipe environments, use --non-interactive or pass --from <brief.md>.
(exit 1)
```

### 7) Lints

`ReadLints` over the 6 changed files → 0 issues.

### 8) UX-round (2026-05-11) regression checks

| Case | Result |
| --- | --- |
| `pnpm typecheck` | exit 0 |
| `pnpm build` | exit 0 |
| `pnpm dev plan --help` | 5 options shown (unchanged) |
| `plan --non-interactive --idea "Acme Automator: browser automation SaaS" --cwd <sandbox>` | `projectType=Browser Automation` (smart default), `frontend=Next.js`, `backend=NestJS`, `database=PostgreSQL`, `dbLayer=Drizzle`, `packageManager=pnpm`, `useNotion=yes`, `useGitWorkflow=yes`, `agentWorkflowLevel=Advanced: ...` |
| `plan --non-interactive --idea "Notely: minimal note app" --cwd <sandbox>` | `projectType=SaaS` (smart default, idea lacks `browser`); other defaults unchanged |
| `plan --non-interactive --idea "Foo: bar" --cwd <sandbox>` | Database / DB Layer / Package manager defaults → `PostgreSQL` / `Drizzle` / `pnpm` |
| `ReadLints` (`src/types/brief.ts`, `src/lib/brief.ts`, `src/lib/inquirer-helpers.ts`) | 0 issues |
