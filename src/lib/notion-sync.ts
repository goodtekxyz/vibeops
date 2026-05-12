/**
 * Planning + execution helpers for `vibeops notion sync`.
 *
 * Layers:
 *   1. `loadSyncContext` — read everything we need (config, token, schema,
 *      project docs, tasks). Pure I/O. No Notion calls.
 *   2. `buildProjectRow` / `buildTaskRow` — pure synchronous mappers from
 *      local data → Notion property objects. Easy to unit-test.
 *   3. `planProjectSync` / `planTaskSync` — given a context + an *existing*
 *      Notion DB schema, decide what to push. Returns a plan that includes
 *      the Notion property object so the caller can either dry-print or hand
 *      it to `executeSync*` for the real API call.
 *   4. `findExistingProject` / `findExistingTask` — query Notion to discover
 *      whether the upsert target already exists. These are the only
 *      network-bound helpers in this file.
 *   5. `executeProjectUpsert` / `executeTaskUpsert` — perform the actual
 *      `pages.create` or `pages.update` call.
 *
 * Notion API mutation lives behind `executeProjectUpsert` /
 * `executeTaskUpsert` only — callers passing `dryRun: true` MUST skip both.
 */

import { relative } from "node:path";

import { gitRemoteUrl } from "./git.js";
import {
  PROJECTS_DB_PROPERTIES,
  TASKS_DB_PROPERTIES,
  validateDatabaseSchema,
  type PropertyRequirement,
  type SchemaViolation,
} from "./notion-schema.js";
import {
  resolveNotionDataSourceTarget,
  type ResolveResult,
} from "./notion-target.js";
import {
  andFilter,
  gitRepoProperty,
  mapTaskStatusToNotion,
  readRichText,
  readStatus,
  readTitle,
  richTextEqualsFilter,
  richTextProperty,
  selectProperty,
  statusProperty,
  titleProperty,
} from "./notion-mappers.js";
import { loadNotionEnv } from "./notion-env.js";
import {
  notionProjectsTargetId,
  notionTasksTargetId,
  readConfig,
} from "./config.js";
import { readTextOrNull } from "./filesystem.js";
import { projectPaths } from "./paths.js";
import { join } from "node:path";
import { readGitContext, scanTasks } from "./task.js";
import type { TaskMeta } from "../types/task.js";
import {
  detectCurrentPhase,
  summarizeGoal,
  summarizeMarkdownLead,
  summarizeResult,
} from "./task-summary.js";
import {
  createNotionClient,
  notionApiError,
  type NotionApiError,
  type NotionClient,
} from "./notion-client.js";
import type { NotionConfig, VibeopsConfig } from "../types/config.js";

// ─── pre-flight ───────────────────────────────────────────────────────────

export interface SyncContextFailure {
  ok: false;
  reason:
    | "no-config"
    | "notion-not-enabled"
    | "no-projects-db"
    | "no-tasks-db"
    | "no-token";
  message: string;
}

export interface ProjectInfo {
  /** raw .vibeops.json data */
  config: VibeopsConfig;
  /** `name` from .vibeops.json — also used as Project ID for matching */
  projectId: string;
  projectName: string;
  /** absolute project root */
  cwd: string;
  /** relative path of docs/project (display only) */
  docsProjectPath: string;
  /** Notion-bound summary derived from `docs/project/00-overview.md` */
  overviewSummary: string;
  /** current MVP phase token derived from `docs/project/{05,03}-current-state.md` */
  currentPhase: string;
  /** origin remote URL (may be empty string) */
  gitRepoUrl: string;
}

export interface LoadedSyncContext {
  ok: true;
  cwd: string;
  notion: NotionConfig;
  /** raw token — DO NOT print */
  token: string;
  tokenSource: ".vibeops.env" | "process.env" | "none";
  project: ProjectInfo;
  tasks: TaskMeta[];
}

export type SyncContextResult = SyncContextFailure | LoadedSyncContext;

