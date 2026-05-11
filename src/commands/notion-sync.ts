import { resolve } from "node:path";

import { bold, cyan, dim, gray, green, log, red, yellow } from "../lib/logger.js";
import { maskToken } from "../lib/notion-env.js";
import { notionApiError, type NotionApiError } from "../lib/notion-client.js";
import {
  MISSING_PROPERTIES_HINT,
  PROJECTS_DB_PROPERTIES,
  STATUS_OPTIONS_HINT,
  TASKS_DB_PROPERTIES,
  type SchemaViolation,
} from "../lib/notion-schema.js";
import {
  createNotionClient,
  executeProjectUpsert,
  executeTaskUpsert,
  fetchSchemas,
  loadSyncContext,
  planSync,
  type LoadedSyncContext,
  type ProjectPlanEntry,
  type SchemaFetchResult,
  type SyncContextResult,
  type SyncPlan,
  type TaskPlanEntry,
} from "../lib/notion-sync.js";

export interface NotionSyncOptions {
  dryRun?: boolean;
  json?: boolean;
  onlyTasks?: boolean;
  onlyProject?: boolean;
  cwd?: string;
}

interface SyncErrorPayload {
  reason: string;
  message: string;
  details?: unknown;
}

interface SyncReportEntry {
  kind: "project" | "task";
  verb: "create" | "update";
  taskId?: string;
  title?: string;
  pageId?: string | null;
  docsRelativePath?: string;
}

interface SchemaDiagnostic {
  kind: "projects" | "tasks";
  inputId: string;
  inputObject: string;
  resolvedId: string;
  resolvedObject: string;
  source: string;
  /**
   * Parent shape that `pages.create` will use. `data_source_id` is the
   * Notion 2025-09-03 surface; `database_id` is the legacy fallback.
   * Surfacing it makes dry-run output identical to the actual sync.
   */
  parentKind: "data_source_id" | "database_id";
  parentDatabaseId?: string;
  propertiesMissing: boolean;
  violationsCount: number;
  warnings: string[];
}

interface SyncReport {
  cwd: string;
  ok: boolean;
  dryRun: boolean;
  tokenMasked: string | null;
  notion: {
    enabled: boolean;
    projectsTargetId: string;
    tasksTargetId: string;
    projectsDatabaseId: string;
    tasksDatabaseId: string;
  } | null;
  project: {
    projectId: string;
    name: string;
    currentPhase: string;
    gitRepoUrl: string;
    docsPath: string;
  } | null;
  schemas?: SchemaDiagnostic[];
  counts: {
    project: { create: number; update: number };
    tasks: { create: number; update: number };
  };
  entries: SyncReportEntry[];
  errors: SyncErrorPayload[];
}

function emptyReport(cwd: string, dryRun: boolean): SyncReport {
  return {
    cwd,
    ok: false,
    dryRun,
    tokenMasked: null,
    notion: null,
    project: null,
    counts: {
      project: { create: 0, update: 0 },
      tasks: { create: 0, update: 0 },
    },
    entries: [],
    errors: [],
  };
}

