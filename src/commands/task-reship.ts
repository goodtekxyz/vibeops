import { resolve } from "node:path";

import { readText } from "../lib/filesystem.js";
import { bold, cyan, dim, green, log, yellow } from "../lib/logger.js";
import { projectPaths } from "../lib/paths.js";
import { relPath } from "../lib/task-context.js";
import {
  commitDirtyWorkingTree,
  docsCommitMessageFor,
  featCommitMessageFor,
} from "../lib/task-git-commit.js";
import { finishTaskWithPullRequest } from "../lib/task-push-pr.js";
import {
  applyTaskShipMemory,
  llmCompleteTaskReship,
  writeTaskResultSections,
} from "../lib/task-ship-llm.js";
import {
  assertMergeRequestNotOpen,
  ensureTaskBranchForReship,
  integrateIntegrationIntoTaskBranch,
  loadGitConfigForReship,
  prepareGitContextForReship,
  refreshGitContextBaseCommit,
  resolveReshipTarget,
} from "../lib/task-reship.js";
import {
  hasNonEmptySection,
  parseTaskFilename,
  readGitContext,
} from "../lib/task.js";
import { listWorkingTreeRelPaths } from "../lib/git.js";

export interface TaskReshipCommandOptions {
  dryRun?: boolean;
  cwd?: string;
  noPr?: boolean;
  noIntegrate?: boolean;
  recreateBranch?: boolean;
  skipLlm?: boolean;
  allowOpenMr?: boolean;
  allowDirty?: boolean;
}

async function commitReshipMetadata(opts: {
  readonly cwd: string;
  readonly taskFile: string;
  readonly taskId: string;
  readonly dryRun: boolean;
}): Promise<void> {
  if (opts.dryRun) {
    log.info(dim("  would commit reship metadata (Status stays Shipped)"));
    return;
  }

  const committed = await commitDirtyWorkingTree(
    opts.cwd,
    docsCommitMessageFor(opts.taskId, "reship metadata"),
    false,
  );
  if (!committed) {
    log.info(dim("No reship metadata commit (Git Context already on disk)."));
  }
}

export async function taskReshipCommand(
  taskRef: string | undefined,
  options: TaskReshipCommandOptions = {},
): Promise<void> {
  const cwd = resolve(options.cwd ?? process.cwd());
  const paths = projectPaths(cwd);
  const dryRun = options.dryRun === true;

  const target = await resolveReshipTarget(paths, cwd, taskRef);
  if (target === null) {
    process.exitCode = 1;
    return;
  }

  const { taskId, taskFile, meta, gitCtx: initialCtx } = target;
  const relFile = relPath(cwd, taskFile);

  log.info(bold(`vibeops task reship ${taskId}`));
  log.info(`  ${dim("file")}    ${relFile}`);
  log.info(`  ${dim("branch")}  ${initialCtx.taskBranch}`);
  log.info(`  ${dim("status")}  Shipped (unchanged)`);
  log.blank();

  const gitCfg = dryRun
    ? await loadGitConfigForReship(cwd).catch(() => null)
    : await loadGitConfigForReship(cwd);
  if (!dryRun && gitCfg === null) {
    process.exitCode = 1;
    return;
  }

  const integrationBranch = gitCfg?.integrationBranch ?? "develop";
  const remote = gitCfg?.remote ?? "origin";

  if (!dryRun && !(await assertMergeRequestNotOpen(cwd, taskFile, options.allowOpenMr === true))) {
    process.exitCode = 1;
    return;
  }

  const branchOk = await ensureTaskBranchForReship({
    cwd,
    taskFile,
    gitCtx: initialCtx,
    integrationBranch,
    remote,
    recreateBranch: options.recreateBranch === true,
    dryRun,
    allowDirty: options.allowDirty === true,
  });
  if (!branchOk) {
    process.exitCode = 1;
    return;
  }

  if (options.noIntegrate !== true) {
    const integrated = await integrateIntegrationIntoTaskBranch({
      cwd,
      integrationBranch,
      remote,
      dryRun,
    });
    if (!integrated) {
      process.exitCode = 1;
      return;
    }
  } else {
    log.info(dim("Skipped integration merge (--no-integrate)."));
  }

  const body = await readText(taskFile);
  let resultOk = hasNonEmptySection(body, "Result");
  let testOk = hasNonEmptySection(body, "Test Result");

  if (!options.skipLlm && !dryRun) {
    log.step("LLM — follow-up Result / Test Result");
    const patch = await llmCompleteTaskReship({
      cwd,
      taskId,
      taskTitle: meta.title,
      taskBody: body,
      taskFileRel: relFile,
    });
    if (patch !== null) {
      await writeTaskResultSections(taskFile, patch.result, patch.testResult);
      log.ok(`Result / Test Result updated (${patch.provider})`);
      const memory = await applyTaskShipMemory(cwd, patch);
      for (const p of memory.updated) log.ok(`Updated ${p}`);
      for (const p of memory.skipped) log.skip(`Skipped ${p}`);
    } else {
      log.warn("LLM unavailable — ensure Result / Test Result describe this follow-up.");
    }
    const body2 = await readText(taskFile);
    resultOk = hasNonEmptySection(body2, "Result");
    testOk = hasNonEmptySection(body2, "Test Result");
  } else if (options.skipLlm) {
    log.info(dim("LLM skipped (--skip-llm)."));
  }

  log.info(bold("Sections"));
  log.info(`  ${resultOk ? green("✓") : yellow("·")} Result`);
  log.info(`  ${testOk ? green("✓") : yellow("·")} Test Result`);
  log.blank();

  if (dryRun) {
    log.info(bold("dry-run — would also:"));
    log.info("  · feat commit + reship metadata, then push once and open MR/PR (unless --no-pr)");
    log.blank();
    log.info(`Next: ${cyan("vibeops task merge")}, then optional ${cyan("task sync")}`);
    return;
  }

  if (!resultOk || !testOk) {
    log.error("Fill Result and Test Result for this follow-up, then rerun.");
    process.exitCode = 1;
    return;
  }

  const dirtyBefore = await listWorkingTreeRelPaths(cwd);
  if (dirtyBefore.length === 0) {
    log.error("No changes to reship. Edit files on the task branch, then rerun.");
    process.exitCode = 1;
    return;
  }

  const parts = parseTaskFilename(taskFile);
  await commitDirtyWorkingTree(cwd, featCommitMessageFor(parts.id, meta.title), false);

  let gitCtx = await readGitContext(taskFile);
  if (gitCtx === null) {
    log.error("Git Context missing after commit.");
    process.exitCode = 1;
    return;
  }

  gitCtx = await refreshGitContextBaseCommit(taskFile, gitCtx, cwd);
  gitCtx = await prepareGitContextForReship(cwd, taskFile, gitCtx);

  await commitReshipMetadata({
    cwd,
    taskFile,
    taskId: parts.id,
    dryRun: false,
  });

  const prResult = await finishTaskWithPullRequest({
    cwd,
    taskFile,
    skipPr: options.noPr === true,
    forceNewMergeRequest: true,
  });
  if (!prResult.ok) {
    log.error("Reship failed — fix push/MR, then rerun task reship.");
    process.exitCode = 1;
    return;
  }
  if (prResult.mergeRequestUrl) {
    log.info(`  ${dim("MR/PR")}     ${prResult.mergeRequestUrl}`);
  }

  log.blank();
  log.info(`Next: ${cyan("vibeops task merge")} (or merge in the host UI), then ${cyan("vibeops task sync")}`);
}
