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
  hintToText,
  listInProgressTasks,
  pickFocusTask,
  relPath,
  taskBranchExistsFor,
} from "../lib/task-context.js";
import { isMergeRequestMerged, taskNeedsSync } from "../lib/task-effective-status.js";
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
  } | null;
  nextHint: string;
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
    mergeRequestUrl = ctx?.mergeRequestUrl ?? null;
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
    };
  }

  const hint = computeNextHint({
    isVibeopsProject,
    focus,
    resultFilled,
    testFilled,
    onTaskBranch,
    hasMergeRequest:
      typeof mergeRequestUrl === "string" && mergeRequestUrl.length > 0,
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
    },
    counts,
    inProgress: inProgress.map((t) => ({
      id: t.id,
      title: t.title,
      file: relPath(cwd, t.filePath),
    })),
    focus: focusBlock,
    nextHint: hintToText(hint, cwd, focus),
    llm,
  };
}

function printHuman(report: StatusReport): void {
  log.blank();
  log.info(bold("─".repeat(56)));
  log.info(bold("  VibeOps · status"));
  log.info(bold("─".repeat(56)));
  log.info(`  ${dim("CLI")}       v${report.vibeopsVersion}`);

  if (!report.isVibeopsProject) {
    log.info(`  ${dim("Project")}  ${yellow("not initialized")} — run vibeops init`);
    log.info(bold("─".repeat(56)));
    log.blank();
    return;
  }

  log.info(`  ${dim("Project")}  ${report.projectName ?? "(unnamed)"}`);
  if (report.clients.length > 0) {
    log.info(`  ${dim("Clients")}  ${report.clients.join(", ")}`);
  }

  if (report.counts) {
    const c = report.counts;
    log.info(
      `  ${dim("Tasks")}    ${c.total} total · ${cyan(String(c.in_progress))} in progress · ${c.shipped} shipped`,
    );
  }

  if (report.inProgress.length > 1) {
    log.blank();
    log.info(bold("  In progress"));
    for (const t of report.inProgress) {
      log.info(`    ${cyan(t.id)} — ${t.title}`);
    }
  }

  log.blank();
  if (report.focus) {
    const f = report.focus;
    log.info(`  ${dim("Focus")}    ${cyan(f.id)} — ${f.title || dim("(no title)")}`);
    log.info(`  ${dim("Status")}  ${f.status}`);
    log.info(`  ${dim("File")}     ${f.file}`);
    if (f.goalExcerpt) log.info(`  ${dim("Goal")}     ${f.goalExcerpt}`);
    log.info(
      `  ${dim("Result")}  ${f.resultFilled ? green("filled") : yellow("empty")} · Test Result ${f.testResultFilled ? green("filled") : yellow("empty")}`,
    );
  } else {
    log.info(`  ${dim("Focus")}    ${dim("(none)")}`);
  }

  log.blank();
  log.info(bold("  Git"));
  if (!report.git.isRepo) {
    log.info(`    ${yellow("not a git repository")}`);
  } else {
    log.info(`    ${dim("HEAD")}     ${report.git.branch ?? "(detached)"}`);
    if (report.git.dirty === true) log.info(`    ${dim("Tree")}    ${yellow("dirty")}`);
    else if (report.git.dirty === false) log.info(`    ${dim("Tree")}    ${green("clean")}`);
    if (report.git.policy) {
      log.info(`    ${dim("Policy")}   ${report.git.policy}`);
    }
    if (report.focus?.taskBranch) {
      const on =
        report.focus.onTaskBranch === true
          ? green("yes")
          : report.focus.onTaskBranch === false
            ? yellow("no")
            : dim("—");
      log.info(`    ${dim("Task br.")}  ${report.focus.taskBranch} · on branch: ${on}`);
    }
    if (report.focus?.mergeRequestUrl) {
      log.info(`    ${dim("MR/PR")}    ${report.focus.mergeRequestUrl}`);
    }
  }

  if (report.llm) {
    log.blank();
    log.info(bold("  LLM"));
    log.info(`    ${dim("Preferred")}  ${report.llm.preference}`);
    const active =
      report.llm.active !== null
        ? green(`${report.llm.active} (ok)`)
        : report.llm.anyAvailable
          ? yellow("(preference not available)")
          : yellow("none");
    log.info(`    ${dim("Active")}     ${active}`);
    for (const p of report.llm.providers) {
      const summary = p.summary.length > 56 ? `${p.summary.slice(0, 53)}…` : p.summary;
      log.info(
        `    ${dim(p.id.padEnd(14))} ${p.ok ? green("ok") : dim("—")}  ${dim(summary)}`,
      );
    }
    if (!report.llm.anyAvailable) {
      log.info(`    ${dim("Setup")}     ${cyan("vibeops llm connect")}`);
    }
  }

  log.blank();
  log.info(`${dim("Next")}     ${report.nextHint}`);
  log.info(bold("─".repeat(56)));
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
