import { GitConfigError, requireGitConfig } from "./git-config.js";
import { detectGitHost } from "./git-host.js";
import {
  gitBranchExists,
  gitRemoteBranchExists,
  gitRemoteUrl,
} from "./git.js";
import {
  findMergeRequestByBranches,
  getMergeRequestState,
  probeMergeRequestCli,
  type MergeRequestState,
} from "./pr-create.js";
import { readGitContext } from "./task.js";
import type { GitHost } from "../types/config.js";
import type { GitContext, TaskMeta } from "../types/task.js";

export type TaskMergeRequestLifecycle = MergeRequestState | "none";

export interface ResolvedTaskMergeRequest {
  readonly url: string;
  readonly host: GitHost;
  readonly state: MergeRequestState;
  readonly source: "branch" | "task-file";
}

export async function resolveGitHostForCwd(cwd: string): Promise<GitHost | null> {
  try {
    const gitCfg = await requireGitConfig(cwd);
    const remoteUrl = await gitRemoteUrl(cwd, gitCfg.remote);
    if (remoteUrl !== null && detectGitHost(remoteUrl) !== null) {
      return detectGitHost(remoteUrl)!;
    }
    return gitCfg.host;
  } catch (e) {
    if (e instanceof GitConfigError) return null;
    throw e;
  }
}

async function readTaskGitContext(
  taskFile: string,
): Promise<GitContext | null> {
  return readGitContext(taskFile);
}

async function resolveFromBranches(
  cwd: string,
  ctx: GitContext,
  state: "open" | "merged" | "closed" | "all",
): Promise<ResolvedTaskMergeRequest | null> {
  try {
    const host = await resolveGitHostForCwd(cwd);
    if (host === null) return null;
    const found = await findMergeRequestByBranches({
      cwd,
      host,
      headBranch: ctx.taskBranch,
      baseBranch: ctx.baseBranch,
      state,
    });
    if (found === null) return null;
    return { url: found.url, host, state: found.state, source: "branch" };
  } catch {
    return null;
  }
}

async function resolveFromTaskFileUrl(
  cwd: string,
  ctx: GitContext,
): Promise<ResolvedTaskMergeRequest | null> {
  const url = ctx.mergeRequestUrl?.trim();
  if (url === undefined || url.length === 0) return null;
  const host = await resolveGitHostForCwd(cwd);
  if (host === null || !(await probeMergeRequestCli(host))) return null;
  const state = await getMergeRequestState(cwd, host, url);
  return { url, host, state, source: "task-file" };
}

/** Open MR/PR for a TASK — branch lookup first, legacy TASK URL fallback. */
export async function resolveOpenTaskMergeRequest(
  cwd: string,
  taskFile: string,
): Promise<ResolvedTaskMergeRequest | null> {
  const ctx = await readTaskGitContext(taskFile);
  if (ctx === null) return null;

  const fromBranch = await resolveFromBranches(cwd, ctx, "open");
  if (fromBranch !== null) return fromBranch;

  const legacy = await resolveFromTaskFileUrl(cwd, ctx);
  if (legacy !== null && legacy.state === "open") return legacy;
  return null;
}

/** MR lifecycle for hints, sync, and status — prefers host branch lookup. */
export async function getTaskMergeRequestLifecycle(
  cwd: string,
  taskFile: string,
): Promise<TaskMergeRequestLifecycle> {
  const ctx = await readTaskGitContext(taskFile);
  if (ctx === null) return "none";

  const open = await resolveFromBranches(cwd, ctx, "open");
  if (open !== null) return "open";

  const merged = await resolveFromBranches(cwd, ctx, "merged");
  if (merged !== null) return "merged";

  const legacy = await resolveFromTaskFileUrl(cwd, ctx);
  if (legacy !== null) return legacy.state;

  return "none";
}

/** @deprecated Use {@link getTaskMergeRequestLifecycle} or {@link resolveOpenTaskMergeRequest}. */
export async function getMergeRequestStateForTask(
  cwd: string,
  taskFile: string,
): Promise<MergeRequestState | null> {
  const lifecycle = await getTaskMergeRequestLifecycle(cwd, taskFile);
  if (lifecycle === "none") return null;
  return lifecycle;
}

export async function hasOpenTaskMergeRequest(
  cwd: string,
  taskFile: string,
): Promise<boolean> {
  return (await getTaskMergeRequestLifecycle(cwd, taskFile)) === "open";
}

export async function resolveTaskMergeRequestUrl(
  cwd: string,
  taskFile: string,
): Promise<string | null> {
  const open = await resolveOpenTaskMergeRequest(cwd, taskFile);
  return open?.url ?? null;
}

export async function isMergeRequestMerged(
  cwd: string,
  task: TaskMeta,
): Promise<boolean> {
  if (task.status !== "shipped") return false;
  return (await getTaskMergeRequestLifecycle(cwd, task.filePath)) === "merged";
}

/**
 * After ship: optional `task sync` when MR is merged (or no MR) but `task/*` still exists.
 */
export async function taskNeedsSync(cwd: string, task: TaskMeta): Promise<boolean> {
  if (task.status !== "shipped") return false;

  const ctx = await readTaskGitContext(task.filePath);
  if (ctx === null) return false;

  const lifecycle = await getTaskMergeRequestLifecycle(cwd, task.filePath);
  if (lifecycle === "open") return false;

  if (await gitBranchExists(cwd, ctx.taskBranch)) return true;

  try {
    const gitCfg = await requireGitConfig(cwd);
    return gitRemoteBranchExists(cwd, gitCfg.remote, ctx.taskBranch);
  } catch (e) {
    if (e instanceof GitConfigError) return false;
    throw e;
  }
}
