import { resolve } from "node:path";

import { GitConfigError, requireGitConfig } from "./git-config.js";
import {
  gitBranchExists,
  gitCheckout,
  gitCheckoutNewBranch,
  gitDeleteBranch,
  gitFetchRemote,
  gitHeadCommit,
  gitMergeRemoteBranch,
  gitMergeInProgress,
  gitPullFastForwardOnly,
  gitRemoteBranchExists,
  gitSwitchToBranch,
  listUnmergedRelPaths,
  readGitInfo,
} from "./git.js";
import { dim, log } from "./logger.js";
import type { ProjectPaths } from "./paths.js";
import { findMergeRequestByBranches } from "./pr-create.js";
import { normalizeTaskRef } from "./resolve-task.js";
import {
  getTaskMergeRequestLifecycle,
  resolveGitHostForCwd,
} from "./task-effective-status.js";
import {
  findTaskFile,
  loadActionableTasks,
  pickLatestShippedTask,
  readGitContext,
  readTaskFile,
  upsertGitContext,
} from "./task.js";
import type { GitContext, TaskMeta } from "../types/task.js";

export interface ReshipTarget {
  readonly taskId: string;
  readonly taskFile: string;
  readonly meta: TaskMeta;
  readonly gitCtx: GitContext;
}

export async function resolveReshipTarget(
  paths: ProjectPaths,
  cwd: string,
  taskRef: string | undefined,
): Promise<ReshipTarget | null> {
  const trimmed = taskRef?.trim();
  let taskId: string;
  let taskFile: string | null;

  if (trimmed !== undefined && trimmed.length > 0) {
    taskId = normalizeTaskRef(trimmed);
    taskFile = await findTaskFile(paths.docsTasks, taskId);
  } else {
    const shipped = pickLatestShippedTask(await loadActionableTasks(paths.docsTasks));
    if (shipped === null) {
      log.error(reshipNotFoundMessage(undefined));
      return null;
    }
    taskId = shipped.id;
    taskFile = shipped.filePath;
  }

  if (taskFile === null) {
    log.error(reshipNotFoundMessage(taskRef));
    return null;
  }

  const meta = await readTaskFile(taskFile);
  if (meta.status !== "shipped") {
    log.error(
      `${taskId} is ${meta.status === "in_progress" ? "In Progress" : meta.status} — use \`vibeops task ship\` for first submit.`,
    );
    return null;
  }

  const gitCtx = await readGitContext(taskFile);
  if (gitCtx === null) {
    log.error(`No Git Context on ${taskId}. Cannot reship.`);
    return null;
  }

  return { taskId, taskFile, meta, gitCtx };
}

export function reshipNotFoundMessage(taskRef: string | undefined): string {
  if (taskRef?.trim()) {
    return `Shipped TASK not found: ${normalizeTaskRef(taskRef)}. Check docs/tasks/.`;
  }
  return "No Shipped TASK found. Pass `vibeops task reship TASK-NNN`.";
}

export interface EnsureTaskBranchOptions {
  readonly cwd: string;
  readonly taskFile: string;
  readonly gitCtx: GitContext;
  readonly integrationBranch: string;
  readonly remote: string;
  /** Prefer recreating from integration instead of checking out a stale remote ref. */
  readonly recreateBranch: boolean;
  readonly dryRun: boolean;
}

async function switchToTaskBranch(cwd: string, taskBranch: string): Promise<boolean> {
  try {
    await gitCheckout(cwd, taskBranch);
    return true;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    log.error(
      `Could not switch to ${taskBranch} with uncommitted changes. Commit, stash, or resolve conflicts, then rerun.`,
    );
    if (msg.length > 0) log.info(dim(msg));
    return false;
  }
}

