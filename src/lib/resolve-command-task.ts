import { findMvpTaskFile } from "./mvp-artifacts.js";
import { TASK_MVP_ID, resolveTaskRef } from "./mvp-constants.js";
import type { ProjectPaths } from "./paths.js";
import { findTaskFile, pickActiveTask, readTaskFile } from "./task.js";

export type CommandTaskSource = "explicit" | "mvp-default" | "backlog-active";

export interface ResolvedCommandTask {
  readonly taskId: string;
  readonly taskFile: string;
  readonly source: CommandTaskSource;
}

/**
 * Resolve which TASK file `start` / `done` / `rollback` target.
 * Default (no ref): TASK-mvp if present, else active/next backlog TASK (legacy projects).
 */
export async function resolveCommandTask(
  paths: ProjectPaths,
  cwd: string,
  taskRef: string | undefined,
): Promise<ResolvedCommandTask | null> {
  const trimmed = taskRef?.trim();
  if (trimmed !== undefined && trimmed.length > 0) {
    const taskId = resolveTaskRef(trimmed);
    const taskFile = await findTaskFile(paths.docsTasks, taskId);
    if (taskFile === null) return null;
    return { taskId, taskFile, source: "explicit" };
  }

  const mvpFile = await findMvpTaskFile(paths.docsTasks);
  if (mvpFile !== null) {
    const meta = await readTaskFile(mvpFile);
    return { taskId: meta.id, taskFile: mvpFile, source: "mvp-default" };
  }

  const active = await pickActiveTask(paths.docsTasks, cwd);
  if (active !== null) {
    return {
      taskId: active.id,
      taskFile: active.filePath,
      source: "backlog-active",
    };
  }

  return null;
}

export function commandTaskNotFoundMessage(taskRef: string | undefined): string {
  const trimmed = taskRef?.trim();
  if (trimmed !== undefined && trimmed.length > 0) {
    const id = resolveTaskRef(trimmed);
    return `TASK not found: ${id}. Check docs/tasks/ or the TASK id.`;
  }
  return (
    `No TASK found (no ${TASK_MVP_ID} — run ${"vibeops plan"} for a new MVP slice, ` +
    `or add docs/tasks/TASK-NNN-*.md and run vibeops start TASK-NNN).`
  );
}
