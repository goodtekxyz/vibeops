import { resolve } from "node:path";

import { GitConfigError, requireGitConfig } from "../lib/git-config.js";
import { formatHostCliHint, formatHostCliMissingMessage } from "../lib/git-host-cli.js";
import { detectGitHost, mergeRequestLabel } from "../lib/git-host.js";
import { gitRemoteUrl } from "../lib/git.js";
import { bold, cyan, dim, log } from "../lib/logger.js";
import { projectPaths } from "../lib/paths.js";
import { taskNotFoundMessage } from "../lib/resolve-task.js";
import {
  getMergeRequestState,
  mergeMergeRequest,
  probeMergeRequestCli,
  type MergeRequestMergeMethod,
} from "../lib/pr-create.js";
import { assertMergeRequestMerged } from "../lib/task-merge-verify.js";
import { relPath } from "../lib/task-context.js";
import { resolveLifecycleTarget } from "../lib/task-lifecycle-target.js";
import { resolveOpenTaskMergeRequest } from "../lib/task-effective-status.js";
import { readGitContext } from "../lib/task.js";

export interface TaskMergeCommandOptions {
  dryRun?: boolean;
  cwd?: string;
  /** Use merge commit (default is squash). */
  merge?: boolean;
  rebase?: boolean;
}

function resolveMergeMethod(opts: TaskMergeCommandOptions): MergeRequestMergeMethod {
  if (opts.rebase === true) return "rebase";
  if (opts.merge === true) return "merge";
  return "squash";
}

export async function taskMergeCommand(
  taskRef: string | undefined,
  options: TaskMergeCommandOptions = {},
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
        "No TASK to merge. Pass TASK-NNN, checkout a task/* branch, or run task ship first.",
      );
    }
    process.exitCode = 1;
    return;
  }

  const ctx = await readGitContext(target.taskFile);
  if (ctx === null) {
    log.error("No Git Context on TASK — run task add first.");
    process.exitCode = 1;
    return;
  }
  const resolvedMr = dryRun
    ? null
    : await resolveOpenTaskMergeRequest(cwd, target.taskFile);

  if (!dryRun && resolvedMr === null) {
    log.error(
      `No open MR/PR for ${ctx.taskBranch} → ${ctx.baseBranch}. Run task ship first.`,
    );
    process.exitCode = 1;
    return;
  }

  const mergeRequestUrl =
    resolvedMr?.url ??
    `(dry-run: would resolve open MR for ${ctx.taskBranch} → ${ctx.baseBranch})`;

  const remoteUrl = await gitRemoteUrl(cwd, gitCfg.remote);
  const host =
    resolvedMr?.host ??
    (remoteUrl !== null && detectGitHost(remoteUrl) !== null
      ? detectGitHost(remoteUrl)!
      : gitCfg.host);

  const method = resolveMergeMethod(options);
  const label = mergeRequestLabel(host);

  log.info(bold(`vibeops task merge ${target.taskId}`));
  log.info(`  ${dim("file")}       ${relPath(cwd, target.taskFile)}`);
  log.info(`  ${dim("MR/PR")}      ${mergeRequestUrl}`);
  log.info(`  ${dim("target")}     ${ctx.baseBranch} (${gitCfg.integrationBranch})`);
  log.info(`  ${dim("method")}     ${method}`);
  log.blank();

  if (dryRun) {
    await mergeMergeRequest({
      cwd,
      host,
      url: mergeRequestUrl,
      method,
      dryRun: true,
    });
    log.blank();
    log.info(`Next: ${cyan("vibeops task sync")}`);
    return;
  }

  const state = await getMergeRequestState(cwd, host, mergeRequestUrl);
  if (state === "merged") {
    log.ok(`${label} already merged.`);
    log.blank();
    log.info(`Next: ${cyan("vibeops task sync")}`);
    return;
  }
  if (state === "open") {
    const cliOk = await probeMergeRequestCli(host);
    if (!cliOk) {
      log.error(formatHostCliMissingMessage(host, `merge the ${label}`));
      for (const line of formatHostCliHint(host)) {
        log.info(dim(`  ${line}`));
      }
      log.info(dim("Or merge in the host UI, then task sync."));
      process.exitCode = 1;
      return;
    }
    try {
      await mergeMergeRequest({
        cwd,
        host,
        url: mergeRequestUrl,
        method,
        waitForCi: true,
        immediate: true,
      });
      const verified = await assertMergeRequestMerged({
        cwd,
        host,
        url: mergeRequestUrl,
        integrationBranch: ctx.baseBranch,
      });
      if (!verified.ok) {
        log.error(verified.message);
        process.exitCode = 1;
        return;
      }
      log.ok(`${label} merged into ${ctx.baseBranch}.`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      log.error(`Merge failed: ${msg}`);
      log.info(dim("Merge in the host UI if branch protection blocks CLI merge."));
      process.exitCode = 1;
      return;
    }
  } else if (state === "closed") {
    log.warn(`${label} is closed but not merged — resolve manually.`);
    process.exitCode = 1;
    return;
  } else {
    log.warn(`Could not read ${label} state — attempting merge anyway.`);
    try {
      await mergeMergeRequest({
        cwd,
        host,
        url: mergeRequestUrl,
        method,
        waitForCi: true,
        immediate: true,
      });
      const verified = await assertMergeRequestMerged({
        cwd,
        host,
        url: mergeRequestUrl,
        integrationBranch: ctx.baseBranch,
      });
      if (!verified.ok) {
        log.error(verified.message);
        process.exitCode = 1;
        return;
      }
      log.ok(`${label} merged into ${ctx.baseBranch}.`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      log.error(`Merge failed: ${msg}`);
      process.exitCode = 1;
      return;
    }
  }

  log.blank();
  log.info(`Next: ${cyan("vibeops task sync")}`);
}
