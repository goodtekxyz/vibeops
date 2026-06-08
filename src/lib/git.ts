import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { dim, log } from "./logger.js";

const exec = promisify(execFile);

/** Avoid `maxBuffer` errors on large `git commit` / `git add` output. */
const DEFAULT_GIT_MAX_BUFFER = 64 * 1024 * 1024;

export interface GitInfo {
  isRepo: boolean;
  branch: string | null;
  state: "none" | "normal" | "unborn" | "detached";
  hasCommits: boolean | null;
  dirty: boolean | null;
  error?: string;
}

export interface GitRunResult {
  stdout: string;
  stderr: string;
}

async function tryGit(cwd: string, args: string[]): Promise<{ stdout: string } | null> {
  try {
    const { stdout } = await exec("git", args, { cwd });
    return { stdout };
  } catch {
    return null;
  }
}

export interface RunGitOptions {
  readonly maxBuffer?: number;
}

export async function runGit(
  cwd: string,
  args: string[],
  options: RunGitOptions = {},
): Promise<GitRunResult> {
  const { stdout, stderr } = await exec("git", args, {
    cwd,
    maxBuffer: options.maxBuffer ?? DEFAULT_GIT_MAX_BUFFER,
  });
  return { stdout, stderr };
}

export async function isGitRepository(cwd: string): Promise<boolean> {
  return (await tryGit(cwd, ["rev-parse", "--is-inside-work-tree"])) !== null;
}

export async function hasAnyCommit(cwd: string): Promise<boolean> {
  return (await tryGit(cwd, ["rev-parse", "--verify", "HEAD"])) !== null;
}

export async function currentBranchOrUnborn(cwd: string): Promise<{
  branch: string | null;
  state: "normal" | "unborn" | "detached";
  hasCommits: boolean;
}> {
  const hasCommits = await hasAnyCommit(cwd);
  const symbolic = await tryGit(cwd, ["symbolic-ref", "--short", "HEAD"]);
  if (symbolic !== null) {
    const branch = symbolic.stdout.trim();
    return {
      branch: branch.length > 0 ? branch : null,
      state: hasCommits ? "normal" : "unborn",
      hasCommits,
    };
  }
  const detached = await tryGit(cwd, ["rev-parse", "--short", "HEAD"]);
  return {
    branch: detached !== null ? detached.stdout.trim() : null,
    state: "detached",
    hasCommits,
  };
}

export async function readGitInfo(cwd: string): Promise<GitInfo> {
  if (!(await isGitRepository(cwd))) {
    return { isRepo: false, branch: null, state: "none", hasCommits: null, dirty: null };
  }
  const branch = await currentBranchOrUnborn(cwd);
  const statusRes = await tryGit(cwd, ["status", "--porcelain"]);
  const dirty = statusRes ? statusRes.stdout.trim().length > 0 : null;
  return {
    isRepo: true,
    branch: branch.branch,
    state: branch.state,
    hasCommits: branch.hasCommits,
    dirty,
  };
}

export async function gitInit(cwd: string): Promise<void> {
  await runGit(cwd, ["init"]);
}

export async function gitSetDefaultBranch(cwd: string, branch: string): Promise<void> {
  if (await hasAnyCommit(cwd)) {
    await runGit(cwd, ["branch", "-M", branch]);
    return;
  }
  await runGit(cwd, ["symbolic-ref", "HEAD", `refs/heads/${branch}`]);
}

export async function gitAddAll(cwd: string): Promise<void> {
  await runGit(cwd, ["add", "."]);
}

export async function gitCommit(cwd: string, message: string): Promise<void> {
  await runGit(cwd, ["commit", "-m", message]);
}

export async function gitHeadCommit(cwd: string, short = true): Promise<string | null> {
  const res = await tryGit(cwd, short ? ["rev-parse", "--short", "HEAD"] : ["rev-parse", "HEAD"]);
  return res ? res.stdout.trim() : null;
}

export async function gitBranchExists(cwd: string, name: string): Promise<boolean> {
  const res = await tryGit(cwd, ["show-ref", "--verify", "--quiet", `refs/heads/${name}`]);
  return res !== null;
}

export async function gitRemoteBranchExists(
  cwd: string,
  remote: string,
  branch: string,
): Promise<boolean> {
  const res = await tryGit(cwd, [
    "show-ref",
    "--verify",
    "--quiet",
    `refs/remotes/${remote}/${branch}`,
  ]);
  return res !== null;
}

