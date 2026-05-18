import { mkdir } from "node:fs/promises";
import { join, relative, resolve } from "node:path";

import { doneCommand } from "./done.js";
import { startCommand } from "./start.js";
import { pathExists, writeText } from "../lib/filesystem.js";
import { bold, cyan, dim, log } from "../lib/logger.js";
import { askInput, askSelect, yesNoSelect } from "../lib/inquirer-helpers.js";
import { projectPaths } from "../lib/paths.js";
import { readConfig } from "../lib/config.js";
import { slugify } from "../lib/slug.js";
import {
  defaultBuildPromptForTask,
  gatherTaskPlanViaLlm,
  llmGenerateQuickTask,
  type QuickTaskLlmResult,
} from "../lib/task-add-llm.js";
import {
  taskBuildPromptAbs,
  taskBuildPromptRel,
} from "../lib/task-add-build-prompt.js";
import {
  allocateNextTaskNumber,
  buildWorkNowTaskMarkdown,
  formatTaskId,
  titleFromIdea,
  uniqueTaskPath,
} from "../lib/task-scaffold.js";
import { readGitInfo } from "../lib/git.js";
import {
  loadActionableTasks,
  pickInProgressTask,
  pickLatestDoneTask,
} from "../lib/task.js";

export interface TaskAddCommandOptions {
  dryRun?: boolean;
  nonInteractive?: boolean;
  cwd?: string;
  /** CI / smoke only — skips prompts when combined with --non-interactive */
  idea?: string;
}

type AddMode = "just" | "plan";

function relOrAbs(root: string, p: string): string {
  const r = relative(root, p);
  return r === "" ? "." : r.startsWith("..") ? p : r;
}

async function maybeCloseInProgressTask(
  root: string,
  inProgress: NonNullable<ReturnType<typeof pickInProgressTask>>,
  nonInteractive: boolean,
): Promise<boolean> {
  if (nonInteractive) return true;

  log.info(
    `Current TASK ${bold(inProgress.id)} is ${cyan("In Progress")}: ${dim(inProgress.title)}`,
  );
  log.blank();

  const closeFirst = await yesNoSelect({
    message: "Close this TASK first (commit, merge, clean tree) before starting a new one?",
    defaultValue: true,
  });

  if (!closeFirst) {
    log.warn(
      `Keeping ${inProgress.id} open — finish it or run ${cyan("vibeops done")} before switching branches.`,
    );
    return true;
  }

  log.blank();
  log.step(`Closing ${inProgress.id} via vibeops done…`);
  await doneCommand(inProgress.id, { cwd: root, allowDirty: true });
  if (process.exitCode !== undefined && process.exitCode !== 0) {
    log.error("Could not close the current TASK — fix blockers above, then run task add again.");
    return false;
  }
  log.blank();
  return true;
}

async function pickAddMode(nonInteractive: boolean): Promise<AddMode> {
  if (nonInteractive) return "just";
  const choice = await askSelect({
    message: "How do you want to create the new TASK?",
    nonInteractive: false,
    choices: ["Just create task", "Create plan using LLM"],
    default: "Just create task",
  });
  return choice.startsWith("Create plan") ? "plan" : "just";
}

