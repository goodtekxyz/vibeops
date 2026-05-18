import { basename, join } from "node:path";

import { pathExists } from "./filesystem.js";
import { readText } from "./filesystem.js";
import { gitBranchExists, gitGovernanceOnlyDirty, readGitInfo } from "./git.js";
import { findMvpTaskFile } from "./mvp-artifacts.js";
import {
  MVP_BUILD_PROMPT_REL,
  NEXT_TASK_SUGGESTION_REL,
} from "./mvp-constants.js";
import { LAST_DONE_SUMMARY_REL } from "./mvp-done-summary.js";
import type { ProjectPaths } from "./paths.js";
import { cursorImplementPromptRel } from "./cursor-task-prompt.js";
import {
  branchNameForTaskFile,
  hasNonEmptySection,
  isMvpTaskId,
  isOnTaskBranch,
  loadActionableTasks,
  pickActiveTask,
  pickLatestDoneTask,
  readGitContext,
  readTaskFile,
} from "./task.js";
import type { VibeopsConfig } from "../types/config.js";
import type { TaskMeta } from "../types/task.js";

export type GuideStepId =
  | "no-mvp"
  | "continue-iteration"
  | "prepare-start"
  | "start"
  | "checkout-task"
  | "implement"
  | "commit"
  | "finish"
  | "all-done"
  | "notion-sync";

/** How the guide resolved the active TASK (MVP file vs backlog vs post-MVP). */
export type GuideMode = "mvp" | "backlog" | "greenfield" | "post-mvp";

export interface GuideStep {
  readonly id: GuideStepId;
  readonly taskId: string | null;
  readonly title: string;
  readonly youDo: readonly string[];
  readonly vibeopsCommand: string | null;
  readonly shellHints: readonly string[];
  readonly runnable: boolean;
}

export interface GuideContext {
  readonly cwd: string;
  readonly paths: ProjectPaths;
  readonly config: VibeopsConfig | null;
  readonly mode: GuideMode;
  readonly task: TaskMeta | null;
  /** Last finished TASK when mode is post-mvp (for display only). */
  readonly referenceTask: TaskMeta | null;
  readonly step: GuideStep;
  readonly gitBranch: string | null;
  readonly gitDirty: boolean | null;
}

export interface ResolvedGuideTask {
  readonly mode: GuideMode;
  readonly task: TaskMeta | null;
  readonly referenceTask: TaskMeta | null;
}

export async function resolveMvpTask(paths: ProjectPaths): Promise<TaskMeta | null> {
  const file = await findMvpTaskFile(paths.docsTasks);
  if (file === null) return null;
  return readTaskFile(file);
}

export async function resolveGuideTask(
  paths: ProjectPaths,
  cwd: string,
): Promise<ResolvedGuideTask> {
  const mvpFile = await findMvpTaskFile(paths.docsTasks);
  if (mvpFile !== null) {
    return {
      mode: "mvp",
      task: await readTaskFile(mvpFile),
      referenceTask: null,
    };
  }

  const actionable = await loadActionableTasks(paths.docsTasks);
  const next = await pickActiveTask(paths.docsTasks, cwd);
  if (next !== null) {
    return { mode: "backlog", task: next, referenceTask: null };
  }

  const referenceTask = pickLatestDoneTask(actionable);
  if (actionable.length > 0 && actionable.every((t) => t.status === "done")) {
    return { mode: "post-mvp", task: null, referenceTask };
  }

  if (referenceTask !== null || (await hasPostMvpArtifacts(cwd))) {
    return { mode: "post-mvp", task: null, referenceTask };
  }

  return { mode: "greenfield", task: null, referenceTask: null };
}

async function hasPostMvpArtifacts(cwd: string): Promise<boolean> {
  return (
    (await pathExists(join(cwd, LAST_DONE_SUMMARY_REL))) ||
    (await pathExists(join(cwd, NEXT_TASK_SUGGESTION_REL)))
  );
}

