import { resolve } from "node:path";

import { readConfig, getClientsFromConfig } from "../lib/config.js";
import { formatGitPolicySummary } from "../lib/git-policy.js";
import { readText } from "../lib/filesystem.js";
import { readGitInfo } from "../lib/git.js";
import { buildLlmStatusReport } from "../lib/llm-status.js";
import { bold, cyan, dim, green, log, yellow } from "../lib/logger.js";
import { projectPaths } from "../lib/paths.js";
import { VERSION } from "../version.js";
import {
  computeNextHint,
  hintToLines,
  hintToText,
  listInProgressTasks,
  pickFocusTask,
  relPath,
  taskBranchExistsFor,
} from "../lib/task-context.js";
import {
  hasOpenTaskMergeRequest,
  isMergeRequestMerged,
  resolveTaskMergeRequestUrl,
  taskNeedsSync,
} from "../lib/task-effective-status.js";
import {
  countTasks,
  hasNonEmptySection,
  isOnTaskBranch,
  loadActionableTasks,
  readGitContext,
  statusDisplay,
} from "../lib/task.js";
import { summarizeGoal } from "../lib/task-summary.js";
import type { LlmStatusReport } from "../lib/llm-status.js";
import type { TaskCounts, TaskMeta } from "../types/task.js";

export interface StatusCommandOptions {
  json?: boolean;
  cwd?: string;
}

export interface StatusReport {
  vibeopsVersion: string;
  isVibeopsProject: boolean;
  projectName: string | null;
  clients: string[];
  git: {
    isRepo: boolean;
    branch: string | null;
    dirty: boolean | null;
    policy: string | null;
    host: string | null;
    remote: string | null;
  };
  counts: TaskCounts | null;
  inProgress: Array<{ id: string; title: string; file: string }>;
  focus: {
    id: string;
    title: string;
    status: string;
    file: string;
    goalExcerpt: string;
    resultFilled: boolean;
    testResultFilled: boolean;
    onTaskBranch: boolean | null;
    taskBranch: string | null;
    taskBranchExists: boolean | null;
    mergeRequestUrl: string | null;
    mergeRequestMerged: boolean;
    needsSync: boolean;
  } | null;
  nextHint: string;
  nextLines: string[];
  llm: LlmStatusReport | null;
}

async function buildReport(cwd: string): Promise<StatusReport> {
  const paths = projectPaths(cwd);
  const config = await readConfig(cwd);
  const git = await readGitInfo(cwd);
  const isVibeopsProject = config !== null;

  let counts: TaskCounts | null = null;
  let inProgress: TaskMeta[] = [];
  let focus: TaskMeta | null = null;

  if (isVibeopsProject) {
    const tasks = await loadActionableTasks(paths.docsTasks);
    counts = countTasks(tasks);
    inProgress = await listInProgressTasks(paths);
    focus = await pickFocusTask(paths, cwd);
  }

  let focusBlock: StatusReport["focus"] = null;
  let resultFilled = false;
  let testFilled = false;
  let onTaskBranch: boolean | null = null;
  let taskBranch: string | null = null;
  let branchExists: boolean | null = null;
  let goalExcerpt = "";
  let mergeRequestUrl: string | null = null;
  let mergeRequestMerged = false;
  let needsSync = false;

  if (focus !== null) {
    const body = await readText(focus.filePath);
    goalExcerpt = summarizeGoal(body);
    resultFilled = hasNonEmptySection(body, "Result");
    testFilled = hasNonEmptySection(body, "Test Result");
    const ctx = await readGitContext(focus.filePath);
    taskBranch = ctx?.taskBranch ?? null;
    mergeRequestUrl = await resolveTaskMergeRequestUrl(cwd, focus.filePath);
    onTaskBranch = isOnTaskBranch(git.branch, ctx);
    branchExists = await taskBranchExistsFor(cwd, focus);
    mergeRequestMerged = await isMergeRequestMerged(cwd, focus);
    needsSync = await taskNeedsSync(cwd, focus);
    focusBlock = {
      id: focus.id,
      title: focus.title,
      status: statusDisplay(focus.status),
      file: relPath(cwd, focus.filePath),
      goalExcerpt,
      resultFilled,
      testResultFilled: testFilled,
      onTaskBranch,
      taskBranch,
      taskBranchExists: branchExists,
      mergeRequestUrl,
      mergeRequestMerged,
      needsSync,
    };
  }

  const hint = computeNextHint({
    isVibeopsProject,
    focus,
    resultFilled,
    testFilled,
    onTaskBranch,
    hasMergeRequest:
      focus !== null
        ? await hasOpenTaskMergeRequest(cwd, focus.filePath)
        : false,
    mergeRequestMerged,
    needsSync,
    hasLocalChanges: git.dirty === true,
  });

  const llm = isVibeopsProject ? await buildLlmStatusReport(cwd) : null;

  return {
    vibeopsVersion: VERSION,
    isVibeopsProject,
    projectName: config?.name ?? null,
    clients: getClientsFromConfig(config),
    git: {
      isRepo: git.isRepo,
      branch: git.branch,
      dirty: git.dirty,
      policy: config?.git ? formatGitPolicySummary(config.git) : null,
      host: config?.git?.host ?? null,
      remote: config?.git?.remote ?? null,
    },
    counts,
    inProgress: inProgress.map((t) => ({
      id: t.id,
      title: t.title,
      file: relPath(cwd, t.filePath),
    })),
    focus: focusBlock,
    nextHint: hintToText(hint, cwd, focus),
    nextLines: [...hintToLines(hint, cwd, focus)],
    llm,
  };
}

