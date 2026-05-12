import { resolve } from "node:path";

import { readConfig } from "../lib/config.js";
import {
  ghAuthStatus,
  gitRemoteList,
  isGhInstalled,
  parseGitHubRemote,
  type GitHubRemoteInfo,
} from "../lib/github-cli.js";
import {
  readBugsUrl,
  readHomepage,
  readPackageJson,
  readRepositoryUrl,
} from "../lib/package-json.js";
import { bold, cyan, dim, green, log, yellow } from "../lib/logger.js";

export interface GithubStatusOptions {
  cwd?: string;
  json?: boolean;
}

interface GithubStatusReport {
  cwd: string;
  gh: {
    installed: boolean;
    authenticated: boolean;
    username: string | null;
    hosts: string[];
  };
  remote: {
    name: string;
    url: string;
    info: GitHubRemoteInfo;
  } | null;
  config: {
    enabled: boolean;
    mode: string;
    owner: string;
    repo: string;
    remote: string;
    visibility: string;
    url: string;
  } | null;
  package: {
    present: boolean;
    repositoryUrl: string;
    homepage: string;
    bugsUrl: string;
  };
}

async function collect(cwd: string): Promise<GithubStatusReport> {
  const [installed, auth, remotes, vibeopsConfig, pkg] = await Promise.all([
    isGhInstalled(),
    ghAuthStatus(),
    gitRemoteList(cwd),
    readConfig(cwd),
    readPackageJson(cwd),
  ]);

  const origin = remotes.find((r) => r.name === "origin") ?? null;
  const otherGithub = remotes.find(
    (r) => r.name !== "origin" && parseGitHubRemote(r.url).isGithub,
  );
  const chosen = origin ?? otherGithub ?? null;
  const remote = chosen
    ? {
        name: chosen.name,
        url: chosen.url,
        info: parseGitHubRemote(chosen.url),
      }
    : null;

  return {
    cwd,
    gh: {
      installed,
      authenticated: auth.authenticated,
      username: auth.username,
      hosts: auth.hosts,
    },
    remote,
    config: vibeopsConfig?.github
      ? {
          enabled: vibeopsConfig.github.enabled,
          mode: vibeopsConfig.github.mode,
          owner: vibeopsConfig.github.owner,
          repo: vibeopsConfig.github.repo,
          remote: vibeopsConfig.github.remote,
          visibility: vibeopsConfig.github.visibility,
          url: vibeopsConfig.github.url,
        }
      : null,
    package: pkg
      ? {
          present: true,
          repositoryUrl: readRepositoryUrl(pkg.data),
          homepage: readHomepage(pkg.data),
          bugsUrl: readBugsUrl(pkg.data),
        }
      : { present: false, repositoryUrl: "", homepage: "", bugsUrl: "" },
  };
}

function fmtRow(label: string, value: string, accent: "ok" | "warn" | "off" | "info" = "info"): void {
  const padded = label.padEnd(20, " ");
  const decorated =
    accent === "ok"
      ? green(value)
      : accent === "warn"
        ? yellow(value)
        : accent === "off"
          ? dim(value)
          : value;
  log.info(`  ${padded} ${decorated}`);
}

function describeRemote(report: GithubStatusReport): {
  text: string;
  accent: "ok" | "warn" | "off";
} {
  if (report.remote === null) return { text: "none", accent: "off" };
  const { info } = report.remote;
  if (info.isGithub && info.owner !== null && info.repo !== null) {
    return {
      text: `${report.remote.name} ${info.owner}/${info.repo}  ${dim(info.url)}`,
      accent: "ok",
    };
  }
  return {
    text: `${report.remote.name} ${report.remote.url}  ${yellow("(not a GitHub URL)")}`,
    accent: "warn",
  };
}

