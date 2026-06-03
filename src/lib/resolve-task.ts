import type { ProjectPaths } from "./paths.js";
import {
  findTaskFile,
  loadActionableTasks,
  pickActiveTask,
  pickInProgressTask,
} from "./task.js";

export interface ResolvedTask {
  readonly taskId: string;
  readonly taskFile: string;
}

export function normalizeTaskRef(ref: string): string {
  const t = ref.trim();
  if (/^task-/i.test(t) && !/^TASK-/i.test(t)) {
    return `TASK-${t.replace(/^task-/i, "")}`;
  }
  return t.toUpperCase().startsWith("TASK-") ? t.toUpperCase() : `TASK-${t}`;
}

export async function resolveTask(
  paths: ProjectPaths,
  cwd: string,
  taskRef: string | undefined,
): Promise<ResolvedTask | null> {
  const trimmed = taskRef?.trim();
  if (trimmed !== undefined && trimmed.length > 0) {
    const taskId = normalizeTaskRef(trimmed);
    const taskFile = await findTaskFile(paths.docsTasks, taskId);
    if (taskFile === null) return null;
    return { taskId, taskFile };
  }

  const tasks = await loadActionableTasks(paths.docsTasks);
  const inProgress = pickInProgressTask(tasks);
  if (inProgress !== null) {
    return { taskId: inProgress.id, taskFile: inProgress.filePath };
  }

  const onBranch = await pickActiveTask(paths.docsTasks, cwd);
  if (onBranch !== null && onBranch.status !== "done") {
    return { taskId: onBranch.id, taskFile: onBranch.filePath };
  }

  return null;
}

export function taskNotFoundMessage(taskRef: string | undefined): string {
  if (taskRef?.trim()) {
    return `TASK not found: ${normalizeTaskRef(taskRef)}. Check docs/tasks/.`;
  }
  return "No open TASK found. Run `vibeops task add` or pass `vibeops task ship TASK-NNN`.";
}
