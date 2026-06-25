import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { mergeRequestLabel } from "./git-host.js";
import {
  isMergeRequestReadyToMerge,
  isPipelineActive,
  pipelineStatusFromHost,
  type MergeRequestReadiness,
  type PipelineStatus,
} from "./merge-request-readiness.js";
import { dim, log } from "./logger.js";
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

export interface MergeRequestDetails {
  readonly state: MergeRequestState;
  readonly mergedAt: string | null;
  readonly mergeCommitSha: string | null;
  readonly squashCommitSha: string | null;
  readonly mergeStatus: string | null;
  readonly detailedMergeStatus: string | null;
  readonly pipelineStatus: PipelineStatus;
  readonly hasConflicts: boolean | null;
}

export type { MergeRequestReadiness, PipelineStatus };
export { isMergeRequestReadyToMerge, isPipelineActive };

export type MergeRequestListState = "open" | "merged" | "closed" | "all";

export interface FindMergeRequestByBranchesOptions {
  readonly cwd: string;
  readonly host: GitHost;
  readonly headBranch: string;
  readonly baseBranch: string;
  readonly state?: MergeRequestListState;
}

export interface MergeRequestRef {
  readonly url: string;
  readonly state: MergeRequestState;
}

function normalizeGhMergeRequestState(raw: string): MergeRequestState {
  const state = raw.trim().toUpperCase();
  if (state === "MERGED") return "merged";
  if (state === "OPEN") return "open";
  if (state === "CLOSED") return "closed";
  return "unknown";
}

function normalizeGlabMergeRequestState(raw: string): MergeRequestState {
  const state = raw.trim().toLowerCase();
  if (state === "merged") return "merged";
  if (state === "opened" || state === "open") return "open";
  if (state === "closed") return "closed";
  return "unknown";
}

async function ghFindMergeRequestByBranches(
  opts: FindMergeRequestByBranchesOptions,
): Promise<MergeRequestRef | null> {
  const state = opts.state ?? "open";
  const { stdout } = await execFileAsync(
    "gh",
    [
      "pr",
      "list",
      "--head",
      opts.headBranch,
      "--base",
      opts.baseBranch,
      "--state",
      state,
      "--limit",
      "1",
      "--json",
      "url,state",
    ],
    { cwd: opts.cwd, maxBuffer: 1024 * 1024 },
  );
  const trimmed = stdout.trim();
  if (trimmed.length === 0 || trimmed === "[]") return null;
  const rows = JSON.parse(trimmed) as Array<{ url?: string; state?: string }>;
  const row = rows[0];
  if (row?.url === undefined || row.url.length === 0) return null;
  return {
    url: row.url,
    state: normalizeGhMergeRequestState(row.state ?? ""),
  };
}

async function glabFindMergeRequestByBranches(
  opts: FindMergeRequestByBranchesOptions,
): Promise<MergeRequestRef | null> {
  const state = opts.state ?? "open";
  const args = [
    "mr",
    "list",
    "--source-branch",
    opts.headBranch,
    "--target-branch",
    opts.baseBranch,
    "-F",
    "json",
    "-P",
    "1",
  ];
  if (state === "merged") {
    args.push("-M");
  } else if (state === "closed") {
    args.push("-c");
  } else if (state === "all") {
    args.push("-A");
  }

  const { stdout } = await execFileAsync("glab", args, {
    cwd: opts.cwd,
    maxBuffer: 1024 * 1024,
  });
  const trimmed = stdout.trim();
  if (trimmed.length === 0 || trimmed === "[]") return null;
  const rows = JSON.parse(trimmed) as Array<{ web_url?: string; state?: string }>;
  const row = rows[0];
  const url = row?.web_url?.trim();
  if (url === undefined || url.length === 0) return null;
  return {
    url,
    state: normalizeGlabMergeRequestState(row.state ?? ""),
  };
}

/** Resolve MR/PR by `(headBranch, baseBranch)` — source of truth for ship/reship (no TASK URL). */
export async function findMergeRequestByBranches(
  opts: FindMergeRequestByBranchesOptions,
): Promise<MergeRequestRef | null> {
  try {
    if (!(await probeMergeRequestCli(opts.host))) return null;
    if (opts.host === "gitlab") {
      return glabFindMergeRequestByBranches(opts);
    }
    return ghFindMergeRequestByBranches(opts);
  } catch {
    return null;
  }
}

/** Extract the numeric PR/MR id from a host URL (e.g. `#42`), or `null`. */
export function prNumberFromUrl(url: string | null | undefined): string | null {
  if (typeof url !== "string") return null;
  const trimmed = url.trim();
  if (trimmed.length === 0) return null;
  const pullMatch = /\/pull\/(\d+)/i.exec(trimmed);
  if (pullMatch) return pullMatch[1]!;
  const mrMatch = /\/merge_requests\/(\d+)/i.exec(trimmed);
  if (mrMatch) return mrMatch[1]!;
  if (/^\d+$/.test(trimmed)) return trimmed;
  return null;
}

