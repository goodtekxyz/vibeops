import { realpath } from "node:fs/promises";
import { resolve } from "node:path";

import {
  gitBranchExists,
  gitRemoteBranchExists,
  gitRemoteUrl,
  gitRevParse,
  restoreGovernanceStashAfterSwitch,
  runGit,
  stashGovernanceIfBlocking,
} from "./git.js";
import { dim, log } from "./logger.js";

/**
 * Worktree-safe helpers (D-006). A repository may have several linked worktrees;
 * git refuses to check out a branch that is already checked out in another one
 * ("fatal: 'develop' is already used by worktree at …"). VibeOps therefore never
 * requires checking out the integration branch: task branches start from
 * `<remote>/<integration>`, and the local integration ref is fast-forwarded only
 * where that is safe.
 */

export interface WorktreeEntry {
  /** Absolute worktree path as reported by git. */
  readonly path: string;
  /** Checked-out commit, or null (bare / unborn). */
  readonly head: string | null;
  /** Short branch name (`develop`), or null when detached / bare. */
  readonly branch: string | null;
  readonly bare: boolean;
  readonly detached: boolean;
}

/** Parse `git worktree list --porcelain` output. */
export function parseWorktreePorcelain(stdout: string): WorktreeEntry[] {
  const out: WorktreeEntry[] = [];
  for (const block of stdout.split(/\n\s*\n/)) {
    const lines = block.split("\n").filter((l) => l.length > 0);
    if (lines.length === 0) continue;
    let path: string | null = null;
    let head: string | null = null;
    let branch: string | null = null;
    let bare = false;
    let detached = false;
    for (const line of lines) {
      if (line.startsWith("worktree ")) path = line.slice("worktree ".length);
      else if (line.startsWith("HEAD ")) head = line.slice("HEAD ".length);
      else if (line.startsWith("branch ")) {
        const ref = line.slice("branch ".length);
        branch = ref.startsWith("refs/heads/") ? ref.slice("refs/heads/".length) : ref;
      } else if (line === "bare") bare = true;
      else if (line === "detached") detached = true;
    }
    if (path !== null) out.push({ path, head, branch, bare, detached });
  }
  return out;
}

export async function listWorktrees(cwd: string): Promise<WorktreeEntry[]> {
  const { stdout } = await runGit(cwd, ["worktree", "list", "--porcelain"]);
  return parseWorktreePorcelain(stdout);
}

async function canonical(p: string): Promise<string> {
  try {
    return await realpath(p);
  } catch {
    return resolve(p);
  }
}

/** Absolute top-level path of the worktree containing `cwd`. */
export async function currentWorktreeRoot(cwd: string): Promise<string> {
  const { stdout } = await runGit(cwd, ["rev-parse", "--show-toplevel"]);
  return canonical(stdout.trim());
}

/**
 * Path of another worktree (not the one containing `cwd`) that has `branch`
 * checked out, or null.
 */
export async function branchCheckedOutElsewhere(
  cwd: string,
  branch: string,
): Promise<string | null> {
  const here = await currentWorktreeRoot(cwd);
  for (const wt of await listWorktrees(cwd)) {
    if (wt.branch !== branch) continue;
    if ((await canonical(wt.path)) === here) continue;
    return wt.path;
  }
  return null;
}

/** Branch checked out in the worktree containing `cwd` (null when detached). */
async function currentBranch(cwd: string): Promise<string | null> {
  try {
    const { stdout } = await runGit(cwd, ["symbolic-ref", "--quiet", "--short", "HEAD"]);
    const b = stdout.trim();
    return b.length > 0 ? b : null;
  } catch {
    return null;
  }
}

/**
 * Ref new task branches start from: `<remote>/<integration>` when the
 * remote-tracking ref exists, else the local integration branch (no remote yet).
 * Null when neither exists.
 */
export async function resolveIntegrationBaseRef(
  cwd: string,
  remote: string,
  integrationBranch: string,
): Promise<string | null> {
  if (
    (await gitRemoteUrl(cwd, remote)) !== null &&
    (await gitRemoteBranchExists(cwd, remote, integrationBranch))
  ) {
    return `${remote}/${integrationBranch}`;
  }
  if (await gitBranchExists(cwd, integrationBranch)) return integrationBranch;
  return null;
}

export type LocalIntegrationUpdate =
  | { readonly kind: "up_to_date" }
  | { readonly kind: "fast_forwarded"; readonly where: "here" | "ref" }
  | { readonly kind: "owned_elsewhere"; readonly worktree: string }
  | { readonly kind: "no_local_branch" }
  | { readonly kind: "no_remote_branch" }
  | { readonly kind: "not_fast_forward" };

/**
 * Fast-forward the local integration branch to `<remote>/<integration>` without
 * ever forcing and without touching another worktree:
 * - checked out in this worktree → `git merge --ff-only <remote>/<integration>`;
 * - otherwise → `git fetch . refs/remotes/<remote>/<integration>:refs/heads/<integration>`. git itself
 *   refuses a non-fast-forward update and refuses to update a branch checked out
 *   in any worktree; those refusals are reported (`not_fast_forward` /
 *   `owned_elsewhere`), not treated as failures. No check-then-update race.
 * A missing local branch is not created.
 */