/**
 * Checkout local `branch`, creating it from `remote/branch` when only the remote ref exists.
 */
export async function gitSwitchToBranch(
  cwd: string,
  branch: string,
  remote = "origin",
): Promise<boolean> {
  if (await gitBranchExists(cwd, branch)) {
    await gitCheckout(cwd, branch);
    return true;
  }

  if ((await gitRemoteUrl(cwd, remote)) === null) return false;

  try {
    await gitFetch(cwd, remote, branch);
  } catch {
    // branch may not exist on remote yet
  }

  if (!(await gitRemoteBranchExists(cwd, remote, branch))) return false;

  await gitCheckoutNewBranch(cwd, branch, `${remote}/${branch}`);
  return true;
}

export async function gitCreateBranch(
  cwd: string,
  name: string,
  startPoint?: string,
): Promise<void> {
  const args = ["branch", name];
  if (typeof startPoint === "string" && startPoint.length > 0) args.push(startPoint);
  await runGit(cwd, args);
}

/**
 * When only governance / VibeOps paths are dirty, stash them so `git switch` can proceed.
 * Callers that switch branches should restore with {@link restoreGovernanceStashAfterSwitch}.
 */
export async function stashGovernanceIfBlocking(cwd: string): Promise<boolean> {
  const git = await readGitInfo(cwd);
  if (git.dirty !== true) return false;
  const gov = await gitGovernanceOnlyDirty(cwd);
  if (!gov.onlyGovernance || gov.allPaths.length === 0) return false;

  const entries = parsePorcelain(await gitStatusPorcelain(cwd));
  const tracked: string[] = [];
  const untracked: string[] = [];
  for (const e of entries) {
    if (!isGovernanceDocumentationPath(e.path)) continue;
    if (e.untracked) untracked.push(e.path);
    else tracked.push(e.path);
  }

  let didStash = false;
  if (tracked.length > 0) {
    await runGit(cwd, [
      "stash",
      "push",
      "-m",
      "vibeops: governance before branch switch",
      "--",
      ...tracked,
    ]);
    didStash = true;
  }
  if (untracked.length > 0) {
    try {
      await runGit(cwd, [
        "stash",
        "push",
        "-u",
        "-m",
        "vibeops: governance untracked before branch switch",
        "--",
        ...untracked,
      ]);
      didStash = true;
    } catch {
      // Untracked generated files (e.g. cursor-implement-*.md) may not stash; switch can still proceed.
    }
  }
  return didStash;
}

/** Re-apply governance paths stashed for a branch switch (e.g. new `docs/tasks/*.md`). */
export async function restoreGovernanceStashAfterSwitch(
  cwd: string,
  didStash: boolean,
): Promise<void> {
  if (!didStash) return;
  try {
    await runGit(cwd, ["stash", "pop"]);
    log.info(dim("Restored stashed governance paths on the task branch."));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    log.warn(
      `Could not restore stashed governance files (${msg}). Run ${dim("git stash pop")} manually.`,
    );
  }
}

export async function gitCheckout(cwd: string, ref: string): Promise<void> {
  const stashed = await stashGovernanceIfBlocking(cwd);
  if (stashed) {
    log.info(dim("Stashed governance-only changes (.vibeops/, docs/) before branch switch."));
  }
  await runGit(cwd, ["switch", ref]);
  await restoreGovernanceStashAfterSwitch(cwd, stashed);
}

export async function gitCheckoutNewBranch(
  cwd: string,
  name: string,
  startPoint?: string,
): Promise<void> {
  const stashed = await stashGovernanceIfBlocking(cwd);
  if (stashed) {
    log.info(dim("Stashed governance-only changes (.vibeops/, docs/) before branch switch."));
  }
  const args = ["switch", "-c", name];
  if (typeof startPoint === "string" && startPoint.length > 0) args.push(startPoint);
  await runGit(cwd, args);
  await restoreGovernanceStashAfterSwitch(cwd, stashed);
}

export async function gitDeleteBranch(
  cwd: string,
  name: string,
  opts: { force?: boolean } = {},
): Promise<void> {
  const flag = opts.force === true ? "-D" : "-d";
  await runGit(cwd, ["branch", flag, name]);
}

