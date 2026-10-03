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
  gitRevParse,
  readGitInfo,
} from "./git.js";
import { resolveIntegrationBaseRef } from "./git-worktree.js";
import {
  ensureIntegrationSynced,
  printIntegrationSyncDiagnosis,
} from "./git-integration-sync.js";
import { cyan, dim, log } from "./logger.js";
import type { GitContext } from "../types/task.js";

export interface StartTaskBranchOptions {
  readonly cwd: string;
  readonly taskFile: string;
  readonly integrationBranch: string;
  readonly remote?: string;
  readonly dryRun?: boolean;
  readonly allowDirty?: boolean;
  /**
   * Skip fetch + fast-forward (caller already ran {@link ensureIntegrationSynced}).
   * The task branch still starts from `<remote>/<integration>` (or the local
   * integration branch when there is no remote-tracking ref).
   */
  readonly skipIntegrationPull?: boolean;
}

function relOrAbs(root: string, p: string): string {
  const r = relative(root, p);
  return r === "" ? "." : r.startsWith("..") ? p : r;
}

/** True when In Progress TASK has no task branch yet (failed mid-add). */
export async function isIncompleteTaskStart(
  cwd: string,
  taskFile: string,
): Promise<boolean> {
  const ctx = await readGitContext(taskFile);
  if (ctx === null) return true;
  return !(await gitBranchExists(cwd, ctx.taskBranch));
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
    const base =
      (await resolveIntegrationBaseRef(cwd, remote, integrationBranch)) ??
      `${remote}/${integrationBranch}`;
    log.info(`  ${dim("integration")}  ${integrationBranch}`);
    log.info(`  ${dim("task branch")}  ${cyan(taskBranch)}`);
    log.info(
      dim(
        branchExists
          ? `dry-run — would git switch ${taskBranch}`
          : `dry-run — would git fetch ${remote} ${integrationBranch}, then git switch -c ${taskBranch} --no-track ${base}`,
      ),
    );
    return true;
  }

  // Worktree-safe (D-006): never check out the integration branch — another
  // worktree may own it. New task branches start from <remote>/<integration>.
  let baseRef: string | null = null;
  if (!branchExists) {
    if (opts.skipIntegrationPull === true) {
      baseRef = await resolveIntegrationBaseRef(cwd, remote, integrationBranch);
    } else {
      const synced = await ensureIntegrationSynced({
        cwd,
        remote,
        integrationBranch,
        fetch: true,
      });
      if (!synced.ok) {
        printIntegrationSyncDiagnosis(synced.diagnosis);
        log.blank();
        log.info(
          dim(
            `TASK file is already created — after fixing sync, rerun ${cyan("vibeops task add")} to resume the branch (does not create a second TASK).`,
          ),
        );
        return false;
      }
      if (synced.pulled) {
        log.info(dim(synced.diagnosis.summary));
      }
      baseRef = synced.baseRef;
    }
    if (baseRef === null) {
      log.error(
        `Integration branch "${integrationBranch}" not found locally or on ${remote}. Run vibeops init or create the branch.`,
      );
      return false;
    }
  }

  const baseBranch = integrationBranch;
  const baseCommit = baseRef !== null ? ((await gitRevParse(cwd, baseRef)) ?? "").slice(0, 7) : "";
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

  log.info(
    `  ${dim("integration")}  ${baseRef ?? baseBranch} @ ${ctx.baseCommit.slice(0, 7)}`,
  );
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
    await gitCheckoutNewBranch(cwd, taskBranch, baseRef!, { noTrack: true });
    await updateInlineStatus(taskFile, "in_progress");
    await upsertGitContext(taskFile, ctx);
    log.ok(`Branch ${taskBranch} ready`);
  }

  log.info(`  ${dim("file")}         ${relOrAbs(cwd, taskFile)}`);
  return true;
}
