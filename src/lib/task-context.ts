import { relative } from "node:path";

import { gitBranchExists, readGitInfo } from "./git.js";
import type { ProjectPaths } from "./paths.js";
import { readGitContext } from "./task.js";
import type { TaskMeta } from "../types/task.js";
import {
  isOnTaskBranch,
  loadActionableTasks,
  pickActiveTask,
  pickInProgressTask,
} from "./task.js";

/** TASK that blocks `task add` — in progress or open on current task branch. */
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
      if (t.status === "done") continue;
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
  return pickActiveTask(paths.docsTasks, cwd);
}

export function relPath(cwd: string, filePath: string): string {
  const r = relative(cwd, filePath).replace(/\\/g, "/");
  return r.startsWith("..") ? filePath : r;
}

export type NextHint =
  | "task-add"
  | "task-done"
  | "cursor-plan"
  | "cursor-implement"
  | "init";

export function computeNextHint(input: {
  readonly isVibeopsProject: boolean;
  readonly focus: TaskMeta | null;
  readonly resultFilled: boolean;
  readonly testFilled: boolean;
  readonly onTaskBranch: boolean | null;
}): NextHint {
  if (!input.isVibeopsProject) return "init";
  if (input.focus === null) return "task-add";
  if (input.focus.status === "done") return "task-add";
  if (!input.resultFilled || !input.testFilled) {
    return input.onTaskBranch === true ? "cursor-implement" : "cursor-plan";
  }
  return "task-done";
}

export function hintToText(hint: NextHint, cwd: string, task: TaskMeta | null): string {
  switch (hint) {
    case "init":
      return "Run `vibeops init` in this directory.";
    case "task-add":
      return "Run `vibeops task add` to start the next slice.";
    case "task-done":
      return task ? `Run \`vibeops task done ${task.id}\`.` : "Run `vibeops task done`.";
    case "cursor-plan":
      return task
        ? `In Cursor Ask: @${relPath(cwd, task.filePath)} — refine Scope / AC.`
        : "Open the TASK file in Cursor Ask.";
    case "cursor-implement":
      return task
        ? `In Cursor Agent: @${relPath(cwd, task.filePath)} — implement, then task done.`
        : "Implement per the TASK file in Cursor.";
  }
}

export async function listInProgressTasks(paths: ProjectPaths): Promise<TaskMeta[]> {
  return (await loadActionableTasks(paths.docsTasks)).filter((t) => t.status === "in_progress");
}

export async function taskBranchExistsFor(cwd: string, task: TaskMeta): Promise<boolean> {
  const ctx = await readGitContext(task.filePath);
  if (ctx === null) return false;
  return gitBranchExists(cwd, ctx.taskBranch);
}