function prRefFromUrl(url: string): string {
  return prNumberFromUrl(url) ?? url.trim();
}

export async function getMergeRequestState(
  cwd: string,
  host: GitHost,
  url: string,
): Promise<MergeRequestState> {
  const details = await getMergeRequestDetails(cwd, host, url);
  return details?.state ?? "unknown";
}

export async function getMergeRequestDetails(
  cwd: string,
  host: GitHost,
  url: string,
): Promise<MergeRequestDetails | null> {
  const ref = prRefFromUrl(url);
  try {
    if (host === "gitlab") {
      const { stdout } = await execFileAsync(
        "glab",
        ["mr", "view", ref, "-F", "json"],
        { cwd, maxBuffer: 1024 * 1024 },
      );
      const parsed = JSON.parse(stdout.trim()) as {
        state?: string;
        merged_at?: string | null;
        merge_commit_sha?: string | null;
        squash_commit_sha?: string | null;
        merge_status?: string | null;
        detailed_merge_status?: string | null;
        has_conflicts?: boolean | null;
        head_pipeline?: { status?: string | null } | null;
      };
      const state = normalizeGlabMergeRequestState(parsed.state ?? "");
      return {
        state,
        mergedAt: parsed.merged_at ?? null,
        mergeCommitSha: parsed.merge_commit_sha ?? null,
        squashCommitSha: parsed.squash_commit_sha ?? null,
        mergeStatus: parsed.merge_status ?? null,
        detailedMergeStatus: parsed.detailed_merge_status ?? null,
        pipelineStatus: pipelineStatusFromHost(parsed.head_pipeline?.status),
        hasConflicts: parsed.has_conflicts ?? null,
      };
    }
    const { stdout } = await execFileAsync(
      "gh",
      ["pr", "view", ref, "--json", "state,mergedAt,mergeCommit,mergeable,statusCheckRollup"],
      { cwd, maxBuffer: 1024 * 1024 },
    );
    const parsed = JSON.parse(stdout.trim()) as {
      state?: string;
      mergedAt?: string | null;
      mergeCommit?: { oid?: string | null } | null;
      mergeable?: string | null;
      statusCheckRollup?: Array<{ state?: string | null }> | null;
    };
    const checks = parsed.statusCheckRollup ?? [];
    let pipelineStatus: PipelineStatus = "none";
    if (checks.some((c) => (c.state ?? "").toUpperCase() === "PENDING")) {
      pipelineStatus = "running";
    } else if (checks.some((c) => (c.state ?? "").toUpperCase() === "FAILURE")) {
      pipelineStatus = "failed";
    } else if (checks.length > 0) {
      pipelineStatus = "success";
    }
    const mergeable = parsed.mergeable?.trim().toUpperCase() ?? "";
    return {
      state: normalizeGhMergeRequestState(parsed.state ?? ""),
      mergedAt: parsed.mergedAt ?? null,
      mergeCommitSha: parsed.mergeCommit?.oid ?? null,
      squashCommitSha: null,
      mergeStatus: mergeable === "MERGEABLE" ? "can_be_merged" : mergeable.toLowerCase(),
      detailedMergeStatus: mergeable.toLowerCase(),
      pipelineStatus,
      hasConflicts: mergeable === "CONFLICTING" ? true : mergeable === "MERGEABLE" ? false : null,
    };
  } catch {
    return null;
  }
}

export interface WaitForMergeRequestMergedOptions {
  readonly timeoutMs?: number;
  readonly intervalMs?: number;
}

/** Poll host until MR/PR state is merged (or timeout). */
export async function waitForMergeRequestMerged(
  cwd: string,
  host: GitHost,
  url: string,
  options: WaitForMergeRequestMergedOptions = {},
): Promise<boolean> {
  const timeoutMs = options.timeoutMs ?? 120_000;
  const intervalMs = options.intervalMs ?? 2_000;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const details = await getMergeRequestDetails(cwd, host, url);
    if (details?.state === "merged" && details.mergedAt !== null) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  return false;
}

function mergeRequestReadinessFromDetails(
  details: MergeRequestDetails | null,
): MergeRequestReadiness | null {
  if (details === null) return null;
  return {
    state: details.state,
    mergeStatus: details.mergeStatus,
    detailedMergeStatus: details.detailedMergeStatus,
    pipelineStatus: details.pipelineStatus,
    hasConflicts: details.hasConflicts,
  };
}

export interface WaitForMergeRequestReadyToMergeOptions {
  readonly timeoutMs?: number;
  readonly intervalMs?: number;
}

