import { GitConfigError, requireGitConfig } from "./git-config.js";
import { detectGitHost } from "./git-host.js";
import {
  gitBranchExists,
  gitRemoteBranchExists,
  gitRemoteUrl,
} from "./git.js";
import { getMergeRequestState, probeMergeRequestCli, type MergeRequestState } from "./pr-create.js";
import { readGitContext } from "./task.js";
import type { TaskMeta } from "../types/task.js";

/** MR state for a TASK file, or `null` when there is no MR URL or host CLI is unavailable. */
export async function getMergeRequestStateForTask(
  cwd: string,
  taskFile: string,
): Promise<MergeRequestState | null> {
  const ctx = await readGitContext(taskFile);
  const url = ctx?.mergeRequestUrl?.trim();
  if (url === undefined || url.length === 0) return null;

  let host;
  try {
    const gitCfg = await requireGitConfig(cwd);
    const remoteUrl = await gitRemoteUrl(cwd, gitCfg.remote);
    host =
      remoteUrl !== null && detectGitHost(remoteUrl) !== null
        ? detectGitHost(remoteUrl)!
        : gitCfg.host;
  } catch (e) {
    if (e instanceof GitConfigError) return null;
    throw e;
  }

  if (!(await probeMergeRequestCli(host))) return null;
  return getMergeRequestState(cwd, host, url);
}

export async function isMergeRequestMerged(
  cwd: string,
  task: TaskMeta,
): Promise<boolean> {
  if (task.status !== "shipped") return false;
  const state = await getMergeRequestStateForTask(cwd, task.filePath);
  return state === "merged";
}

/**
 * After ship: optional `task sync` when MR is merged (or no MR) but `task/*` still exists.
 */
export async function taskNeedsSync(cwd: string, task: TaskMeta): Promise<boolean> {
  if (task.status !== "shipped") return false;

  const ctx = await readGitContext(task.filePath);
  if (ctx === null) return false;

  const mrUrl = ctx.mergeRequestUrl?.trim();
  if (mrUrl !== undefined && mrUrl.length > 0) {
    const state = await getMergeRequestStateForTask(cwd, task.filePath);
    if (state !== "merged") return false;
  }

  if (await gitBranchExists(cwd, ctx.taskBranch)) return true;

  try {
    const gitCfg = await requireGitConfig(cwd);
    return gitRemoteBranchExists(cwd, gitCfg.remote, ctx.taskBranch);
  } catch (e) {
    if (e instanceof GitConfigError) return false;
    throw e;
  }
}