export async function notionSyncCommand(
  options: NotionSyncOptions = {},
): Promise<void> {
  const cwd = resolve(options.cwd ?? process.cwd());
  const dryRun = options.dryRun === true;
  const wantJson = options.json === true;
  const report = emptyReport(cwd, dryRun);

  const ctxRes: SyncContextResult = await loadSyncContext(cwd);
  if (!ctxRes.ok) {
    report.errors.push({ reason: ctxRes.reason, message: ctxRes.message });
    return finalize(report, wantJson, "preflight");
  }
  const ctx: LoadedSyncContext = ctxRes;
  report.tokenMasked = maskToken(ctx.token);
  report.notion = {
    enabled: ctx.notion.enabled,
    projectsTargetId: ctx.notion.projectsTargetId,
    tasksTargetId: ctx.notion.tasksTargetId,
    projectsDatabaseId: ctx.notion.projectsDatabaseId,
    tasksDatabaseId: ctx.notion.tasksDatabaseId,
  };
  report.project = {
    projectId: ctx.project.projectId,
    name: ctx.project.projectName,
    currentPhase: ctx.project.currentPhase,
    gitRepoUrl: ctx.project.gitRepoUrl,
    docsPath: ctx.project.docsProjectPath,
  };

  let client;
  try {
    client = await createNotionClient(ctx.token);
  } catch (err) {
    const apiErr = notionApiError(err);
    report.errors.push({
      reason: "sdk-load",
      message: `@notionhq/client 로드 실패 — ${apiErr.message}`,
      details: apiErr,
    });
    return finalize(report, wantJson, "preflight");
  }

  const schemaRes: SchemaFetchResult = await fetchSchemas(client, ctx.notion);
  if (!schemaRes.ok) {
    report.errors.push({
      reason: schemaRes.reason,
      message: explainNotionError(schemaRes.error),
      details: schemaRes.error,
    });
    return finalize(report, wantJson, "preflight");
  }

  report.schemas = [
    {
      kind: "projects",
      inputId: schemaRes.projects.inputId,
      inputObject: schemaRes.projects.inputObject,
      resolvedId: schemaRes.projects.resolvedId,
      resolvedObject: schemaRes.projects.resolvedObject,
      source: schemaRes.projects.source,
      parentKind:
        schemaRes.projects.resolvedObject === "data_source"
          ? "data_source_id"
          : "database_id",
      ...(schemaRes.projects.parentDatabaseId !== undefined
        ? { parentDatabaseId: schemaRes.projects.parentDatabaseId }
        : {}),
      propertiesMissing: schemaRes.projects.propertiesMissing,
      violationsCount: schemaRes.projects.violations.length,
      warnings: schemaRes.projects.warnings,
    },
    {
      kind: "tasks",
      inputId: schemaRes.tasks.inputId,
      inputObject: schemaRes.tasks.inputObject,
      resolvedId: schemaRes.tasks.resolvedId,
      resolvedObject: schemaRes.tasks.resolvedObject,
      source: schemaRes.tasks.source,
      parentKind:
        schemaRes.tasks.resolvedObject === "data_source"
          ? "data_source_id"
          : "database_id",
      ...(schemaRes.tasks.parentDatabaseId !== undefined
        ? { parentDatabaseId: schemaRes.tasks.parentDatabaseId }
        : {}),
      propertiesMissing: schemaRes.tasks.propertiesMissing,
      violationsCount: schemaRes.tasks.violations.length,
      warnings: schemaRes.tasks.warnings,
    },
  ];

  const violations: SchemaViolation[] = [
    ...schemaRes.projects.violations,
    ...schemaRes.tasks.violations,
  ];
  if (violations.length > 0) {
    const propertiesMissing =
      schemaRes.projects.propertiesMissing ||
      schemaRes.tasks.propertiesMissing;
    const statusOptionsMissing = violations.some(
      (v) =>
        v.kind === "status-options-missing" ||
        v.kind === "status-options-unreadable",
    );
    let message: string;
    let reason: string;
    if (propertiesMissing) {
      message = `Notion DB 응답에 properties 객체가 없다. ${MISSING_PROPERTIES_HINT}`;
      reason = "schema-missing-properties";
    } else if (statusOptionsMissing) {
      message = `Notion Status 속성에 VibeOps 가 쓰는 option 이 부족하다 (${violations.length} 위반). ${STATUS_OPTIONS_HINT}`;
      reason = "schema-status-options";
    } else {
      message = `Notion DB 스키마가 VibeOps 요구사항과 다르다 (${violations.length} 위반).`;
      reason = "schema";
    }
    report.errors.push({
      reason,
      message,
      details: violations,
    });
    // Sync fast-fails BEFORE any mutation when schema is incomplete — even in
    // actual run we never partially upsert when status options are missing.
    return finalize(report, wantJson, "schema");
  }

  let plan: SyncPlan;
  try {
    plan = await planSync({
      ctx,
      schemas: schemaRes,
      detectExisting: true,
      onlyTasks: options.onlyTasks === true,
      onlyProject: options.onlyProject === true,
      client,
    });
  } catch (err) {
    const apiErr = notionApiError(err);
    report.errors.push({
      reason: "query",
      message: explainNotionError(apiErr),
      details: apiErr,
    });
    return finalize(report, wantJson, "query");
  }

  report.counts = plan.counts;
  if (plan.project) {
    report.entries.push(planEntryToReport(plan.project, ctx));
  }
  for (const t of plan.tasks) {
    report.entries.push(taskEntryToReport(t));
  }

  if (dryRun) {
    report.ok = true;
    return finalize(report, wantJson, "dry-run");
  }

  let mutateFailed = false;
  const projectsTargetId = schemaRes.projects.resolvedId;
  const projectsParentKind: ParentKind =
    schemaRes.projects.resolvedObject === "data_source" ? "data_source_id" : "database_id";
  const tasksTargetId = schemaRes.tasks.resolvedId;
  const tasksParentKind: ParentKind =
    schemaRes.tasks.resolvedObject === "data_source" ? "data_source_id" : "database_id";
  if (plan.project) {
    try {
      const r = await executeProjectUpsert(client, projectsTargetId, plan.project);
      const idx = report.entries.findIndex((e) => e.kind === "project");
      if (idx >= 0) report.entries[idx]!.pageId = r.pageId;
    } catch (err) {
      mutateFailed = true;
      const apiErr = notionApiError(err);
      report.errors.push({
        reason: "project-upsert",
        message: formatMutateError({
          err: apiErr,
          action: plan.project.verb === "update" ? "update-page" : "create-page",
          parentKind: projectsParentKind,
          targetId: projectsTargetId,
        }),
        details: apiErr,
      });
    }
  }
  for (const entry of plan.tasks) {
    try {
      const r = await executeTaskUpsert(client, tasksTargetId, entry);
      const idx = report.entries.findIndex(
        (e) => e.kind === "task" && e.taskId === entry.taskId,
      );
      if (idx >= 0) report.entries[idx]!.pageId = r.pageId;
    } catch (err) {
      mutateFailed = true;
      const apiErr = notionApiError(err);
      report.errors.push({
        reason: "task-upsert",
        message: `${entry.taskId}: ${formatMutateError({
          err: apiErr,
          action: entry.verb === "update" ? "update-page" : "create-page",
          parentKind: tasksParentKind,
          targetId: tasksTargetId,
        })}`,
        details: apiErr,
      });
    }
  }
  report.ok = !mutateFailed;
  finalize(report, wantJson, mutateFailed ? "mutate-error" : "ok");
}

