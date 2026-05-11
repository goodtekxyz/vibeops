/**
 * Planning + execution helpers for `vibeops task pull`.
 *
 * Notion is queried for TASK rows whose Status matches `--status` (default
 * "Planned"). For each row that does NOT yet have a local TASK file we plan
 * a new `docs/tasks/TASK-NNN-slug.md` skeleton.
 *
 * Rules:
 *   - Never overwrite an existing local file.
 *   - Never write any TASK body section beyond the Notion-sourced metadata.
 *   - Always include a `## Notion Page` section so `notion sync` can later
 *     update the same row in place.
 *
 * Mutation surface:
 *   - `executePullEntry` writes the local file and (if Docs Path on Notion
 *     was empty) optionally updates the Notion page's Docs Path. Callers in
 *     dry-run mode MUST skip this.
 */

import { readdir } from "node:fs/promises";
import { basename, join, posix } from "node:path";

import { pathExists, writeText } from "./filesystem.js";
import { projectPaths } from "./paths.js";
import {
  formatTaskId,
  highestTaskNumber,
} from "./task.js";
import { slugify } from "./task-generator.js";
import {
  readRichText,
  readSelect,
  readStatus,
  readTitle,
  richTextEqualsFilter,
  richTextProperty,
  statusEqualsFilter,
  andFilter,
} from "./notion-mappers.js";
import {
  renderPulledTaskMarkdown,
} from "./task-summary.js";
import type {
  NotionClient,
  NotionPageRef,
} from "./notion-client.js";

export interface NotionTaskRow {
  pageId: string;
  taskId: string;
  name: string;
  status: string;
  mvpPhase: string;
  priority: string;
  summary: string;
  docsPath: string;
}

export function rowFromNotionPage(page: NotionPageRef): NotionTaskRow {
  const p = page.properties;
  return {
    pageId: page.id,
    taskId: readRichText(p["Task ID"]),
    name: readTitle(p.Name),
    status: readStatus(p.Status),
    mvpPhase: readSelect(p["MVP Phase"]),
    priority: readSelect(p.Priority),
    summary: readRichText(p.Summary),
    docsPath: readRichText(p["Docs Path"]),
  };
}

export type PullSkipReason =
  | "no-task-id"
  | "local-file-exists"
  | "docs-path-mismatch"
  | "docs-path-conflict"
  | "duplicate-task-id";

export interface PullSkip {
  pageId: string;
  taskId: string;
  reason: PullSkipReason;
  /** docs path VibeOps proposed / observed (best effort, may be empty). */
  docsRelativePath: string;
  /**
   * Free-form, token-safe context for verbose / debug output. Surface this
   * verbatim when `--verbose` is on. Format keeps to short labelled lines.
   */
  detail?: string;
}

export interface PullEntry {
  pageId: string;
  /** task id to use locally (may have been re-allocated if Notion had none) */
  taskId: string;
  /** title for the H1 line */
  title: string;
  status: string;
  mvpPhase: string;
  summary: string;
  docsRelativePath: string;
  absPath: string;
  /** whether Notion's "Docs Path" needs to be updated to point here */
  notionNeedsDocsPath: boolean;
  /** Short token-safe label why this row was selected (verbose / debug). */
  detail?: string;
}

/**
 * Per-row trace VibeOps surfaces under `--verbose`. Carries the same fields
 * the user asked for in TASK-011 follow-up #7 so they can reproduce a
 * mismatch without re-reading Notion. Never carries the bearer token.
 */
export interface PullDecisionTrace {
  taskId: string;
  pageId: string;
  /** raw Notion Docs Path (may be empty / mismatched) */
  notionDocsPath: string;
  /** path VibeOps resolved against the local repo */
  localResolvedPath: string;
  /** which branch of the decision tree we took (one short label) */
  decision:
    | "skip-no-task-id"
    | "skip-duplicate-task-id"
    | "skip-docs-path-mismatch"
    | "skip-local-file-exists"
    | "new-file";
  reason: string;
}

export interface PullPlan {
  /** rows that would result in new local files */
  entries: PullEntry[];
  /** rows we deliberately skipped (already exist on disk, malformed, etc) */
  skipped: PullSkip[];
  /** how many Notion rows we scanned in total */
  considered: number;
  /**
   * Per-considered-row decision trace, in scan order. Same length as
   * `considered`. Surface under `--verbose`; default output stays terse.
   */
  trace: PullDecisionTrace[];
}

