/**
 * Classify GitHub `statusCheckRollup` items and evaluate the merge gate
 * (`task merge` / `task release` refuse to merge on red or missing checks).
 *
 * GitHub returns two item shapes:
 * - `CheckRun` (GitHub Actions, check apps): `status` + `conclusion`, no `state`.
 * - `StatusContext` (commit status API): `state`, no `status`/`conclusion`.
 */

export type CheckVerdict = "passed" | "failed" | "pending";

export interface RawRollupItem {
  readonly __typename?: string | null;
  readonly name?: string | null;
  readonly context?: string | null;
  readonly workflowName?: string | null;
  readonly status?: string | null;
  readonly conclusion?: string | null;
  readonly state?: string | null;
  readonly detailsUrl?: string | null;
  readonly targetUrl?: string | null;
}

export interface ClassifiedCheck {
  readonly name: string;
  readonly kind: "CheckRun" | "StatusContext";
  readonly verdict: CheckVerdict;
  /** Raw host value that drove the verdict (e.g. `FAILURE`, `IN_PROGRESS`). */
  readonly detail: string;
}

/** GitHub GraphQL `CheckStatusState` values other than COMPLETED. */
const CHECK_RUN_IN_FLIGHT = new Set(["REQUESTED", "QUEUED", "IN_PROGRESS", "WAITING", "PENDING"]);
/** GitHub GraphQL `CheckConclusionState`, split into pass / fail (exhaustive). */
const CHECK_RUN_PASS = new Set(["SUCCESS", "NEUTRAL", "SKIPPED"]);
const CHECK_RUN_FAIL = new Set([
  "FAILURE",
  "CANCELLED",
  "TIMED_OUT",
  "ACTION_REQUIRED",
  "STARTUP_FAILURE",
  "STALE",
]);
/** GitHub GraphQL `StatusState` (exhaustive): SUCCESS | PENDING | EXPECTED | FAILURE | ERROR. */
const STATUS_CONTEXT_PENDING = new Set(["PENDING", "EXPECTED"]);
const STATUS_CONTEXT_FAIL = new Set(["FAILURE", "ERROR"]);

function upper(raw: string | null | undefined): string {
  return (raw ?? "").trim().toUpperCase();
}

function isCheckRun(item: RawRollupItem): boolean {
  if (item.__typename === "CheckRun") return true;
  if (item.__typename === "StatusContext") return false;
  // Unknown typename: infer from fields.
  return (item.status ?? null) !== null || (item.conclusion ?? null) !== null;
}

export function classifyRollupItem(item: RawRollupItem): ClassifiedCheck {
  if (isCheckRun(item)) {
    const name = (item.name ?? "").trim() || "(unnamed check run)";
    const status = upper(item.status);
    const conclusion = upper(item.conclusion);
    if (CHECK_RUN_IN_FLIGHT.has(status)) {
      return { name, kind: "CheckRun", verdict: "pending", detail: status };
    }
    if (status !== "COMPLETED") {
      // Missing or undocumented status — fail closed.
      return { name, kind: "CheckRun", verdict: "failed", detail: status || "MISSING_STATUS" };
    }
    if (CHECK_RUN_PASS.has(conclusion)) {
      return { name, kind: "CheckRun", verdict: "passed", detail: conclusion };
    }
    if (CHECK_RUN_FAIL.has(conclusion)) {
      return { name, kind: "CheckRun", verdict: "failed", detail: conclusion };
    }
    // Completed with a missing or undocumented conclusion — fail closed.
    return {
      name,
      kind: "CheckRun",
      verdict: "failed",
      detail: conclusion || "MISSING_CONCLUSION",
    };
  }

  const name = (item.context ?? item.name ?? "").trim() || "(unnamed status)";
  const state = upper(item.state);
  if (state === "SUCCESS") {
    return { name, kind: "StatusContext", verdict: "passed", detail: state };
  }
  if (STATUS_CONTEXT_PENDING.has(state)) {
    return { name, kind: "StatusContext", verdict: "pending", detail: state };
  }
  if (STATUS_CONTEXT_FAIL.has(state)) {
    return { name, kind: "StatusContext", verdict: "failed", detail: state };
  }
  // Missing or undocumented state — fail closed.
  return { name, kind: "StatusContext", verdict: "failed", detail: state || "MISSING_STATE" };
}

export function classifyRollup(items: readonly RawRollupItem[] | null | undefined): ClassifiedCheck[] {
  return (items ?? []).map(classifyRollupItem);
}

/** Exact name, or a `*` glob (e.g. `Strategy diff guards*`, `* · vs develop`). */
export function checkNameMatches(name: string, pattern: string): boolean {
  const p = pattern.trim();
  if (p.length === 0) return false;
  if (!p.includes("*")) return name === p;
  const re = new RegExp(
    `^${p
      .split("*")
      .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
      .join(".*")}$`,
  );
  return re.test(name);
}

export type CheckGateState = "green" | "pending" | "red";

export interface CheckGateResult {
  readonly state: CheckGateState;
  readonly failed: readonly ClassifiedCheck[];
  readonly pending: readonly ClassifiedCheck[];
  readonly passed: readonly ClassifiedCheck[];
  /** Required patterns with no matching check in the rollup. */
  readonly missingRequired: readonly string[];
}

/**
 * Evaluate classified checks against optional required patterns.
 * - any failed → red
 * - any pending, or a required check not (yet) present → pending
 * - otherwise green (including "no checks at all" when nothing is required)
 */
export function evaluateCheckGate(
  checks: readonly ClassifiedCheck[],
  requiredChecks: readonly string[] = [],
): CheckGateResult {
  const failed = checks.filter((c) => c.verdict === "failed");
  const pending = checks.filter((c) => c.verdict === "pending");
  const passed = checks.filter((c) => c.verdict === "passed");
  const missingRequired = requiredChecks
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
    .filter((p) => !checks.some((c) => checkNameMatches(c.name, p)));

  let state: CheckGateState = "green";
  if (failed.length > 0) state = "red";
  else if (pending.length > 0 || missingRequired.length > 0) state = "pending";

  return { state, failed, pending, passed, missingRequired };
}

function describe(c: ClassifiedCheck): string {
  return `"${c.name}" (${c.detail})`;
}

/** Human-readable lines for a refused merge. */
export function formatCheckGateProblems(gate: CheckGateResult): string[] {
  const lines: string[] = [];
  if (gate.failed.length > 0) {
    lines.push(`failed checks: ${gate.failed.map(describe).join(", ")}`);
  }
  if (gate.pending.length > 0) {
    lines.push(`checks still pending: ${gate.pending.map(describe).join(", ")}`);
  }
  for (const p of gate.missingRequired) {
    lines.push(`required check "${p}" never ran`);
  }
  return lines;
}
