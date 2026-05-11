import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";

import { runGit } from "./git.js";
import type { GithubVisibility } from "../types/config.js";

const exec = promisify(execFile);

/**
 * Thin wrapper around the GitHub CLI (`gh`) and selected git remote
 * mutations. Every command runs through `execFile` with an args array so
 * shell metacharacters cannot be interpreted. We never log tokens, never
 * read environment variables we do not own, and never write any files —
 * that is `github-init` 's job.
 */

export interface GhResult {
  ok: boolean;
  stdout: string;
  stderr: string;
  exitCode: number | null;
}

export async function runGh(args: readonly string[]): Promise<GhResult> {
  try {
    const { stdout, stderr } = await exec("gh", [...args], { env: process.env });
    return { ok: true, stdout, stderr, exitCode: 0 };
  } catch (err) {
    const e = err as {
      stdout?: string;
      stderr?: string;
      code?: number;
      message?: string;
    };
    return {
      ok: false,
      stdout: e.stdout ?? "",
      stderr: e.stderr ?? (typeof e.message === "string" ? e.message : ""),
      exitCode: typeof e.code === "number" ? e.code : null,
    };
  }
}

/** Returns true if `gh --version` exits 0. */
export async function isGhInstalled(): Promise<boolean> {
  const res = await runGh(["--version"]);
  return res.ok;
}

export interface GhAuthStatus {
  installed: boolean;
  authenticated: boolean;
  /** Best-effort. `gh auth status` may not print username on every version. */
  username: string | null;
  hosts: string[];
  /** Raw stderr/stdout snippet for diagnostics (token-safe). */
  detail: string;
}

const USERNAME_RE = /Logged in to (?:github\.com|[\w.-]+) (?:as|account) ([^\s)]+)/i;

export async function ghAuthStatus(): Promise<GhAuthStatus> {
  const installed = await isGhInstalled();
  if (!installed) {
    return {
      installed: false,
      authenticated: false,
      username: null,
      hosts: [],
      detail: "gh CLI not installed",
    };
  }
  const res = await runGh(["auth", "status"]);
  const text = `${res.stdout}\n${res.stderr}`;
  const authenticated = res.ok || /Logged in to/i.test(text);
  const userMatch = USERNAME_RE.exec(text);
  const hosts: string[] = [];
  for (const m of text.matchAll(/^([\w.-]+\.com)\s*$/gm)) {
    const host = m[1]?.trim();
    if (typeof host === "string" && host.length > 0 && !hosts.includes(host)) {
      hosts.push(host);
    }
  }
  if (hosts.length === 0 && /github\.com/i.test(text)) hosts.push("github.com");
  return {
    installed: true,
    authenticated,
    username: userMatch !== null ? userMatch[1]!.trim() : null,
    hosts,
    // Strip any potential token-looking strings defensively.
    detail: maskAuthDetail(text),
  };
}

function maskAuthDetail(text: string): string {
  return text
    .replace(/gh[op]_[A-Za-z0-9]{20,}/g, "gh***")
    .replace(/ghp_[A-Za-z0-9]{20,}/g, "gh***")
    .replace(/ghu_[A-Za-z0-9]{20,}/g, "gh***")
    .replace(/(Authorization:\s*Bearer\s+)\S+/gi, "$1***")
    .trim();
}

/** Best-effort `gh api user --jq .login`. Returns `null` when gh fails. */
export async function ghCurrentUser(): Promise<string | null> {
  const res = await runGh(["api", "user", "--jq", ".login"]);
  if (!res.ok) return null;
  const login = res.stdout.trim();
  return login.length > 0 ? login : null;
}

export async function ghRepoExists(owner: string, repo: string): Promise<boolean> {
  if (owner.length === 0 || repo.length === 0) return false;
  const res = await runGh(["repo", "view", `${owner}/${repo}`, "--json", "name"]);
  return res.ok;
}

export interface GhCreateRepoInput {
  owner: string;
  repo: string;
  visibility: Exclude<GithubVisibility, "">;
  /** Local source directory to attach (`--source=`). When absent, `gh` makes a remote-only repo. */
  source?: string;
  /** Remote name to register (`--remote=`). Default `origin`. */
  remote?: string;
  /** Repository description. */
  description?: string;
  /** When true, return a planned command without executing it. */
  dryRun?: boolean;
}

export interface GhCreateRepoResult {
  ok: boolean;
  command: string;
  /** Args array exactly as it will be / was passed to `gh`. */
  argv: string[];
  stdout?: string;
  stderr?: string;
  exitCode?: number | null;
  dryRun: boolean;
}

export function buildGhCreateRepoArgs(input: GhCreateRepoInput): string[] {
  const slug = `${input.owner}/${input.repo}`;
  const args: string[] = ["repo", "create", slug];
  args.push(input.visibility === "public" ? "--public" : "--private");
  if (typeof input.source === "string" && input.source.length > 0) {
    args.push(`--source=${input.source}`);
  }
  args.push(`--remote=${input.remote ?? "origin"}`);
  if (typeof input.description === "string" && input.description.length > 0) {
    args.push("--description", input.description);
  }
  return args;
}

export async function ghCreateRepo(
  input: GhCreateRepoInput,
): Promise<GhCreateRepoResult> {
  const argv = buildGhCreateRepoArgs(input);
  const command = `gh ${argv.map(shellSafe).join(" ")}`;
  if (input.dryRun === true) {
    return { ok: true, command, argv, dryRun: true };
  }
  const res = await runGh(argv);
  return {
    ok: res.ok,
    command,
    argv,
    stdout: res.stdout,
    stderr: res.stderr,
    exitCode: res.exitCode,
    dryRun: false,
  };
}

