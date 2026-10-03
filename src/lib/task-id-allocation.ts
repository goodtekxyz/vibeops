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
 *  3. VibeOps task branches — local heads and `<remote>/task/*` (refreshed with
 *     `git fetch --prune <remote> +refs/heads/task/*:refs/remotes/<remote>/task/*`) —
 *     counted only when the branch name has the generated form AND the branch's
 *     tree contains that TASK file (so `task/2026-q4-plan` does not inflate ids);
 *  4. `docs/tasks` in every worktree from `git worktree list` (covers task branches
 *     whose TASK file is not committed yet).
 *
 * A configured remote whose task branches cannot be fetched is an error (fail
 * closed) — an id could otherwise collide with an unmerged branch.
 */

const TASK_FILE_RE = /^TASK-(\d+)(?:-|\.md$)/i;

/**
 * Generated task branch form: `task/<NNN>` or `task/<NNN>-<slug>`, where NNN is the
 * zero-padded TASK number (≥ 3 digits, `formatTaskId`) and slug is `slugify` output
 * (`[a-z0-9]+` joined by single hyphens) — i.e. `branchNameForTaskFile` of
 * `TASK-<NNN>-<slug>.md`.
 */
export const GENERATED_TASK_BRANCH_RE = /^task\/(\d{3,})(?:-([a-z0-9]+(?:-[a-z0-9]+)*))?$/;

export function taskNumberFromFilename(name: string): number | null {
  const m = TASK_FILE_RE.exec(name.trim());
  return m ? Number.parseInt(m[1]!, 10) : null;
}

/**
 * TASK number of a branch in the generated form (accepts `refs/heads/` and
 * `refs/remotes/<remote>/` prefixes), else null.
 */
export function taskNumberFromBranch(ref: string): number | null {
  const name = ref
    .trim()
    .replace(/^refs\/heads\//, "")
    .replace(/^refs\/remotes\/[^/]+\//, "");
  const m = GENERATED_TASK_BRANCH_RE.exec(name);
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

async function branchHasTaskFile(
  cwd: string,
  ref: string,
  tasksRel: string,
  n: number,
): Promise<boolean> {
  try {
    const { stdout } = await runGit(cwd, ["ls-tree", "--name-only", `${ref}:${tasksRel}`]);
    return stdout.split("\n").some((f) => taskNumberFromFilename(f) === n);
  } catch {
    return false; // no docs/tasks in that tree
  }
}

/**
 * Cross-machine guard for `task ship`: refuse to push `taskBranch` when the remote
 * already has a different generated task branch with the same TASK number (another
 * machine allocated the same id). Fails closed when the remote cannot be listed.
 */
export async function assertTaskIdFreeOnRemote(
  cwd: string,
  remote: string,
  taskBranch: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const n = taskNumberFromBranch(taskBranch);
  if (n === null) return { ok: true };
  if ((await gitRemoteUrl(cwd, remote)) === null) return { ok: true };
  let stdout: string;
  try {
    ({ stdout } = await runGit(cwd, ["ls-remote", "--heads", remote, "task/*"]));
  } catch (e) {
    const msg = e instanceof Error ? e.message.split("\n")[0] : String(e);
    return {
      ok: false,
      message: `Cannot list task branches on ${remote} (${msg}) — refusing to push without checking for a TASK id collision.`,
    };
  }
  const clashes = stdout
    .split("\n")
    .map((l) => (l.split("\t")[1] ?? "").replace(/^refs\/heads\//, ""))
    .filter((name) => name.length > 0 && name !== taskBranch && taskNumberFromBranch(name) === n);
  if (clashes.length > 0) {
    return {
      ok: false,
      message: `TASK id collision: ${remote} already has ${clashes.join(", ")} for TASK-${String(n).padStart(3, "0")}. Not pushing ${taskBranch}. Renumber this TASK (file + branch) and rerun.`,
    };
  }
  return { ok: true };
}

export async function allocateTaskId(input: {
  readonly cwd: string;
  readonly tasksDir: string;
  readonly remote: string;
  readonly integrationBranch: string;
  /** Fetch `<remote>` task branches first (default true; false for dry-run). */
  readonly fetchRemote?: boolean;
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

  // 3. VibeOps task branches (local + freshly fetched remote), with TASK-file evidence
  if (input.fetchRemote !== false && (await gitRemoteUrl(cwd, remote)) !== null) {
    try {
      await runGit(cwd, [
        "fetch",
        "--prune",
        remote,
        `+refs/heads/task/*:refs/remotes/${remote}/task/*`,
      ]);
    } catch (e) {
      const msg = e instanceof Error ? e.message.split("\n")[0] : String(e);
      throw new TaskIdAllocationError(
        `Cannot fetch task branches from ${remote} (${msg}) — refusing to pick a TASK id that may collide. Check network / auth and rerun.`,
      );
    }
  }
  const { stdout: refs } = await runGit(cwd, [
    "for-each-ref",
    "--format=%(refname)",
    "refs/heads/task/",
    `refs/remotes/${remote}/task/`,
  ]);
  let branches = 0;
  for (const ref of refs.split("\n").filter((r) => r.length > 0)) {
    const n = taskNumberFromBranch(ref);
    if (n === null || n <= branches) continue;
    if (await branchHasTaskFile(cwd, ref, tasksRel, n)) branches = n;
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
    worktrees,
  };
  const max = Math.max(...Object.values(sources));
  return { next: max + 1, max, sources };
}
