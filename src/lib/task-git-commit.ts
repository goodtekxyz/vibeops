import { dim, log } from "./logger.js";
import {
  gitAddPaths,
  gitPush,
  listWorkingTreeRelPaths,
  partitionPathsForAutoCommit,
  readGitInfo,
  runGit,
} from "./git.js";

export function featCommitMessageFor(taskId: string, title: string): string {
  const slug = title.replace(/^TASK-\d+\s*[:\-]\s*/i, "").trim() || taskId;
  return `feat(${taskId.toLowerCase()}): ${slug}`;
}

export function docsCommitMessageFor(taskId: string, suffix: string): string {
  return `docs(${taskId.toLowerCase()}): ${suffix}`;
}

/** Commit all committable dirty paths; returns whether a commit was created. */
export async function commitDirtyWorkingTree(
  cwd: string,
  message: string,
  dryRun: boolean,
): Promise<boolean> {
  const git = await readGitInfo(cwd);
  if (!git.isRepo || git.dirty !== true) return false;
  const { committable, excluded } = partitionPathsForAutoCommit(
    await listWorkingTreeRelPaths(cwd),
    { unmerged: [] },
  );
  if (committable.length === 0) return false;
  if (excluded.length > 0) {
    log.warn(`Skipping ${excluded.length} build artifact path(s) from auto-commit.`);
  }
  if (dryRun) {
    log.info(dim(`  would commit ${committable.length} path(s): ${message}`));
    return true;
  }
  await gitAddPaths(cwd, committable);
  await runGit(cwd, ["commit", "-q", "-m", message]);
  log.ok(`Committed: ${message}`);
  return true;
}

export async function pushBranch(
  cwd: string,
  remote: string,
  branch: string,
  setUpstream: boolean,
): Promise<void> {
  await gitPush(cwd, remote, branch, setUpstream);
}