export async function inferGuideStep(inputs: {
  readonly cwd: string;
  readonly paths: ProjectPaths;
  readonly config: VibeopsConfig | null;
  readonly forceStepId?: GuideStepId;
}): Promise<GuideContext> {
  const { cwd, paths, config } = inputs;
  const git = await readGitInfo(cwd);
  const resolved = await resolveGuideTask(paths, cwd);

  if (resolved.mode === "greenfield") {
    return {
      cwd,
      paths,
      config,
      mode: "greenfield",
      task: null,
      referenceTask: null,
      gitBranch: git.branch,
      gitDirty: git.dirty,
      step: buildStep("no-mvp", {
        mode: "greenfield",
        task: null,
        referenceTask: null,
        body: "",
        gitCtx: null,
        git,
        hasSuggestion: false,
      }),
    };
  }

  if (resolved.mode === "post-mvp") {
    const hasSuggestion = await pathExists(join(cwd, NEXT_TASK_SUGGESTION_REL));
    return {
      cwd,
      paths,
      config,
      mode: "post-mvp",
      task: null,
      referenceTask: resolved.referenceTask,
      gitBranch: git.branch,
      gitDirty: git.dirty,
      step:
        inputs.forceStepId !== undefined
          ? buildStep(inputs.forceStepId, {
              mode: "post-mvp",
              task: null,
              referenceTask: resolved.referenceTask,
              body: "",
              gitCtx: null,
              git,
              hasSuggestion,
            })
          : buildStep("continue-iteration", {
              mode: "post-mvp",
              task: null,
              referenceTask: resolved.referenceTask,
              body: "",
              gitCtx: null,
              git,
              hasSuggestion,
            }),
    };
  }

  const task = resolved.task!;
  const body = await readText(task.filePath);
  const gitCtx = await readGitContext(task.filePath);
  const taskBranch = branchNameForTaskFile(task.filePath);
  const branchExists = await gitBranchExists(cwd, taskBranch);
  const hasSuggestion = await pathExists(join(cwd, NEXT_TASK_SUGGESTION_REL));
  const step =
    inputs.forceStepId !== undefined
      ? buildStep(inputs.forceStepId, {
          mode: resolved.mode,
          task,
          referenceTask: null,
          body,
          gitCtx,
          git,
          hasSuggestion,
          taskBranch,
          branchExists,
        })
      : await inferStep({
          cwd,
          mode: resolved.mode,
          task,
          body,
          gitCtx,
          git,
          hasSuggestion,
          taskBranch,
          branchExists,
        });

  return {
    cwd,
    paths,
    config,
    mode: resolved.mode,
    task,
    referenceTask: null,
    gitBranch: git.branch,
    gitDirty: git.dirty,
    step,
  };
}

/** Next guide step when the current one is manual (user chose Next). */
export function successorStepId(
  current: GuideStepId,
  ctx: { readonly body: string; readonly gitDirty: boolean | null },
): GuideStepId | null {
  const resultOk = hasNonEmptySection(ctx.body, "Result");
  const testOk = hasNonEmptySection(ctx.body, "Test Result");
  switch (current) {
    case "implement":
      if (resultOk && testOk) return "finish";
      if (ctx.gitDirty === true) return "commit";
      return null;
    case "commit":
      return "finish";
    default:
      return null;
  }
}

async function inferStep(ctx: {
  readonly cwd: string;
  readonly mode: GuideMode;
  readonly task: TaskMeta;
  readonly body: string;
  readonly gitCtx: Awaited<ReturnType<typeof readGitContext>>;
  readonly git: Awaited<ReturnType<typeof readGitInfo>>;
  readonly hasSuggestion: boolean;
  readonly taskBranch: string;
  readonly branchExists: boolean;
}): Promise<GuideStep> {
  const { mode, task, body, gitCtx, git, hasSuggestion, taskBranch, branchExists } = ctx;
  const resultOk = hasNonEmptySection(body, "Result");
  const testOk = hasNonEmptySection(body, "Test Result");
  const onTaskBranch = git.branch === taskBranch;

  if (branchExists && !onTaskBranch) {
    return buildStep("checkout-task", {
      mode,
      task,
      referenceTask: null,
      body,
      gitCtx,
      git,
      hasSuggestion,
      taskBranch,
      branchExists,
    });
  }

  if (task.status === "done") {
    if (mode === "mvp") {
      return buildStep("all-done", { mode, task, referenceTask: null, body, gitCtx, git, hasSuggestion });
    }
    if (isOnTaskBranch(git.branch, gitCtx)) {
      return buildStep("finish", { mode, task, referenceTask: null, body, gitCtx, git, hasSuggestion });
    }
    return buildStep("continue-iteration", {
      mode: "post-mvp",
      task,
      referenceTask: task,
      body,
      gitCtx,
      git,
      hasSuggestion,
    });
  }

  if ((!gitCtx || task.status === "planned") && !branchExists) {
    if (git.dirty === true) {
      const gov = await gitGovernanceOnlyDirty(ctx.cwd);
      if (!gov.onlyGovernance) {
        return buildStep("prepare-start", {
          mode,
          task,
          referenceTask: null,
          body,
          gitCtx,
          git,
          hasSuggestion,
          taskBranch,
          branchExists,
        });
      }
    }
    return buildStep("start", {
      mode,
      task,
      referenceTask: null,
      body,
      gitCtx,
      git,
      hasSuggestion,
      taskBranch,
      branchExists,
    });
  }

  if (!resultOk || !testOk) {
    return buildStep("implement", { mode, task, referenceTask: null, body, gitCtx, git, hasSuggestion });
  }

  if (git.dirty === true) {
    const gov = await gitGovernanceOnlyDirty(ctx.cwd);
    if (!gov.onlyGovernance) {
      return buildStep("commit", {
        mode,
        task,
        referenceTask: null,
        body,
        gitCtx,
        git,
        hasSuggestion,
        taskBranch,
        branchExists,
      });
    }
  }

  return buildStep("finish", { mode, task, referenceTask: null, body, gitCtx, git, hasSuggestion });
}

