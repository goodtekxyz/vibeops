import { resolve } from "node:path";

import { bold, cyan, dim, log } from "../lib/logger.js";
import { projectPaths } from "../lib/paths.js";
import { relPath } from "../lib/task-context.js";
import {
  assertTaskDeletable,
  assertWorkingTreeForDel,
  closeOpenTaskMergeRequestIfNeeded,
  deleteTaskBranches,
  deleteTaskMarkdown,
  loadGitConfigForDel,
  resolveDelTarget,
  taskDelNotFoundMessage,
  validateTaskBranchForDel,
} from "../lib/task-del.js";
import { readGitContext, statusDisplay } from "../lib/task.js";

export interface TaskDelCommandOptions {
  dryRun?: boolean;
  cwd?: string;
  force?: boolean;
  noRemoteDelete?: boolean;
  noCloseMr?: boolean;
}

export async function taskDelCommand(
  taskRef: string | undefined,
  options: TaskDelCommandOptions = {},
): Promise<void> {
  const cwd = resolve(options.cwd ?? process.cwd());
  const dryRun = options.dryRun === true;
  const paths = projectPaths(cwd);

  const target = await resolveDelTarget(paths, cwd, taskRef);
  if (target === null) {
    log.error(taskDelNotFoundMessage(taskRef));
    process.exitCode = 1;
    return;
  }

  const { taskId, taskFile, meta, taskBranch } = target;
  const relFile = relPath(cwd, taskFile);

  log.info(bold(`vibeops task del ${taskId}`));
  log.info(`  ${dim("file")}    ${relFile}`);
  log.info(`  ${dim("branch")}  ${taskBranch}`);
  log.info(`  ${dim("status")}  ${statusDisplay(meta.status)}`);
  log.blank();

  const deletable = await assertTaskDeletable(cwd, target);
  if (!deletable.ok) {
    log.error(deletable.reason);
    process.exitCode = 1;
    return;
  }

  const gitCfg = dryRun
    ? await loadGitConfigForDel(cwd).catch(() => null)
    : await loadGitConfigForDel(cwd);
  if (!dryRun && gitCfg === null) {
    process.exitCode = 1;
    return;
  }

  const integrationBranch = gitCfg?.integrationBranch ?? "develop";
  const productionBranch = gitCfg?.productionBranch ?? "main";
  const remote = gitCfg?.remote ?? "origin";

  if (!validateTaskBranchForDel(taskBranch, integrationBranch, productionBranch)) {
    process.exitCode = 1;
    return;
  }

  if (dryRun) {
    log.info(bold("dry-run — would:"));
    const ctx = await readGitContext(taskFile);
    if (ctx !== null) {
      await closeOpenTaskMergeRequestIfNeeded({
        cwd,
        taskFile,
        taskBranch,
        baseBranch: ctx.baseBranch,
        dryRun: true,
        skipClose: options.noCloseMr === true,
      });
    }
    log.info(`  · git switch ${integrationBranch} (if on ${taskBranch})`);
    await deleteTaskBranches({
      cwd,
      taskBranch,
      integrationBranch,
      remote,
      dryRun: true,
      noRemoteDelete: options.noRemoteDelete === true,
    });
    await deleteTaskMarkdown(taskFile, true);
    log.blank();
    log.info(`Next: ${cyan("vibeops task add")}`);
    return;
  }

  if (!(await assertWorkingTreeForDel(cwd, options.force === true))) {
    process.exitCode = 1;
    return;
  }

  const ctx = await readGitContext(taskFile);
  if (ctx === null) {
    log.error("Git Context missing.");
    process.exitCode = 1;
    return;
  }

  await closeOpenTaskMergeRequestIfNeeded({
    cwd,
    taskFile,
    taskBranch,
    baseBranch: ctx.baseBranch,
    dryRun: false,
    skipClose: options.noCloseMr === true,
  });

  const branchesOk = await deleteTaskBranches({
    cwd,
    taskBranch,
    integrationBranch,
    remote,
    dryRun: false,
    noRemoteDelete: options.noRemoteDelete === true,
  });
  if (!branchesOk) {
    process.exitCode = 1;
    return;
  }

  await deleteTaskMarkdown(taskFile, false);

  log.blank();
  log.info(`Next: ${cyan("vibeops task add")}`);
}
