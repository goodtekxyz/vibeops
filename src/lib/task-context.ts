import { relative } from "node:path";

import { gitBranchExists, readGitInfo } from "./git.js";
import type { ProjectPaths } from "./paths.js";
import { isMergeRequestMerged, taskNeedsSync } from "./task-effective-status.js";
import { readGitContext } from "./task.js";
import type { TaskMeta } from "../types/task.js";
import {
  isOnTaskBranch,
  loadActionableTasks,
  pickActiveTask,
  pickInProgressTask,
} from "./task.js";

/** Only **In Progress** blocks the next `task add`. */
export async function findBlockingTask(
  paths: ProjectPaths,
  cwd: string,
): Promise<TaskMeta | null> {
  const tasks = await loadActionableTasks(paths.docsTasks);
  const inProgress = pickInProgressTask(tasks);
  if (inProgress !== null) return inProgress;

  const git = await readGitInfo(cwd);
  if (git.isRepo && typeof git.branch === "string" && git.branch.startsWith("task/")) {
    for (const t of tasks) {
      if (t.status !== "in_progress") continue;
      const ctx = await readGitContext(t.filePath);
      if (isOnTaskBranch(git.branch, ctx)) return t;
    }
  }
  return null;
}

export async function pickFocusTask(
  paths: ProjectPaths,
  cwd: string,
): Promise<TaskMeta | null> {
  const active = await pickActiveTask(paths.docsTasks, cwd);
  if (active !== null) return active;

  const shipped = (await loadActionableTasks(paths.docsTasks))
    .filter((t) => t.status === "shipped")
    .sort((a, b) => {
      const na = Number.parseInt(/^TASK-(\d+)$/i.exec(a.id)?.[1] ?? "0", 10);
      const nb = Number.parseInt(/^TASK-(\d+)$/i.exec(b.id)?.[1] ?? "0", 10);
      return nb - na;
    });
  return shipped[0] ?? null;
}

export function relPath(cwd: string, filePath: string): string {
  const r = relative(cwd, filePath).replace(/\\/g, "/");
  return r.startsWith("..") ? filePath : r;
}

export type NextHint =
  | "task-add"
  | "task-ship"
  | "task-ship-followup"
  | "task-merge"
  | "task-sync"
  | "cursor-plan"
  | "cursor-implement"
  | "init";

export function computeNextHint(input: {
  readonly isVibeopsProject: boolean;
  readonly focus: TaskMeta | null;
  readonly resultFilled: boolean;
  readonly testFilled: boolean;
  readonly onTaskBranch: boolean | null;
  readonly hasMergeRequest: boolean;
  readonly mergeRequestMerged: boolean;
  readonly needsSync: boolean;
  readonly hasLocalChanges: boolean;
}): NextHint {
  if (!input.isVibeopsProject) return "init";
  if (input.focus === null) return "task-add";
  if (input.focus.status === "shipped") {
    if (input.needsSync) return "task-sync";
    if (input.hasMergeRequest && !input.mergeRequestMerged) return "task-merge";
    if (input.hasLocalChanges) return "task-ship-followup";
    return "task-add";
  }
  if (!input.resultFilled || !input.testFilled) {
    return input.onTaskBranch === true ? "cursor-implement" : "cursor-plan";
  }
  return input.hasMergeRequest ? "task-merge" : "task-ship";
}

/** Multi-line NEXT block lines (without the leading arrow prefix). */
export function hintToLines(
  hint: NextHint,
  cwd: string,
  task: TaskMeta | null,
): readonly string[] {
  switch (hint) {
    case "init":
      return ["vibeops init"];
    case "task-add":
      return ["vibeops task add"];
    case "task-ship":
      return [task ? `vibeops task ship ${task.id}` : "vibeops task ship"];
    case "task-ship-followup":
      return task
        ? [
            `Follow up on ${task.id} (after merge: confirm or --new-cycle)`,
            `vibeops task ship ${task.id}`,
          ]
        : ["vibeops task ship --new-cycle"];
    case "task-merge":
      return task
        ? [`vibeops task merge ${task.id}`, "(or merge in the host UI)"]
        : ["vibeops task merge"];
    case "task-sync":
      return task
        ? [`vibeops task sync ${task.id}`, "then: vibeops task add"]
        : ["vibeops task sync"];
    case "cursor-plan":
      return task
        ? [
            `Cursor Ask: @${relPath(cwd, task.filePath)} — refine Scope / AC`,
          ]
        : ["Open the TASK file in Cursor Ask"];
    case "cursor-implement":
      return task
        ? [
            `Cursor Agent: @${relPath(cwd, task.filePath)} — implement`,
            `then: vibeops task ship ${task.id}`,
          ]
        : ["Implement per the TASK file, then vibeops task ship"];
  }
}

export function hintToText(hint: NextHint, cwd: string, task: TaskMeta | null): string {
  return hintToLines(hint, cwd, task).join(" · ");
}

export async function listInProgressTasks(paths: ProjectPaths): Promise<TaskMeta[]> {
  return (await loadActionableTasks(paths.docsTasks)).filter((t) => t.status === "in_progress");
}

export async function taskBranchExistsFor(cwd: string, task: TaskMeta): Promise<boolean> {
  const ctx = await readGitContext(task.filePath);
  if (ctx === null) return false;
  return gitBranchExists(cwd, ctx.taskBranch);
}

export { isMergeRequestMerged, taskNeedsSync };