function buildStep(
  stepId: GuideStepId,
  ctx: {
    readonly mode: GuideMode;
    readonly task: TaskMeta | null;
    readonly referenceTask: TaskMeta | null;
    readonly body: string;
    readonly gitCtx: Awaited<ReturnType<typeof readGitContext>>;
    readonly git: Awaited<ReturnType<typeof readGitInfo>>;
    readonly hasSuggestion: boolean;
    readonly taskBranch?: string;
    readonly branchExists?: boolean;
  },
): GuideStep {
  const { task, referenceTask, gitCtx, git, hasSuggestion } = ctx;
  const id = task?.id ?? referenceTask?.id ?? null;
  const isMvp = id !== null && isMvpTaskId(id);

  switch (stepId) {
    case "no-mvp":
      return {
        id: "no-mvp",
        taskId: null,
        title: "No TASK yet",
        youDo: ["Run planning to create TASK-mvp and the build prompt."],
        vibeopsCommand: "vibeops plan",
        shellHints: ['vibeops plan --idea "Your product idea"'],
        runnable: false,
      };
    case "continue-iteration": {
      const ref = referenceTask ?? task;
      const lines: string[] = [];
      if (ref) {
        lines.push(`Last finished: ${ref.id}${ref.title ? ` — ${ref.title}` : ""}.`);
      } else {
        lines.push("MVP / backlog work is complete on this project.");
      }
      lines.push(`Read ${LAST_DONE_SUMMARY_REL} for what shipped (if present).`);
      if (hasSuggestion) {
        lines.push(`Review ${NEXT_TASK_SUGGESTION_REL} from the last vibeops done.`);
      }
      lines.push(
        "Plan the next slice — prior summary is injected into TASK-mvp + mvp-build.md.",
      );
      const shellHints = ['vibeops plan --idea "Next feature or slice"'];
      if (hasSuggestion) {
        shellHints.push(`cat ${NEXT_TASK_SUGGESTION_REL}`);
      }
      return {
        id: "continue-iteration",
        taskId: ref?.id ?? null,
        title: "Continue after MVP",
        youDo: lines,
        vibeopsCommand: "vibeops plan",
        shellHints,
        runnable: false,
      };
    }
    case "prepare-start":
      return {
        id: "prepare-start",
        taskId: id,
        title: `Prepare git before ${id}`,
        youDo: [
          git.branch
            ? `On ${git.branch} with uncommitted project files (not just .vibeops/).`
            : "Uncommitted project files on the working tree.",
          "Commit or stash them before `vibeops start` creates a task branch.",
          "If this is TASK-009 (Next.js scaffold), finish with `vibeops done TASK-009` or commit that work first.",
          `Optional: vibeops start ${id} --allow-dirty (carries current changes into the new task branch).`,
        ].filter((l) => l.length > 0),
        vibeopsCommand: null,
        shellHints: [
          "git status",
          'git stash push -u -m "wip before task branch"',
          `vibeops start ${id} --allow-dirty`,
        ],
        runnable: false,
      };
    case "start":
      return {
        id: "start",
        taskId: id,
        title: isMvp ? "Start MVP branch" : `Start ${id}`,
        youDo: isMvp
          ? ["Creates task/mvp-* branch and Git Context."]
          : [`Creates task branch and Git Context for ${id}.`],
        vibeopsCommand: isMvp ? "vibeops start" : `vibeops start ${id}`,
        shellHints: [],
        runnable: true,
      };
    case "checkout-task": {
      const branch = ctx.taskBranch ?? gitCtx?.taskBranch ?? "task/…";
      return {
        id: "checkout-task",
        taskId: id,
        title: `Resume ${id} branch`,
        youDo: [
          git.branch ? `Current branch: ${git.branch}` : "",
          `Switch: git switch ${branch} (or: vibeops start ${id})`,
          "Does not recreate the branch if it already exists.",
        ].filter((l) => l.length > 0),
        vibeopsCommand: isMvp ? "vibeops start" : `vibeops start ${id}`,
        shellHints: [`git switch ${branch}`],
        runnable: true,
      };
    }
    case "implement": {
      const branchNote =
        gitCtx && git.branch && git.branch !== gitCtx.taskBranch
          ? `On ${git.branch} — switch: git switch ${gitCtx.taskBranch}`
          : gitCtx
            ? `Branch: ${gitCtx.taskBranch}`
            : "";
      const taskFile = task ? basename(task.filePath) : "TASK file";
      const fillResult = !hasNonEmptySection(ctx.body, "Result");
      const fillTestResult = !hasNonEmptySection(ctx.body, "Test Result");
      const needsCursorPrompt = fillResult || fillTestResult;
      const promptRel = task && needsCursorPrompt ? cursorImplementPromptRel(task.id) : null;

      const implementLines = isMvp
        ? [
            branchNote,
            `Drag ${MVP_BUILD_PROMPT_REL} into a new chat.`,
            ...(needsCursorPrompt && promptRel
              ? [
                  `Result / Test Result empty — in Cursor: @${promptRel} (see ${promptRel}).`,
                ]
              : ["Meet Acceptance Criteria; fill Result and Test Result."]),
          ]
        : [
            branchNote,
            `Open docs/tasks/${taskFile} in Cursor.`,
            ...(needsCursorPrompt && promptRel
              ? [
                  `Result / Test Result empty — in Cursor: @${promptRel} or paste the prompt from that file.`,
                ]
              : ["Meet Acceptance Criteria; fill Result and Test Result."]),
          ];
      return {
        id: "implement",
        taskId: id,
        title: isMvp ? "Build MVP in Cursor" : `Implement ${id}`,
        youDo: implementLines.filter((l) => l.length > 0),
        vibeopsCommand: null,
        shellHints: promptRel ? [`cat ${promptRel}`] : [],
        runnable: false,
      };
    }
    case "commit": {
      const doneCmd = isMvp ? "vibeops done" : `vibeops done ${id}`;
      return {
        id: "commit",
        taskId: id,
        title: "Commit work on task branch",
        youDo: [
          "Commit task files (docs/, src/) — not node_modules or .next.",
          `Or run ${doneCmd} to commit safe paths and merge.`,
        ],
        vibeopsCommand: null,
        shellHints: [
          "git status",
          "git add docs/ src/ …",
          `git commit -m "feat(${id?.toLowerCase() ?? "task"}): <summary>"`,
          doneCmd,
        ],
        runnable: false,
      };
    }
    case "finish": {
      const markedDone = task?.status === "done";
      return {
        id: "finish",
        taskId: id,
        title: isMvp
          ? "Finish MVP (merge)"
          : markedDone
            ? `Close out ${id} (merge & sync)`
            : `Finish ${id}`,
        youDo: markedDone
          ? [
              "TASK file already says Done — still on the task branch.",
              "Run done to commit if needed, merge to base branch, delete task branch.",
              "Runs Notion sync when enabled.",
            ]
          : [
              "Requires Result and Test Result.",
              isMvp
                ? "Marks Done, commits if needed, merges to main, deletes task branch."
                : "Marks Done, commits if needed, merges to main when on the task branch.",
              "Runs Notion sync when enabled; offers post-MVP cleanup if the tree is still dirty.",
            ],
        vibeopsCommand: isMvp ? "vibeops done" : `vibeops done ${id}`,
        shellHints: [],
        runnable: true,
      };
    }
    case "notion-sync":
      return {
        id: "notion-sync",
        taskId: id,
        title: "Sync Notion metadata",
        youDo: ["Optional — pushes project + TASK metadata to Notion."],
        vibeopsCommand: "vibeops notion sync",
        shellHints: ["vibeops notion sync --dry-run"],
        runnable: true,
      };
    case "all-done":
      return {
        id: "all-done",
        taskId: id,
        title: "MVP complete",
        youDo: [
          `Read ${LAST_DONE_SUMMARY_REL} for what shipped.`,
          "Update docs/project/05-current-state.md if the project stage changed.",
          "Next iteration: vibeops plan (prior summary is injected into TASK + mvp-build.md).",
        ],
        vibeopsCommand: "vibeops plan",
        shellHints: hasSuggestion ? [`cat ${NEXT_TASK_SUGGESTION_REL}`] : [],
        runnable: false,
      };
  }
}

/** Higher = later in the TASK workflow (used to keep manual Next advances). */
export function guideStepRank(stepId: GuideStepId): number {
  switch (stepId) {
    case "no-mvp":
    case "continue-iteration":
      return 0;
    case "prepare-start":
      return 5;
    case "start":
    case "checkout-task":
      return 10;
    case "implement":
      return 20;
    case "commit":
      return 30;
    case "finish":
    case "notion-sync":
      return 40;
    case "all-done":
      return 50;
    default:
      return 0;
  }
}

export function followUpStepId(completed: GuideStepId): GuideStepId | null {
  switch (completed) {
    case "start":
    case "checkout-task":
      return "implement";
    case "commit":
      return "implement";
    case "finish":
      return "all-done";
    default:
      return null;
  }
}
