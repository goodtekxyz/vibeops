import { resolve } from "node:path";

import { bold, cyan, dim, gray, green, log, yellow } from "../lib/logger.js";
import { maskToken } from "../lib/notion-env.js";
import { notionApiError, type NotionApiError } from "../lib/notion-client.js";
import {
  createNotionClient,
  fetchSchemas,
  loadSyncContext,
  type SchemaFetchResult,
  type SyncContextResult,
} from "../lib/notion-sync.js";
import {
  executePullEntry,
  planPull,
  type PullPlan,
} from "../lib/task-pull.js";

export interface TaskPullOptions {
  dryRun?: boolean;
  json?: boolean;
  status?: string;
  limit?: string | number;
  cwd?: string;
  /** Print per-considered-row decision trace and skip detail blocks. */
  verbose?: boolean;
}

interface PullReport {
  cwd: string;
  ok: boolean;
  dryRun: boolean;
  tokenMasked: string | null;
  notion: {
    projectsTargetId: string;
    tasksTargetId: string;
    projectsDatabaseId: string;
    tasksDatabaseId: string;
  } | null;
  filter: { projectId: string; statusNames: string[]; limit: number };
  considered: number;
  entries: {
    taskId: string;
    title: string;
    status: string;
    mvpPhase: string;
    pageId: string;
    docsRelativePath: string;
    notionNeedsDocsPath: boolean;
    detail?: string;
    created?: boolean;
    notionUpdated?: boolean;
  }[];
  skipped: {
    pageId: string;
    taskId: string;
    reason: string;
    docsRelativePath: string;
    detail?: string;
  }[];
  /**
   * Per-considered-row decision trace, surfaced under `--verbose`. JSON
   * always includes it so machine consumers can reproduce decisions without
   * re-reading Notion.
   */
  trace: {
    taskId: string;
    pageId: string;
    notionDocsPath: string;
    localResolvedPath: string;
    decision: string;
    reason: string;
  }[];
  errors: { reason: string; message: string; details?: unknown }[];
}

function emptyReport(cwd: string, dryRun: boolean): PullReport {
  return {
    cwd,
    ok: false,
    dryRun,
    tokenMasked: null,
    notion: null,
    filter: { projectId: "", statusNames: [], limit: 0 },
    considered: 0,
    entries: [],
    skipped: [],
    trace: [],
    errors: [],
  };
}