/** Poll until MR/PR CI finished and host reports mergeable (or already merged). */
export async function waitForMergeRequestReadyToMerge(
  cwd: string,
  host: GitHost,
  url: string,
  options: WaitForMergeRequestReadyToMergeOptions = {},
): Promise<boolean> {
  const timeoutMs = options.timeoutMs ?? 900_000;
  const intervalMs = options.intervalMs ?? 5_000;
  const deadline = Date.now() + timeoutMs;
  const label = mergeRequestLabel(host);
  let loggedWait = false;

  while (Date.now() < deadline) {
    const details = await getMergeRequestDetails(cwd, host, url);
    const readiness = mergeRequestReadinessFromDetails(details);
    if (readiness !== null && isMergeRequestReadyToMerge(readiness)) {
      return true;
    }
    if (!loggedWait) {
      log.info(dim(`Waiting for ${label} pipeline / merge checks…`));
      loggedWait = true;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  return false;
}

function isMergeHttp405(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return msg.includes("405") || msg.toLowerCase().includes("method not allowed");
}

export interface MergeMergeRequestOptions {
  readonly cwd: string;
  readonly host: GitHost;
  readonly url: string;
  readonly method?: MergeRequestMergeMethod;
  readonly dryRun?: boolean;
  /** Wait for MR/PR CI to finish before attempting merge. Default false. */
  readonly waitForCi?: boolean;
  /**
   * GitLab only: merge now instead of scheduling auto-merge when CI is running.
   * When `waitForCi` is true, defaults to true after CI is green.
   */
  readonly immediate?: boolean;
}

export interface CloseMergeRequestOptions {
  readonly cwd: string;
  readonly host: GitHost;
  readonly url: string;
  readonly dryRun?: boolean;
}

export async function closeMergeRequest(opts: CloseMergeRequestOptions): Promise<void> {
  const ref = prRefFromUrl(opts.url);
  const label = mergeRequestLabel(opts.host);

  if (opts.dryRun === true) {
    log.info(`would close ${label} ${ref}`);
    return;
  }

  if (opts.host === "gitlab") {
    await execFileAsync("glab", ["mr", "close", ref], {
      cwd: opts.cwd,
      maxBuffer: 4 * 1024 * 1024,
    });
    return;
  }

  await execFileAsync("gh", ["pr", "close", ref], {
    cwd: opts.cwd,
    maxBuffer: 4 * 1024 * 1024,
  });
}

export async function mergeMergeRequest(opts: MergeMergeRequestOptions): Promise<void> {
  const ref = prRefFromUrl(opts.url);
  const method = opts.method ?? "squash";
  const label = mergeRequestLabel(opts.host);

  if (opts.waitForCi === true && opts.dryRun !== true) {
    const ready = await waitForMergeRequestReadyToMerge(opts.cwd, opts.host, opts.url);
    if (!ready) {
      throw new Error(
        `${label} is not ready to merge yet (pipeline running, checks pending, or timeout).`,
      );
    }
  }

  const details = await getMergeRequestDetails(opts.cwd, opts.host, opts.url);
  const readiness = mergeRequestReadinessFromDetails(details);
  const pipelineActive =
    readiness !== null ? isPipelineActive(readiness.pipelineStatus) : false;

  if (opts.dryRun === true) {
    if (opts.host === "gitlab") {
      const immediate = opts.immediate !== false && !pipelineActive;
      const flags = immediate ? " --auto-merge=false" : " (auto-merge when pipeline succeeds)";
      const methodFlag =
        method === "squash" ? " --squash" : method === "rebase" ? " --rebase" : "";
      log.info(`would ${label} merge ${ref} (glab mr merge${flags}${methodFlag})`);
    } else {
      log.info(`would gh pr merge ${ref} --${method}`);
    }
    return;
  }

  if (opts.host === "gitlab") {
    await mergeGitLabMergeRequest({
      cwd: opts.cwd,
      ref,
      method,
      immediate: opts.immediate !== false && !pipelineActive,
    });
    return;
  }

  const args = ["pr", "merge", ref, `--${method}`];
  await execFileAsync("gh", args, { cwd: opts.cwd, maxBuffer: 4 * 1024 * 1024 });
}

async function mergeGitLabMergeRequest(input: {
  readonly cwd: string;
  readonly ref: string;
  readonly method: MergeRequestMergeMethod;
  readonly immediate: boolean;
}): Promise<void> {
  const attempt = async (immediate: boolean): Promise<void> => {
    const args = ["mr", "merge", input.ref];
    if (immediate) {
      args.push("--auto-merge=false");
    }
    if (input.method === "squash") {
      args.push("--squash");
    } else if (input.method === "rebase") {
      args.push("--rebase");
    }
    await execFileAsync("glab", args, {
      cwd: input.cwd,
      maxBuffer: 4 * 1024 * 1024,
    });
  };

  try {
    await attempt(input.immediate);
  } catch (error) {
    if (!input.immediate && isMergeHttp405(error)) {
      await attempt(false);
      return;
    }
    if (input.immediate && isMergeHttp405(error)) {
      await attempt(false);
      return;
    }
    throw error;
  }
}
