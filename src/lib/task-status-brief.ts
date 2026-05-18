import { join, relative } from "node:path";

import { readConfig } from "./config.js";
import { pathExists, readText } from "./filesystem.js";
import { gitBranchExists, readGitInfo } from "./git.js";
import { MVP_BUILD_PROMPT_REL } from "./mvp-constants.js";
import { taskBuildPromptRel } from "./task-add-build-prompt.js";
import { projectPaths } from "./paths.js";
import { cursorImplementPromptRel } from "./cursor-task-prompt.js";
import { summarizeGoal } from "./task-summary.js";
import {
  branchNameForTaskFile,
  countTasks,
  findAcceptanceCriteria,
  hasNonEmptySection,
  isMvpTaskId,
  isOnTaskBranch,
  loadActionableTasks,
  readGitContext,
  statusDisplay,
} from "./task.js";
import {
  inferGuideStep,
  type GuideMode,
  type GuideStepId,
} from "./workflow-guide.js";
import type { TaskCounts, TaskMeta } from "../types/task.js";

export interface TaskStatusBriefTask {
  readonly id: string;
  readonly title: string;
  readonly status: string;
  readonly mvpPhase?: string;
  readonly file: string;
}

export interface TaskStatusBriefSections {
  readonly goalExcerpt: string;
  readonly resultFilled: boolean;
  readonly testResultFilled: boolean;
  readonly acceptanceCriteriaCount: number;
}

export interface TaskStatusBriefGit {
  readonly isRepo: boolean;
  readonly branch: string | null;
  readonly dirty: boolean | null;
  readonly onTaskBranch: boolean | null;
  readonly expectedTaskBranch: string | null;
  readonly taskBranchExists: boolean | null;
  readonly baseBranch: string | null;
  readonly startedAt: string | null;
}

export interface TaskStatusBriefWorkflow {
  readonly stepId: GuideStepId;
  readonly stepTitle: string;
  readonly suggestedCommand: string | null;
  readonly youDo: readonly string[];
}

export interface TaskStatusBrief {
  readonly isVibeopsProject: boolean;
  readonly projectName: string | null;
  readonly mode: GuideMode;
  readonly activeTask: TaskStatusBriefTask | null;
  readonly referenceTask: TaskStatusBriefTask | null;
  readonly inProgressTasks: readonly TaskStatusBriefTask[];
  readonly counts: TaskCounts | null;
  readonly workflow: TaskStatusBriefWorkflow;
  readonly git: TaskStatusBriefGit;
  readonly sections: TaskStatusBriefSections | null;
  readonly artifacts: readonly string[];
}

function relTaskPath(cwd: string, filePath: string): string {
  const r = relative(cwd, filePath).replace(/\\/g, "/");
  return r.startsWith("..") ? filePath : r;
}

function toBriefTask(cwd: string, meta: TaskMeta): TaskStatusBriefTask {
  return {
    id: meta.id,
    title: meta.title,
    status: statusDisplay(meta.status),
    mvpPhase: meta.mvpPhase,
    file: relTaskPath(cwd, meta.filePath),
  };
}

async function collectArtifacts(
  cwd: string,
  task: TaskMeta | null,
): Promise<string[]> {
  const out: string[] = [];
  if (task === null) return out;
  if (isMvpTaskId(task.id) && (await pathExists(join(cwd, MVP_BUILD_PROMPT_REL)))) {
    out.push(MVP_BUILD_PROMPT_REL);
  }
  const buildRel = taskBuildPromptRel(task.id);
  if (await pathExists(join(cwd, buildRel))) out.push(buildRel);
  const implRel = cursorImplementPromptRel(task.id);
  if (await pathExists(join(cwd, implRel))) out.push(implRel);
  return out;
}

export async function collectTaskStatusBrief(cwd: string): Promise<TaskStatusBrief> {
  const paths = projectPaths(cwd);
  const config = await readConfig(cwd);
  const isVibeopsProject = config !== null;

  const emptyWorkflow: TaskStatusBriefWorkflow = {
    stepId: "no-mvp",
    stepTitle: "No TASK yet",
    suggestedCommand: "vibeops plan",
    youDo: ["Run planning to create TASK-mvp and the build prompt."],
  };

  if (!isVibeopsProject) {
    const git = await readGitInfo(cwd);
    return {
      isVibeopsProject: false,
      projectName: null,
      mode: "greenfield",
      activeTask: null,
      referenceTask: null,
      inProgressTasks: [],
      counts: null,
      workflow: emptyWorkflow,
      git: {
        isRepo: git.isRepo,
        branch: git.branch,
        dirty: git.dirty,
        onTaskBranch: null,
        expectedTaskBranch: null,
        taskBranchExists: null,
        baseBranch: null,
        startedAt: null,
      },
      sections: null,
      artifacts: [],
    };
  }

  const guideCtx = await inferGuideStep({ cwd, paths, config });
  const actionable = await loadActionableTasks(paths.docsTasks);
  const counts = countTasks(actionable);
  const inProgress = actionable
    .filter((t) => t.status === "in_progress")
    .map((t) => toBriefTask(cwd, t));

  const active = guideCtx.task;
  const reference =
    guideCtx.referenceTask !== null ? toBriefTask(cwd, guideCtx.referenceTask) : null;

  let sections: TaskStatusBriefSections | null = null;
  let expectedBranch: string | null = null;
  let branchExists: boolean | null = null;
  let gitCtx = null as Awaited<ReturnType<typeof readGitContext>>;

  if (active !== null) {
    const body = await readText(active.filePath);
    gitCtx = await readGitContext(active.filePath);
    expectedBranch = branchNameForTaskFile(active.filePath);
    branchExists = await gitBranchExists(cwd, expectedBranch);
    sections = {
      goalExcerpt: summarizeGoal(body, 280),
      resultFilled: hasNonEmptySection(body, "Result"),
      testResultFilled: hasNonEmptySection(body, "Test Result"),
      acceptanceCriteriaCount: findAcceptanceCriteria(body).length,
    };
  }

  const git = await readGitInfo(cwd);
  const onTaskBranch =
    active !== null && gitCtx !== null ? isOnTaskBranch(git.branch, gitCtx) : null;

  const artifacts = await collectArtifacts(cwd, active);

  return {
    isVibeopsProject: true,
    projectName: config.name ?? null,
    mode: guideCtx.mode,
    activeTask: active !== null ? toBriefTask(cwd, active) : null,
    referenceTask: reference,
    inProgressTasks: inProgress,
    counts,
    workflow: {
      stepId: guideCtx.step.id,
      stepTitle: guideCtx.step.title,
      suggestedCommand: guideCtx.step.vibeopsCommand,
      youDo: guideCtx.step.youDo,
    },
    git: {
      isRepo: git.isRepo,
      branch: git.branch,
      dirty: git.dirty,
      onTaskBranch,
      expectedTaskBranch: expectedBranch ?? gitCtx?.taskBranch ?? null,
      taskBranchExists: branchExists,
      baseBranch: gitCtx?.baseBranch ?? null,
      startedAt: gitCtx?.startedAt ?? null,
    },
    sections,
    artifacts,
  };
}

export function taskStatusBriefToJson(brief: TaskStatusBrief): string {
  return JSON.stringify(brief, null, 2);
}
