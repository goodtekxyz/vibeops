import { basename, join } from "node:path";

import { pathExists, writeText } from "./filesystem.js";
import { formatTaskId, highestTaskNumber } from "./task.js";
import { slugify } from "./task-generator.js";

export interface ScaffoldPlanInputs {
  tasksDir: string;
  count: number;
  phase?: string;
  /** optional explicit slug; if absent, uses `planned-task` */
  slug?: string;
  /** optional explicit title; if absent, uses `(scaffolded TASK — fill in)` */
  title?: string;
}

export interface ScaffoldEntry {
  id: string;
  number: number;
  slug: string;
  title: string;
  fileName: string;
  absPath: string;
  phase: string;
}

export interface ScaffoldPlan {
  entries: ScaffoldEntry[];
  startNumber: number;
}

export async function planScaffoldEntries(
  inputs: ScaffoldPlanInputs,
): Promise<ScaffoldPlan> {
  const startNumber = (await highestTaskNumber(inputs.tasksDir)) + 1;
  const baseSlug = slugify(inputs.slug ?? "planned-task", "planned-task");
  const baseTitle = inputs.title ?? "(scaffolded TASK — fill in)";
  const phase = inputs.phase ?? "(unassigned)";
  const entries: ScaffoldEntry[] = [];
  let cursor = startNumber;
  for (let i = 0; i < inputs.count; i++) {
    // skip numbers whose file already exists on disk so users running scaffold
    // twice in a row don't collide with previously generated skeletons.
    let candidatePath = "";
    let chosen = -1;
    while (chosen < 0) {
      const fileName = `${formatTaskId(cursor)}-${baseSlug}.md`;
      const abs = join(inputs.tasksDir, fileName);
      if (!(await pathExists(abs))) {
        chosen = cursor;
        candidatePath = abs;
      }
      cursor++;
    }
    entries.push({
      id: formatTaskId(chosen),
      number: chosen,
      slug: baseSlug,
      title: baseTitle,
      fileName: basename(candidatePath),
      absPath: candidatePath,
      phase,
    });
  }
  return { entries, startNumber };
}

export function renderScaffoldMarkdown(entry: ScaffoldEntry): string {
  return `# ${entry.id} · ${entry.title}

> This file is a skeleton produced by \`vibeops task generate --scaffold\`. \`vibeops task done\` will refuse to advance the task until every section is filled in.

## Status

planned

## MVP Phase

${entry.phase}

## Goal

(scaffold — describe in 2-4 sentences what becomes possible when this TASK ships.)

## Background

(scaffold — why now, which earlier TASKs or decisions this builds on.)

## Scope

- (scaffold — item 1)
- (scaffold — item 2)

## Out of Scope

- (scaffold — items intentionally excluded)

## Acceptance Criteria

1. (scaffold — verifiable statement 1)
2. (scaffold — verifiable statement 2)

## Files to Inspect First

- (scaffold)

## Expected Files to Change

- new: (scaffold)
- update: (scaffold)

## Risks

- (scaffold)

## Test Plan

- (scaffold)

## Rollback Plan

- (scaffold — branch deletion or another recovery flow)

## Git Context

(populated by \`vibeops task start ${entry.id}\`)

## Notion Page

(populated by \`vibeops notion sync\`)

## Implementation Plan

1. (scaffold)

## Result

(not yet)

## Test Result

(not yet)

## Review Notes

(not yet)
`;
}

export async function writeScaffoldFiles(plan: ScaffoldPlan): Promise<string[]> {
  const written: string[] = [];
  for (const entry of plan.entries) {
    if (await pathExists(entry.absPath)) continue;
    await writeText(entry.absPath, renderScaffoldMarkdown(entry));
    written.push(entry.absPath);
  }
  return written;
}