export async function fastForwardLocalIntegration(
  cwd: string,
  remote: string,
  integrationBranch: string,
): Promise<LocalIntegrationUpdate> {
  const remoteRef = `${remote}/${integrationBranch}`;
  if (!(await gitRemoteBranchExists(cwd, remote, integrationBranch))) {
    return { kind: "no_remote_branch" };
  }
  if (!(await gitBranchExists(cwd, integrationBranch))) return { kind: "no_local_branch" };

  if ((await currentBranch(cwd)) === integrationBranch) {
    const before = await gitRevParse(cwd, `refs/heads/${integrationBranch}`);
    const remoteSha = await gitRevParse(cwd, `refs/remotes/${remoteRef}`);
    if (before === remoteSha) return { kind: "up_to_date" };
    const stashed = await stashGovernanceIfBlocking(cwd);
    try {
      await runGit(cwd, ["merge", "--ff-only", remoteRef]);
    } catch (e) {
      if (/not possible to fast-forward|diverg|non-fast-forward/i.test(errorText(e))) {
        return { kind: "not_fast_forward" };
      }
      throw e;
    } finally {
      await restoreGovernanceStashAfterSwitch(cwd, stashed);
    }
    return { kind: "fast_forwarded", where: "here" };
  }

  const before = await gitRevParse(cwd, `refs/heads/${integrationBranch}`);
  try {
    // Fetch from this repository (`.`) into the local branch: same git safety as
    // `git fetch <remote> <b>:<b>` (refuses non-fast-forward, refuses a branch
    // checked out in any worktree) using the remote-tracking ref the caller just
    // fetched — no second network round-trip.
    await runGit(cwd, [
      "fetch",
      ".",
      `refs/remotes/${remoteRef}:refs/heads/${integrationBranch}`,
    ]);
  } catch (e) {
    const text = errorText(e);
    if (/refusing to fetch into branch|checked out at/i.test(text)) {
      const owner = await branchCheckedOutElsewhere(cwd, integrationBranch);
      return { kind: "owned_elsewhere", worktree: owner ?? "(another worktree)" };
    }
    if (/non-fast-forward|rejected/i.test(text)) return { kind: "not_fast_forward" };
    throw e;
  }
  const after = await gitRevParse(cwd, `refs/heads/${integrationBranch}`);
  return after === before ? { kind: "up_to_date" } : { kind: "fast_forwarded", where: "ref" };
}

function errorText(e: unknown): string {
  if (e && typeof e === "object") {
    const o = e as { stderr?: unknown; message?: unknown };
    return `${typeof o.stderr === "string" ? o.stderr : ""}\n${typeof o.message === "string" ? o.message : ""}`;
  }
  return String(e);
}

/** One-line log for {@link fastForwardLocalIntegration} results. */
export function logLocalIntegrationUpdate(
  r: LocalIntegrationUpdate,
  remote: string,
  integrationBranch: string,
): void {
  switch (r.kind) {
    case "fast_forwarded":
      log.ok(`Fast-forwarded local ${integrationBranch} to ${remote}/${integrationBranch}`);
      return;
    case "owned_elsewhere":
      log.info(
        dim(
          `Local ${integrationBranch} is checked out in worktree ${r.worktree} — left unchanged (update it there).`,
        ),
      );
      return;
    case "not_fast_forward":
      log.warn(
        `Local ${integrationBranch} has commits not on ${remote}/${integrationBranch} — left unchanged (never forced).`,
      );
      return;
    default:
      return;
  }
}

export type LeaveTaskBranchResult =
  | { readonly ok: true; readonly on: "integration" | "detached"; readonly ref: string }
  | { readonly ok: false; readonly message: string };

/**
 * Move HEAD off the task branch so it can be deleted. Switches to the integration
 * branch when no other worktree has it checked out; otherwise detaches at
 * `<remote>/<integration>` (or the local integration ref without a remote).
 */
export async function leaveTaskBranch(
  cwd: string,
  remote: string,
  integrationBranch: string,
): Promise<LeaveTaskBranchResult> {
  const owner = await branchCheckedOutElsewhere(cwd, integrationBranch);
  const base = await resolveIntegrationBaseRef(cwd, remote, integrationBranch);
  if (base === null) {
    return {
      ok: false,
      message: `Integration branch "${integrationBranch}" not found locally or on ${remote}.`,
    };
  }

  const stashed = await stashGovernanceIfBlocking(cwd);
  try {
    if (owner === null) {
      if (await gitBranchExists(cwd, integrationBranch)) {
        await runGit(cwd, ["switch", integrationBranch]);
      } else {
        await runGit(cwd, ["switch", "-c", integrationBranch, "--track", base]);
      }
      return { ok: true, on: "integration", ref: integrationBranch };
    }
    await runGit(cwd, ["switch", "--detach", base]);
    log.info(
      dim(
        `${integrationBranch} is checked out in worktree ${owner} — detached this worktree at ${base}.`,
      ),
    );
    return { ok: true, on: "detached", ref: base };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, message: `Could not leave the task branch: ${msg}` };
  } finally {
    await restoreGovernanceStashAfterSwitch(cwd, stashed);
  }
}
