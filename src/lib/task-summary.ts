/**
 * Small text-extraction helpers used by `vibeops notion sync` and
 * `vibeops task pull`.
 *
 * Everything here is read-only (`extract*`) or returns new strings the caller
 * may write back (`upsertNotionPageSection`, `renderPulledTaskMarkdown`).
 *
 * Goal/Background extraction is deliberately heuristic:
 *   - we strip markdown bullet/numbering prefixes,
 *   - we collapse blank-line groups so the first non-empty paragraph wins,
 *   - we truncate to `NOTION_TEXT_LIMIT` (default 1500 chars).
 *
 * We never include placeholder content such as `(not yet)`, legacy localized
 * placeholders, or `(scaffolded ...)`; those become an empty string.
 */

import { readTextOrNull, writeText } from "./filesystem.js";
import { isPlaceholderContent, readSection } from "./task.js";
import { truncate } from "./notion-mappers.js";

const PLACEHOLDER_RE = new RegExp(
  String.raw`^\(.*(not yet|fill in|unassigned|scaffold|\uBBF8\uC218\uD589|\uBBF8\uC815|\uCC44\uC6CC\uB77C).*\)$`,
  "i",
);

function stripBullet(line: string): string {
  return line.replace(/^\s*(?:[-*+]|\d+\.)\s+/, "").trim();
}

function isHeading(line: string): boolean {
  return /^#{1,6}\s+/.test(line);
}

function compressBlank(lines: string[]): string {
  const out: string[] = [];
  let blank = false;
  for (const raw of lines) {
    const line = raw.replace(/\s+$/u, "");
    if (line.length === 0) {
      if (!blank && out.length > 0) out.push("");
      blank = true;
      continue;
    }
    blank = false;
    out.push(line);
  }
  return out.join("\n").trim();
}

/**
 * Pull a flattened, single-string summary from a `## Section`. Bullet points
 * and numbered list items are joined with " · ". Placeholder bodies become "".
 */
export function summarizeSection(body: string, title: string, limit?: number): string {
  const raw = readSection(body, title);
  if (raw.length === 0) return "";
  if (isPlaceholderContent(raw)) return "";
  const lines = raw.split("\n");
  const cleaned: string[] = [];
  for (const line of lines) {
    const t = line.trim();
    if (t.length === 0) {
      cleaned.push("");
      continue;
    }
    if (PLACEHOLDER_RE.test(t)) continue;
    if (isHeading(t)) continue;
    cleaned.push(stripBullet(t));
  }
  const compact = compressBlank(cleaned);
  return truncate(compact, limit);
}

export function summarizeGoal(body: string, limit?: number): string {
  const goal = summarizeSection(body, "Goal", limit);
  if (goal.length > 0) return goal;
  return summarizeSection(body, "Background", limit);
}

export function summarizeResult(body: string, limit?: number): string {
  return summarizeSection(body, "Result", limit);
}

/**
 * Best-effort: pull the very first non-heading paragraph from an arbitrary
 * markdown body (e.g. `docs/project/00-overview.md`). Returns "" if nothing
 * useful is found.
 */
export function summarizeMarkdownLead(body: string, limit?: number): string {
  const lines = body.split("\n");
  const collected: string[] = [];
  let started = false;
  for (const raw of lines) {
    const t = raw.trim();
    if (t.length === 0) {
      if (started) break;
      continue;
    }
    if (isHeading(t)) {
      if (started) break;
      continue;
    }
    if (t.startsWith(">")) continue;
    started = true;
    collected.push(stripBullet(t));
  }
  return truncate(collected.join(" ").trim(), limit);
}

/**
 * Heuristic: scan `docs/project/05-current-state.md` (or any markdown) for an
 * "MVP 1 ~ N" hint. Falls back to the first heading-derived MVP token.
 */
export function detectCurrentPhase(body: string): string {
  if (body.length === 0) return "";
  const m = body.match(/MVP\s*\d+(?:\s*[·•:\-]\s*[^\n]+)?/i);
  if (m) return m[0]!.trim().replace(/\s+/g, " ");
  return "";
}

// --- `## Notion Page` section management ----------------------------------

export interface NotionPageBlockInputs {
  pageId: string;
  docsRelativePath: string;
}

export function renderNotionPageBlock(inputs: NotionPageBlockInputs): string {
  return [
    `- Page ID: \`${inputs.pageId}\``,
    `- Docs Path: \`${inputs.docsRelativePath}\``,
  ].join("\n");
}

