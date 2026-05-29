import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { askInput } from "./inquirer-helpers.js";
import { detectGitHost } from "./git-host.js";
import { gitRemoteUrl, runGit } from "./git.js";
import { dim, log } from "./logger.js";
import type { GitHost } from "../types/config.js";

const execFileAsync = promisify(execFile);

export interface EnsureRemoteOptions {
  readonly cwd: string;
  readonly remoteName?: string;
  readonly dryRun?: boolean;
  readonly nonInteractive?: boolean;
  readonly allowMissing?: boolean;
  /** GitLab `glab repo create --defaultBranch` (defaults to main). */
  readonly defaultBranch?: string;
}

export interface EnsureRemoteResult {
  readonly remote: string;
  readonly url: string;
  readonly host: GitHost;
}

async function probeGh(): Promise<boolean> {
  try {
    await execFileAsync("gh", ["auth", "status"], { maxBuffer: 1024 * 1024 });
    return true;
  } catch {
    return false;
  }
}

async function probeGlab(): Promise<boolean> {
  try {
    await execFileAsync("glab", ["auth", "status"], { maxBuffer: 1024 * 1024 });
    return true;
  } catch {
    return false;
  }
}

async function createGithubRepo(cwd: string, name: string): Promise<string> {
  const { stdout } = await execFileAsync(
    "gh",
    // gh requires an explicit visibility flag when non-interactive.
    ["repo", "create", name, "--source=.", "--remote=origin", "--push", "--private"],
    { cwd, maxBuffer: 8 * 1024 * 1024 },
  );
  const match = stdout.match(/https:\/\/github\.com\/[^\s]+/);
  if (match) return match[0]!.replace(/\.git$/, "") + ".git";
  const url = await gitRemoteUrl(cwd, "origin");
  if (url) return url;
  throw new Error("gh repo create finished but origin URL could not be read.");
}

async function createGitlabRepo(
  cwd: string,
  name: string,
  defaultBranch: string,
): Promise<string> {
  await execFileAsync(
    "glab",
    ["repo", "create", name, "--remote=origin", "--defaultBranch", defaultBranch],
    { cwd, maxBuffer: 8 * 1024 * 1024 },
  );
  const url = await gitRemoteUrl(cwd, "origin");
  if (url) return url;
  throw new Error("glab repo create finished but origin URL could not be read.");
}

/**
 * Ensures `origin` (or named remote) exists. Interactive path can create via gh/glab or manual URL.
 */
export async function ensureOriginRemote(
  opts: EnsureRemoteOptions,
): Promise<EnsureRemoteResult | null> {
  const remote = opts.remoteName ?? "origin";
  const existing = await gitRemoteUrl(opts.cwd, remote);
  if (existing) {
    const host = detectGitHost(existing);
    if (!host) {
      log.warn(`Remote ${remote} URL is not GitHub or GitLab: ${existing}`);
      if (opts.allowMissing) return null;
      throw new Error("Only GitHub and GitLab remotes are supported.");
    }
    return { remote, url: existing, host };
  }

  if (opts.dryRun) {
    log.info(dim(`would configure git remote ${remote}`));
    return { remote, url: "(dry-run)", host: "github" };
  }

  if (opts.allowMissing) {
    return null;
  }

  if (opts.nonInteractive) {
    throw new Error(
      `Git remote "${remote}" is not configured. Add it with: git remote add ${remote} <url>`,
    );
  }

  log.blank();
  log.info("Remote origin is required for push and merge requests.");

  const ghOk = await probeGh();
  const glabOk = await probeGlab();

  if (ghOk) {
    const name = await askInput({
      message: "GitHub repository name (owner/repo or name for gh to create)",
      nonInteractive: false,
      required: true,
    });
    log.info(dim("Creating GitHub repository via gh…"));
    const url = await createGithubRepo(opts.cwd, name);
    return { remote, url, host: "github" };
  }

  if (glabOk) {
    const name = await askInput({
      message: "GitLab project path (group/project)",
      nonInteractive: false,
      required: true,
    });
    log.info(dim("Creating GitLab project via glab…"));
    const defaultBranch =
      typeof opts.defaultBranch === "string" && opts.defaultBranch.length > 0
        ? opts.defaultBranch
        : "main";
    const url = await createGitlabRepo(opts.cwd, name, defaultBranch);
    return { remote, url, host: "gitlab" };
  }

  const url = await askInput({
    message: `Remote URL for ${remote} (https://github.com/… or https://gitlab.com/…)`,
    nonInteractive: false,
    required: true,
  });
  await runGit(opts.cwd, ["remote", "add", remote, url.trim()]);
  const host = detectGitHost(url);
  if (!host) throw new Error("Only GitHub and GitLab HTTPS/SSH URLs are supported.");
  return { remote, url: url.trim(), host };
}