type ParentKind = "data_source_id" | "database_id";

interface MutateErrorInputs {
  err: NotionApiError;
  action: "create-page" | "update-page" | "query";
  parentKind?: ParentKind;
  targetId: string;
}

/**
 * Mutation-time error message. Always carries:
 *   - action (create/update/query)
 *   - target id (the data_source id we used)
 *   - parent kind (data_source_id vs database_id) for create
 * NEVER prints the bearer token.
 */
function formatMutateError(inputs: MutateErrorInputs): string {
  const head = explainNotionError(inputs.err);
  const parts: string[] = [`action=${inputs.action}`, `target=${inputs.targetId}`];
  if (inputs.action === "create-page" && inputs.parentKind !== undefined) {
    parts.push(`parent=${inputs.parentKind}`);
  }
  const hint = mutateHint(inputs.err);
  return `${head}  [${parts.join(", ")}]${hint}`;
}

function mutateHint(err: NotionApiError): string {
  if (err.status === 404) {
    return " — Notion 이 target id 를 못 찾았다. resolved data_source id 가 맞는지, integration 이 해당 data_source 에 직접 연결돼 있는지 확인. `vibeops notion test --debug-shape` 로 진단 가능.";
  }
  // "Invalid status option" / "Invalid select option" — VibeOps 가 쓰는 option
  // 이 Notion 에 등록되지 않은 케이스. status-options validator 가 이미 잡았어야
  // 하지만, Notion 응답이 status options 를 안 돌려준 환경에서는 actual 에서만
  // 터질 수 있어 추가 안내를 붙인다.
  if (
    err.code === "validation_error" &&
    /Invalid (status|select) option/i.test(err.message)
  ) {
    return ` — ${STATUS_OPTIONS_HINT}`;
  }
  return "";
}