async function removeLocalTaskBranch(
  cwd: string,
  taskBranch: string,
  integrationBranch: string,
  remote: string,
): Promise<boolean> {
  if (!(await gitBranchExists(cwd, taskBranch))) return true;

  const git = await readGitInfo(cwd);
  if (git.branch === taskBranch) {
    const ok = await gitSwitchToBranch(cwd, integrationBranch, remote);
    if (!ok) {
      log.error(`Integration branch "${integrationBranch}" not found.`);
      return false;
    }
  }

  try {
    await gitDeleteBranch(cwd, taskBranch, { force: true });
    log.info(dim(`Removed local ${taskBranch}.`));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    log.error(`Could not remove local ${taskBranch}: ${msg}`);
    return false;
  }
  return true;
}

async function recreateTaskBranchFromIntegration(
  opts: EnsureTaskBranchOptions,
): Promise<boolean> {
  const cwd = resolve(opts.cwd);
  const { taskBranch } = opts.gitCtx;

  const ok = await gitSwitchToBranch(cwd, opts.integrationBranch, opts.remote);
  if (!ok) {
    log.error(`Integration branch "${opts.integrationBranch}" not found.`);
    return false;
  }

  if (await gitRemoteBranchExists(cwd, opts.remote, opts.integrationBranch)) {
    try {
      await gitPullFastForwardOnly(cwd, opts.remote, opts.integrationBranch);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      log.error(`Could not update ${opts.integrationBranch}: ${msg}`);
      return false;
    }
  }

  const head = await gitHeadCommit(cwd);
  if (head === null || head.length === 0) {
    log.error("Integration branch has no commits.");
    return false;
  }

  try {
    await gitCheckoutNewBranch(cwd, taskBranch, opts.integrationBranch);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    log.error(
      `Could not create ${taskBranch} from ${opts.integrationBranch} with uncommitted changes.`,
    );
    if (msg.length > 0) log.info(dim(msg));
    return false;
  }

  await upsertGitContext(opts.taskFile, {
    ...opts.gitCtx,
    baseBranch: opts.integrationBranch,
    baseCommit: head,
  });
  log.ok(`Created ${taskBranch} from ${opts.integrationBranch}`);
  return true;
}

/** Checkout or recreate the task branch without changing TASK Status. */
export async function ensureTaskBranchForReship(
  opts: EnsureTaskBranchOptions,
): Promise<boolean> {
  const cwd = resolve(opts.cwd);
  const { taskBranch } = opts.gitCtx;
  const git = await readGitInfo(cwd);

  if (!git.isRepo) {
    log.error("Not a git repository.");
    return false;
  }

  if (git.dirty === true) {
    log.info(dim("Uncommitted changes will be carried onto the task branch."));
  }

  const localExists = await gitBranchExists(cwd, taskBranch);
  const remoteExists = await gitRemoteBranchExists(
    cwd,
    opts.remote,
    taskBranch,
  );
  const recreateFromIntegration =
    opts.recreateBranch === true || (!localExists && !remoteExists);

  if (opts.dryRun) {
    if (localExists && !opts.recreateBranch) {
      log.info(dim(`  would git switch ${taskBranch}`));
    } else if (!recreateFromIntegration && remoteExists) {
      log.info(dim(`  would checkout ${taskBranch} from ${opts.remote}`));
    } else {
      if (localExists && opts.recreateBranch) {
        log.info(dim(`  would remove local ${taskBranch}`));
      }
      log.info(
        dim(`  would create ${taskBranch} from ${opts.integrationBranch}`),
      );
    }
    return true;
  }

  if (localExists && !opts.recreateBranch) {
    if (!(await switchToTaskBranch(cwd, taskBranch))) return false;
    log.ok(`On ${taskBranch}`);
    return true;
  }

  if (!recreateFromIntegration && remoteExists) {
    const checkedOut = await gitSwitchToBranch(cwd, taskBranch, opts.remote);
    if (checkedOut) {
      log.ok(`Checked out ${taskBranch} from ${opts.remote}`);
      return true;
    }
    log.warn(`Could not checkout ${opts.remote}/${taskBranch}; creating from integration.`);
  }

  if (localExists) {
    const removed = await removeLocalTaskBranch(
      cwd,
      taskBranch,
      opts.integrationBranch,
      opts.remote,
    );
    if (!removed) return false;
  }

  return recreateTaskBranchFromIntegration(opts);
}

