export type MergeRequestHostState = "merged" | "open" | "closed" | "unknown";

export type PipelineStatus =
  | "pending"
  | "running"
  | "success"
  | "failed"
  | "canceled"
  | "skipped"
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
]);

const TERMINAL_PIPELINE_FAILURES = new Set(["failed", "canceled"]);

function normalizePipelineStatus(raw: string | null | undefined): PipelineStatus {
  if (raw === null || raw === undefined || raw.trim().length === 0) return "none";
  const status = raw.trim().toLowerCase();
  if (status === "success") return "success";
  if (status === "skipped") return "skipped";
  if (status === "failed") return "failed";
  if (status === "canceled" || status === "cancelled") return "canceled";
  if (ACTIVE_PIPELINE_STATUSES.has(status)) return "running";
  return "unknown";
}

export function pipelineStatusFromHost(raw: string | null | undefined): PipelineStatus {
  return normalizePipelineStatus(raw);
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
  if (isPipelineActive(readiness.pipelineStatus)) return false;

  const mergeStatus = readiness.mergeStatus?.trim().toLowerCase() ?? "";
  return mergeStatus === "can_be_merged" || detailed === "mergeable";
}
