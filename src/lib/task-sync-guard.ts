import { mergeRequestLabel } from "./git-host.js";
import { gitIsAncestor, gitRemoteBranchExists, gitRevParse } from "./git.js";
import { getMergeRequestDetails } from "./pr-create.js";
import { resolveTaskMergeRequestLifecycle } from "./task-effective-status.js";
import { readGitContext } from "./task.js";
import type { GitHost } from "../types/config.js";
import type { TaskMergeRequestLifecycle } from "./task-effective-status.js";

export type TaskSyncGuardFailureReason =
  | "mr-open"
  | "mr-closed-not-merged"
  | "mr-not-merged"
  | "mr-state-unknown"
  | "integration-not-updated";

export interface TaskSyncGuardResult {
  readonly ok: boolean;
  readonly reason?: TaskSyncGuardFailureReason;
  readonly message?: string;
}

export function mrLifecycleBlocksSync(
  lifecycle: TaskMergeRequestLifecycle,
): TaskSyncGuardFailureReason | null {
  if (lifecycle === "open") return "mr-open";
  if (lifecycle === "closed") return "mr-closed-not-merged";
  return null;
}

function integrationRef(remote: string, branch: string): string {
  return `${remote}/${branch}`;
}

async function resolveMergedCommitOnIntegration(
  cwd: string,
  host: GitHost,
  mrUrl: string,
  remote: string,
  integrationBranch: string,
  taskBranch: string,
): Promise<string | null> {
  const details = await getMergeRequestDetails(cwd, host, mrUrl);
  const fromMr =
    details?.squashCommitSha?.trim() ||
    details?.mergeCommitSha?.trim() ||
    null;
  if (fromMr) return fromMr;

  const taskRemoteRef = integrationRef(remote, taskBranch);
  if (await gitRemoteBranchExists(cwd, remote, taskBranch)) {
    return gitRevParse(cwd, taskRemoteRef);
  }

  const integrationSha = await gitRevParse(cwd, integrationRef(remote, integrationBranch));
  return integrationSha;
}

async function integrationContainsTaskWork(
  cwd: string,
  remote: string,
  integrationBranch: string,
  taskBranch: string,
  host: GitHost | null,
  mrUrl: string | null,
  lifecycle: TaskMergeRequestLifecycle,
): Promise<boolean> {
  const target = integrationRef(remote, integrationBranch);
  const targetSha = await gitRevParse(cwd, target);
  if (targetSha === null) return false;

  if (lifecycle === "merged" && mrUrl !== null && host !== null) {
    const mergedCommit = await resolveMergedCommitOnIntegration(
      cwd,
      host,
      mrUrl,
      remote,
      integrationBranch,
      taskBranch,
    );
    if (mergedCommit !== null) {
      return gitIsAncestor(cwd, mergedCommit, target);
    }
  }

  const taskRemoteRef = integrationRef(remote, taskBranch);
  if (await gitRemoteBranchExists(cwd, remote, taskBranch)) {
    const taskTip = await gitRevParse(cwd, taskRemoteRef);
    if (taskTip !== null) {
      return gitIsAncestor(cwd, taskTip, target);
    }
  }

  // No remote task branch and no merged commit to verify — allow cleanup only when MR is merged.
  return lifecycle === "merged";
}

export async function checkTaskSyncReady(input: {
  cwd: string;
  taskFile: string;
  remote: string;
  integrationBranch: string;
  taskBranch: string;
  host: GitHost | null;
  force?: boolean;
}): Promise<TaskSyncGuardResult> {
  if (input.force === true) {
    return { ok: true };
  }

  const lifecycleInfo = await resolveTaskMergeRequestLifecycle(input.cwd, input.taskFile);
  const lifecycle = lifecycleInfo.state;
  const mrUrl = lifecycleInfo.url;
  const host = lifecycleInfo.host ?? input.host;
  const label = mergeRequestLabel(host ?? "github");

  const lifecycleBlock = mrLifecycleBlocksSync(lifecycle);
  if (lifecycleBlock === "mr-open") {
    return {
      ok: false,
      reason: "mr-open",
      message: `${label} is still open. Run \`vibeops task merge\` (or merge in the host UI) and confirm it shows Merged before sync.`,
    };
  }
  if (lifecycleBlock === "mr-closed-not-merged") {
    return {
      ok: false,
      reason: "mr-closed-not-merged",
      message: `${label} is closed but not merged. Re-open or recreate the MR and merge into ${input.integrationBranch} before sync.`,
    };
  }

  if (lifecycle === "unknown" && mrUrl !== null) {
    return {
      ok: false,
      reason: "mr-state-unknown",
      message: `Could not verify ${label} state. Merge on the host, then rerun sync (or use --force to skip checks).`,
    };
  }

  if (lifecycle === "merged") {
    if (mrUrl !== null && host !== null) {
      const details = await getMergeRequestDetails(input.cwd, host, mrUrl);
      if (details?.state !== "merged" || details.mergedAt === null) {
        return {
          ok: false,
          reason: "mr-not-merged",
          message: `${label} is not merged yet (auto-merge may still be pending). Wait for Merged on the host, then rerun sync.`,
        };
      }
    }
  } else if (lifecycle === "none") {
    const ctx = await readGitContext(input.taskFile);
    if (ctx === null) {
      return {
        ok: false,
        reason: "mr-state-unknown",
        message: "No Git Context on TASK — cannot verify merge before sync.",
      };
    }
  }

  const integrated = await integrationContainsTaskWork(
    input.cwd,
    input.remote,
    input.integrationBranch,
    input.taskBranch,
    host,
    mrUrl,
    lifecycle,
  );

  if (!integrated) {
    return {
      ok: false,
      reason: "integration-not-updated",
      message: `${input.integrationBranch} does not contain the task branch commits yet. Merge the ${label} into ${input.integrationBranch} before sync.`,
    };
  }

  return { ok: true };
}
