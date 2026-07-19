/** TASK markdown lifecycle — only two states (merge/sync are Git-only). */
export type TaskStatus = "in_progress" | "shipped";

export interface TaskMeta {
  id: string;
  title: string;
  status: TaskStatus;
  mvpPhase?: string;
  priority?: string;
  filePath: string;
}

export interface TaskCounts {
  total: number;
  in_progress: number;
  shipped: number;
}

export interface AgentMeta {
  name: string;
  role: string;
  description?: string;
  filePath: string;
}

export interface GitContext {
  baseBranch: string;
  baseCommit: string;
  taskBranch: string;
  startedAt: string;
  /** Optional timestamp when the slice finished (legacy `Done At` in TASK md). */
  doneAt?: string;
  /**
   * Legacy: MR/PR URL stored in TASK md (pre-2.1.3).
   * Since 2.1.3 the host resolves open PRs by `(taskBranch, baseBranch)`; ship does not write this.
   */
  mergeRequestUrl?: string;
  /** Prior MR/PR URLs archived when starting a new PR cycle after merge. */
  previousMergeRequestUrls?: readonly string[];
  /** Legacy push timestamp in TASK md (pre-2.1.3). */
  pushedAt?: string;
  /** ISO timestamp of the latest new-PR-cycle follow-up. */
  lastReshipAt?: string;
  /** Number of new-PR-cycle follow-ups (excluding initial ship). */
  reshipCount?: number;
}
