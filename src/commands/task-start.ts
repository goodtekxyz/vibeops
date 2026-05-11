import { relative, resolve } from "node:path";

import {
  branchNameForTaskFile,
  findTaskFile,
  upsertGitContext,
  updateInlineStatus,
} from "../lib/task.js";
import {
  detectDefaultBranch,
  gitBranchExists,
  gitCheckoutNewBranch,
  gitHeadCommit,
  readGitInfo,
} from "../lib/git.js";
import { bold, cyan, dim, log } from "../lib/logger.js";
import { buildTaskPromptString } from "../lib/task-prompt.js";
import { projectPaths } from "../lib/paths.js";
import type { GitContext } from "../types/task.js";

export interface TaskStartOptions {
  dryRun?: boolean;
  allowDirty?: boolean;
  agent?: string;
  cwd?: string;
}

function relOrAbs(root: string, p: string): string {
  const r = relative(root, p);
  return r === "" ? "." : r.startsWith("..") ? p : r;
}

export async function taskStartCommand(
  taskId: string,
  options: TaskStartOptions = {},
): Promise<void> {
  const cwd = resolve(options.cwd ?? process.cwd());
  const paths = projectPaths(cwd);
  const agentName = options.agent ?? "builder";

  const taskFile = await findTaskFile(paths.docsTasks, taskId);
  if (!taskFile) {
    log.error(`TASK not found: ${taskId} (looked in ${relOrAbs(cwd, paths.docsTasks)})`);
    process.exitCode = 1;
    return;
  }

  const git = await readGitInfo(cwd);
  if (!git.isRepo) {
    log.error(`Not a git repository: ${cwd}`);
    process.exitCode = 1;
    return;
  }
  if (git.dirty === true && options.allowDirty !== true) {
    log.error(
      "Git working tree is dirty. Commit or stash first, or rerun with --allow-dirty.",
    );
    process.exitCode = 1;
    return;
  }

  const baseBranch = git.branch ?? (await detectDefaultBranch(cwd)) ?? "main";
  const baseCommit = (await gitHeadCommit(cwd)) ?? "";
  if (baseCommit.length === 0) {
    log.error("Failed to read HEAD commit. Repo has no commits yet?");
    process.exitCode = 1;
    return;
  }
  const taskBranch = branchNameForTaskFile(taskFile);
  const startedAt = new Date().toISOString();
  const ctx: GitContext = { baseBranch, baseCommit, taskBranch, startedAt };

  log.info(bold(`vibeops task start ${taskId}`));
  log.info(`  ${dim("file")}        ${relOrAbs(cwd, taskFile)}`);
  log.info(`  ${dim("base branch")} ${baseBranch}`);
  log.info(`  ${dim("base commit")} ${baseCommit}`);
  log.info(`  ${dim("task branch")} ${cyan(taskBranch)}`);
  log.info(`  ${dim("started at")}  ${startedAt}`);
  log.blank();

  if (options.dryRun === true) {
    log.info(bold("dry-run — would perform:"));
    log.info(`  · git checkout -b ${taskBranch} ${baseBranch}`);
    log.info(`  · update Status → In Progress in ${relOrAbs(cwd, taskFile)}`);
    log.info(`  · upsert "## Git Context" section in ${relOrAbs(cwd, taskFile)}`);
    log.info(`  · build Cursor prompt for agent "${agentName}"`);
    log.blank();
    log.info(dim("no files were written and no git command was executed."));
    return;
  }

  if (await gitBranchExists(cwd, taskBranch)) {
    log.error(`Task branch already exists: ${taskBranch}`);
    log.info(
      `  Use a different TASK or delete the existing branch first: \`git branch -D ${taskBranch}\`.`,
    );
    process.exitCode = 1;
    return;
  }

  await gitCheckoutNewBranch(cwd, taskBranch, baseBranch);
  log.ok(`checked out new branch: ${taskBranch}`);

  await updateInlineStatus(taskFile, "in_progress");
  await upsertGitContext(taskFile, ctx);
  log.ok(`updated ${relOrAbs(cwd, taskFile)} (Status + Git Context)`);

  log.blank();
  const promptResult = await buildTaskPromptString({
    projectRoot: paths.root,
    agentsDir: paths.vibeopsAgents,
    agentName,
    taskFilePath: taskFile,
  });

  if (!promptResult.ok) {
    log.warn(
      `agent "${agentName}" not found in ${relOrAbs(cwd, paths.vibeopsAgents)} — skipping prompt.`,
    );
    if (promptResult.available.length > 0) {
      log.info(`Available agents: ${promptResult.available.join(", ")}`);
    }
    log.info(
      `Run \`vibeops task prompt ${taskId} --agent <name>\` later to generate the Cursor prompt.`,
    );
    return;
  }

  log.info(bold(`Cursor prompt (agent: ${agentName}):`));
  log.info(dim("─".repeat(60)));
  log.raw(promptResult.prompt.endsWith("\n") ? promptResult.prompt : `${promptResult.prompt}\n`);
  log.info(dim("─".repeat(60)));
  log.info(
    `Copy the block above into Cursor. When done, run \`vibeops task check ${taskId}\`.`,
  );
}
