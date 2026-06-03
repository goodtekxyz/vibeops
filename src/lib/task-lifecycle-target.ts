import type { ProjectPaths } from "./paths.js";
import { readGitInfo } from "./git.js";
import {
  isOnTaskBranch,
  loadActionableTasks,
  pickLatestShippedTask,
  readGitContext,
} from "./task.js";
import { resolveTask } from "./resolve-task.js";

export interface LifecycleTarget {
  readonly taskId: string;
  readonly taskBranch: string;
  readonly taskFile: string;
}

/** Resolve TASK + task branch for ship / merge / sync. */
export async function resolveLifecycleTarget(
  paths: ProjectPaths,
  cwd: string,
  taskRef: string | undefined,
): Promise<LifecycleTarget | null> {
  const trimmed = taskRef?.trim();
  if (trimmed !== undefined && trimmed.length > 0) {
    const resolved = await resolveTask(paths, cwd, trimmed);
    if (resolved === null) return null;
    const ctx = await readGitContext(resolved.taskFile);
    if (ctx === null) return null;
    return {
      taskId: resolved.taskId,
      taskBranch: ctx.taskBranch,
      taskFile: resolved.taskFile,
    };
  }

  const git = await readGitInfo(cwd);
  if (git.isRepo && typeof git.branch === "string" && git.branch.startsWith("task/")) {
    const tasks = await loadActionableTasks(paths.docsTasks);
    for (const t of tasks) {
      const ctx = await readGitContext(t.filePath);
      if (isOnTaskBranch(git.branch, ctx)) {
        return { taskId: t.id, taskBranch: git.branch, taskFile: t.filePath };
      }
    }
  }

  const shipped = pickLatestShippedTask(await loadActionableTasks(paths.docsTasks));
  if (shipped === null) return null;
  const ctx = await readGitContext(shipped.filePath);
  if (ctx === null) return null;
  return {
    taskId: shipped.id,
    taskBranch: ctx.taskBranch,
    taskFile: shipped.filePath,
  };
}
