import { readdir } from "node:fs/promises";
import { basename, join } from "node:path";

import type { BriefBundle } from "../types/brief.js";
import { isDirectory, pathExists, writeText } from "./filesystem.js";
import { MVP_BUILD_PROMPT_REL, TASK_MVP_ID } from "./mvp-constants.js";
import {
  excerptDoneSummary,
  readLastDoneSummary,
  renderPriorIterationSection,
} from "./mvp-done-summary.js";
import { projectPaths } from "./paths.js";
import { slugify } from "./slug.js";

export interface MvpArtifactPaths {
  readonly taskFile: string;
  readonly taskRelative: string;
  readonly buildPromptFile: string;
  readonly buildPromptRelative: string;
}

function bulletList(items: readonly string[], empty = "(none listed in brief)"): string {
  if (items.length === 0) return `- ${empty}`;
  return items.map((x) => `- ${x}`).join("\n");
}

export function renderMvpTaskMarkdown(
  bundle: BriefBundle,
  priorSummary?: string | null,
): string {
  const { brief } = bundle;
  const title = `MVP — ${brief.projectName}`;
  const priorBlock =
    typeof priorSummary === "string" && priorSummary.trim().length > 0
      ? `${renderPriorIterationSection(excerptDoneSummary(priorSummary, 55))}\n`
      : "";
  const criteria =
    brief.successCriteria.trim().length > 0
      ? `1. ${brief.successCriteria.trim()}`
      : "1. The MVP delivers the scoped features below and matches the success criteria in `docs/project/02-mvp-scope.md` after `vibeops plan`.";
  const featureCriteria = brief.mvpFeatures
    .slice(0, 8)
    .map((f, i) => `${i + 2}. ${f} is implemented and verifiable.`)
    .join("\n");

  return `# ${TASK_MVP_ID} · ${title}

> Single MVP TASK for the v2 workflow. Implementation happens in **Cursor** using \`${MVP_BUILD_PROMPT_REL}\` (drag into chat). Git rails: \`vibeops start\` → build → \`vibeops done\`.

## Status

planned

## MVP Phase

MVP (full scope)

## Goal

Ship the **entire MVP** for **${brief.projectName}**: ${brief.oneLineIdea}

## Background

Generated from \`vibeops plan\` (${bundle.meta.source}). Tech: ${brief.frontend} / ${brief.backend} / ${brief.database} (${brief.dbLayer}), package manager ${brief.packageManager}.

${priorBlock}## Scope

${bulletList(brief.mvpFeatures, "(add MVP features in the brief)")}

## Out of Scope

${bulletList(brief.outOfScope)}

## Acceptance Criteria

${criteria}
${featureCriteria.length > 0 ? featureCriteria : ""}

## Files to Inspect First

- \`AGENTS.md\`
- \`docs/project/05-current-state.md\` (or \`03-current-state.md\` if present)
- \`docs/project/02-mvp-scope.md\`
- \`docs/project/03-architecture.md\`
- \`${MVP_BUILD_PROMPT_REL}\`

## Expected Files to Change

- (application code and config as required by the MVP — list concrete paths as you implement)

## Risks

${bulletList(brief.risks)}

## Test Plan

- Run the project's test/lint scripts if present (\`pnpm test\`, \`pnpm lint\`, etc.).
- Manually verify each Acceptance Criterion in Cursor or the running app.
- Record commands and outcomes in **Test Result** before \`vibeops done\`.

## Rollback Plan

- \`vibeops task rollback ${TASK_MVP_ID}\` for guidance; destructive steps require \`--confirm\`.
- Or delete branch \`task/mvp-*\` after switching to the base branch.

## Git Context

(populated by \`vibeops start\` or \`vibeops task start ${TASK_MVP_ID}\`)

## Notion Page

(optional — \`vibeops notion sync\` when Notion is enabled)

## Implementation Plan

1. \`vibeops start\` (creates \`task/mvp-*\` branch).
2. Drag \`${MVP_BUILD_PROMPT_REL}\` into a **new Cursor chat** and implement until Acceptance Criteria pass.
3. Fill **Result** and **Test Result**, then \`vibeops done\`.

## Result

(not yet)

## Test Result

(not yet)

## Review Notes

(not yet)
`;
}

