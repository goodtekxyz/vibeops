export type MergeRequestHostState = "merged" | "open" | "closed" | "unknown";

export type PipelineStatus =
  | "pending"
  | "running"
  | "success"
  | "failed"
  | "canceled"
  | "skipped"
  | "manual"
  | "unknown"
  | "none";

export interface MergeRequestReadiness {
  readonly state: MergeRequestHostState;
  readonly mergeStatus: string | null;
  readonly detailedMergeStatus: string | null;
  readonly pipelineStatus: PipelineStatus;
  readonly hasConflicts: boolean | null;
}

const ACTIVE_PIPELINE_STATUSES = new Set([
  "pending",
  "running",
  "created",
  "waiting_for_resource",
  "preparing",
  "scheduled",
  "waiting_for_callback",
  "canceling",
]);

const TERMINAL_PIPELINE_FAILURES = new Set<PipelineStatus>(["failed", "canceled"]);

/** Pipeline statuses that count as green for the merge gate (`none` = no pipeline). */
const GREEN_PIPELINE_STATUSES = new Set<PipelineStatus>(["success", "skipped", "none"]);

function normalizePipelineStatus(raw: string | null | undefined): PipelineStatus {
  if (raw === null || raw === undefined || raw.trim().length === 0) return "none";
  const status = raw.trim().toLowerCase();
  if (status === "success") return "success";
  if (status === "skipped") return "skipped";
  if (status === "failed") return "failed";
  if (status === "canceled" || status === "cancelled") return "canceled";
  if (status === "manual") return "manual";
  if (ACTIVE_PIPELINE_STATUSES.has(status)) return "running";
  return "unknown";
}

export function pipelineStatusFromHost(raw: string | null | undefined): PipelineStatus {
  return normalizePipelineStatus(raw);
}

/**
 * Merge-gate verdict for a single pipeline status (GitLab head pipeline, or the
 * aggregated GitHub rollup). Unknown / manual / failed / canceled are red —
 * never merge on a status we cannot prove is green.
 */
export function pipelineGateState(status: PipelineStatus): "green" | "pending" | "red" {
  if (GREEN_PIPELINE_STATUSES.has(status)) return "green";
  if (isPipelineActive(status)) return "pending";
  return "red";
}

export function isPipelineActive(status: PipelineStatus): boolean {
  return status === "running" || status === "pending";
}

/** True when the host reports the MR can be merged now (CI done or not required). */
export function isMergeRequestReadyToMerge(readiness: MergeRequestReadiness): boolean {
  if (readiness.state === "merged") return true;
  if (readiness.state !== "open") return false;
  if (readiness.hasConflicts === true) return false;

  const detailed = readiness.detailedMergeStatus?.trim().toLowerCase() ?? "";
  if (
    detailed === "conflict" ||
    detailed === "not_approved" ||
    detailed === "draft_status" ||
    detailed === "ci_still_running" ||
    detailed === "checking" ||
    detailed === "not_open" ||
    detailed === "discussions_not_resolved" ||
    detailed === "need_rebase" ||
    detailed === "blocked_status"
  ) {
    return false;
  }

  if (TERMINAL_PIPELINE_FAILURES.has(readiness.pipelineStatus)) return false;
  if (pipelineGateState(readiness.pipelineStatus) !== "green") return false;

  const mergeStatus = readiness.mergeStatus?.trim().toLowerCase() ?? "";
  return mergeStatus === "can_be_merged" || detailed === "mergeable";
}
