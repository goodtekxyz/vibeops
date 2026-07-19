import { basename } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import {
  brewInstall,
  formatHostCliHint,
  formatHostCliMissingMessage,
  hostCliTool,
  parseOwnerRepo,
  probeBrew,
  probeHostCliAuth,
  remoteUrlForHost,
  repoExistsOnHost,
  runInteractiveCli,
  type HostCliTool,
} from "./git-host-cli.js";
import { detectGitHost } from "./git-host.js";
import { gitRemoteUrl, runGit } from "./git.js";
import { askInput, askSelect, askYesNo } from "./inquirer-helpers.js";
import { dim, log, yellow } from "./logger.js";
import type { GitHost } from "../types/config.js";

const execFileAsync = promisify(execFile);

export interface EnsureRemoteOptions {
  readonly cwd: string;
  readonly remoteName?: string;
  readonly dryRun?: boolean;
  readonly nonInteractive?: boolean;
  readonly allowMissing?: boolean;
  /** Preferred host from `--git-host` (used when interactive select is skipped). */
  readonly preferredHost?: GitHost;
  /** GitLab `glab repo create --defaultBranch` (defaults to main). */
  readonly defaultBranch?: string;
}

export interface EnsureRemoteResult {
  readonly remote: string;
  readonly url: string;
  readonly host: GitHost;
  /** True when the user chose local-only / skip. */
  readonly skipped?: boolean;
}