export async function gitResetHard(cwd: string, ref: string): Promise<void> {
  await runGit(cwd, ["reset", "--hard", ref]);
}

export async function gitDiffNameOnly(cwd: string, range?: string): Promise<string[]> {
  const args = ["diff", "--name-only"];
  if (typeof range === "string" && range.length > 0) args.push(range);
  const res = await tryGit(cwd, args);
  if (!res) return [];
  return res.stdout
    .split("\n")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * Raw lines from `git status --porcelain` (read-only).
 * Returns an empty array if the repo is unreadable.
 */
export async function gitStatusPorcelain(cwd: string): Promise<string[]> {
  const res = await tryGit(cwd, ["status", "--porcelain"]);
  if (!res) return [];
  return res.stdout.split("\n").filter((line) => line.length > 0);
}

interface PorcelainEntry {
  readonly code: string;
  readonly staged: boolean;
  readonly unstaged: boolean;
  readonly untracked: boolean;
  readonly path: string;
  readonly origPath?: string;
}

function parsePorcelainLine(line: string): PorcelainEntry | null {
  if (line.length < 3) return null;
  const code = line.slice(0, 2);
  const rest = line.slice(3);
  if (code === "??") {
    return { code, staged: false, unstaged: false, untracked: true, path: rest };
  }
  if (code === "!!") {
    return null;
  }
  const x = code.charAt(0);
  const y = code.charAt(1);
  // Rename / copy: `R  old -> new` or `C  old -> new`
  if (x === "R" || x === "C") {
    const arrow = rest.indexOf(" -> ");
    if (arrow >= 0) {
      const origPath = rest.slice(0, arrow);
      const path = rest.slice(arrow + 4);
      return {
        code,
        staged: true,
        unstaged: y !== " " && y !== "?",
        untracked: false,
        path,
        origPath,
      };
    }
  }
  return {
    code,
    staged: x !== " " && x !== "?",
    unstaged: y !== " " && y !== "?",
    untracked: false,
    path: rest,
  };
}

function parsePorcelain(lines: string[]): PorcelainEntry[] {
  const out: PorcelainEntry[] = [];
  for (const line of lines) {
    const entry = parsePorcelainLine(line);
    if (entry !== null) out.push(entry);
  }
  return out;
}

/** Paths under these prefixes may stay uncommitted across `start` / `done` / doc updates. */
const GOVERNANCE_DOC_REL_PREFIXES = [
  "docs/tasks/",
  "docs/project/",
  "docs/logs/",
  ".vibeops/",
] as const;

function normalizeRepoRelPath(p: string): string {
  return p.replace(/\\/g, "/").replace(/^\/+/, "");
}

export function isGovernanceDocumentationPath(repoRelativePath: string): boolean {
  const n = normalizeRepoRelPath(repoRelativePath);
  for (const prefix of GOVERNANCE_DOC_REL_PREFIXES) {
    if (n.startsWith(prefix)) return true;
  }
  return false;
}

/** Build artifacts / deps — never auto-committed by `vibeops done` cleanup. */
const AUTO_COMMIT_EXCLUDED_PREFIXES = [
  "node_modules/",
  ".next/",
  ".pnpm-store/",
  "dist/",
  "build/",
  ".turbo/",
  "coverage/",
  ".vercel/",
  ".output/",
  ".cache/",
] as const;

const AUTO_COMMIT_EXCLUDED_EXACT = new Set([
  "node_modules",
  ".next",
  "dist",
  "build",
]);

export function isAutoCommitExcludedPath(repoRelativePath: string): boolean {
  const n = normalizeRepoRelPath(repoRelativePath);
  if (AUTO_COMMIT_EXCLUDED_EXACT.has(n)) return true;
  for (const prefix of AUTO_COMMIT_EXCLUDED_PREFIXES) {
    if (n.startsWith(prefix)) return true;
  }
  return false;
}

export async function gitMergeInProgress(cwd: string): Promise<boolean> {
  return (await tryGit(cwd, ["rev-parse", "-q", "--verify", "MERGE_HEAD"])) !== null;
}

/** Conflict paths from an in-progress merge (`git diff --diff-filter=U`). */
export async function listUnmergedRelPaths(cwd: string): Promise<string[]> {
  const res = await tryGit(cwd, ["diff", "--name-only", "--diff-filter=U"]);
  if (res === null) return [];
  return res.stdout
    .split("\n")
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

/**
 * During a merge, take the incoming branch version for governance / VibeOps paths
 * (typical after `vibeops done` merge conflicts on `.vibeops/generated/*`).
 */
export async function tryResolveGovernanceUnmerged(cwd: string): Promise<string[]> {
  const unmerged = await listUnmergedRelPaths(cwd);
  const resolved: string[] = [];
  for (const p of unmerged) {
    if (!isGovernanceDocumentationPath(p)) continue;
    try {
      await runGit(cwd, ["checkout", "--theirs", "--", p]);
      await runGit(cwd, ["add", "--", p]);
      resolved.push(p);
    } catch {
      // skip paths that cannot be auto-resolved
    }
  }
  return resolved;
}

export async function listWorkingTreeRelPaths(cwd: string): Promise<string[]> {
  const entries = parsePorcelain(await gitStatusPorcelain(cwd));
  const all = new Set<string>();
  for (const e of entries) {
    all.add(e.path);
    if (typeof e.origPath === "string" && e.origPath.length > 0) {
      all.add(e.origPath);
    }
  }
  return [...all];
}

export function partitionPathsForAutoCommit(
  paths: readonly string[],
  opts: { readonly unmerged?: readonly string[] } = {},
): {
  readonly committable: readonly string[];
  readonly excluded: readonly string[];
  readonly unmerged: readonly string[];
} {
  const unmergedSet = new Set(opts.unmerged ?? []);
  const committable: string[] = [];
  const excluded: string[] = [];
  const unmerged: string[] = [];
  for (const p of paths) {
    if (unmergedSet.has(p)) {
      unmerged.push(p);
      continue;
    }
    if (isAutoCommitExcludedPath(p)) excluded.push(p);
    else committable.push(p);
  }
  return { committable, excluded, unmerged };
}

export async function gitAddPaths(cwd: string, paths: readonly string[]): Promise<void> {
  if (paths.length === 0) return;
  const chunkSize = 80;
  for (let i = 0; i < paths.length; i += chunkSize) {
    const slice = paths.slice(i, i + chunkSize);
    await runGit(cwd, ["add", "--", ...slice]);
  }
}

/**
 * When the index/worktree is dirty, classify whether every changed path is
 * limited to governance docs and VibeOps metadata (`.vibeops/**`, docs/tasks, etc.).
 * Used when switching task branches so governance paths are not left off-disk after switch.
 * block the next TASK unless application code is also dirty.
 */
export async function gitGovernanceOnlyDirty(cwd: string): Promise<{
  readonly allPaths: readonly string[];
  readonly nonGovernancePaths: readonly string[];
  readonly onlyGovernance: boolean;
}> {
  const lines = await gitStatusPorcelain(cwd);
  const entries = parsePorcelain(lines);
  const all = new Set<string>();
  for (const e of entries) {
    all.add(e.path);
    if (typeof e.origPath === "string" && e.origPath.length > 0) {
      all.add(e.origPath);
    }
  }
  const allPaths = [...all];
  const nonGovernancePaths = allPaths.filter((p) => !isGovernanceDocumentationPath(p));
  return {
    allPaths,
    nonGovernancePaths,
    onlyGovernance: allPaths.length > 0 && nonGovernancePaths.length === 0,
  };
}

export async function gitWorkingTreeChangedFiles(cwd: string): Promise<string[]> {
  const entries = parsePorcelain(await gitStatusPorcelain(cwd));
  return entries.filter((e) => e.unstaged).map((e) => e.path);
}

export async function gitStagedChangedFiles(cwd: string): Promise<string[]> {
  const entries = parsePorcelain(await gitStatusPorcelain(cwd));
  return entries.filter((e) => e.staged).map((e) => e.path);
}

export async function gitUntrackedFiles(cwd: string): Promise<string[]> {
  const entries = parsePorcelain(await gitStatusPorcelain(cwd));
  return entries.filter((e) => e.untracked).map((e) => e.path);
}

export async function gitCommittedChangedFilesSince(
  baseCommit: string,
  cwd: string,
): Promise<string[]> {
  if (baseCommit.length === 0) return [];
  return gitDiffNameOnly(cwd, `${baseCommit}..HEAD`);
}

export interface ChangedFilesSummary {
  /** files dirty in the working tree (modified, deleted, etc. — unstaged) */
  readonly working: string[];
  /** files staged in the index */
  readonly staged: string[];
  /** untracked files (`??`) */
  readonly untracked: string[];
  /** files changed in committed history between baseCommit and HEAD */
  readonly committed: string[];
  /**
   * union of (working + staged + untracked) — all uncommitted changes.
   * Set-dedup applied.
   */
  readonly workingTree: string[];
  /**
   * union of all categories. Set-dedup applied. This is the value used
   * when matching `Expected Files to Change`.
   */
  readonly all: string[];
}

export async function gitAllChangedFilesSinceTaskStart(
  baseCommit: string,
  cwd: string,
): Promise<ChangedFilesSummary> {
  const entries = parsePorcelain(await gitStatusPorcelain(cwd));
  const working = entries.filter((e) => e.unstaged).map((e) => e.path);
  const staged = entries.filter((e) => e.staged).map((e) => e.path);
  const untracked = entries.filter((e) => e.untracked).map((e) => e.path);
  const committed = await gitCommittedChangedFilesSince(baseCommit, cwd);
  const workingTree = Array.from(new Set([...working, ...staged, ...untracked]));
  const all = Array.from(new Set([...workingTree, ...committed]));
  return { working, staged, untracked, committed, workingTree, all };
}

export interface OnelineEntry {
  sha: string;
  message: string;
}

export async function gitLogOneline(cwd: string, range?: string): Promise<OnelineEntry[]> {
  const args = ["log", "--oneline", "--no-decorate"];
  if (typeof range === "string" && range.length > 0) args.push(range);
  const res = await tryGit(cwd, args);
  if (!res) return [];
  const out: OnelineEntry[] = [];
  for (const line of res.stdout.split("\n")) {
    const m = /^([0-9a-f]+)\s+(.+)$/i.exec(line.trim());
    if (m) out.push({ sha: m[1]!, message: m[2]! });
  }
  return out;
}

export async function gitCommitsAhead(
  cwd: string,
  baseRef: string,
  headRef = "HEAD",
): Promise<number> {
  const res = await tryGit(cwd, ["rev-list", "--count", `${baseRef}..${headRef}`]);
  if (!res) return 0;
  const n = Number.parseInt(res.stdout.trim(), 10);
  return Number.isFinite(n) ? n : 0;
}

export async function detectDefaultBranch(cwd: string): Promise<string | null> {
  for (const cand of ["main", "master"]) {
    if (await gitBranchExists(cwd, cand)) return cand;
  }
  return null;
}

/**
 * Read the `origin` remote URL (e.g. `git@github.com:org/repo.git`).
 * Returns `null` if the repo has no `origin` remote or git isn't available.
 * Read-only — never adds, sets, or fetches.
 */
export async function gitRemoteUrl(cwd: string, name = "origin"): Promise<string | null> {
  const res = await tryGit(cwd, ["remote", "get-url", name]);
  if (!res) return null;
  const url = res.stdout.trim();
  return url.length > 0 ? url : null;
}

export async function gitFetch(cwd: string, remote: string, ref?: string): Promise<void> {
  const args = ["fetch", remote];
  if (typeof ref === "string" && ref.length > 0) args.push(ref);
  await runGit(cwd, args);
}

/** Fetch all refs from `remote` and prune deleted remote-tracking branches. */
export async function gitFetchRemote(cwd: string, remote: string): Promise<void> {
  await runGit(cwd, ["fetch", remote, "--prune"]);
}

export async function gitDeleteRemoteBranch(
  cwd: string,
  remote: string,
  branch: string,
): Promise<void> {
  await runGit(cwd, ["push", remote, "--delete", branch]);
}

export async function gitPullFastForwardOnly(
  cwd: string,
  remote: string,
  branch: string,
): Promise<void> {
  await runGit(cwd, ["pull", "--ff-only", remote, branch]);
}

/** Merge `remote/branch` into the current HEAD (follow-up integration). */
export async function gitMergeRemoteBranch(
  cwd: string,
  remote: string,
  branch: string,
): Promise<void> {
  await runGit(cwd, ["merge", `${remote}/${branch}`, "--no-edit"]);
}

export async function gitPush(
  cwd: string,
  remote: string,
  branch: string,
  setUpstream = true,
): Promise<void> {
  const args = setUpstream ? ["push", "-u", remote, branch] : ["push", remote, branch];
  await runGit(cwd, args);
}