export async function loadSyncContext(cwd: string): Promise<SyncContextResult> {
  const config = await readConfig(cwd);
  if (config === null) {
    return {
      ok: false,
      reason: "no-config",
      message: ".vibeops.json not found. Run `vibeops init` first.",
    };
  }
  const notion = config.notion;
  if (notion === undefined || !notion.enabled) {
    return {
      ok: false,
      reason: "notion-not-enabled",
      message:
        "Notion integration is disabled. Enable it with `vibeops notion init --enable` and set the DB ids.",
    };
  }
  if (notionProjectsTargetId(notion).length === 0) {
    return {
      ok: false,
      reason: "no-projects-db",
      message:
        "`.vibeops.json` `notion.projectsTargetId` or `notion.projectsDatabaseId` is empty. Fill it in with `vibeops notion init`.",
    };
  }
  if (notionTasksTargetId(notion).length === 0) {
    return {
      ok: false,
      reason: "no-tasks-db",
      message:
        "`.vibeops.json` `notion.tasksTargetId` or `notion.tasksDatabaseId` is empty. Fill it in with `vibeops notion init`.",
    };
  }
  const env = await loadNotionEnv(cwd);
  if (env.token === null) {
    return {
      ok: false,
      reason: "no-token",
      message:
        "`NOTION_TOKEN` not found. Set it in `.vibeops.env` or as an environment variable (NOTION_TOKEN=secret_...).",
    };
  }

  const paths = projectPaths(cwd);
  const overviewPath = join(paths.docsProject, "00-overview.md");
  const overviewRaw = (await readTextOrNull(overviewPath)) ?? "";
  const overviewSummary = summarizeMarkdownLead(overviewRaw);

  // `docs/project/05-current-state.md` is the canonical name; the VibeOps
  // repo itself still uses the legacy `03-current-state.md` filename. Honour both.
  let currentStateRaw =
    (await readTextOrNull(join(paths.docsProject, "05-current-state.md"))) ?? "";
  if (currentStateRaw.length === 0) {
    currentStateRaw =
      (await readTextOrNull(join(paths.docsProject, "03-current-state.md"))) ?? "";
  }
  const currentPhase = detectCurrentPhase(currentStateRaw) || "MVP";

  const gitRepoUrl = (await gitRemoteUrl(cwd, "origin")) ?? "";

  const tasks = await scanTasks(paths.docsTasks);

  return {
    ok: true,
    cwd,
    notion,
    token: env.token,
    tokenSource: env.source,
    project: {
      config,
      projectId: config.name,
      projectName: config.name,
      cwd,
      docsProjectPath: relative(cwd, paths.docsProject) || "docs/project",
      overviewSummary,
      currentPhase,
      gitRepoUrl,
    },
    tasks,
  };
}

// ─── schema discovery ─────────────────────────────────────────────────────

export interface SchemaReport {
  /**
   * Object kind of the **input** id (whatever Notion called it on the first
   * call). For VibeOps' typical workflow this is `"database"`.
   */
  inputObject: string;
  /**
   * Object kind of the **resolved** target — `"data_source"` (current API)
   * or `"database"` (legacy / very old SDK fallback).
   */
  resolvedObject: string;
  /** Id the caller passed in (`.vibeops.json` value). */
  inputId: string;
  /** Id whose schema we actually validated against. */
  resolvedId: string;
  /** How the resolver landed on `resolvedId`. */
  source: "input-data-source" | "database-default-data-source" | "legacy-database";
  /** Optional title text echoed by Notion for diagnostic display. */
  title?: string;
  /** Parent database id for `database-default-data-source` results. */
  parentDatabaseId?: string;
  /** Extracted `properties` map; `{}` if the resolver failed. */
  properties: Record<string, unknown>;
  /** True when the resolver could not produce a properties map. */
  propertiesMissing: boolean;
  /** Violations against `required` (`[missing-properties]` if propertiesMissing). */
  violations: SchemaViolation[];
  /** Detected type of "Git Repo" property (rich_text | url | ""). */
  gitRepoType: "rich_text" | "url" | "";
  /** Resolver warnings (e.g. "database has 3 data_sources — used [0]"). */
  warnings: string[];
}