export async function taskAddCommand(opts: TaskAddCommandOptions = {}): Promise<void> {
  const root = resolve(opts.cwd ?? process.cwd());
  const dryRun = opts.dryRun === true;
  const nonInteractive =
    opts.nonInteractive === true || dryRun || process.stdin.isTTY !== true;

  log.info(bold("vibeops task add"));
  log.blank();

  let tasks = await loadActionableTasks(projectPaths(root).docsTasks);
  const inProgress = pickInProgressTask(tasks);

  if (inProgress !== null) {
    const ok = await maybeCloseInProgressTask(root, inProgress, nonInteractive);
    if (!ok) return;
    tasks = await loadActionableTasks(projectPaths(root).docsTasks);
  }

  const mode = await pickAddMode(nonInteractive);
  const latestDone = pickLatestDoneTask(tasks);
  const nextNum = allocateNextTaskNumber(tasks);
  const taskId = formatTaskId(nextNum);

  const ideaDefault =
    opts.idea?.trim() ||
    (latestDone ? `Follow-up after ${latestDone.id}` : "New work slice");

  const idea = await askInput({
    message:
      mode === "plan"
        ? "What do you want to build? (starting point for planning)"
        : "What are you doing now? (short)",
    nonInteractive,
    default: ideaDefault,
    required: true,
  });

  const paths = projectPaths(root);
  const config = await readConfig(root);
  const projectName = config?.name ?? "project";

  let title = titleFromIdea(idea);
  let slug = slugify(title);
  let markdown = "";
  let buildPromptMarkdown: string | null = null;
  let llmNote: string | null = null;

  if (mode === "plan") {
    if (dryRun) {
      log.info(`[dry-run] Would run LLM planning for ${bold(taskId)}`);
      log.info(dim(`  idea: ${idea}`));
      return;
    }
    if (nonInteractive) {
      log.error("Create plan using LLM requires an interactive terminal (omit --non-interactive).");
      process.exitCode = 1;
      return;
    }
    log.step("LLM task planning (interactive questions)…");
    const planned = await gatherTaskPlanViaLlm({
      cwd: root,
      taskId,
      projectName,
      seedIdea: idea,
    });
    if (planned === null) {
      log.error("No LLM provider available for planning.");
      process.exitCode = 1;
      return;
    }
    markdown = planned.markdown;
    buildPromptMarkdown = planned.buildPromptMarkdown;
    llmNote = `planned via ${planned.provider}`;
    const header = /^#\s+TASK-\d+:\s*(.+)$/m.exec(markdown);
    if (header?.[1]) title = header[1].trim();
    slug = slugify(title);
  } else {
    let quick: QuickTaskLlmResult | null = null;
    if (!nonInteractive || opts.idea) {
      quick = await llmGenerateQuickTask({
        cwd: root,
        taskId,
        idea,
        latestDone,
      });
    }
    if (quick !== null) {
      title = quick.title;
      slug = quick.slug;
      markdown = quick.markdown;
      llmNote = `quick scaffold via ${quick.provider}`;
    } else {
      const parent = inProgress ?? latestDone;
      markdown = buildWorkNowTaskMarkdown({
        id: taskId,
        title,
        idea,
        mvpPhase: parent?.mvpPhase?.trim() || "Work-now slice",
        spawnedFrom: parent?.id,
      });
      if (!nonInteractive) {
        log.warn("LLM unavailable — using minimal TASK template.");
      }
    }
  }

  const { filePath } = uniqueTaskPath(
    paths.docsTasks,
    taskId,
    slug,
    tasks.map((t) => t.filePath),
  );
  const relFile = relOrAbs(root, filePath);
  const taskRelative = relFile.replace(/\\/g, "/");
  const buildRel = taskBuildPromptRel(taskId);
  const buildAbs = taskBuildPromptAbs(root, taskId);

  if (buildPromptMarkdown === null) {
    buildPromptMarkdown = defaultBuildPromptForTask(projectName, taskId, taskRelative);
  }

  if (dryRun) {
    log.info(`[dry-run] Would create ${bold(taskId)} → ${cyan(relFile)}`);
    if (mode === "plan") {
      log.info(`[dry-run] Would write ${cyan(buildRel)}`);
    }
    log.blank();
    return;
  }

  if (await pathExists(filePath)) {
    throw new Error(`TASK file already exists: ${relFile}`);
  }

  await writeText(filePath, markdown);
  await mkdir(join(root, ".vibeops", "generated"), { recursive: true });
  await writeText(buildAbs, buildPromptMarkdown);

  log.ok(`Created ${bold(taskId)} → ${cyan(relFile)}`);
  if (mode === "plan") {
    log.ok(`Cursor build doc → ${cyan(buildRel)}`);
  }
  if (llmNote) log.skip(llmNote);

  const git = await readGitInfo(root);
  if (!git.isRepo) {
    log.warn("Not a git repository — TASK file saved. Run vibeops init --git, then start.");
    return;
  }

  log.blank();
  log.step(`Starting ${taskId} (branch + In Progress)…`);
  await startCommand(taskId, { cwd: root, allowDirty: true });

  if (process.exitCode !== undefined && process.exitCode !== 0) {
    log.warn(`TASK file exists but start failed — run ${cyan(`vibeops start ${taskId}`)} when Git is ready.`);
    return;
  }

  log.blank();
  if (mode === "plan") {
    log.info(bold("Build in Cursor"));
    log.info(`  Drag ${cyan(buildRel)} into a new chat and implement.`);
  } else {
    log.info(bold("Work in Cursor"));
    log.info(`  Edit ${cyan(relFile)} freely, then ${cyan(`vibeops done ${taskId}`)} when finished.`);
  }
}