const NOTION_PAGE_RE = /^-\s+Page ID:\s*`([^`]+)`/m;

export function readNotionPageId(body: string): string | null {
  const section = readSection(body, "Notion Page");
  if (section.length === 0) return null;
  const m = section.match(NOTION_PAGE_RE);
  return m ? m[1]!.trim() : null;
}

/**
 * Replace the body of an existing `## Notion Page` section, or append the
 * section to the file if it doesn't exist yet. Returns the new file body
 * (caller is responsible for writing it back).
 */
export function upsertNotionPageSection(
  body: string,
  inputs: NotionPageBlockInputs,
): string {
  const block = renderNotionPageBlock(inputs);
  const HEADING_RE = /^(##+)\s+(.+?)\s*$/;
  const lines = body.split("\n");
  let startIdx = -1;
  let endIdx = -1;
  let level = 2;
  for (let i = 0; i < lines.length; i++) {
    const m = HEADING_RE.exec(lines[i]!);
    if (!m) continue;
    if (m[2]!.trim().toLowerCase() !== "notion page") continue;
    startIdx = i;
    level = m[1]!.length;
    let j = i + 1;
    while (j < lines.length) {
      const nm = HEADING_RE.exec(lines[j]!);
      if (nm && nm[1]!.length <= level) break;
      j++;
    }
    endIdx = j;
    break;
  }
  if (startIdx < 0) {
    const trimmed = body.replace(/\s+$/u, "");
    return `${trimmed}\n\n## Notion Page\n\n${block}\n`;
  }
  const before = lines.slice(0, startIdx + 1);
  const after = lines.slice(endIdx);
  return [...before, "", block, "", ...after].join("\n").replace(/\n{3,}/g, "\n\n");
}

export async function writeNotionPageSection(
  filePath: string,
  inputs: NotionPageBlockInputs,
): Promise<boolean> {
  const current = await readTextOrNull(filePath);
  if (current === null) return false;
  const next = upsertNotionPageSection(current, inputs);
  if (next === current) return false;
  await writeText(filePath, next);
  return true;
}

// --- render a pulled TASK skeleton ----------------------------------------

export interface PulledTaskInputs {
  taskId: string;
  title: string;
  status: string;
  mvpPhase: string;
  summary: string;
  pageId: string;
  docsRelativePath: string;
}

/**
 * Render the markdown body for a TASK file that `vibeops task pull` is
 * creating from a Notion row. Always uses the 18-section skeleton so the
 * downstream `vibeops task done` validation can still run.
 *
 * Only the fields Notion actually carries get prefilled; everything else
 * stays a placeholder.
 */
export function renderPulledTaskMarkdown(inputs: PulledTaskInputs): string {
  const title = inputs.title.length > 0 ? inputs.title : "(pulled from Notion — fill in)";
  const status = inputs.status.length > 0 ? inputs.status : "planned";
  const phase = inputs.mvpPhase.length > 0 ? inputs.mvpPhase : "(unassigned)";
  const summary = inputs.summary.length > 0 ? inputs.summary : "(Notion Summary is empty — fill in.)";
  const notionBlock = renderNotionPageBlock({
    pageId: inputs.pageId,
    docsRelativePath: inputs.docsRelativePath,
  });

  return `# ${inputs.taskId} · ${title}

> This file was generated by \`vibeops task pull\` from Notion metadata. The body is empty — the Builder/Planner Agent should fill it in.

## Status

${status}

## MVP Phase

${phase}

## Goal

${summary}

## Background

(pulled — fill in context beyond the Notion Summary.)

## Scope

- (pulled — Scope item 1)
- (pulled — Scope item 2)

## Out of Scope

- (pulled)

## Acceptance Criteria

1. (pulled — verifiable statement 1)
2. (pulled — verifiable statement 2)

## Files to Inspect First

- (pulled)

## Expected Files to Change

- new: (pulled)
- update: (pulled)

## Risks

- (pulled)

## Test Plan

- (pulled)

## Rollback Plan

- (pulled)

## Git Context

(populated by \`vibeops task start ${inputs.taskId}\`)

## Notion Page

${notionBlock}

## Implementation Plan

1. (pulled)

## Result

(not yet)

## Test Result

(not yet)

## Review Notes

(not yet)
`;
}