export interface IntegrateOptions {
  readonly cwd: string;
  readonly integrationBranch: string;
  readonly remote: string;
  readonly dryRun: boolean;
}

/** Merge latest integration into the current task branch. */
export async function integrateIntegrationIntoTaskBranch(
  opts: IntegrateOptions,
): Promise<boolean> {
  const cwd = resolve(opts.cwd);

  if (opts.dryRun) {
    log.info(
      dim(
        `  would git fetch ${opts.remote} && git merge ${opts.remote}/${opts.integrationBranch}`,
      ),
    );
    return true;
  }

  try {
    await gitFetchRemote(cwd, opts.remote);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    log.warn(`git fetch failed (${msg}). Continuing with local refs.`);
  }

  if (!(await gitRemoteBranchExists(cwd, opts.remote, opts.integrationBranch))) {
    log.warn(`No ${opts.remote}/${opts.integrationBranch} — skipped integrate.`);
    return true;
  }

  try {
    await gitMergeRemoteBranch(cwd, opts.remote, opts.integrationBranch);
    log.ok(`Merged ${opts.remote}/${opts.integrationBranch} into task branch`);
    return true;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (await gitMergeInProgress(cwd)) {
      const conflicts = await listUnmergedRelPaths(cwd);
      log.error(`Merge conflict with ${opts.integrationBranch}. Resolve, commit, then rerun.`);
      if (conflicts.length > 0) {
        log.info(dim(`Conflicts: ${conflicts.slice(0, 8).join(", ")}`));
      }
    } else {
      log.error(`Could not merge ${opts.integrationBranch}: ${msg}`);
    }
    return false;
  }
}

export async function assertMergeRequestNotOpen(
  cwd: string,
  taskFile: string,
  allowOpenMr: boolean,
): Promise<boolean> {
  if (allowOpenMr) return true;
  const state = await getTaskMergeRequestLifecycle(cwd, taskFile);
  if (state !== "open") return true;
  log.error(
    "Current MR/PR is still open. Merge or close it first, or rerun with --allow-open-mr.",
  );
  return false;
}

export async function refreshGitContextBaseCommit(
  taskFile: string,
  gitCtx: GitContext,
  cwd: string,
): Promise<GitContext> {
  const head = await gitHeadCommit(cwd);
  if (head === null || head.length === 0) return gitCtx;
  return { ...gitCtx, baseCommit: head };
}

export async function prepareGitContextForReship(
  cwd: string,
  taskFile: string,
  gitCtx: GitContext,
): Promise<GitContext> {
  const previous = [...(gitCtx.previousMergeRequestUrls ?? [])];
  const host = await resolveGitHostForCwd(cwd);
  if (host !== null) {
    const open = await findMergeRequestByBranches({
      cwd,
      host,
      headBranch: gitCtx.taskBranch,
      baseBranch: gitCtx.baseBranch,
      state: "open",
    });
    if (open !== null) {
      previous.push(open.url);
    }
  }
  const legacy = gitCtx.mergeRequestUrl?.trim();
  if (legacy !== undefined && legacy.length > 0 && !previous.includes(legacy)) {
    previous.push(legacy);
  }

  const archived: GitContext = {
    ...gitCtx,
    previousMergeRequestUrls: previous.length > 0 ? previous : undefined,
    mergeRequestUrl: undefined,
    reshipCount: (gitCtx.reshipCount ?? 0) + 1,
    lastReshipAt: new Date().toISOString(),
  };
  await upsertGitContext(taskFile, archived);
  return archived;
}

export async function loadGitConfigForReship(cwd: string): Promise<{
  remote: string;
  integrationBranch: string;
} | null> {
  try {
    const cfg = await requireGitConfig(cwd);
    return { remote: cfg.remote, integrationBranch: cfg.integrationBranch };
  } catch (e) {
    if (e instanceof GitConfigError) {
      log.error(e.message);
      return null;
    }
    throw e;
  }
}
