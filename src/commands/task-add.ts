import { resolve } from "node:path";

import { pathExists, writeText } from "../lib/filesystem.js";
import { GitConfigError, requireGitConfig } from "../lib/git-config.js";
import { askInput } from "../lib/inquirer-helpers.js";
import { bold, cyan, dim, log, yellow } from "../lib/logger.js";
import { projectPaths } from "../lib/paths.js";
import { slugify } from "../lib/slug.js";
import { fallbackTaskDraft, llmScaffoldTask } from "../lib/task-add-llm.js";
import {
  allocateNextTaskNumber,
  formatTaskId,
  uniqueTaskPath,
} from "../lib/task-scaffold.js";
import { findBlockingTask, relPath } from "../lib/task-context.js";
import { startTaskBranch } from "../lib/task-start.js";
import { loadActionableTasks, readGitContext } from "../lib/task.js";
import type { VibeopsGitConfig } from "../types/config.js";

export interface TaskAddCommandOptions {
  dryRun?: boolean;
  nonInteractive?: boolean;
  cwd?: string;
  idea?: string;
}

async function loadGitConfigOrNull(
  root: string,
  dryRun: boolean,
): Promise<VibeopsGitConfig | null> {
  try {
    return await requireGitConfig(root);
  } catch (e) {
    if (e instanceof GitConfigError) {
      if (dryRun) return null;
      log.error(e.message);
      process.exitCode = 1;
      return null;
    }
    throw e;
  }
}

export async function taskAddCommand(opts: TaskAddCommandOptions = {}): Promise<void> {
  const root = resolve(opts.cwd ?? process.cwd());
  const dryRun = opts.dryRun === true;
  const nonInteractive =
    opts.nonInteractive === true || dryRun || process.stdin.isTTY !== true;

  log.info(bold("vibeops task add"));
  log.blank();

  const gitCfg = await loadGitConfigOrNull(root, dryRun);
  if (!dryRun && gitCfg === null) return;

  const paths = projectPaths(root);
  const blocking = await findBlockingTask(paths, root);
  if (blocking !== null) {
    const ctx = await readGitContext(blocking.filePath);
    log.warn(
      `${yellow("Blocked")} — ${bold(blocking.id)} is still open (${blocking.title || "no title"}).`,
    );
    if (ctx) {
      log.info(`  ${dim("branch")}  ${ctx.taskBranch}`);
    }
    log.info(`  ${dim("file")}   ${relPath(root, blocking.filePath)}`);
    log.blank();
    log.info(`Finish it first: ${cyan(`vibeops task sync ${blocking.id}`)} (after ship + merge)`);
    log.info(`Then run ${cyan("vibeops task add")} again.`);
    process.exitCode = 1;
    return;
  }

  const ideaDefault = "New work slice";
  const idea = await askInput({
    message: "What are you doing now? (short)",
    nonInteractive,
    default: opts.idea?.trim() || ideaDefault,
    required: true,
  });

  const tasks = await loadActionableTasks(paths.docsTasks);
  const taskId = formatTaskId(allocateNextTaskNumber(tasks));

  let title: string;
  let slug: string;
  let markdown: string;

  if (dryRun || nonInteractive) {
    const fb = fallbackTaskDraft(taskId, idea);
    title = fb.title;
    slug = fb.slug;
    markdown = fb.markdown;
  } else {
    const llm = await llmScaffoldTask({ cwd: root, taskId, idea });
    if (llm !== null) {
      title = llm.title;
      slug = llm.slug;
      markdown = llm.markdown;
      log.skip(`Scaffold via ${llm.provider}`);
    } else {
      log.warn("LLM unavailable — using minimal TASK template.");
      log.info(dim(`  Run ${cyan("vibeops llm connect")} to set up Codex, Cursor Agent CLI, or OpenAI.`));
      const fb = fallbackTaskDraft(taskId, idea);
      title = fb.title;
      slug = fb.slug;
      markdown = fb.markdown;
    }
  }

  const { filePath } = uniqueTaskPath(
    paths.docsTasks,
    taskId,
    slugify(slug || title),
    tasks.map((t) => t.filePath),
  );
  const relFile = relPath(root, filePath);
  const integration = gitCfg?.integrationBranch ?? "integration";

  if (dryRun) {
    log.info(`[dry-run] Would create ${bold(taskId)} → ${cyan(relFile)}`);
    log.info(dim(`  branch task/${slugify(slug || title).replace(/^(\d+)-/, "$1-")} from ${integration}`));
    if (gitCfg) {
      await startTaskBranch({
        cwd: root,
        taskFile: filePath,
        integrationBranch: gitCfg.integrationBranch,
        remote: gitCfg.remote,
        dryRun: true,
      });
    }
    return;
  }

  if (await pathExists(filePath)) {
    throw new Error(`TASK file already exists: ${relFile}`);
  }

  await writeText(filePath, markdown);
  log.ok(`Created ${bold(taskId)} → ${cyan(relFile)}`);

  log.blank();
  log.step("Starting task branch…");
  const started = await startTaskBranch({
    cwd: root,
    taskFile: filePath,
    integrationBranch: gitCfg!.integrationBranch,
    remote: gitCfg!.remote,
    allowDirty: true,
  });
  if (!started) {
    process.exitCode = 1;
    return;
  }

  log.blank();
  log.info(bold("Next in Cursor"));
  log.info(`  Ask:  @${relFile} — plan Scope / Acceptance Criteria`);
  log.info(`  Agent: same file — implement`);
  log.info(`  Ship: ${cyan(`vibeops task ship ${taskId}`)}`);
}
