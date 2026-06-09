import { resolve } from "node:path";

import { deleteFile } from "./filesystem.js";
import { GitConfigError, requireGitConfig } from "./git-config.js";
import { mergeRequestLabel } from "./git-host.js";
import {
  gitBranchExists,
  gitDeleteBranch,
  gitDeleteRemoteBranch,
  gitGovernanceOnlyDirty,
  gitRemoteBranchExists,
  gitSwitchToBranch,
  readGitInfo,
} from "./git.js";
import { dim, log } from "./logger.js";
import type { ProjectPaths } from "./paths.js";
import {
  closeMergeRequest,
  findMergeRequestByBranches,
  probeMergeRequestCli,
} from "./pr-create.js";
import { normalizeTaskRef } from "./resolve-task.js";
import { getTaskMergeRequestLifecycle, resolveGitHostForCwd } from "./task-effective-status.js";
import {
  findTaskFile,
  loadActionableTasks,
  pickInProgressTask,
  readGitContext,
  readTaskFile,
} from "./task.js";
import type { TaskMeta } from "../types/task.js";

export interface DelTarget {
  readonly taskId: string;
  readonly taskFile: string;
  readonly meta: TaskMeta;
  readonly taskBranch: string;
}

export async function resolveDelTarget(
  paths: ProjectPaths,
  cwd: string,
  taskRef: string | undefined,
): Promise<DelTarget | null> {
  const trimmed = taskRef?.trim();
  let taskId: string;
  let taskFile: string | null;

  if (trimmed !== undefined && trimmed.length > 0) {
    taskId = normalizeTaskRef(trimmed);
    taskFile = await findTaskFile(paths.docsTasks, taskId);
  } else {
    const inProgress = pickInProgressTask(await loadActionableTasks(paths.docsTasks));
    if (inProgress === null) {
      return null;
    }
    taskId = inProgress.id;
    taskFile = inProgress.filePath;
  }

  if (taskFile === null) {
    return null;
  }

  const meta = await readTaskFile(taskFile);
  const ctx = await readGitContext(taskFile);
  if (ctx === null) {
    log.error(`No Git Context on ${taskId}. Cannot delete.`);
    return null;
  }

  return { taskId, taskFile, meta, taskBranch: ctx.taskBranch };
}

export function taskDelNotFoundMessage(taskRef: string | undefined): string {
  if (taskRef?.trim()) {
    return `TASK not found: ${normalizeTaskRef(taskRef)}. Check docs/tasks/.`;
  }
  return "No In Progress TASK found. Pass `vibeops task del TASK-NNN`.";
}

export async function assertTaskDeletable(
  cwd: string,
  target: DelTarget,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const lifecycle = await getTaskMergeRequestLifecycle(cwd, target.taskFile);
  if (lifecycle === "merged") {
    return {
      ok: false,
      reason:
        `${target.taskId} is merged into integration — task del is not allowed. ` +
        "Revert on develop if needed, or keep the TASK file as history.",
    };
  }
  return { ok: true };
}

export async function assertWorkingTreeForDel(
  cwd: string,
  allowDirty: boolean,
): Promise<boolean> {
  const git = await readGitInfo(cwd);
  if (git.dirty !== true) return true;

  const gov = await gitGovernanceOnlyDirty(cwd);
  if (gov.onlyGovernance) return true;

  if (allowDirty) {
    log.warn("Uncommitted changes remain in the working tree after delete.");
    return true;
  }

  log.error(
    "Working tree is dirty. Commit, stash, restore, or rerun with --force to discard uncommitted work.",
  );
  return false;
}

function isProtectedBranch(
  name: string,
  integration: string,
  production: string,
): boolean {
  return name === integration || name === production || name === "main" || name === "master";
}

export interface DeleteTaskBranchesOptions {
  readonly cwd: string;
  readonly taskBranch: string;
  readonly integrationBranch: string;
  readonly remote: string;
  readonly dryRun: boolean;
  readonly noRemoteDelete: boolean;
}

