export type TaskStatus = "planned" | "in_progress" | "blocked" | "done";

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
  blocked: number;
  done: number;
}

export interface AgentMeta {
  name: string;
  role: string;
  description?: string;
  filePath: string;
}
