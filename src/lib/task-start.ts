import { relative, resolve } from "node:path";

import {
  branchNameForTaskFile,
  readGitContext,
  readTaskFile,
  updateInlineStatus,
  upsertGitContext,
} from "./task.js";
import {
  gitBranchExists,
  gitCheckout,
  gitCheckoutNewBranch,
  gitGovernanceOnlyDirty,
  gitHeadCommit,
  gitPullFastForwardOnly,
  gitRemoteBranchExists,
  gitSwitchToBranch,
  gitRemoteUrl,
  readGitInfo,
} from "./git.js";
import { cyan, dim, log } from "./logger.js";
import type { GitContext } from "../types/task.js";

export interface StartTaskBranchOptions {
  readonly cwd: string;
  readonly taskFile: string;
  readonly integrationBranch: string;
  readonly remote?: string;
  readonly dryRun?: boolean;
  readonly allowDirty?: boolean;
}

function relOrAbs(root: string, p: string): string {
  const r = relative(root, p);
  return r === "" ? "." : r.startsWith("..") ? p : r;
}

/** Create or resume task branch from integration branch and mark TASK In Progress. */
export async function startTaskBranch(opts: StartTaskBranchOptions): Promise<boolean> {
  const cwd = resolve(opts.cwd);
  const taskFile = opts.taskFile;
  const integrationBranch = opts.integrationBranch;
  const remote = opts.remote ?? "origin";
  const meta = await readTaskFile(taskFile);
  const git = await readGitInfo(cwd);

  if (!git.isRepo) {
    if (opts.dryRun) {
      log.info(dim("dry-run — would require a git repository"));
      return true;
    }
    log.error("Not a git repository. Run `vibeops init` with Git setup first.");
    return false;
  }

  if (git.dirty === true && opts.allowDirty !== true) {
    const gov = await gitGovernanceOnlyDirty(cwd);
    if (!gov.onlyGovernance) {
      log.error("Git working tree is dirty. Commit or stash, or rerun with --allow-dirty.");
      return false;
    }
    log.warn("Only governance paths are dirty — proceeding.");
  }

  const taskBranch = branchNameForTaskFile(taskFile);
  const existingCtx = await readGitContext(taskFile);
  const branchExists = await gitBranchExists(cwd, taskBranch);

  if (opts.dryRun) {
    log.info(`  ${dim("integration")}  ${integrationBranch}`);
    log.info(`  ${dim("task branch")}  ${cyan(taskBranch)}`);
    log.info(
      dim(
        branchExists
          ? `dry-run — would git switch ${taskBranch}`
          : `dry-run — would checkout ${integrationBranch}, then git switch -c ${taskBranch}`,
      ),
    );
    return true;
  }

  if (!branchExists && git.branch !== integrationBranch) {
    const ok = await gitSwitchToBranch(cwd, integrationBranch, remote);
    if (!ok) {
      log.error(
        `Integration branch "${integrationBranch}" not found locally or on ${remote}. Run vibeops init or create the branch.`,
      );
      return false;
    }
  }

  // Ensure integration branch is up-to-date before creating a new task branch.
  if (!branchExists) {
    const remoteUrl = await gitRemoteUrl(cwd, remote);
    if (remoteUrl) {
      const hasRemoteBranch = await gitRemoteBranchExists(cwd, remote, integrationBranch);
      if (hasRemoteBranch) {
        try {
          await gitPullFastForwardOnly(cwd, remote, integrationBranch);
          log.info(dim(`Pulled latest ${remote}/${integrationBranch} (--ff-only).`));
        } catch {
          log.warn(
            `Could not fast-forward pull ${remote}/${integrationBranch}. Resolve manually, then rerun task add.`,
          );
          return false;
        }
      }
    }
  }

  const baseBranch = integrationBranch;
  const baseCommit = (await gitHeadCommit(cwd)) ?? "";
  if (baseCommit.length === 0 && !branchExists) {
    log.error("No commits on integration branch. Create an initial commit first.");
    return false;
  }

  const ctx: GitContext = {
    baseBranch,
    baseCommit: branchExists && existingCtx ? existingCtx.baseCommit : baseCommit,
    taskBranch,
    startedAt: existingCtx?.startedAt ?? new Date().toISOString(),
  };

  log.info(`  ${dim("integration")}  ${baseBranch} @ ${ctx.baseCommit.slice(0, 7)}`);
  log.info(`  ${dim("task branch")}  ${cyan(taskBranch)}`);

  if (branchExists) {
    await gitCheckout(cwd, taskBranch);
    if (meta.status !== "shipped") {
      await updateInlineStatus(taskFile, "in_progress");
    }
    if (existingCtx === null) {
      await upsertGitContext(taskFile, ctx);
    }
    log.ok(`Resumed ${taskBranch}`);
  } else {
    await gitCheckoutNewBranch(cwd, taskBranch, baseBranch);
    await updateInlineStatus(taskFile, "in_progress");
    await upsertGitContext(taskFile, ctx);
    log.ok(`Branch ${taskBranch} ready`);
  }

  log.info(`  ${dim("file")}         ${relOrAbs(cwd, taskFile)}`);
  return true;
}