export interface PlanPullInputs {
  cwd: string;
  client: NotionClient;
  /**
   * Resolved Notion `data_source` id for the Tasks DB. Must come from
   * `fetchSchemas(...).tasks.resolvedId` so dry-run and the actual pull
   * hit the same surface (no silent fallback to a container database id).
   */
  tasksDataSourceId: string;
  projectId: string;
  /** Notion status name(s) to fetch (default: ["Planned"]) */
  statusNames?: readonly string[];
  /** max rows to fetch (default 20) */
  limit?: number;
}

const DEFAULT_STATUS_NAMES = ["Planned"] as const;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

function buildPullFilter(
  projectId: string,
  statusNames: readonly string[],
): Record<string, unknown> {
  const statusFilters = statusNames.map((n) => statusEqualsFilter("Status", n));
  const statusFilter: Record<string, unknown> =
    statusFilters.length === 1
      ? (statusFilters[0] as Record<string, unknown>)
      : { or: statusFilters };
  return andFilter([
    richTextEqualsFilter("Project ID", projectId),
    statusFilter,
  ]);
}

/**
 * Notion `Docs Path` is **trusted only when its basename matches the TASK
 * ID**. A row whose Task ID is `TASK-099` but whose Docs Path points at
 * `docs/tasks/TASK-012-package-polish-readme.md` is a mismatch — surfacing
 * it as `local-file-exists` silently shadows the real TASK-099 candidate.
 *
 * Acceptable basenames (case sensitive — Notion is case sensitive here):
 *   - `TASK-099.md`
 *   - `TASK-099-anything.md`  (the standard `TASK-NNN-slug.md` form)
 *
 * Anything else is a mismatch.
 */
export function docsPathMatchesTaskId(
  docsRelativePath: string,
  taskId: string,
): boolean {
  if (docsRelativePath.length === 0 || taskId.length === 0) return false;
  const base = basename(docsRelativePath);
  return base === `${taskId}.md` || base.startsWith(`${taskId}-`);
}

/** Scan `docs/tasks` for any file whose basename starts with `TASK-NNN`. */
async function findLocalTaskFileForId(
  docsTasksDir: string,
  taskId: string,
): Promise<string | null> {
  let entries: string[];
  try {
    entries = await readdir(docsTasksDir);
  } catch {
    return null;
  }
  for (const name of entries) {
    if (name === `${taskId}.md` || name.startsWith(`${taskId}-`)) {
      return join(docsTasksDir, name);
    }
  }
  return null;
}