function filledLabel(ok: boolean): string {
  return ok ? green("ok") : yellow("empty");
}

function printNow(report: StatusReport): void {
  log.info(bold("  NOW"));
  if (!report.isVibeopsProject) {
    log.info(`    ${dim("Project")}   ${yellow("not a VibeOps project")}`);
    return;
  }

  if (report.focus) {
    const f = report.focus;
    log.info(
      `    ${dim("Focus")}     ${cyan(f.id)} — ${f.title || dim("(no title)")}`,
    );
    log.info(`    ${dim("Stage")}     ${f.status}`);
    log.info(
      `    ${dim("Checklist")} Result ${filledLabel(f.resultFilled)} · Test Result ${filledLabel(f.testResultFilled)}`,
    );

    if (f.taskBranch) {
      const parts: string[] = [];
      if (f.onTaskBranch === true) parts.push("on it");
      else if (f.onTaskBranch === false) parts.push("not checked out");
      if (report.git.dirty === true) parts.push("dirty");
      else if (report.git.dirty === false) parts.push("clean");
      const suffix = parts.length > 0 ? `  (${parts.join(" · ")})` : "";
      log.info(`    ${dim("Branch")}    ${f.taskBranch}${suffix}`);
    } else if (report.git.isRepo) {
      log.info(
        `    ${dim("Branch")}    ${report.git.branch ?? "(detached)"}${report.git.dirty === true ? yellow(" · dirty") : ""}`,
      );
    }

    if (f.needsSync) {
      log.info(`    ${dim("PR")}        ${dim("(merged — sync pending)")}`);
    } else if (f.mergeRequestUrl) {
      const tag = f.mergeRequestMerged ? dim(" · merged") : "";
      log.info(`    ${dim("PR")}        ${f.mergeRequestUrl}${tag}`);
    } else {
      log.info(`    ${dim("PR")}        ${dim("(none)")}`);
    }
  } else {
    log.info(`    ${dim("Focus")}     ${dim("(none)")}`);
    if (report.git.isRepo) {
      log.info(
        `    ${dim("Branch")}    ${report.git.branch ?? "(detached)"}${report.git.dirty === true ? yellow(" · dirty") : ""}`,
      );
    }
  }
}

function printNext(report: StatusReport): void {
  log.blank();
  log.info(bold("  NEXT"));
  for (const line of report.nextLines) {
    log.info(`    ${cyan("→")} ${line}`);
  }
}

function printDetails(report: StatusReport): void {
  log.blank();
  log.info(dim("  ──"));
  if (!report.isVibeopsProject) {
    log.info(`  ${dim("CLI")}       v${report.vibeopsVersion}`);
    return;
  }

  const clients =
    report.clients.length > 0 ? report.clients.join(", ") : dim("(none)");
  log.info(
    `  ${dim("Project")}   ${report.projectName ?? "(unnamed)"} · clients ${clients}`,
  );

  if (report.counts) {
    const c = report.counts;
    log.info(
      `  ${dim("Tasks")}     ${c.total} total · ${cyan(String(c.in_progress))} in progress · ${c.shipped} shipped`,
    );
  }

  if (report.inProgress.length > 1) {
    log.info(
      `  ${dim("Active")}    ${report.inProgress.map((t) => t.id).join(", ")}`,
    );
  }

  const hostBits: string[] = [];
  if (report.git.host) hostBits.push(report.git.host);
  if (report.git.remote) hostBits.push(report.git.remote);
  if (report.git.policy) hostBits.push(report.git.policy);
  if (hostBits.length > 0) {
    log.info(`  ${dim("Git")}       ${hostBits.join(" · ")}`);
  }

  if (report.llm) {
    const active =
      report.llm.active !== null
        ? `${report.llm.active} (ok)`
        : report.llm.anyAvailable
          ? "(preference not available)"
          : "none";
    log.info(
      `  ${dim("LLM")}       ${active} · prefer ${report.llm.preference}${report.llm.anyAvailable ? "" : ` · ${cyan("vibeops llm connect")}`}`,
    );
  }
}

function printHuman(report: StatusReport): void {
  log.blank();
  log.info(bold("─".repeat(44)));
  log.info(bold("  VibeOps  ·  status"));
  log.info(bold("─".repeat(44)));
  log.blank();

  printNow(report);
  printNext(report);
  printDetails(report);

  log.blank();
  log.info(bold("─".repeat(44)));
  log.blank();
}

export async function statusCommand(opts: StatusCommandOptions = {}): Promise<void> {
  const cwd = resolve(opts.cwd ?? process.cwd());
  const report = await buildReport(cwd);

  if (opts.json) {
    log.raw(JSON.stringify(report, null, 2));
  } else {
    printHuman(report);
  }

  if (!report.isVibeopsProject) {
    process.exitCode = 1;
  }
}
