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
import { getMergeRequestState, probeMergeRequestCli } from "../lib/pr-create.js";
import { projectPaths } from "../lib/paths.js";
import { taskNotFoundMessage } from "../lib/resolve-task.js";
import { relPath } from "../lib/task-context.js";
import {
  commitDirtyWorkingTree,
  docsCommitMessageFor,
  pushBranch,
} from "../lib/task-git-commit.js";
import { resolveLifecycleTarget } from "../lib/task-lifecycle-target.js";
import {
  markGitContextDone,
  readGitContext,
  readTaskFile,
  updateInlineStatus,
} from "../lib/task.js";

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
  const ctx = await readGitContext(taskFile);

  if (isProtectedBranch(taskBranch, integrationBranch, productionBranch)) {
    log.error(`Refusing to delete protected branch: ${taskBranch}`);
    process.exitCode = 1;
    return;
  }

  log.info(bold(`vibeops task sync ${taskId}`));
  log.info(`  ${dim("task branch")}  ${cyan(taskBranch)}`);
  log.info(`  ${dim("integration")}  ${integrationBranch}`);
  log.info(`  ${dim("file")}          ${relPath(cwd, taskFile)}`);
  log.blank();

  const meta = await readTaskFile(taskFile);
  if (ctx?.mergeRequestUrl && !dryRun) {
    const remoteUrl = await gitRemoteUrl(cwd, remote);
    const host =
      remoteUrl !== null && detectGitHost(remoteUrl) !== null
        ? detectGitHost(remoteUrl)!
        : gitCfg.host;
    if (await probeMergeRequestCli(host)) {
      const state = await getMergeRequestState(cwd, host, ctx.mergeRequestUrl);
      const label = mergeRequestLabel(host);
      if (state === "open") {
        log.warn(
          `${yellow(label)} still open — merge with task merge or the host UI before sync.`,
        );
      } else if (state === "merged") {
        log.ok(`${label} merged.`);
      }
    }
  } else if (meta.status === "review") {
    log.warn(
      `${yellow("Status")} is Review — merge the MR first, then rerun task sync.`,
    );
  }

  if (dryRun) {
    log.info(bold("dry-run — would:"));
    log.info(`  · git fetch ${remote} --prune`);
    log.info(`  · git switch ${integrationBranch}`);
    log.info(`  · git pull --ff-only ${remote} ${integrationBranch}`);
    if (meta.status !== "done") {
      log.info("  · Status → Done on integration branch; commit; push");
    }
    log.info(`  · git branch ${options.force === true ? "-D" : "-d"} ${taskBranch}`);
    if (options.noRemoteDelete !== true) {
      log.info(`  · git push ${remote} --delete ${taskBranch} (if exists)`);
    }
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

  const metaOnIntegration = await readTaskFile(taskFile);
  if (metaOnIntegration.status !== "done") {
    await updateInlineStatus(taskFile, "done");
    await markGitContextDone(taskFile);
    log.ok("Status → Done");
    const committed = await commitDirtyWorkingTree(
      cwd,
      docsCommitMessageFor(taskId, "mark done"),
      false,
    );
    if (committed) {
      try {
        await pushBranch(cwd, remote, integrationBranch, false);
        log.ok(`Pushed done metadata → ${remote}/${integrationBranch}`);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        log.warn(`Could not push done metadata: ${msg}`);
      }
    }
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