export async function planPull(inputs: PlanPullInputs): Promise<PullPlan> {
  const statusNames = inputs.statusNames ?? DEFAULT_STATUS_NAMES;
  const limit = Math.max(1, Math.min(inputs.limit ?? DEFAULT_LIMIT, MAX_LIMIT));
  const res = await inputs.client.queryDataSource(inputs.tasksDataSourceId, {
    filter: buildPullFilter(inputs.projectId, statusNames),
    pageSize: limit,
  });
  const paths = projectPaths(inputs.cwd);
  const startCounter = await highestTaskNumber(paths.docsTasks);
  let nextNumber = startCounter + 1;

  const entries: PullEntry[] = [];
  const skipped: PullSkip[] = [];
  const trace: PullDecisionTrace[] = [];
  // First pass: detect duplicate Task IDs across the Notion query result so
  // a second row with the same id cannot quietly create a second entry. We
  // keep the first row and skip subsequent ones with `duplicate-task-id`.
  const seenTaskIds = new Set<string>();
  const duplicatePageIds = new Set<string>();
  for (const page of res.results) {
    const id = rowFromNotionPage(page).taskId.trim();
    if (id.length === 0) continue;
    if (seenTaskIds.has(id)) {
      duplicatePageIds.add(page.id);
    } else {
      seenTaskIds.add(id);
    }
  }

  for (const page of res.results) {
    const row = rowFromNotionPage(page);
    const notionDocsPath = row.docsPath.trim();

    // (A) Task ID required — guard against blank ids before we touch local fs.
    const taskIdRaw = row.taskId.trim();
    if (taskIdRaw.length === 0 && notionDocsPath.length === 0) {
      // No Task ID and no Docs Path → allocate a fresh one, treated as a
      // legitimate "new" candidate (existing behaviour). Trace it so
      // `--verbose` makes the allocation visible.
      const taskId = formatTaskId(nextNumber);
      nextNumber++;
      const slug = slugify(row.name.length > 0 ? row.name : taskId, taskId.toLowerCase());
      const docsRelativePath = posix.join("docs/tasks", `${taskId}-${slug}.md`);
      const absPath = join(paths.docsTasks, `${taskId}-${slug}.md`);
      // Even an allocated id may already be present on disk (race / manual
      // creation). Re-check.
      if (await pathExists(absPath)) {
        skipped.push({
          pageId: page.id,
          taskId,
          reason: "local-file-exists",
          docsRelativePath,
          detail: `local resolved path: ${docsRelativePath}`,
        });
        trace.push({
          taskId,
          pageId: page.id,
          notionDocsPath,
          localResolvedPath: docsRelativePath,
          decision: "skip-local-file-exists",
          reason: "Task ID was empty, allocated next id already on disk",
        });
        continue;
      }
      entries.push({
        pageId: page.id,
        taskId,
        title: row.name.length > 0 ? row.name : taskId,
        status: row.status,
        mvpPhase: row.mvpPhase,
        summary: row.summary,
        docsRelativePath,
        absPath,
        notionNeedsDocsPath: true,
        detail: "allocated Task ID (Notion row had none)",
      });
      trace.push({
        taskId,
        pageId: page.id,
        notionDocsPath: "",
        localResolvedPath: docsRelativePath,
        decision: "new-file",
        reason: "Task ID empty → allocated; no local file with that id",
      });
      continue;
    }
    if (taskIdRaw.length === 0) {
      // Has a Docs Path but no Task ID — refuse to act. Renaming pages from
      // empty ids is risky and not in TASK-011 scope.
      skipped.push({
        pageId: page.id,
        taskId: "(none)",
        reason: "no-task-id",
        docsRelativePath: notionDocsPath,
        detail: `notion docs path: ${notionDocsPath}`,
      });
      trace.push({
        taskId: "(none)",
        pageId: page.id,
        notionDocsPath,
        localResolvedPath: notionDocsPath,
        decision: "skip-no-task-id",
        reason: "Notion row has Docs Path but no Task ID",
      });
      continue;
    }
    const taskId = taskIdRaw;

    // (A.2) duplicate Task ID across the considered rows.
    if (duplicatePageIds.has(page.id)) {
      skipped.push({
        pageId: page.id,
        taskId,
        reason: "duplicate-task-id",
        docsRelativePath: notionDocsPath,
        detail: `another Notion row already used this Task ID in the same query`,
      });
      trace.push({
        taskId,
        pageId: page.id,
        notionDocsPath,
        localResolvedPath: "",
        decision: "skip-duplicate-task-id",
        reason: "duplicate Task ID across considered rows — kept first row only",
      });
      continue;
    }

    // (B) Notion Docs Path exists but does NOT match this Task ID. Refuse
    // to create / overwrite — surface a `docs-path-mismatch` so the user
    // can fix Notion. We deliberately do NOT auto-rename — auto-fixing
    // Notion's Docs Path on a mismatch is reserved for a future
    // `--fix-docs-path` opt-in.
    if (
      notionDocsPath.length > 0 &&
      !docsPathMatchesTaskId(notionDocsPath, taskId)
    ) {
      skipped.push({
        pageId: page.id,
        taskId,
        reason: "docs-path-mismatch",
        docsRelativePath: notionDocsPath,
        detail:
          `notion docs path: ${notionDocsPath}\n` +
          `expected basename prefix: ${taskId}- or ${taskId}.md\n` +
          `action: fix Notion 'Docs Path' for this row (auto-fix not enabled).`,
      });
      trace.push({
        taskId,
        pageId: page.id,
        notionDocsPath,
        localResolvedPath: notionDocsPath,
        decision: "skip-docs-path-mismatch",
        reason: `Notion Docs Path basename does not match ${taskId}- prefix`,
      });
      continue;
    }

    // (C) / (D) / (F) — resolve where the local file would live and check
    // for existing files. If Notion gave us a matching Docs Path, honour
    // it. Otherwise scan `docs/tasks` for any `TASK-NNN-*.md` already on
    // disk; if found, treat the row as `local-file-exists`. If not, plan a
    // new `TASK-NNN-slug.md`.
    const slug = slugify(row.name.length > 0 ? row.name : taskId, taskId.toLowerCase());
    let docsRelativePath: string;
    let absPath: string;
    let notionNeedsDocsPath: boolean;
    let decisionDetail: string;
    if (notionDocsPath.length > 0) {
      docsRelativePath = notionDocsPath;
      absPath = join(inputs.cwd, notionDocsPath);
      notionNeedsDocsPath = false;
      decisionDetail = `notion docs path: ${notionDocsPath}`;
    } else {
      const existing = await findLocalTaskFileForId(paths.docsTasks, taskId);
      if (existing !== null) {
        const rel = posix.join("docs/tasks", basename(existing));
        skipped.push({
          pageId: page.id,
          taskId,
          reason: "local-file-exists",
          docsRelativePath: rel,
          detail:
            `local resolved path: ${rel}\n` +
            `notion docs path: (empty)`,
        });
        trace.push({
          taskId,
          pageId: page.id,
          notionDocsPath: "",
          localResolvedPath: rel,
          decision: "skip-local-file-exists",
          reason:
            "Notion Docs Path empty, but a local file matching the Task ID was found on disk",
        });
        continue;
      }
      docsRelativePath = posix.join("docs/tasks", `${taskId}-${slug}.md`);
      absPath = join(paths.docsTasks, `${taskId}-${slug}.md`);
      notionNeedsDocsPath = true;
      decisionDetail = `local resolved path: ${docsRelativePath}`;
    }

    if (await pathExists(absPath)) {
      skipped.push({
        pageId: page.id,
        taskId,
        reason: "local-file-exists",
        docsRelativePath,
        detail: decisionDetail,
      });
      trace.push({
        taskId,
        pageId: page.id,
        notionDocsPath,
        localResolvedPath: docsRelativePath,
        decision: "skip-local-file-exists",
        reason:
          notionDocsPath.length > 0
            ? "Notion Docs Path matched Task ID and file already exists on disk"
            : "local search found a file matching the Task ID",
      });
      continue;
    }

    entries.push({
      pageId: page.id,
      taskId,
      title: row.name.length > 0 ? row.name : taskId,
      status: row.status,
      mvpPhase: row.mvpPhase,
      summary: row.summary,
      docsRelativePath,
      absPath,
      notionNeedsDocsPath,
      detail: decisionDetail,
    });
    trace.push({
      taskId,
      pageId: page.id,
      notionDocsPath,
      localResolvedPath: docsRelativePath,
      decision: "new-file",
      reason:
        notionDocsPath.length > 0
          ? "Notion Docs Path matched Task ID — local file does not exist yet"
          : "Notion Docs Path empty — planning fresh local file under docs/tasks",
    });
  }
  return { entries, skipped, considered: res.results.length, trace };
}

// ─── execute (mutation — never call from dry-run) ─────────────────────────

export interface ExecutedPullEntry {
  taskId: string;
  pageId: string;
  absPath: string;
  docsRelativePath: string;
  notionUpdated: boolean;
}

export async function executePullEntry(
  client: NotionClient,
  entry: PullEntry,
): Promise<ExecutedPullEntry> {
  const md = renderPulledTaskMarkdown({
    taskId: entry.taskId,
    title: entry.title,
    status: entry.status,
    mvpPhase: entry.mvpPhase,
    summary: entry.summary,
    pageId: entry.pageId,
    docsRelativePath: entry.docsRelativePath,
  });
  await writeText(entry.absPath, md);

  let notionUpdated = false;
  if (entry.notionNeedsDocsPath) {
    await client.updatePage({
      pageId: entry.pageId,
      properties: {
        "Docs Path": richTextProperty(entry.docsRelativePath),
      },
    });
    notionUpdated = true;
  }
  return {
    taskId: entry.taskId,
    pageId: entry.pageId,
    absPath: entry.absPath,
    docsRelativePath: entry.docsRelativePath,
    notionUpdated,
  };
}
