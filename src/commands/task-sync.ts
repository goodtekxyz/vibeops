import { resolve } from "node:path";

import { GitConfigError, requireGitConfig } from "../lib/git-config.js";
import { detectGitHost, mergeRequestLabel } from "../lib/git-host.js";
import {
  gitBranchExists,
  gitDeleteBranch,
  gitDeleteRemoteBranch,
  gitFetchRemote,
  gitPullFastForwardOnly,
  gitRemoteBranchExists,
  gitRemoteUrl,
  gitSwitchToBranch,
  readGitInfo,
} from "../lib/git.js";
import { bold, cyan, dim, log, yellow } from "../lib/logger.js";
import { probeMergeRequestCli } from "../lib/pr-create.js";
import { projectPaths } from "../lib/paths.js";
import { taskNotFoundMessage } from "../lib/resolve-task.js";
import { relPath } from "../lib/task-context.js";
import {
  getTaskMergeRequestLifecycle,
  isMergeRequestMerged,
} from "../lib/task-effective-status.js";
import { resolveLifecycleTarget } from "../lib/task-lifecycle-target.js";
import { readTaskFile } from "../lib/task.js";

export interface TaskSyncCommandOptions {
  dryRun?: boolean;
  cwd?: string;
  noRemoteDelete?: boolean;
  force?: boolean;
}

function isProtectedBranch(name: string, integration: string, production: string): boolean {
  return name === integration || name === production || name === "main" || name === "master";
}

export async function taskSyncCommand(
  taskRef: string | undefined,
  options: TaskSyncCommandOptions = {},
): Promise<void> {
  const cwd = resolve(options.cwd ?? process.cwd());
  const dryRun = options.dryRun === true;
  const paths = projectPaths(cwd);

  let gitCfg;
  try {
    gitCfg = await requireGitConfig(cwd);
  } catch (e) {
    if (e instanceof GitConfigError) {
      log.error(e.message);
      process.exitCode = 1;
      return;
    }
    throw e;
  }

  const target = await resolveLifecycleTarget(paths, cwd, taskRef);
  if (target === null) {
    if (taskRef?.trim()) {
      log.error(taskNotFoundMessage(taskRef));
    } else {
      log.error(
        "No TASK to sync. Pass TASK-NNN, checkout a task/* branch, or run task ship first.",
      );
    }
    process.exitCode = 1;
    return;
  }

  const { integrationBranch, productionBranch, remote } = gitCfg;
  const { taskId, taskBranch, taskFile } = target;

  if (isProtectedBranch(taskBranch, integrationBranch, productionBranch)) {
    log.error(`Refusing to delete protected branch: ${taskBranch}`);
    process.exitCode = 1;
    return;
  }

  log.info(bold(`vibeops task sync ${taskId}`));
  log.info(`  ${dim("task branch")}  ${cyan(taskBranch)}`);
  log.info(`  ${dim("integration")}  ${integrationBranch}`);
  log.info(`  ${dim("file")}          ${relPath(cwd, taskFile)}`);
  log.info(`  ${dim("note")}        ${dim("Git cleanup only — TASK md stays Shipped")}`);
  log.blank();

  const meta = await readTaskFile(taskFile);
  if (!dryRun) {
    const lifecycle = await getTaskMergeRequestLifecycle(cwd, taskFile);
    if (lifecycle !== "none") {
      const remoteUrl = await gitRemoteUrl(cwd, remote);
      const host =
        remoteUrl !== null && detectGitHost(remoteUrl) !== null
          ? detectGitHost(remoteUrl)!
          : gitCfg.host;
      const label = mergeRequestLabel(host);
      if (lifecycle === "open") {
        log.warn(
          `${yellow(label)} still open — merge with task merge or the host UI before sync.`,
        );
      } else if (lifecycle === "merged") {
        log.ok(`${label} merged.`);
      }
    } else if (await probeMergeRequestCli(gitCfg.host)) {
      log.warn("Could not read MR state — continuing with branch cleanup.");
    }
  } else if (meta.status === "shipped" && !(await isMergeRequestMerged(cwd, meta))) {
    log.warn(
      `${yellow("MR")} not merged yet — merge on the host or \`task merge\`, then rerun task sync.`,
    );
  }

  if (dryRun) {
    log.info(bold("dry-run — would:"));
    log.info(`  · git fetch ${remote} --prune`);
    log.info(`  · git switch ${integrationBranch}`);
    log.info(`  · git pull --ff-only ${remote} ${integrationBranch}`);
    log.info(`  · git branch ${options.force === true ? "-D" : "-d"} ${taskBranch}`);
    if (options.noRemoteDelete !== true) {
      log.info(`  · git push ${remote} --delete ${taskBranch} (if exists)`);
    }
    log.info(dim("  · no edits to docs/tasks/*.md"));
    log.blank();
    log.info(`Next: ${cyan("vibeops task add")}`);
    return;
  }

  const git = await readGitInfo(cwd);
  if (!git.isRepo) {
    log.error("Not a git repository.");
    process.exitCode = 1;
    return;
  }

  if (git.branch === taskBranch) {
    log.info(dim(`On ${taskBranch} — switching to ${integrationBranch} first.`));
  }

  try {
    await gitFetchRemote(cwd, remote);
    log.ok(`Fetched ${remote} (--prune)`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    log.warn(`git fetch failed (${msg}). Continuing with local refs.`);
  }

  const switched = await gitSwitchToBranch(cwd, integrationBranch, remote);
  if (!switched) {
    log.error(
      `Integration branch "${integrationBranch}" not found locally or on ${remote}.`,
    );
    process.exitCode = 1;
    return;
  }
  log.ok(`On ${integrationBranch}`);

  if (await gitRemoteBranchExists(cwd, remote, integrationBranch)) {
    try {
      await gitPullFastForwardOnly(cwd, remote, integrationBranch);
      log.ok(`Up to date with ${remote}/${integrationBranch} (--ff-only)`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      log.error(
        `Could not fast-forward ${integrationBranch}: ${msg}. Resolve locally, then rerun.`,
      );
      process.exitCode = 1;
      return;
    }
  } else {
    log.warn(`No ${remote}/${integrationBranch} — skipped pull.`);
  }

  if (await gitBranchExists(cwd, taskBranch)) {
    try {
      await gitDeleteBranch(cwd, taskBranch, { force: options.force === true });
      log.ok(`Deleted local branch ${taskBranch}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      log.error(`Could not delete local ${taskBranch}: ${msg}`);
      log.info(
        dim(
          "Merge the MR into the integration branch first, or rerun with --force (discards unmerged branch).",
        ),
      );
      process.exitCode = 1;
      return;
    }
  } else {
    log.info(dim(`Local branch ${taskBranch} not found — skipped.`));
  }

  if (options.noRemoteDelete !== true && (await gitRemoteBranchExists(cwd, remote, taskBranch))) {
    try {
      await gitDeleteRemoteBranch(cwd, remote, taskBranch);
      log.ok(`Deleted ${remote}/${taskBranch}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      log.warn(`Could not delete remote ${taskBranch}: ${msg}`);
      log.info(dim(`Delete manually: git push ${remote} --delete ${taskBranch}`));
    }
  } else if (options.noRemoteDelete === true) {
    log.info(dim("Remote branch delete skipped (--no-remote-delete)."));
  } else {
    log.info(dim(`No ${remote}/${taskBranch} — skipped remote delete.`));
  }

  log.blank();
  log.info(`Next: ${cyan("vibeops task add")}`);
}
