import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";

import type { GitHost } from "../types/config.js";

const execFileAsync = promisify(execFile);

/** Run a CLI with inherited stdio (e.g. `gh auth login`). */
export function runInteractiveCli(bin: string, args: readonly string[]): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, [...args], { stdio: "inherit" });
    child.on("error", reject);
    child.on("close", (code) => resolve(code ?? 1));
  });
}

export type HostCliTool = "gh" | "glab";

export type HostCliAuthStatus = "ok" | "missing" | "unauthenticated";

export function hostCliTool(host: GitHost): HostCliTool {
  return host === "gitlab" ? "glab" : "gh";
}

export async function commandExists(bin: string): Promise<boolean> {
  try {
    await execFileAsync(bin, ["--version"], { maxBuffer: 1024 });
    return true;
  } catch {
    return false;
  }
}

export async function probeGhAuth(): Promise<boolean> {
  try {
    await execFileAsync("gh", ["auth", "status"], { maxBuffer: 1024 * 1024 });
    return true;
  } catch {
    return false;
  }
}

export async function probeGlabAuth(): Promise<boolean> {
  try {
    await execFileAsync("glab", ["auth", "status"], { maxBuffer: 1024 * 1024 });
    return true;
  } catch {
    return false;
  }
}

export async function probeHostCliAuth(host: GitHost): Promise<HostCliAuthStatus> {
  const tool = hostCliTool(host);
  if (!(await commandExists(tool))) return "missing";
  const ok = host === "gitlab" ? await probeGlabAuth() : await probeGhAuth();
  return ok ? "ok" : "unauthenticated";
}

/** Install / login lines shared by init and ship/merge. */
export function formatHostCliHint(host: GitHost): readonly string[] {
  if (host === "gitlab") {
    return [
      `Install glab: https://gitlab.com/gitlab-org/cli#installation`,
      `  brew install glab`,
      `Then: glab auth login`,
    ];
  }
  return [
    `Install gh: https://cli.github.com/`,
    `  brew install gh`,
    `Then: gh auth login`,
  ];
}

export function formatHostCliMissingMessage(host: GitHost, purpose: string): string {
  const tool = hostCliTool(host);
  return `${tool} CLI is required to ${purpose}.`;
}

export async function probeBrew(): Promise<boolean> {
  return commandExists("brew");
}

export async function brewInstall(pkg: HostCliTool): Promise<void> {
  await execFileAsync("brew", ["install", pkg], {
    maxBuffer: 16 * 1024 * 1024,
  });
}

/** Parse `owner/repo`, HTTPS, or SSH GitHub/GitLab URLs. */
export function parseOwnerRepo(input: string): { owner: string; repo: string } | null {
  const raw = input.trim();
  if (raw.length === 0) return null;

  const slug = /^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?$/;
  const fromSlug = slug.exec(raw);
  if (fromSlug && !raw.includes(":") && !raw.includes("@")) {
    return { owner: fromSlug[1]!, repo: fromSlug[2]! };
  }

  const https =
    /^https?:\/\/(?:www\.)?(?:github\.com|gitlab\.com)\/([^/]+)\/([^/]+?)(?:\.git)?\/?$/i.exec(
      raw,
    );
  if (https) {
    return { owner: https[1]!, repo: https[2]!.replace(/\.git$/i, "") };
  }

  const ssh =
    /^(?:git@|ssh:\/\/git@)(?:github\.com|gitlab\.com)[:/]([^/]+)\/([^/]+?)(?:\.git)?$/i.exec(
      raw,
    );
  if (ssh) {
    return { owner: ssh[1]!, repo: ssh[2]!.replace(/\.git$/i, "") };
  }

  return null;
}

export function remoteUrlForHost(host: GitHost, owner: string, repo: string): string {
  if (host === "gitlab") {
    return `https://gitlab.com/${owner}/${repo}.git`;
  }
  return `https://github.com/${owner}/${repo}.git`;
}

export async function repoExistsOnHost(
  host: GitHost,
  owner: string,
  repo: string,
): Promise<boolean> {
  const slug = `${owner}/${repo}`;
  try {
    if (host === "gitlab") {
      await execFileAsync("glab", ["repo", "view", slug], { maxBuffer: 1024 * 1024 });
      return true;
    }
    await execFileAsync("gh", ["repo", "view", slug], { maxBuffer: 1024 * 1024 });
    return true;
  } catch {
    return false;
  }
}
