import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { mergeRequestLabel } from "./git-host.js";
import {
  classifyRollup,
  evaluateCheckGate,
  formatCheckGateProblems,
  type ClassifiedCheck,
  type RawRollupItem,
} from "./check-rollup.js";
import {
  isMergeRequestReadyToMerge,
  isPipelineActive,
  pipelineGateState,
  pipelineStatusFromHost,
  type MergeRequestReadiness,
  type PipelineStatus,
} from "./merge-request-readiness.js";
import { dim, log } from "./logger.js";
import { MERGE_GATE_DEFAULTS, mergeGateTiming } from "./merge-config.js";
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
  /** GitHub: classified `statusCheckRollup` items. GitLab: `null` (head pipeline only). */
  readonly checks: readonly ClassifiedCheck[] | null;
  /** Head commit SHA (GitHub `headRefOid`, GitLab `sha`), used to pin the merge. */
  readonly headSha: string | null;
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

/** Host CLI returned JSON without a field the merge gate needs — fail closed. */
export class MergeRequestShapeError extends Error {
  constructor(tool: string, problems: readonly string[]) {
    super(`${tool} output cannot be trusted for the merge gate: ${problems.join("; ")}.`);
    this.name = "MergeRequestShapeError";
  }
}

type FieldRule = "nonEmptyString" | "array" | "present";

/** Describe every field that violates its rule (`undefined`, `null`, `""`, wrong type). */
function shapeProblems(
  obj: Record<string, unknown>,
  rules: Readonly<Record<string, FieldRule>>,
): string[] {
  const out: string[] = [];
  for (const [field, rule] of Object.entries(rules)) {
    const v = obj[field];
    if (rule === "present") {
      if (!(field in obj) || v === undefined) out.push(`\`${field}\` is missing`);
    } else if (rule === "array") {
      if (!Array.isArray(v)) out.push(`\`${field}\` is missing or not a list`);
    } else if (typeof v !== "string" || v.trim().length === 0) {
      out.push(`\`${field}\` is missing or empty`);
    }
  }
  return out;
}

export async function getMergeRequestDetails(
  cwd: string,
  host: GitHost,
  url: string,
): Promise<MergeRequestDetails | null> {
  try {
    return await readMergeRequestDetails(cwd, host, url, { strict: false });
  } catch {
    return null;
  }
}

/**
 * Read MR/PR details from the host CLI. Throws on CLI / JSON errors. With
 * `strict`, also throws `MergeRequestShapeError` when a field the merge gate
 * relies on is absent (never treat missing data as green).
 */
export async function readMergeRequestDetails(
  cwd: string,
  host: GitHost,
  url: string,
  options: { readonly strict: boolean },
): Promise<MergeRequestDetails> {
  const ref = prRefFromUrl(url);
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
      sha?: string | null;
    };
    if (options.strict) {
      const problems = shapeProblems(parsed as Record<string, unknown>, {
        state: "nonEmptyString",
        merge_status: "present",
        detailed_merge_status: "present",
        // `null` = no pipeline; the key itself must be there.
        head_pipeline: "present",
        sha: "nonEmptyString",
      });
      const pipeline = parsed.head_pipeline;
      if (
        pipeline !== null &&
        pipeline !== undefined &&
        (typeof pipeline.status !== "string" || pipeline.status.trim().length === 0)
      ) {
        problems.push("`head_pipeline.status` is missing or empty");
      }
      if (problems.length > 0) throw new MergeRequestShapeError("glab", problems);
    }
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
      checks: null,
      headSha: parsed.sha ?? null,
    };
  }
  const { stdout } = await execFileAsync(
    "gh",
    [
      "pr",
      "view",
      ref,
      "--json",
      "state,mergedAt,mergeCommit,mergeable,headRefOid,statusCheckRollup",
    ],
    { cwd, maxBuffer: 4 * 1024 * 1024 },
  );
  const parsed = JSON.parse(stdout.trim()) as {
    state?: string;
    mergedAt?: string | null;
    mergeCommit?: { oid?: string | null } | null;
    mergeable?: string | null;
    headRefOid?: string | null;
    statusCheckRollup?: RawRollupItem[] | null;
  };
  if (options.strict) {
    const problems = shapeProblems(parsed as Record<string, unknown>, {
      state: "nonEmptyString",
      mergeable: "nonEmptyString",
      headRefOid: "nonEmptyString",
      statusCheckRollup: "array",
    });
    if (problems.length > 0) throw new MergeRequestShapeError("gh", problems);
  }
  const checks = classifyRollup(parsed.statusCheckRollup);
  const gate = evaluateCheckGate(checks);
  let pipelineStatus: PipelineStatus = "none";
  if (gate.state === "red") {
    pipelineStatus = "failed";
  } else if (gate.state === "pending") {
    pipelineStatus = "running";
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
    checks,
    headSha: parsed.headRefOid ?? null,
  };
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

