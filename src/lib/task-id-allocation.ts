import { readdir, realpath } from "node:fs/promises";
import { basename, dirname, join, relative } from "node:path";

import { gitRemoteUrl, runGit } from "./git.js";
import { currentWorktreeRoot, listWorktrees } from "./git-worktree.js";

/**
 * Collision-free TASK ids (D-006).
 *
 * next id = 1 + max TASK number found in ANY of:
 *  1. local `docs/tasks` (this worktree, including uncommitted files);
 *  2. `docs/tasks` on `<remote>/<integration>` (`git ls-tree`), else local `<integration>`;
 *  3. `task/NNN-*` branches: local heads, remote-tracking refs, and the remote itself
 *     (`git ls-remote --heads <remote> 'task/*'`);
 *  4. `docs/tasks` in every worktree from `git worktree list`.
 *
 * A configured remote that cannot be listed is an error (fail closed) — an id
 * could otherwise collide with an unmerged task branch someone else pushed.
 */

const TASK_FILE_RE = /^TASK-(\d+)/i;
const TASK_BRANCH_RE = /^task\/(?:task-)?(\d+)(?:-|$)/i;

export function taskNumberFromFilename(name: string): number | null {
  const m = TASK_FILE_RE.exec(name.trim());
  return m ? Number.parseInt(m[1]!, 10) : null;
}

/** `task/270-foo` or `task/task-020-foo` → number; accepts `refs/heads/` / `<remote>/` prefixes. */
export function taskNumberFromBranch(ref: string): number | null {
  const name = ref
    .trim()
    .replace(/^refs\/heads\//, "")
    .replace(/^refs\/remotes\/[^/]+\//, "");
  const m = TASK_BRANCH_RE.exec(name);
  return m ? Number.parseInt(m[1]!, 10) : null;
}

export class TaskIdAllocationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TaskIdAllocationError";
  }
}

export interface TaskIdSources {
  readonly localFiles: number;
  readonly integrationTree: number;
  readonly branches: number;
  readonly remoteBranches: number;
  readonly worktrees: number;
}

export interface TaskIdAllocation {
  readonly next: number;
  readonly max: number;
  /** Highest number seen per source (0 = none). */
  readonly sources: TaskIdSources;
}

async function maxInDir(dir: string): Promise<number> {
  let max = 0;
  let names: string[];
  try {
    names = await readdir(dir);
  } catch {
    return 0;
  }
  for (const n of names) {
    const v = taskNumberFromFilename(n);
    if (v !== null) max = Math.max(max, v);
  }
  return max;
}

function maxOf(values: Iterable<number | null>): number {
  let max = 0;
  for (const v of values) if (v !== null) max = Math.max(max, v);
  return max;
}

async function refExists(cwd: string, ref: string): Promise<boolean> {
  try {
    await runGit(cwd, ["rev-parse", "--verify", "--quiet", `${ref}^{commit}`]);
    return true;
  } catch {
    return false;
  }
}

export async function allocateTaskId(input: {
  readonly cwd: string;
  readonly tasksDir: string;
  readonly remote: string;
  readonly integrationBranch: string;
}): Promise<TaskIdAllocation> {
  const { cwd, tasksDir, remote, integrationBranch } = input;
  const root = await currentWorktreeRoot(cwd);
  // Compare canonical paths (macOS /var → /private/var) to get the repo-relative dir.
  const tasksAbs = await realpath(tasksDir).catch(async () =>
    join(await realpath(dirname(tasksDir)), basename(tasksDir)),
  );
  const tasksRel = relative(root, tasksAbs).split("\\").join("/");
  if (tasksRel.startsWith("..") || tasksRel.length === 0) {
    throw new Error(`TASK directory ${tasksDir} is not inside the worktree ${root}.`);
  }

  // 1. local docs/tasks
  const localFiles = await maxInDir(tasksDir);

  // 2. integration tree
  let integrationTree = 0;
  const treeRef = (await refExists(cwd, `refs/remotes/${remote}/${integrationBranch}`))
    ? `${remote}/${integrationBranch}`
    : (await refExists(cwd, `refs/heads/${integrationBranch}`))
      ? integrationBranch
      : null;
  if (treeRef !== null) {
    const { stdout } = await runGit(cwd, ["ls-tree", "--name-only", `${treeRef}:${tasksRel}`]).catch(
      () => ({ stdout: "" }),
    );
    integrationTree = maxOf(stdout.split("\n").map(taskNumberFromFilename));
  }

  // 3a. local + remote-tracking task branches
  const { stdout: refs } = await runGit(cwd, [
    "for-each-ref",
    "--format=%(refname)",
    "refs/heads/task/",
    `refs/remotes/${remote}/task/`,
  ]);
  const branches = maxOf(refs.split("\n").map(taskNumberFromBranch));

  // 3b. branches on the remote itself (may be newer than remote-tracking refs)
  let remoteBranches = 0;
  if ((await gitRemoteUrl(cwd, remote)) !== null) {
    let lsRemote: string;
    try {
      ({ stdout: lsRemote } = await runGit(cwd, ["ls-remote", "--heads", remote, "task/*"]));
    } catch (e) {
      const msg = e instanceof Error ? e.message.split("\n")[0] : String(e);
      throw new TaskIdAllocationError(
        `Cannot list task branches on ${remote} (${msg}) — refusing to pick a TASK id that may collide. Check network / auth and rerun.`,
      );
    }
    remoteBranches = maxOf(
      lsRemote
        .split("\n")
        .map((l) => l.split("\t")[1] ?? "")
        .map(taskNumberFromBranch),
    );
  }

  // 4. every worktree's docs/tasks
  let worktrees = 0;
  for (const wt of await listWorktrees(cwd)) {
    if (wt.bare) continue;
    worktrees = Math.max(worktrees, await maxInDir(join(wt.path, tasksRel)));
  }

  const sources: TaskIdSources = {
    localFiles,
    integrationTree,
    branches,
    remoteBranches,
    worktrees,
  };
  const max = Math.max(...Object.values(sources));
  return { next: max + 1, max, sources };
}
