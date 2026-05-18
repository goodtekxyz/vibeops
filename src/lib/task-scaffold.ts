import { basename, join } from "node:path";

import type { TaskMeta } from "../types/task.js";
import { statusDisplay } from "./task.js";

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

export interface WorkNowTaskDraft {
  id: string;
  title: string;
  idea: string;
  mvpPhase: string;
  spawnedFrom?: string;
}

export function buildWorkNowTaskMarkdown(draft: WorkNowTaskDraft): string {
  const spawnedNote = draft.spawnedFrom
    ? `\n\nWork-now slice while **${draft.spawnedFrom}** is still open — not a pre-planned backlog item scheduled after later TASK numbers.`
    : "";

  return `# ${draft.id}: ${draft.title}

## Status

${statusDisplay("planned")}

## MVP Phase

${draft.mvpPhase}

## Goal

${draft.idea.trim()}

## Background

${draft.idea.trim()}${spawnedNote}

## Scope

- Deliver the goal above in a single focused pass.

## Out of Scope

- Unrelated backlog items and broad refactors not required for this slice.

## Acceptance Criteria

1. Goal and Scope are met and verifiable from the repo or commands in Test Plan.
2. Result and Test Result sections are filled before \`vibeops done\`.

## Files to Inspect First

- (add paths before implementation)

## Expected Files to Change

- (list as you implement)

## Risks

- Scope creep from the parent TASK — keep this slice narrow.

## Test Plan

- \`vibeops task check ${draft.id}\`
- Project-specific checks for the change

## Rollback Plan

- \`vibeops rollback ${draft.id}\` (advisory) or revert the task branch commits.

## Implementation Plan

1. Confirm Scope with the open parent TASK (if any).
2. Implement on \`vibeops start ${draft.id}\`.
3. Fill Result and Test Result, then \`vibeops done ${draft.id}\`.

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

export function titleFromIdea(idea: string, explicitTitle?: string): string {
  const t = explicitTitle?.trim();
  if (t && t.length > 0) return t;
  const oneLine = idea.replace(/\s+/g, " ").trim();
  if (oneLine.length <= 80) return oneLine;
  const cut = oneLine.slice(0, 77).trimEnd();
  return `${cut}...`;
}
