import { join, relative } from "node:path";

import { mkdir } from "node:fs/promises";

import { pathExists, writeText } from "./filesystem.js";
import { hasNonEmptySection } from "./task.js";
import { VERSION } from "../version.js";
import type { VibeopsConfig } from "../types/config.js";
import type { TaskMeta } from "../types/task.js";

export function cursorImplementPromptRel(taskId: string): string {
  const slug = taskId.toLowerCase().replace(/[^a-z0-9-]+/g, "-");
  return `.vibeops/generated/cursor-implement-${slug}.md`;
}

export function buildCursorImplementPrompt(opts: {
  readonly projectName: string;
  readonly taskId: string;
  readonly taskPath: string;
  readonly vibeopsVersion: string;
  readonly fillResult: boolean;
  readonly fillTestResult: boolean;
}): string {
  const fill: string[] = [];
  if (opts.fillResult) fill.push("**Result**");
  if (opts.fillTestResult) fill.push("**Test Result**");
  const fillLine =
    fill.length > 0
      ? `4. Update ${fill.join(" and ")} in \`${opts.taskPath}\` (replace Pending / (not yet) placeholders).`
      : "";

  return `# Implement ${opts.taskId}

Project: \`${opts.projectName}\` (VibeOps ${opts.vibeopsVersion})

Read and follow the **entire** TASK file:

\`${opts.taskPath}\`

Procedure:

1. Work only inside **Scope** and **Acceptance Criteria** in that file.
2. **Search** the repo for existing patterns before adding code or docs.
3. Do the work required by this TASK (implementation, spec, or docs — per Scope / Out of Scope).
${fillLine ? `${fillLine}\n` : ""}5. Do not touch other TASKs. No git push or merge.

When finished, run \`vibeops next\` and choose Refresh, then \`vibeops done ${opts.taskId}\`.
`;
}

export interface CursorImplementPromptInfo {
  readonly rel: string;
  readonly fillResult: boolean;
  readonly fillTestResult: boolean;
}

/** Write \`.vibeops/generated/cursor-implement-*.md\` when Result/Test need filling. */
export async function ensureCursorImplementPrompt(
  cwd: string,
  config: VibeopsConfig | null,
  task: TaskMeta,
  body: string,
): Promise<CursorImplementPromptInfo | null> {
  const fillResult = !hasNonEmptySection(body, "Result");
  const fillTestResult = !hasNonEmptySection(body, "Test Result");
  if (!fillResult && !fillTestResult) return null;

  const rel = cursorImplementPromptRel(task.id);
  const taskPath = relative(cwd, task.filePath).replace(/\\/g, "/");
  const projectName = config?.name ?? "project";
  const text = buildCursorImplementPrompt({
    projectName,
    taskId: task.id,
    taskPath,
    vibeopsVersion: VERSION,
    fillResult,
    fillTestResult,
  });

  const outDir = join(cwd, ".vibeops", "generated");
  if (!(await pathExists(outDir))) {
    await mkdir(outDir, { recursive: true });
  }
  await writeText(join(cwd, rel), text);

  return { rel, fillResult, fillTestResult };
}