export async function deleteTaskBranches(opts: DeleteTaskBranchesOptions): Promise<boolean> {
  const cwd = resolve(opts.cwd);

  if (opts.dryRun) {
    if (await gitBranchExists(cwd, opts.taskBranch)) {
      log.info(dim(`  would git branch -D ${opts.taskBranch}`));
    }
    if (
      opts.noRemoteDelete !== true &&
      (await gitRemoteBranchExists(cwd, opts.remote, opts.taskBranch))
    ) {
      log.info(dim(`  would git push ${opts.remote} --delete ${opts.taskBranch}`));
    }
    return true;
  }

  const git = await readGitInfo(cwd);
  if (git.branch === opts.taskBranch) {
    const switched = await gitSwitchToBranch(cwd, opts.integrationBranch, opts.remote);
    if (!switched) {
      log.error(`Integration branch "${opts.integrationBranch}" not found.`);
      return false;
    }
    log.ok(`On ${opts.integrationBranch}`);
  }

  if (await gitBranchExists(cwd, opts.taskBranch)) {
    try {
      await gitDeleteBranch(cwd, opts.taskBranch, { force: true });
      log.ok(`Deleted local branch ${opts.taskBranch}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      log.error(`Could not delete local ${opts.taskBranch}: ${msg}`);
      return false;
    }
  } else {
    log.info(dim(`Local branch ${opts.taskBranch} not found — skipped.`));
  }

  if (
    opts.noRemoteDelete !== true &&
    (await gitRemoteBranchExists(cwd, opts.remote, opts.taskBranch))
  ) {
    try {
      await gitDeleteRemoteBranch(cwd, opts.remote, opts.taskBranch);
      log.ok(`Deleted ${opts.remote}/${opts.taskBranch}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      log.warn(`Could not delete remote ${opts.taskBranch}: ${msg}`);
    }
  } else if (opts.noRemoteDelete === true) {
    log.info(dim("Remote branch delete skipped (--no-remote-delete)."));
  }

  return true;
}

export async function closeOpenTaskMergeRequestIfNeeded(opts: {
  readonly cwd: string;
  readonly taskFile: string;
  readonly taskBranch: string;
  readonly baseBranch: string;
  readonly dryRun: boolean;
  readonly skipClose: boolean;
}): Promise<boolean> {
  if (opts.skipClose) {
    log.info(dim("Open MR/PR close skipped (--no-close-mr)."));
    return true;
  }

  const lifecycle = await getTaskMergeRequestLifecycle(opts.cwd, opts.taskFile);
  if (lifecycle !== "open") return true;

  const host = await resolveGitHostForCwd(opts.cwd);
  if (host === null) {
    log.warn("Could not resolve Git host — close the MR/PR manually.");
    return true;
  }

  const open = await findMergeRequestByBranches({
    cwd: opts.cwd,
    host,
    headBranch: opts.taskBranch,
    baseBranch: opts.baseBranch,
    state: "open",
  });
  if (open === null) return true;

  const label = mergeRequestLabel(host);
  if (!(await probeMergeRequestCli(host))) {
    log.warn(`Open ${label}: ${open.url} — close it manually before deleting the branch.`);
    return true;
  }

  try {
    await closeMergeRequest({ cwd: opts.cwd, host, url: open.url, dryRun: opts.dryRun });
    if (!opts.dryRun) log.ok(`Closed ${label}`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    log.warn(`Could not close ${label}: ${msg}`);
    log.info(dim(`Close manually: ${open.url}`));
  }

  return true;
}

export async function deleteTaskMarkdown(
  taskFile: string,
  dryRun: boolean,
): Promise<void> {
  if (dryRun) {
    log.info(dim(`  would delete ${taskFile}`));
    return;
  }
  await deleteFile(taskFile);
  log.ok(`Deleted TASK file`);
}

export async function loadGitConfigForDel(cwd: string): Promise<{
  remote: string;
  integrationBranch: string;
  productionBranch: string;
} | null> {
  try {
    const cfg = await requireGitConfig(cwd);
    return {
      remote: cfg.remote,
      integrationBranch: cfg.integrationBranch,
      productionBranch: cfg.productionBranch,
    };
  } catch (e) {
    if (e instanceof GitConfigError) {
      log.error(e.message);
      return null;
    }
    throw e;
  }
}

export function validateTaskBranchForDel(
  taskBranch: string,
  integrationBranch: string,
  productionBranch: string,
): boolean {
  if (isProtectedBranch(taskBranch, integrationBranch, productionBranch)) {
    log.error(`Refusing to delete protected branch: ${taskBranch}`);
    return false;
  }
  return true;
}