async function createGithubRepo(cwd: string, name: string): Promise<string> {
  const { stdout } = await execFileAsync(
    "gh",
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

async function addRemoteUrl(
  cwd: string,
  remote: string,
  url: string,
): Promise<EnsureRemoteResult> {
  const host = detectGitHost(url);
  if (!host) {
    throw new Error("Only GitHub and GitLab HTTPS/SSH URLs are supported.");
  }
  await runGit(cwd, ["remote", "add", remote, url.trim()]);
  return { remote, url: url.trim(), host };
}

async function resolveConnectUrl(
  host: GitHost,
  input: string,
): Promise<string> {
  const trimmed = input.trim();
  const parsed = parseOwnerRepo(trimmed);
  if (parsed) {
    if (trimmed.startsWith("http") || trimmed.startsWith("git@") || trimmed.startsWith("ssh://")) {
      return trimmed.endsWith(".git") ? trimmed : `${trimmed.replace(/\/$/, "")}.git`;
    }
    return remoteUrlForHost(host, parsed.owner, parsed.repo);
  }
  if (detectGitHost(trimmed)) {
    return trimmed.endsWith(".git") ? trimmed : `${trimmed.replace(/\/$/, "")}.git`;
  }
  throw new Error(`Could not parse remote: ${trimmed}`);
}

async function repairMissingCli(host: GitHost): Promise<"retry" | "manual" | "skip"> {
  const tool = hostCliTool(host);
  const status = await probeHostCliAuth(host);
  log.warn(
    status === "missing"
      ? formatHostCliMissingMessage(host, "create a remote repository")
      : `${tool} is installed but not logged in.`,
  );
  for (const line of formatHostCliHint(host)) {
    log.info(dim(`  ${line}`));
  }

  const brewOk = status === "missing" ? await probeBrew() : false;
  const choices = [
    "I installed / logged in — retry",
    ...(brewOk ? [`Run brew install ${tool}`] : []),
    "Enter remote URL manually",
    "Skip remote for now",
  ];

  // Loop so brew install / retry can re-prompt.
  for (;;) {
    const pick = await askSelect({
      message: "How do you want to continue?",
      nonInteractive: false,
      choices,
    });

    if (pick === "I installed / logged in — retry") {
      const again = await probeHostCliAuth(host);
      if (again === "ok") return "retry";
      log.warn(
        again === "missing"
          ? `${tool} still not found on PATH.`
          : `${tool} still not authenticated. Run \`${tool} auth login\`.`,
      );
      continue;
    }

    if (pick.startsWith("Run brew install")) {
      log.info(dim(`Running: brew install ${tool}`));
      try {
        await brewInstall(tool as HostCliTool);
        log.ok(`Installed ${tool}`);
        log.info(dim(`Next: ${tool} auth login`));
        const loginNow = await askYesNo({
          message: `Run \`${tool} auth login\` now?`,
          nonInteractive: false,
          defaultValue: true,
        });
        if (loginNow) {
          try {
            await runInteractiveCli(tool, ["auth", "login"]);
          } catch {
            /* user may cancel */
          }
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        log.warn(`brew install failed: ${msg}`);
      }
      continue;
    }

    if (pick === "Enter remote URL manually") return "manual";
    return "skip";
  }
}

async function connectExisting(
  cwd: string,
  remote: string,
  host: GitHost,
): Promise<EnsureRemoteResult> {
  const input = await askInput({
    message: "Repository URL or owner/repo",
    nonInteractive: false,
    required: true,
  });
  const url = await resolveConnectUrl(host, input);
  const parsed = parseOwnerRepo(url) ?? parseOwnerRepo(input);

  if (parsed && (await probeHostCliAuth(host)) === "ok") {
    const exists = await repoExistsOnHost(host, parsed.owner, parsed.repo);
    if (!exists) {
      log.warn(
        yellow(
          `Could not verify ${parsed.owner}/${parsed.repo} on ${host} (missing or private). Continuing with remote add.`,
        ),
      );
    }
  }

  return addRemoteUrl(cwd, remote, url);
}

async function createOnHost(
  cwd: string,
  remote: string,
  host: GitHost,
  defaultBranch: string,
): Promise<EnsureRemoteResult> {
  const folder = basename(cwd);
  const label = host === "gitlab" ? "GitLab project path (group/project)" : "GitHub repository (owner/repo or name)";
  const name = await askInput({
    message: label,
    nonInteractive: false,
    required: true,
    default: folder,
  });

  log.info(dim(`Creating ${host} repository via ${hostCliTool(host)}…`));
  if (host === "gitlab") {
    const url = await createGitlabRepo(cwd, name, defaultBranch);
    // glab may name remote differently; ensure our remote name.
    const current = await gitRemoteUrl(cwd, remote);
    if (!current) {
      const origin = await gitRemoteUrl(cwd, "origin");
      if (origin && remote !== "origin") {
        await runGit(cwd, ["remote", "rename", "origin", remote]);
      }
    }
    return { remote, url, host };
  }
  const url = await createGithubRepo(cwd, name);
  return { remote, url, host };
}

/**
 * Ensures `origin` (or named remote) exists.
 * Interactive: ask host → create/connect; soft-gate when CLI missing.
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
    const host = opts.preferredHost ?? "github";
    log.info(dim(`would configure git remote ${remote} (${host})`));
    return { remote, url: "(dry-run)", host };
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
  log.info("Remote setup — used later for pull requests / merge requests.");

  const hostPick = await askSelect({
    message: "Where will this project's remote live?",
    nonInteractive: false,
    choices: ["GitHub", "GitLab", "Skip for now (local only)"],
    default:
      opts.preferredHost === "gitlab"
        ? "GitLab"
        : opts.preferredHost === "github"
          ? "GitHub"
          : undefined,
  });

  if (hostPick.startsWith("Skip")) {
    log.warn("No git remote configured. task ship push/MR will fail until origin exists.");
    log.info(dim(`  Later: git remote add ${remote} <url>`));
    return null;
  }

  const host: GitHost = hostPick === "GitLab" ? "gitlab" : "github";

  const mode = await askSelect({
    message: "Set up the remote",
    nonInteractive: false,
    choices: ["Create a new repository", "Connect an existing repository"],
  });

  if (mode.startsWith("Connect")) {
    return connectExisting(opts.cwd, remote, host);
  }

  // Create path — requires authenticated CLI (soft gate).
  for (;;) {
    const auth = await probeHostCliAuth(host);
    if (auth === "ok") {
      const defaultBranch =
        typeof opts.defaultBranch === "string" && opts.defaultBranch.length > 0
          ? opts.defaultBranch
          : "main";
      return createOnHost(opts.cwd, remote, host, defaultBranch);
    }

    const action = await repairMissingCli(host);
    if (action === "retry") continue;
    if (action === "manual") {
      return connectExisting(opts.cwd, remote, host);
    }
    log.warn("No git remote configured. task ship push/MR will fail until origin exists.");
    log.info(dim(`  Later: git remote add ${remote} <url>`));
    return null;
  }
}