export function buildMvpBuildPrompt(
  bundle: BriefBundle,
  taskRelativePath: string,
  priorSummary?: string | null,
): string {
  const { brief } = bundle;
  const priorSection =
    typeof priorSummary === "string" && priorSummary.trim().length > 0
      ? `\n## Previous iteration (read first)\n\n${excerptDoneSummary(priorSummary, 80)}\n\n---\n`
      : "";
  return `# MVP build — ${brief.projectName}
${priorSection}

You are the **lead implementer** in Cursor for this repository. Deliver the **full MVP** in one focused effort. VibeOps owns Git/docs rails; **you** own code and verification.

## Source of truth (read first)

1. \`AGENTS.md\` and \`.cursor/rules/\`
2. \`docs/project/05-current-state.md\` (or \`03-current-state.md\`)
3. \`docs/project/02-mvp-scope.md\`, \`03-architecture.md\`, \`04-tech-stack.md\`
4. TASK file: \`${taskRelativePath}\` — **only** work within its Scope / Acceptance Criteria

## Project brief

- **Idea:** ${brief.oneLineIdea}
- **Type:** ${brief.projectType}
- **Users:** ${brief.targetUsers.join(", ") || "(see brief)"}
- **Problem:** ${brief.coreProblem}
- **Stack:** ${brief.frontend} · ${brief.backend} · ${brief.database} · ${brief.dbLayer} · ${brief.packageManager}
- **Deploy:** ${brief.deploymentTargets.join(", ") || "TBD"}
- **Auth:** ${brief.authRequirements.join(", ") || "none"}
- **Integrations (MVP):** ${brief.integrations.join(", ") || "none"}
- **Success:** ${brief.successCriteria}

### MVP features (in scope)

${bulletList(brief.mvpFeatures)}

### Explicitly out of scope

${bulletList(brief.outOfScope)}

## How to work (orchestration — in this chat, not via CLI)

- Implement **one TASK only**: \`${TASK_MVP_ID}\`. Do not start other TASK ids unless the human asks.
- **Search** the repo before adding files; reuse existing patterns.
- You may delegate focused sub-steps with Cursor's **Task** tool (explore, shell) — max **3** attempts per sub-problem, then stop and report blockers.
- Do **not** rely on \`vibeops agent prompt\` paste loops or multi-TASK \`task generate\` for this MVP pass.
- No features outside \`docs/project/02-mvp-scope.md\` unless the human expands scope in Git docs first.

## Definition of done

1. Every item in **Acceptance Criteria** in \`${taskRelativePath}\` is met.
2. **Result** and **Test Result** sections in that TASK file are filled with facts (paths, commands, outcomes).
3. Working tree is ready for \`vibeops done\` (commit on the task branch if needed).

## Risks to watch

${bulletList(brief.risks)}

---

*Generated by \`vibeops plan\`. Re-run plan to refresh after brief changes.*
`;
}

export async function findMvpTaskFile(tasksDir: string): Promise<string | null> {
  if (!(await isDirectory(tasksDir))) return null;
  const entries = await readdir(tasksDir, { withFileTypes: true });
  const match = entries
    .filter((e) => e.isFile() && /^TASK-mvp/i.test(e.name) && e.name.endsWith(".md"))
    .map((e) => join(tasksDir, e.name))
    .sort();
  return match[0] ?? null;
}

export async function writeMvpArtifacts(
  cwd: string,
  bundle: BriefBundle,
): Promise<MvpArtifactPaths> {
  const paths = projectPaths(cwd);
  const priorSummary = await readLastDoneSummary(cwd);
  const slug = slugify(bundle.brief.projectName, "mvp");
  const fileName = `TASK-mvp-${slug}.md`;
  const taskFile = join(paths.docsTasks, fileName);

  const existing = await findMvpTaskFile(paths.docsTasks);
  const targetTask =
    existing !== null && basename(existing) !== fileName ? existing : taskFile;

  await writeText(targetTask, renderMvpTaskMarkdown(bundle, priorSummary));

  const buildPromptFile = join(cwd, MVP_BUILD_PROMPT_REL);
  const taskRelative =
    targetTask.startsWith(cwd) ? targetTask.slice(cwd.length + 1) : targetTask;
  await writeText(buildPromptFile, buildMvpBuildPrompt(bundle, taskRelative, priorSummary));

  return {
    taskFile: targetTask,
    taskRelative,
    buildPromptFile,
    buildPromptRelative: MVP_BUILD_PROMPT_REL,
  };
}

export async function mvpBuildPromptExists(cwd: string): Promise<boolean> {
  return pathExists(join(cwd, MVP_BUILD_PROMPT_REL));
}