export interface MergeGateOptions {
  /** Max time to wait for pending checks / mergeability. Default: `merge.waitTimeoutSeconds`. */
  readonly timeoutMs?: number;
  /** Poll interval. Default: `merge.pollIntervalSeconds`. */
  readonly intervalMs?: number;
  /** Wait while checks are pending. When false, pending checks refuse immediately. */
  readonly waitForPending?: boolean;
  /** Check names (exact or `*` glob) that must be present and green. GitHub only. */
  readonly requiredChecks?: readonly string[];
  /**
   * Right after a push the host may not have registered any checks yet. While the
   * rollup is empty, keep polling this long. Default: `merge.emptyRollupGraceSeconds`.
   */
  readonly emptyRollupGraceMs?: number;
  /**
   * After the grace window, a PR with no checks at all refuses unless this is true
   * (`merge.allowNoChecks`). Default false — fail closed.
   */
  readonly allowNoChecks?: boolean;
}

export type MergeGateResult =
  | { readonly ok: true; readonly alreadyMerged: boolean; readonly details: MergeRequestDetails }
  | { readonly ok: false; readonly problems: readonly string[] };

/** Thrown by `mergeMergeRequest` when the merge gate refuses (red / pending / missing checks). */
export class MergeGateError extends Error {
  readonly problems: readonly string[];
  constructor(label: string, problems: readonly string[]) {
    super(
      `Refusing to merge ${label}:\n${problems.map((p) => `  - ${p}`).join("\n")}`,
    );
    this.name = "MergeGateError";
    this.problems = problems;
  }
}

interface GateEvaluation {
  readonly state: "green" | "pending" | "red";
  readonly problems: string[];
  readonly noChecks: boolean;
}

function evaluateDetailsGate(
  details: MergeRequestDetails,
  requiredChecks: readonly string[],
): GateEvaluation {
  if (details.checks !== null) {
    const gate = evaluateCheckGate(details.checks, requiredChecks);
    return {
      state: gate.state,
      problems: formatCheckGateProblems(gate),
      noChecks: details.checks.length === 0,
    };
  }
  const state = pipelineGateState(details.pipelineStatus);
  return {
    state,
    problems: state === "green" ? [] : [`head pipeline is ${details.pipelineStatus}`],
    noChecks: details.pipelineStatus === "none",
  };
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));

/**
 * Merge gate: poll the MR/PR until every check is green and the host reports it
 * mergeable. Refuses immediately on any failed check, on host output it cannot
 * trust, and on "no checks at all" (unless allowed); refuses after the timeout
 * when checks stay pending or a required check never appears.
 */
