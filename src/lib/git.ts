import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);

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

export async function runGit(cwd: string, args: string[]): Promise<GitRunResult> {
  const { stdout, stderr } = await exec("git", args, { cwd });
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

export async function gitCreateBranch(
  cwd: string,
  name: string,
  startPoint?: string,
): Promise<void> {
  const args = ["branch", name];
  if (typeof startPoint === "string" && startPoint.length > 0) args.push(startPoint);
  await runGit(cwd, args);
}

export async function gitCheckout(cwd: string, ref: string): Promise<void> {
  await runGit(cwd, ["checkout", ref]);
}

export async function gitCheckoutNewBranch(
  cwd: string,
  name: string,
  startPoint?: string,
): Promise<void> {
  const args = ["checkout", "-b", name];
  if (typeof startPoint === "string" && startPoint.length > 0) args.push(startPoint);
  await runGit(cwd, args);
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
