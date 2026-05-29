import { basename, join } from "node:path";

import type { TaskMeta } from "../types/task.js";
import { statusDisplay } from "./task.js";

export const V3_TASK_SECTIONS = [
  "Status",
  "Goal",
  "Scope",
  "Out of Scope",
  "Acceptance Criteria",
  "Test Plan",
  "Git Context",
  "Result",
  "Test Result",
] as const;

export function allocateNextTaskNumber(tasks: readonly TaskMeta[]): number {
  let max = 0;
  for (const t of tasks) {
    const m = /^TASK-(\d+)$/i.exec(t.id.trim());
    if (m) max = Math.max(max, Number.parseInt(m[1]!, 10));
  }
  return max + 1;
}

export function formatTaskId(number: number): string {
  return `TASK-${String(number).padStart(3, "0")}`;
}

export interface TaskDraft {
  id: string;
  title: string;
  idea: string;
}

export function buildMinimalTaskMarkdown(draft: TaskDraft): string {
  return `# ${draft.id}: ${draft.title}

## Status

${statusDisplay("planned")}

## Goal

${draft.idea.trim()}

## Scope

- Deliver the goal above in a single focused pass.

## Out of Scope

- Unrelated refactors and features outside this slice.

## Acceptance Criteria

1. Goal and Scope are met and verifiable via Test Plan.
2. Result and Test Result are filled before \`vibeops task done\`.

## Test Plan

- Project-specific checks for this change

## Git Context

(populated by \`vibeops task add\`)

## Result

(not yet)

## Test Result

(not yet)
`;
}

export function taskFilename(taskId: string, slug: string): string {
  return `${taskId}-${slug}.md`;
}

export function uniqueTaskPath(
  tasksDir: string,
  taskId: string,
  baseSlug: string,
  existingPaths: readonly string[],
): { slug: string; filePath: string } {
  const names = new Set(existingPaths.map((p) => basename(p)));
  let slug = baseSlug;
  let name = taskFilename(taskId, slug);
  let n = 2;
  while (names.has(name)) {
    slug = `${baseSlug}-${n}`;
    name = taskFilename(taskId, slug);
    n++;
  }
  return { slug, filePath: join(tasksDir, name) };
}

export function titleFromIdea(idea: string): string {
  const oneLine = idea.replace(/\s+/g, " ").trim();
  if (oneLine.length <= 80) return oneLine;
  return `${oneLine.slice(0, 77).trimEnd()}...`;
}

export function ensureV3Sections(markdown: string): string {
  let body = markdown;
  for (const section of V3_TASK_SECTIONS) {
    const re = new RegExp(`^##\\s+${section.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "im");
    if (!re.test(body)) {
      body = `${body.trimEnd()}\n\n## ${section}\n\n(not yet)\n`;
    }
  }
  return body;
}

export function normalizeTaskHeader(markdown: string, taskId: string, title: string): string {
  const lines = markdown.split("\n");
  const header = `# ${taskId}: ${title}`;
  if (lines.length > 0 && /^#\s+/.test(lines[0]!)) {
    lines[0] = header;
    return lines.join("\n");
  }
  return `${header}\n\n${markdown}`;
}