/**
 * Run `gh auth login` with the user's TTY (stdio inherit). Returns a promise
 * resolving with the child's exit code. Caller is responsible for verifying
 * `--dry-run` / `--yes` / non-TTY guards before invoking — this helper does
 * NOT decide policy.
 */
export function ghAuthLoginInteractive(): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn("gh", ["auth", "login"], {
      stdio: "inherit",
      env: process.env,
    });
    child.on("exit", (code) => {
      resolve(typeof code === "number" ? code : 1);
    });
    child.on("error", () => {
      resolve(127);
    });
  });
}

export type GitHubRemoteProtocol = "ssh" | "https" | "slug" | "git";

export interface GitHubRemoteInfo {
  isGithub: boolean;
  owner: string | null;
  repo: string | null;
  url: string;
  /** Original protocol detected; useful for round-tripping. */
  protocol: GitHubRemoteProtocol | null;
  /** Normalized https url (e.g. for `package.json#homepage`). `null` when not a GitHub url. */
  httpsUrl: string | null;
  /** Normalized git+https url (e.g. for `package.json#repository.url`). `null` when not GitHub. */
  gitHttpsUrl: string | null;
}

const RE_SSH = /^git@github\.com:([^/\s]+)\/([^/\s]+?)(?:\.git)?$/i;
const RE_HTTPS = /^https?:\/\/github\.com\/([^/\s?#]+)\/([^/\s?#]+?)(?:\.git)?(?:[?#].*)?$/i;
const RE_GIT_HTTPS = /^git\+https?:\/\/github\.com\/([^/\s?#]+)\/([^/\s?#]+?)(?:\.git)?(?:[?#].*)?$/i;
const RE_SLUG = /^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/;

/** Strip a trailing `.git` and any `?...#...` suffix from a repo name. */
function cleanRepoName(name: string): string {
  return name.replace(/\.git$/i, "").trim();
}

export function parseGitHubRemote(rawUrl: string): GitHubRemoteInfo {
  const url = rawUrl.trim();
  const empty: GitHubRemoteInfo = {
    isGithub: false,
    owner: null,
    repo: null,
    url,
    protocol: null,
    httpsUrl: null,
    gitHttpsUrl: null,
  };
  if (url.length === 0) return empty;

  let owner: string | null = null;
  let repo: string | null = null;
  let protocol: GitHubRemoteProtocol | null = null;

  const ssh = RE_SSH.exec(url);
  if (ssh !== null) {
    owner = ssh[1]!;
    repo = cleanRepoName(ssh[2]!);
    protocol = "ssh";
  } else {
    const gitHttps = RE_GIT_HTTPS.exec(url);
    if (gitHttps !== null) {
      owner = gitHttps[1]!;
      repo = cleanRepoName(gitHttps[2]!);
      protocol = "git";
    } else {
      const https = RE_HTTPS.exec(url);
      if (https !== null) {
        owner = https[1]!;
        repo = cleanRepoName(https[2]!);
        protocol = "https";
      } else {
        const slug = RE_SLUG.exec(url);
        if (slug !== null) {
          owner = slug[1]!;
          repo = cleanRepoName(slug[2]!);
          protocol = "slug";
        }
      }
    }
  }

  if (owner === null || repo === null || repo.length === 0) return empty;
  const httpsUrl = `https://github.com/${owner}/${repo}`;
  const gitHttpsUrl = `git+https://github.com/${owner}/${repo}.git`;
  return {
    isGithub: true,
    owner,
    repo,
    url,
    protocol,
    httpsUrl,
    gitHttpsUrl,
  };
}

/** Read remotes from `git remote -v` (read-only). */
export interface GitRemoteEntry {
  name: string;
  url: string;
}

export async function gitRemoteList(cwd: string): Promise<GitRemoteEntry[]> {
  try {
    const { stdout } = await exec("git", ["remote", "-v"], { cwd });
    const out: GitRemoteEntry[] = [];
    const seen = new Set<string>();
    for (const line of stdout.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (trimmed.length === 0) continue;
      const m = /^([^\s]+)\s+([^\s]+)\s+\((fetch|push)\)$/.exec(trimmed);
      if (m === null) continue;
      const name = m[1]!;
      const url = m[2]!;
      const key = `${name}\t${url}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ name, url });
    }
    // Deduplicate to one entry per remote name (prefer fetch).
    const byName = new Map<string, GitRemoteEntry>();
    for (const e of out) {
      if (!byName.has(e.name)) byName.set(e.name, e);
    }
    return Array.from(byName.values());
  } catch {
    return [];
  }
}

/** Add a new git remote. Throws if remote already exists or git fails. */
export async function gitRemoteAdd(
  cwd: string,
  name: string,
  url: string,
): Promise<void> {
  await runGit(cwd, ["remote", "add", name, url]);
}

/** Update an existing git remote URL. Throws if remote does not exist. */
export async function gitRemoteSetUrl(
  cwd: string,
  name: string,
  url: string,
): Promise<void> {
  await runGit(cwd, ["remote", "set-url", name, url]);
}

/**
 * Quote a single argv element for human-readable command preview. Not used
 * to actually execute commands — we always go through execFile arg arrays.
 */
function shellSafe(s: string): string {
  if (/^[\w@/:.+=-]+$/.test(s)) return s;
  return `'${s.replace(/'/g, "'\\''")}'`;
}
