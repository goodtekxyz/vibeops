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
  const phase = inputs.phase ?? "(미정)";
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

> 이 파일은 \`vibeops task generate --scaffold\` 가 만든 골격이다. 모든 섹션의 본문을 채우기 전까지 \`vibeops task done\`은 거부된다.

## Status

planned

## MVP Phase

${entry.phase}

## Goal

(scaffold — 이 TASK가 끝나면 무엇이 가능해지는지 2 ~ 4문장으로 채워라.)

## Background

(scaffold — 왜 지금 이게 필요한지, 어떤 이전 TASK / 결정 위에 올라가는지.)

## Scope

- (scaffold — 다룰 항목 1)
- (scaffold — 다룰 항목 2)

## Out of Scope

- (scaffold — 명시적으로 빠지는 항목)

## Acceptance Criteria

1. (scaffold — 검증 가능한 문장 1)
2. (scaffold — 검증 가능한 문장 2)

## Files to Inspect First

- (scaffold)

## Expected Files to Change

- 신규: (scaffold)
- 갱신: (scaffold)

## Risks

- (scaffold)

## Test Plan

- (scaffold)

## Rollback Plan

- (scaffold — 브랜치 폐기 또는 별도 절차)

## Git Context

(시작 시 \`vibeops task start ${entry.id}\`이 채움)

## Notion Page

(MVP 4 / TASK-011 \`vibeops notion sync\`가 채움)

## Implementation Plan

1. (scaffold)

## Result

(미수행)

## Test Result

(미수행)

## Review Notes

(미수행)
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
