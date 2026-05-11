import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);

export interface GitInfo {
  isRepo: boolean;
  branch: string | null;
  dirty: boolean | null;
  error?: string;
}

async function tryGit(cwd: string, args: string[]): Promise<{ stdout: string } | null> {
  try {
    const { stdout } = await exec("git", args, { cwd });
    return { stdout };
  } catch {
    return null;
  }
}

export async function readGitInfo(cwd: string): Promise<GitInfo> {
  const repo = await tryGit(cwd, ["rev-parse", "--is-inside-work-tree"]);
  if (repo === null) {
    return { isRepo: false, branch: null, dirty: null };
  }
  const branchRes = await tryGit(cwd, ["rev-parse", "--abbrev-ref", "HEAD"]);
  const statusRes = await tryGit(cwd, ["status", "--porcelain"]);
  const branch = branchRes ? branchRes.stdout.trim() : null;
  const dirty = statusRes ? statusRes.stdout.trim().length > 0 : null;
  return { isRepo: true, branch, dirty };
}