function planEntryToReport(
  entry: ProjectPlanEntry,
  ctx: LoadedSyncContext,
): SyncReportEntry {
  return {
    kind: "project",
    verb: entry.verb,
    title: ctx.project.projectName,
    taskId: ctx.project.projectId,
    pageId: entry.existingPageId,
    docsRelativePath: ctx.project.docsProjectPath,
  };
}

function taskEntryToReport(entry: TaskPlanEntry): SyncReportEntry {
  return {
    kind: "task",
    verb: entry.verb,
    taskId: entry.taskId,
    title: entry.title,
    pageId: entry.existingPageId,
    docsRelativePath: entry.docsRelativePath,
  };
}

function explainNotionError(err: NotionApiError): string {
  const tail = err.status ? ` (HTTP ${err.status})` : "";
  switch (err.code) {
    case "unauthorized":
      return `NOTION_TOKEN 이 거부됐다. integration 만료/오타 확인.${tail}`;
    case "restricted_resource":
      return `Notion DB 가 integration 에 공유되지 않았다. Notion DB → Connections 에 integration 추가.${tail}`;
    case "object_not_found":
      return `Notion 리소스를 찾지 못했다. database id / page id 확인.${tail}`;
    case "validation_error":
      return `요청 거부 (validation_error): ${err.message}${tail}`;
    case "rate_limited":
      return `Notion API rate limit — 잠시 후 다시 시도.${tail}`;
    case "request_timeout":
    case "ETIMEDOUT":
      return `Notion API 5s timeout. 네트워크 상태 확인.${tail}`;
    default:
      return `${err.code}: ${err.message}${tail}`;
  }
}