function parseStatusList(raw?: string): readonly string[] {
  if (typeof raw !== "string" || raw.trim().length === 0) return ["Planned"];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function parseLimit(raw?: string | number): number {
  if (typeof raw === "number") return raw;
  if (typeof raw === "string" && raw.length > 0) {
    const n = Number.parseInt(raw, 10);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 20;
}

export async function taskPullCommand(
  options: TaskPullOptions = {},
): Promise<void> {
  const cwd = resolve(options.cwd ?? process.cwd());
  const dryRun = options.dryRun === true;
  const wantJson = options.json === true;
  const verbose = options.verbose === true;
  const report = emptyReport(cwd, dryRun);

  const ctxRes: SyncContextResult = await loadSyncContext(cwd);
  if (!ctxRes.ok) {
    report.errors.push({ reason: ctxRes.reason, message: ctxRes.message });
    return finalize(report, wantJson, verbose);
  }
  const ctx = ctxRes;
  report.tokenMasked = maskToken(ctx.token);
  report.notion = {
    projectsTargetId: ctx.notion.projectsTargetId,
    tasksTargetId: ctx.notion.tasksTargetId,
    projectsDatabaseId: ctx.notion.projectsDatabaseId,
    tasksDatabaseId: ctx.notion.tasksDatabaseId,
  };
  const statusNames = parseStatusList(options.status);
  const limit = parseLimit(options.limit);
  report.filter = {
    projectId: ctx.project.projectId,
    statusNames: [...statusNames],
    limit,
  };

  let client;
  try {
    client = await createNotionClient(ctx.token);
  } catch (err) {
    const apiErr = notionApiError(err);
    report.errors.push({
      reason: "sdk-load",
      message: `Failed to load @notionhq/client — ${apiErr.message}`,
      details: apiErr,
    });
    return finalize(report, wantJson, verbose);
  }

  const schemaRes: SchemaFetchResult = await fetchSchemas(client, ctx.notion);
  if (!schemaRes.ok) {
    report.errors.push({
      reason: schemaRes.reason,
      message: explainNotionError(schemaRes.error),
      details: schemaRes.error,
    });
    return finalize(report, wantJson, verbose);
  }
  const violations = [
    ...schemaRes.projects.violations,
    ...schemaRes.tasks.violations,
  ];
  if (violations.length > 0) {
    report.errors.push({
      reason: "schema",
      message: `Notion DB schema does not match VibeOps requirements (${violations.length} violation${violations.length === 1 ? "" : "s"}). Inspect details with \`vibeops notion test\`.`,
      details: violations,
    });
    return finalize(report, wantJson, verbose);
  }

  let plan: PullPlan;
  try {
    plan = await planPull({
      cwd,
      client,
      tasksDataSourceId: schemaRes.tasks.resolvedId,
      projectId: ctx.project.projectId,
      statusNames,
      limit,
    });
  } catch (err) {
    const apiErr = notionApiError(err);
    report.errors.push({
      reason: "query",
      message: explainNotionError(apiErr),
      details: apiErr,
    });
    return finalize(report, wantJson, verbose);
  }
  report.considered = plan.considered;
  for (const e of plan.entries) {
    report.entries.push({
      taskId: e.taskId,
      title: e.title,
      status: e.status,
      mvpPhase: e.mvpPhase,
      pageId: e.pageId,
      docsRelativePath: e.docsRelativePath,
      notionNeedsDocsPath: e.notionNeedsDocsPath,
      ...(e.detail !== undefined ? { detail: e.detail } : {}),
    });
  }
  for (const s of plan.skipped) {
    report.skipped.push({
      pageId: s.pageId,
      taskId: s.taskId,
      reason: s.reason,
      docsRelativePath: s.docsRelativePath,
      ...(s.detail !== undefined ? { detail: s.detail } : {}),
    });
  }
  for (const t of plan.trace) {
    report.trace.push({
      taskId: t.taskId,
      pageId: t.pageId,
      notionDocsPath: t.notionDocsPath,
      localResolvedPath: t.localResolvedPath,
      decision: t.decision,
      reason: t.reason,
    });
  }

  if (dryRun) {
    report.ok = true;
    return finalize(report, wantJson, verbose);
  }

  let mutateFailed = false;
  for (let i = 0; i < plan.entries.length; i++) {
    const entry = plan.entries[i]!;
    try {
      const res = await executePullEntry(client, entry);
      report.entries[i]!.created = true;
      report.entries[i]!.notionUpdated = res.notionUpdated;
    } catch (err) {
      mutateFailed = true;
      const apiErr = notionApiError(err);
      report.errors.push({
        reason: "pull-execute",
        message: `${entry.taskId}: ${explainNotionError(apiErr)}`,
        details: apiErr,
      });
    }
  }
  report.ok = !mutateFailed;
  finalize(report, wantJson, verbose);
}

function explainNotionError(err: NotionApiError): string {
  const tail = err.status ? ` (HTTP ${err.status})` : "";
  switch (err.code) {
    case "unauthorized":
      return `NOTION_TOKEN was rejected. Verify the integration is not expired and the value is correct.${tail}`;
    case "restricted_resource":
      return `The Notion DB is not shared with the integration. Add it via Notion DB → Connections.${tail}`;
    case "object_not_found":
      return `Notion resource not found. Verify the database id / page id.${tail}`;
    case "validation_error":
      return `Request rejected (validation_error): ${err.message}${tail}`;
    case "rate_limited":
      return `Notion API rate limit — retry shortly.${tail}`;
    case "request_timeout":
    case "ETIMEDOUT":
      return `Notion API 5s timeout. Check your network.${tail}`;
    default:
      return `${err.code}: ${err.message}${tail}`;
  }
}

function finalize(report: PullReport, wantJson: boolean, verbose: boolean): void {
  if (wantJson) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    process.exitCode = report.ok ? 0 : 1;
    return;
  }
  log.info(bold("vibeops task pull"));
  log.info(
    `  ${dim("cwd")}  ${report.cwd}${report.dryRun ? `  ${yellow("[dry-run]")}` : ""}`,
  );
  if (report.tokenMasked) log.info(`  ${dim("token")} ${report.tokenMasked}`);
  if (report.filter.projectId.length > 0) {
    log.info(
      `  ${dim("filter")} Project ID=${cyan(report.filter.projectId)}  Status ∈ {${report.filter.statusNames
        .map((s) => cyan(s))
        .join(", ")}}  ${dim(`limit=${report.filter.limit}`)}`,
    );
  }
  log.blank();
  for (const e of report.errors) {
    log.error(`${cyan(e.reason)} — ${e.message}`);
  }
  if (report.errors.length > 0) log.blank();

  log.info(
    `  ${bold("considered")} ${report.considered} rows  ${dim("→")}  ${green(
      `new ${report.entries.length}`,
    )}  ${yellow(`skipped ${report.skipped.length}`)}`,
  );
  log.blank();

  if (report.entries.length > 0) {
    log.info(bold("would create"));
    for (const e of report.entries) {
      const tag = e.created ? green("✓") : yellow("·");
      const sync = e.notionUpdated ? cyan(" notion.docsPath←") : "";
      log.info(
        `  ${tag} ${cyan(e.taskId)} ${e.title}${gray(`  status=${e.status} phase=${e.mvpPhase}`)}${sync}`,
      );
      log.info(`      ${dim(e.docsRelativePath)}`);
      if (verbose && typeof e.detail === "string" && e.detail.length > 0) {
        for (const line of e.detail.split(/\r?\n/)) {
          log.info(`      ${dim(line)}`);
        }
      }
    }
    log.blank();
  }
  if (report.skipped.length > 0) {
    log.info(bold("skipped"));
    for (const s of report.skipped) {
      log.info(
        `  ${yellow("·")} ${cyan(s.taskId)} ${gray(s.reason)}  ${dim(s.docsRelativePath)}`,
      );
      if (typeof s.detail === "string" && s.detail.length > 0) {
        // Print the per-skip detail unconditionally — the new mismatch /
        // duplicate-task-id branches NEED to call out the Notion docs path
        // and the action the user should take.
        for (const line of s.detail.split(/\r?\n/)) {
          log.info(`      ${dim(line)}`);
        }
      }
    }
    log.blank();
  }
  if (verbose && report.trace.length > 0) {
    log.info(bold("trace"));
    for (const t of report.trace) {
      log.info(
        `  ${cyan(t.taskId)}  ${gray(t.decision)}  ${dim(`page=${t.pageId}`)}`,
      );
      log.info(`      ${dim(`notion docs path : ${t.notionDocsPath || "(empty)"}`)}`);
      log.info(`      ${dim(`local resolved   : ${t.localResolvedPath || "(none)"}`)}`);
      log.info(`      ${dim(`reason           : ${t.reason}`)}`);
    }
    log.blank();
  }

  if (report.dryRun) {
    log.info(yellow("  dry-run — no file or Notion mutation performed."));
  }

  if (report.ok && report.errors.length === 0) {
    log.ok(
      report.dryRun
        ? "Pull plan OK — re-run without --dry-run to apply."
        : `task pull complete — ${report.entries.filter((e) => e.created).length} file(s) created.`,
    );
    process.exitCode = 0;
  } else if (report.ok) {
    log.warn("Some rows were skipped.");
    process.exitCode = 0;
  } else {
    log.error("task pull failed — see errors above.");
    process.exitCode = 1;
  }
}
