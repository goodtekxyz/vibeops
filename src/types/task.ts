export type TaskStatus = "planned" | "in_progress" | "review" | "blocked" | "done";

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
  planned: number;
  in_progress: number;
  review: number;
  blocked: number;
  done: number;
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
  /** Set by `task sync` when the slice is closed on the integration branch. */
  doneAt?: string;
  /** Set by `task ship` after push + MR/PR creation. */
  mergeRequestUrl?: string;
  /** Set by `task ship` after push. */
  pushedAt?: string;
}