export interface FetchedSchemas {
  ok: true;
  projects: SchemaReport;
  tasks: SchemaReport;
}

export interface SchemaFetchFailure {
  ok: false;
  reason: "projects-retrieve" | "tasks-retrieve";
  error: NotionApiError;
}

export type SchemaFetchResult = FetchedSchemas | SchemaFetchFailure;

/**
 * Convert a `ResolveResult` into a {@link SchemaReport}.
 *
 * Always returns — `ok: false` paths surface as a `missing-properties`
 * violation so callers can render a meaningful diagnostic without crashing.
 */
function reportFromResolved(
  required: readonly PropertyRequirement[],
  db: "projects" | "tasks",
  resolved: ResolveResult,
  fallbackId: string,
): SchemaReport {
  if (!resolved.ok) {
    return {
      inputObject: resolved.partial?.inputObject ?? "(unknown)",
      resolvedObject: "(unresolved)",
      inputId: fallbackId,
      resolvedId: "",
      source: "input-data-source",
      properties: {},
      propertiesMissing: true,
      violations: [
        {
          db,
          property: "(properties)",
          kind: "missing-properties",
          allowedTypes: [],
          description: resolved.message,
        },
      ],
      gitRepoType: "",
      warnings: [],
    };
  }
  const violations = validateDatabaseSchema({
    db,
    required,
    retrieveResponse: resolved.properties,
  });
  const gitRepoProp = resolved.properties["Git Repo"] as { type?: string } | undefined;
  const gitRepoType: "rich_text" | "url" | "" =
    gitRepoProp?.type === "url" || gitRepoProp?.type === "rich_text"
      ? gitRepoProp.type
      : "";
  return {
    inputObject: resolved.inputObject,
    resolvedObject: resolved.resolvedObject,
    inputId: resolved.inputId,
    resolvedId: resolved.resolvedId,
    source: resolved.source,
    ...(resolved.title !== undefined ? { title: resolved.title } : {}),
    ...(resolved.parentDatabaseId !== undefined
      ? { parentDatabaseId: resolved.parentDatabaseId }
      : {}),
    properties: resolved.properties,
    propertiesMissing: false,
    violations,
    gitRepoType,
    warnings: resolved.warnings,
  };
}

export async function fetchSchemas(
  client: NotionClient,
  notion: NotionConfig,
): Promise<SchemaFetchResult> {
  let projectsResolved: ResolveResult;
  try {
    projectsResolved = await resolveNotionDataSourceTarget(
      client,
      notionProjectsTargetId(notion),
      "projects",
    );
  } catch (err) {
    return { ok: false, reason: "projects-retrieve", error: notionApiError(err) };
  }
  let tasksResolved: ResolveResult;
  try {
    tasksResolved = await resolveNotionDataSourceTarget(
      client,
      notionTasksTargetId(notion),
      "tasks",
    );
  } catch (err) {
    return { ok: false, reason: "tasks-retrieve", error: notionApiError(err) };
  }
  // All structured resolver failures (transport / no-data-source /
  // no-properties) funnel through `reportFromResolved` so the CLI can show
  // its rich `${kind} DB target` block + the resolver's actionable hint.
  // We only fast-fail on resolver-side exceptions (caught above).
  return {
    ok: true,
    projects: reportFromResolved(
      PROJECTS_DB_PROPERTIES,
      "projects",
      projectsResolved,
      notionProjectsTargetId(notion),
    ),
    tasks: reportFromResolved(
      TASKS_DB_PROPERTIES,
      "tasks",
      tasksResolved,
      notionTasksTargetId(notion),
    ),
  };
}

// ─── property builders ────────────────────────────────────────────────────