function finalize(report: SyncReport, wantJson: boolean, phase: string): void {
  if (wantJson) {
    process.stdout.write(
      `${JSON.stringify({ phase, ...report }, null, 2)}\n`,
    );
    process.exitCode = report.ok ? 0 : 1;
    return;
  }
  log.info(bold("vibeops notion sync"));
  log.info(`  ${dim("cwd")}  ${report.cwd}${report.dryRun ? `  ${yellow("[dry-run]")}` : ""}`);
  if (report.tokenMasked) {
    log.info(`  ${dim("token")} ${report.tokenMasked}`);
  }
  if (report.project) {
    log.info(
      `  ${dim("project")} ${report.project.name} ${gray(`(id=${report.project.projectId})`)}`,
    );
    log.info(
      `  ${dim("phase")} ${report.project.currentPhase}  ${dim("git remote")} ${
        report.project.gitRepoUrl.length > 0 ? report.project.gitRepoUrl : gray("(none)")
      }`,
    );
  }
  log.blank();

  if (report.schemas !== undefined && report.schemas.length > 0) {
    for (const s of report.schemas) {
      const status = s.propertiesMissing
        ? red("missing-properties")
        : s.violationsCount > 0
          ? red(`${s.violationsCount} violation${s.violationsCount === 1 ? "" : "s"}`)
          : green("schema valid");
      log.info(`  ${bold(`${s.kind} DB target`)}`);
      log.info(`    ${dim("input id       ")} ${cyan(s.inputId)}`);
      log.info(`    ${dim("input object   ")} ${s.inputObject}`);
      log.info(`    ${dim("resolved id    ")} ${cyan(s.resolvedId)}`);
      log.info(`    ${dim("resolved object")} ${s.resolvedObject}`);
      log.info(`    ${dim("source         ")} ${s.source}`);
      if (s.parentDatabaseId !== undefined) {
        log.info(`    ${dim("parent database")} ${gray(s.parentDatabaseId)}`);
      }
      log.info(
        `    ${dim("create parent  ")} ${s.parentKind} ${cyan(s.resolvedId)}`,
      );
      log.info(
        `    ${dim("query target   ")} ${s.parentKind === "data_source_id" ? "data_source" : "database"} ${cyan(s.resolvedId)}`,
      );
      log.info(`    ${dim("schema         ")} ${status}`);
      for (const w of s.warnings) {
        log.info(`    ${dim("warning        ")} ${yellow(w)}`);
      }
    }
    log.blank();
  }

  if (report.errors.length > 0) {
    for (const e of report.errors) {
      log.error(`${cyan(e.reason)} — ${e.message}`);
      if (
        (e.reason === "schema" ||
          e.reason === "schema-missing-properties" ||
          e.reason === "schema-status-options") &&
        Array.isArray(e.details)
      ) {
        for (const v of e.details as SchemaViolation[]) {
          if (
            v.kind === "status-options-missing" ||
            v.kind === "status-options-unreadable"
          ) {
            log.info(
              `      · ${red(v.kind)} ${cyan(`${v.db}.${v.property}`)}`,
            );
            if (
              v.kind === "status-options-missing" &&
              v.missingOptions !== undefined &&
              v.missingOptions.length > 0
            ) {
              log.info(`          ${dim("missing")} ${v.missingOptions.join(", ")}`);
            }
            if (
              v.requiredOptions !== undefined &&
              v.requiredOptions.length > 0
            ) {
              log.info(
                `          ${dim("Add these options in Notion")}:  Status property → Edit options → ${v.requiredOptions.join(", ")}`,
              );
            }
            if (
              v.kind === "status-options-missing" &&
              v.foundOptions !== undefined &&
              v.foundOptions.length > 0
            ) {
              log.info(
                `          ${dim("found in Notion")}: ${v.foundOptions.join(", ")}`,
              );
            }
            continue;
          }
          const detail =
            v.kind === "missing-properties"
              ? // The resolver puts the actionable hint into description —
                // surface that instead of the static "no properties object" line.
                v.description
              : v.kind === "missing"
                ? `expected types: ${v.allowedTypes.join(" | ")}`
                : `expected ${v.allowedTypes.join(" | ")} but got ${v.actualType ?? "?"}`;
          log.info(
            `      · ${red(v.kind)} ${cyan(`${v.db}.${v.property}`)} — ${dim(detail)}`,
          );
        }
        log.info(
          dim(
            `  Projects DB 8 속성 / Tasks DB 10 속성 + 필수 Status options 모두 만족해야 한다. \`vibeops notion test\` 로 자세히 확인.`,
          ),
        );
      }
    }
    log.blank();
  }

  const total = report.counts.project.create + report.counts.project.update;
  const tasksTotal = report.counts.tasks.create + report.counts.tasks.update;
  log.info(
    `  ${bold("Project")}  ${green(`create ${report.counts.project.create}`)}  ${cyan(
      `update ${report.counts.project.update}`,
    )}  ${dim(`total ${total}`)}`,
  );
  log.info(
    `  ${bold("Tasks")}    ${green(`create ${report.counts.tasks.create}`)}  ${cyan(
      `update ${report.counts.tasks.update}`,
    )}  ${dim(`total ${tasksTotal}`)}`,
  );
  log.blank();

  if (report.entries.length > 0) {
    log.info(bold("preview"));
    for (const e of report.entries) {
      const verbTag =
        e.verb === "create" ? green("create") : cyan("update");
      const kindTag =
        e.kind === "project" ? gray("project") : gray("task   ");
      const id = e.taskId ?? "";
      const path = e.docsRelativePath ? dim(` ${e.docsRelativePath}`) : "";
      const title = e.title ? ` ${e.title}` : "";
      log.info(`  ${verbTag} ${kindTag} ${cyan(id)}${title}${path}`);
    }
    log.blank();
  }

  log.info(
    dim(
      `  schemas covered: Projects(${PROJECTS_DB_PROPERTIES.length}) · Tasks(${TASKS_DB_PROPERTIES.length}).`,
    ),
  );

  if (report.dryRun) {
    log.info(yellow("  dry-run — Notion API mutation은 수행하지 않았다."));
  }

  if (report.ok) {
    log.ok(
      report.dryRun
        ? "sync plan OK — 실제 푸시는 --dry-run 없이 다시 실행."
        : "Notion sync 완료.",
    );
    process.exitCode = 0;
  } else {
    log.error("Notion sync 실패 — 위 에러 확인.");
    process.exitCode = 1;
  }
}