export async function waitForMergeGate(
  cwd: string,
  host: GitHost,
  url: string,
  options: MergeGateOptions = {},
): Promise<MergeGateResult> {
  const defaults = mergeGateTiming(MERGE_GATE_DEFAULTS);
  const timeoutMs = options.timeoutMs ?? defaults.timeoutMs;
  const intervalMs = options.intervalMs ?? defaults.intervalMs;
  const graceMs = options.emptyRollupGraceMs ?? defaults.emptyRollupGraceMs;
  const allowNoChecks = options.allowNoChecks ?? MERGE_GATE_DEFAULTS.allowNoChecks;
  const waitForPending = options.waitForPending !== false;
  const required = options.requiredChecks ?? [];
  const label = mergeRequestLabel(host);
  const start = Date.now();
  const deadline = start + timeoutMs;
  let loggedWait = false;
  let warnedGitLabRequired = false;

  for (;;) {
    let problems: string[] = [];
    let details: MergeRequestDetails | null = null;
    try {
      details = await readMergeRequestDetails(cwd, host, url, { strict: true });
    } catch (error) {
      if (error instanceof MergeRequestShapeError) {
        return { ok: false, problems: [error.message] };
      }
      const msg = error instanceof Error ? error.message.split("\n")[0] : String(error);
      problems = [`could not read ${label} details from the host: ${msg}`];
    }
    if (details === null) {
      // problems set in catch; keep polling (transient CLI / network error).
    } else if (details.state === "merged") {
      return { ok: true, alreadyMerged: true, details };
    } else if (details.state !== "open") {
      return { ok: false, problems: [`${label} is ${details.state}, not open`] };
    } else {
      const gitlab = details.checks === null;
      if (gitlab && required.length > 0 && !warnedGitLabRequired) {
        log.warn("merge.requiredChecks is GitHub-only; GitLab uses the head pipeline status.");
        warnedGitLabRequired = true;
      }
      const ev = evaluateDetailsGate(details, required);
      if (ev.state === "red") {
        return { ok: false, problems: ev.problems };
      }
      if (details.hasConflicts === true) {
        return { ok: false, problems: [`${label} has merge conflicts`] };
      }
      // "No checks at all" is judged here only when no required check could
      // report it instead (GitHub with requiredChecks → "never ran" path).
      const noChecksRule = ev.noChecks && (gitlab || required.length === 0);
      const inGrace = waitForPending && noChecksRule && Date.now() - start < graceMs;
      if (ev.state === "pending") {
        problems = ev.problems;
      } else if (inGrace) {
        problems = ["no status checks reported yet"];
      } else if (noChecksRule && !allowNoChecks) {
        return {
          ok: false,
          problems: [
            `the host reports no checks for this ${label} — refusing (fail closed). ` +
              "Configure CI and `merge.requiredChecks`, or set `merge.allowNoChecks: true` in .vibeops.json for a repo without CI",
          ],
        };
      } else {
        if (noChecksRule) {
          log.warn(
            `WARNING: merging ${label} with NO checks (merge.allowNoChecks is true). Nothing verified this change.`,
          );
        }
        const readiness = mergeRequestReadinessFromDetails(details);
        if (readiness !== null && isMergeRequestReadyToMerge(readiness)) {
          return { ok: true, alreadyMerged: false, details };
        }
        problems = [
          `host does not report the ${label} as mergeable yet (${
            details.detailedMergeStatus || details.mergeStatus || "unknown"
          })`,
        ];
      }
    }

    const now = Date.now();
    if (!waitForPending || now >= deadline) {
      const suffix = waitForPending
        ? ` (gave up after ${Math.round(timeoutMs / 1000)}s)`
        : "";
      return {
        ok: false,
        problems: problems.map((p, i) => (i === problems.length - 1 ? `${p}${suffix}` : p)),
      };
    }
    if (!loggedWait) {
      log.info(dim(`Waiting for ${label} checks: ${problems.join("; ")}…`));
      loggedWait = true;
    }
    await sleep(Math.min(intervalMs, deadline - now));
  }
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
  /**
   * Wait (bounded) for pending checks before merging. Default false: pending checks
   * refuse immediately. Failed checks always refuse — there is no bypass.
   */
  readonly waitForCi?: boolean;
  /** Check names (exact or `*` glob) that must be present and green (GitHub). */
  readonly requiredChecks?: readonly string[];
  /** Merge-gate timing / no-checks policy (from `.vibeops.json` `merge`). */
  readonly gate?: Pick<
    MergeGateOptions,
    "timeoutMs" | "intervalMs" | "emptyRollupGraceMs" | "allowNoChecks"
  >;
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

  if (opts.dryRun === true) {
    const required =
      opts.requiredChecks && opts.requiredChecks.length > 0
        ? ` + required: ${opts.requiredChecks.join(", ")}`
        : "";
    log.info(`would check ${label} status checks (all green${required}) before merging`);
    if (opts.host === "gitlab") {
      log.info(
        `would ${label} merge ${ref} (glab ${gitLabMergeArgs(ref, method, "<head sha>").join(" ")})`,
      );
    } else {
      log.info(`would gh ${gitHubMergeArgs(ref, method, "<head sha>").join(" ")}`);
    }
    return;
  }

  const runGate = async (): Promise<MergeRequestDetails | null> => {
    const gate = await waitForMergeGate(opts.cwd, opts.host, opts.url, {
      ...opts.gate,
      waitForPending: opts.waitForCi === true,
      requiredChecks: opts.requiredChecks ?? [],
    });
    if (!gate.ok) throw new MergeGateError(label, gate.problems);
    if (gate.alreadyMerged) return null;
    if (gate.details.headSha === null || gate.details.headSha.trim().length === 0) {
      // Strict read already guarantees this; never merge unpinned.
      throw new MergeGateError(label, ["host did not report the head commit SHA"]);
    }
    return gate.details;
  };

  const details = await runGate();
  if (details === null) return;

  if (opts.host === "gitlab") {
    try {
      await execGlabMerge(opts.cwd, gitLabMergeArgs(ref, method, details.headSha!));
    } catch (error) {
      if (!isMergeHttp405(error)) throw error;
      // 405: GitLab not ready to accept the merge yet (e.g. mergeability still
      // being computed). Re-run the gate, then retry once with the same flags
      // (still `--auto-merge=false`, pinned to the re-checked SHA).
      const again = await runGate();
      if (again === null) return;
      await execGlabMerge(opts.cwd, gitLabMergeArgs(ref, method, again.headSha!));
    }
    return;
  }

  // Pinned to the commit the gate checked: a push after the gate makes GitHub refuse.
  await execFileAsync("gh", gitHubMergeArgs(ref, method, details.headSha!), {
    cwd: opts.cwd,
    maxBuffer: 4 * 1024 * 1024,
  });
}

/** `gh pr merge` argv. `--match-head-commit` needs gh ≥ 2.13.0. */
export function gitHubMergeArgs(
  ref: string,
  method: MergeRequestMergeMethod,
  headSha: string,
): string[] {
  return ["pr", "merge", ref, `--${method}`, "--match-head-commit", headSha];
}

/** `glab mr merge` argv: immediate (never schedule auto-merge) and pinned with `--sha`. */
export function gitLabMergeArgs(
  ref: string,
  method: MergeRequestMergeMethod,
  headSha: string,
): string[] {
  const args = ["mr", "merge", ref, "--auto-merge=false", "--sha", headSha];
  if (method === "squash") args.push("--squash");
  else if (method === "rebase") args.push("--rebase");
  return args;
}

async function execGlabMerge(cwd: string, args: readonly string[]): Promise<void> {
  await execFileAsync("glab", [...args], { cwd, maxBuffer: 4 * 1024 * 1024 });
}