export function buildProjectProperties(
  project: ProjectInfo,
  gitRepoType: "rich_text" | "url" | "",
): Record<string, unknown> {
  return {
    Name: titleProperty(project.projectName),
    "Project ID": richTextProperty(project.projectId),
    Status: statusProperty("Building"),
    "Local Path": richTextProperty(project.cwd),
    "Git Repo": gitRepoProperty(
      project.gitRepoUrl,
      gitRepoType === "url" ? "url" : "rich_text",
    ),
    "Current Phase": selectProperty(project.currentPhase),
    "Docs Path": richTextProperty(project.docsProjectPath),
    Summary: richTextProperty(project.overviewSummary),
  };
}

export interface BuiltTaskRow {
  taskId: string;
  title: string;
  docsRelativePath: string;
  properties: Record<string, unknown>;
}

export async function buildTaskRow(
  task: TaskMeta,
  ctx: LoadedSyncContext,
): Promise<BuiltTaskRow> {
  const body = (await readTextOrNull(task.filePath)) ?? "";
  const goal = summarizeGoal(body);
  const result = summarizeResult(body);
  const gitContext = await readGitContext(task.filePath).catch(() => null);
  const gitBranch = gitContext?.taskBranch ?? "";
  const docsRelativePath = relative(ctx.cwd, task.filePath) || task.filePath;
  const properties: Record<string, unknown> = {
    Name: titleProperty(task.title.length > 0 ? task.title : task.id),
    "Task ID": richTextProperty(task.id),
    "Project ID": richTextProperty(ctx.project.projectId),
    Status: statusProperty(mapTaskStatusToNotion(task.status)),
    Priority: selectProperty(task.priority ?? "P2"),
    "MVP Phase": selectProperty(task.mvpPhase ?? ""),
    "Git Branch": richTextProperty(gitBranch),
    "Docs Path": richTextProperty(docsRelativePath),
    Summary: richTextProperty(goal),
    "Result Summary": richTextProperty(result),
  };
  return {
    taskId: task.id,
    title: task.title,
    docsRelativePath,
    properties,
  };
}

// ─── query / upsert ───────────────────────────────────────────────────────

export interface ExistingPage {
  id: string;
  properties: Record<string, unknown>;
}

export async function findExistingProject(
  client: NotionClient,
  dataSourceId: string,
  projectId: string,
): Promise<ExistingPage | null> {
  const res = await client.queryDataSource(dataSourceId, {
    filter: richTextEqualsFilter("Project ID", projectId),
    pageSize: 1,
  });
  const page = res.results[0];
  return page ? { id: page.id, properties: page.properties } : null;
}

export async function findExistingTask(
  client: NotionClient,
  dataSourceId: string,
  projectId: string,
  taskId: string,
): Promise<ExistingPage | null> {
  const res = await client.queryDataSource(dataSourceId, {
    filter: andFilter([
      richTextEqualsFilter("Task ID", taskId),
      richTextEqualsFilter("Project ID", projectId),
    ]),
    pageSize: 1,
  });
  const page = res.results[0];
  return page ? { id: page.id, properties: page.properties } : null;
}

/**
 * Task IDs that VibeOps never pushes to Notion. `TASK-000-template.md` is a
 * scaffolding template that lives in `docs/tasks/` only so `task generate`
 * has a stable copy to clone — Notion should not show it as a real TASK row.
 */
export const SYNC_EXCLUDED_TASK_IDS = new Set(["TASK-000"]);

// ─── high-level plan + execute ────────────────────────────────────────────

export type UpsertVerb = "create" | "update";

export interface ProjectPlanEntry {
  verb: UpsertVerb;
  /** existing Notion page (only set when verb === "update") */
  existingPageId: string | null;
  properties: Record<string, unknown>;
}

export interface TaskPlanEntry {
  taskId: string;
  title: string;
  docsRelativePath: string;
  verb: UpsertVerb;
  existingPageId: string | null;
  properties: Record<string, unknown>;
}

