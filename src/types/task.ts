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
  /** Set by `task ship` after push + MR/PR creation. */
  mergeRequestUrl?: string;
  /** Set by `task ship` after push. */
  pushedAt?: string;
}
