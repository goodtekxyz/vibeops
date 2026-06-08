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
  | "task-reship"
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
    if (input.hasLocalChanges && input.onTaskBranch === true) return "task-reship";
    return "task-add";
  }
  if (!input.resultFilled || !input.testFilled) {
    return input.onTaskBranch === true ? "cursor-implement" : "cursor-plan";
  }
  return input.hasMergeRequest ? "task-merge" : "task-ship";
}

export function hintToText(hint: NextHint, cwd: string, task: TaskMeta | null): string {
  switch (hint) {
    case "init":
      return "Run `vibeops init` in this directory.";
    case "task-add":
      return "Run `vibeops task add` to start the next slice.";
    case "task-ship":
      return task ? `Run \`vibeops task ship ${task.id}\`.` : "Run `vibeops task ship`.";
    case "task-reship":
      return task
        ? `Follow-up on ${task.id}? Edit on task branch, then \`vibeops task reship ${task.id}\`.`
        : "Run `vibeops task reship TASK-NNN` for a Shipped follow-up.";
    case "task-merge":
      return task
        ? `Merge the MR (UI or \`vibeops task merge ${task.id}\`), then optional task sync.`
        : "Merge the MR on the host or with `vibeops task merge`.";
    case "task-sync":
      return task
        ? `Run \`vibeops task sync ${task.id}\` to delete task branches, then task add.`
        : "Run `vibeops task sync` to delete task branches after merge.";
    case "cursor-plan":
      return task
        ? `In Cursor Ask: @${relPath(cwd, task.filePath)} — refine Scope / AC.`
        : "Open the TASK file in Cursor Ask.";
    case "cursor-implement":
      return task
        ? `In Cursor Agent: @${relPath(cwd, task.filePath)} — implement, then task ship.`
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

export { isMergeRequestMerged, taskNeedsSync };
