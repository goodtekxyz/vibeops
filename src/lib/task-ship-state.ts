import { prNumberFromUrl } from "./pr-create.js";
import { resolveTaskMergeRequestLifecycle } from "./task-effective-status.js";

/** PR/MR lifecycle relevant to the `ship` state machine. */
export type ShipPrState = "none" | "open" | "merged" | "closed";

export interface ShipPrContext {
  readonly state: ShipPrState;
  readonly url: string | null;
  readonly number: string | null;
}

/**
 * Single entry point for `ship` to learn the current PR/MR state of a TASK.
 * Wraps {@link resolveTaskMergeRequestLifecycle} and extracts the PR number.
 */
export async function detectShipPrState(
  cwd: string,
  taskFile: string,
): Promise<ShipPrContext> {
  const lifecycle = await resolveTaskMergeRequestLifecycle(cwd, taskFile);
  const state: ShipPrState =
    lifecycle.state === "open"
      ? "open"
      : lifecycle.state === "merged"
        ? "merged"
        : lifecycle.state === "closed"
          ? "closed"
          : "none";
  return {
    state,
    url: lifecycle.url,
    number: prNumberFromUrl(lifecycle.url),
  };
}

export type ShipAction = "first" | "update-open" | "new-cycle" | "mismatch";

/**
 * Map (PR state, TASK status) → the `ship` action. Pure so it is unit-testable.
 * - open PR            → update the existing PR (state 2)
 * - merged PR          → start a new PR cycle (state 3, guarded)
 * - no/closed PR + In Progress → first submit (state 1)
 * - no/closed PR + Shipped     → status/PR mismatch (resync hint)
 */
export function resolveShipAction(
  prState: ShipPrState,
  taskStatus: "in_progress" | "shipped",
): ShipAction {
  if (prState === "open") return "update-open";
  if (prState === "merged") return "new-cycle";
  return taskStatus === "shipped" ? "mismatch" : "first";
}

/** Format the PR reference for output (`#42` or `the PR`). */
export function prRefLabel(prNumber: string | null): string {
  return prNumber !== null ? `#${prNumber}` : "the PR";
}