function describePackage(report: GithubStatusReport): {
  text: string;
  accent: "ok" | "warn" | "off";
} {
  if (!report.package.present) return { text: "none", accent: "off" };
  const url = report.package.repositoryUrl;
  if (url.length === 0) return { text: "none", accent: "off" };
  const info = parseGitHubRemote(url);
  if (info.isGithub && info.owner !== null && info.repo !== null) {
    return {
      text: `${info.owner}/${info.repo}  ${dim(url)}`,
      accent: "ok",
    };
  }
  return { text: `${url}  ${yellow("(not a GitHub URL)")}`, accent: "warn" };
}

function describeConfig(report: GithubStatusReport): {
  text: string;
  accent: "ok" | "warn" | "off";
} {
  if (report.config === null) return { text: "no  (no github section)", accent: "off" };
  if (!report.config.enabled)
    return {
      text: `no  (config present, enabled=false)`,
      accent: "off",
    };
  const slug =
    report.config.owner.length > 0 && report.config.repo.length > 0
      ? `${report.config.owner}/${report.config.repo}`
      : "(owner/repo missing)";
  const visibility = report.config.visibility.length > 0 ? report.config.visibility : "?";
  return {
    text: `yes  ${slug}  visibility=${visibility}  remote=${report.config.remote}`,
    accent: report.config.owner.length > 0 && report.config.repo.length > 0 ? "ok" : "warn",
  };
}

function printHuman(report: GithubStatusReport): void {
  log.info(bold("GitHub"));
  fmtRow(
    "gh installed",
    report.gh.installed ? "yes" : "no",
    report.gh.installed ? "ok" : "off",
  );
  if (report.gh.installed) {
    fmtRow(
      "gh authenticated",
      report.gh.authenticated
        ? `yes${report.gh.username !== null ? `  ${dim(`as ${report.gh.username}`)}` : ""}`
        : "no",
      report.gh.authenticated ? "ok" : "off",
    );
  } else {
    fmtRow("gh authenticated", "n/a", "off");
  }
  const remote = describeRemote(report);
  fmtRow("git remote origin", remote.text, remote.accent);
  const cfg = describeConfig(report);
  fmtRow("config enabled", cfg.text, cfg.accent);
  const pkg = describePackage(report);
  fmtRow("package repo", pkg.text, pkg.accent);
  log.blank();
  if (!report.gh.installed) {
    log.info(`${yellow("!")} gh CLI not found. Install via ${cyan("brew install gh")} (macOS) and re-run.`);
  } else if (!report.gh.authenticated) {
    log.info(`${yellow("!")} gh installed but not authenticated. Run ${cyan("gh auth login")} first.`);
  } else if (report.remote === null) {
    log.info(`${dim("·")} No git remote yet. Run ${cyan("vibeops github init")} to create or connect one.`);
  } else if (!report.remote.info.isGithub) {
    log.info(`${yellow("!")} ${report.remote.name} is not a GitHub URL. Reconnect with ${cyan("vibeops github init --connect <owner/repo>")}.`);
  } else if (report.config === null || !report.config.enabled) {
    log.info(`${dim("·")} Remote OK, but .vibeops.json has no github section. Run ${cyan("vibeops github init")} to record it.`);
  } else if (
    report.package.present &&
    parseGitHubRemote(report.package.repositoryUrl).isGithub === false
  ) {
    log.info(`${dim("·")} package.json repository fields are not GitHub URLs. Re-run ${cyan("vibeops github init")} to update them.`);
  } else {
    log.ok("GitHub setup looks consistent.");
  }
}

export async function githubStatusCommand(
  options: GithubStatusOptions = {},
): Promise<void> {
  const cwd = resolve(options.cwd ?? process.cwd());
  const report = await collect(cwd);

  if (options.json === true) {
    log.raw(`${JSON.stringify(report, null, 2)}\n`);
    return;
  }

  printHuman(report);
  // Non-blocking: github status never sets a non-zero exit code by itself.
  // The user is informed; nothing about gh missing / unauthenticated should
  // break CI scripts that only call `vibeops github status` to probe state.
}