export interface SyncPlan {
  project: ProjectPlanEntry | null;
  tasks: TaskPlanEntry[];
  /** total counts for summary printing */
  counts: { project: { create: number; update: number }; tasks: { create: number; update: number } };
}

export interface PlanInputs {
  ctx: LoadedSyncContext;
  schemas: FetchedSchemas;
  /** when true, perform Notion queries to detect existing pages (recommended) */
  detectExisting: boolean;
  onlyTasks?: boolean;
  onlyProject?: boolean;
  client: NotionClient;
}

export async function planSync(inputs: PlanInputs): Promise<SyncPlan> {
  const { ctx, schemas, detectExisting, client } = inputs;
  const plan: SyncPlan = {
    project: null,
    tasks: [],
    counts: {
      project: { create: 0, update: 0 },
      tasks: { create: 0, update: 0 },
    },
  };
  if (inputs.onlyTasks !== true) {
    const props = buildProjectProperties(ctx.project, schemas.projects.gitRepoType);
    let existing: ExistingPage | null = null;
    if (detectExisting) {
      existing = await findExistingProject(
        client,
        schemas.projects.resolvedId,
        ctx.project.projectId,
      );
    }
    const verb: UpsertVerb = existing ? "update" : "create";
    plan.project = {
      verb,
      existingPageId: existing?.id ?? null,
      properties: props,
    };
    plan.counts.project[verb]++;
  }
  if (inputs.onlyProject !== true) {
    for (const task of ctx.tasks) {
      if (SYNC_EXCLUDED_TASK_IDS.has(task.id)) continue;
      const row = await buildTaskRow(task, ctx);
      let existing: ExistingPage | null = null;
      if (detectExisting) {
        existing = await findExistingTask(
          client,
          schemas.tasks.resolvedId,
          ctx.project.projectId,
          task.id,
        );
      }
      const verb: UpsertVerb = existing ? "update" : "create";
      plan.tasks.push({
        taskId: task.id,
        title: row.title,
        docsRelativePath: row.docsRelativePath,
        verb,
        existingPageId: existing?.id ?? null,
        properties: row.properties,
      });
      plan.counts.tasks[verb]++;
    }
  }
  return plan;
}

// ─── execute (mutation — never call from dry-run) ─────────────────────────

export interface ExecutedRow {
  verb: UpsertVerb;
  pageId: string;
  taskId?: string;
}

export async function executeProjectUpsert(
  client: NotionClient,
  dataSourceId: string,
  entry: ProjectPlanEntry,
): Promise<ExecutedRow> {
  if (entry.verb === "update" && entry.existingPageId !== null) {
    const res = await client.updatePage({
      pageId: entry.existingPageId,
      properties: entry.properties,
    });
    return { verb: "update", pageId: res.id };
  }
  const res = await client.createPageInDataSource({
    dataSourceId,
    properties: entry.properties,
  });
  return { verb: "create", pageId: res.id };
}

export async function executeTaskUpsert(
  client: NotionClient,
  dataSourceId: string,
  entry: TaskPlanEntry,
): Promise<ExecutedRow> {
  if (entry.verb === "update" && entry.existingPageId !== null) {
    const res = await client.updatePage({
      pageId: entry.existingPageId,
      properties: entry.properties,
    });
    return { verb: "update", pageId: res.id, taskId: entry.taskId };
  }
  const res = await client.createPageInDataSource({
    dataSourceId,
    properties: entry.properties,
  });
  return { verb: "create", pageId: res.id, taskId: entry.taskId };
}

// ─── helpers for command output ───────────────────────────────────────────

export function readExistingProjectIdentity(page: ExistingPage): {
  name: string;
  projectId: string;
} {
  return {
    name: readTitle(page.properties.Name),
    projectId: readRichText(page.properties["Project ID"]),
  };
}

export function readExistingTaskStatus(page: ExistingPage): string {
  return readStatus(page.properties.Status);
}

// re-export so commands don't need a second import
export { createNotionClient };
