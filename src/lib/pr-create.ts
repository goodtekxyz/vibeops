import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { mergeRequestLabel } from "./git-host.js";
import { log } from "./logger.js";
import type { GitHost } from "../types/config.js";

const execFileAsync = promisify(execFile);

export interface CreateMergeRequestOptions {
  readonly cwd: string;
  readonly host: GitHost;
  readonly baseBranch: string;
  readonly headBranch: string;
  readonly title: string;
  readonly body: string;
  readonly dryRun?: boolean;
}

export interface CreateMergeRequestResult {
  readonly url: string;
}

async function ghPrCreate(opts: CreateMergeRequestOptions): Promise<string> {
  const { stdout } = await execFileAsync(
    "gh",
    [
      "pr",
      "create",
      "--base",
      opts.baseBranch,
      "--head",
      opts.headBranch,
      "--title",
      opts.title,
      "--body",
      opts.body,
    ],
    { cwd: opts.cwd, maxBuffer: 4 * 1024 * 1024 },
  );
  const line = stdout.trim().split("\n").pop()?.trim();
  if (line && line.startsWith("http")) return line;
  throw new Error("gh pr create did not return a URL.");
}

async function glabMrCreate(opts: CreateMergeRequestOptions): Promise<string> {
  const { stdout } = await execFileAsync(
    "glab",
    [
      "mr",
      "create",
      "--target-branch",
      opts.baseBranch,
      "--source-branch",
      opts.headBranch,
      "--title",
      opts.title,
      "--description",
      opts.body,
    ],
    { cwd: opts.cwd, maxBuffer: 4 * 1024 * 1024 },
  );
  const line = stdout.trim().split("\n").pop()?.trim();
  if (line && (line.startsWith("http") || line.includes("merge_requests"))) return line;
  const match = stdout.match(/https?:\/\/[^\s]+/);
  if (match) return match[0]!;
  throw new Error("glab mr create did not return a URL.");
}

export async function createMergeRequest(
  opts: CreateMergeRequestOptions,
): Promise<CreateMergeRequestResult> {
  const label = mergeRequestLabel(opts.host);
  if (opts.dryRun) {
    log.info(`would create ${label}: ${opts.headBranch} → ${opts.baseBranch}`);
    return { url: `(dry-run ${label})` };
  }

  const url =
    opts.host === "gitlab" ? await glabMrCreate(opts) : await ghPrCreate(opts);
  return { url };
}

export async function probeMergeRequestCli(host: GitHost): Promise<boolean> {
  try {
    if (host === "gitlab") {
      await execFileAsync("glab", ["--version"], { maxBuffer: 1024 });
      return true;
    }
    await execFileAsync("gh", ["--version"], { maxBuffer: 1024 });
    return true;
  } catch {
    return false;
  }
}

export type MergeRequestMergeMethod = "merge" | "squash" | "rebase";

export type MergeRequestState = "merged" | "open" | "closed" | "unknown";

function prRefFromUrl(url: string): string {
  const trimmed = url.trim();
  const pullMatch = /\/pull\/(\d+)/i.exec(trimmed);
  if (pullMatch) return pullMatch[1]!;
  const mrMatch = /\/merge_requests\/(\d+)/i.exec(trimmed);
  if (mrMatch) return mrMatch[1]!;
  if (/^\d+$/.test(trimmed)) return trimmed;
  return trimmed;
}

export async function getMergeRequestState(
  cwd: string,
  host: GitHost,
  url: string,
): Promise<MergeRequestState> {
  const ref = prRefFromUrl(url);
  try {
    if (host === "gitlab") {
      const { stdout } = await execFileAsync(
        "glab",
        ["mr", "view", ref, "--output", "json", "state"],
        { cwd, maxBuffer: 1024 * 1024 },
      );
      const state = stdout.trim().toLowerCase();
      if (state === "merged") return "merged";
      if (state === "opened" || state === "open") return "open";
      if (state === "closed") return "closed";
      return "unknown";
    }
    const { stdout } = await execFileAsync(
      "gh",
      ["pr", "view", ref, "--json", "state", "-q", ".state"],
      { cwd, maxBuffer: 1024 * 1024 },
    );
    const state = stdout.trim().toUpperCase();
    if (state === "MERGED") return "merged";
    if (state === "OPEN") return "open";
    if (state === "CLOSED") return "closed";
    return "unknown";
  } catch {
    return "unknown";
  }
}

export interface MergeMergeRequestOptions {
  readonly cwd: string;
  readonly host: GitHost;
  readonly url: string;
  readonly method?: MergeRequestMergeMethod;
  readonly dryRun?: boolean;
}

export async function mergeMergeRequest(opts: MergeMergeRequestOptions): Promise<void> {
  const ref = prRefFromUrl(opts.url);
  const method = opts.method ?? "squash";
  const label = mergeRequestLabel(opts.host);

  if (opts.dryRun === true) {
    if (opts.host === "gitlab") {
      log.info(`would ${label} merge ${ref} (glab mr merge)`);
    } else {
      log.info(`would gh pr merge ${ref} --${method}`);
    }
    return;
  }

  if (opts.host === "gitlab") {
    await execFileAsync("glab", ["mr", "merge", ref], {
      cwd: opts.cwd,
      maxBuffer: 4 * 1024 * 1024,
    });
    return;
  }

  const args = ["pr", "merge", ref, `--${method}`];
  await execFileAsync("gh", args, { cwd: opts.cwd, maxBuffer: 4 * 1024 * 1024 });
}
