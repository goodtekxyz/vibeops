import { resolve } from "node:path";

import { readText } from "./filesystem.js";
import { listWorkingTreeRelPaths } from "./git.js";
import { bold, cyan, dim, green, log, yellow } from "./logger.js";
import { projectPaths } from "./paths.js";
import { prNumberFromUrl } from "./pr-create.js";
import { relPath } from "./task-context.js";
import {
  commitDirtyWorkingTree,
  docsCommitMessageFor,
  featCommitMessageFor,
} from "./task-git-commit.js";
import { finishTaskWithPullRequest } from "./task-push-pr.js";
import {
  applyTaskShipMemory,
  llmCompleteTaskReship,
  writeTaskResultSections,
} from "./task-ship-llm.js";
import {
  assertMergeRequestNotOpen,
  ensureTaskBranchForReship,
  integrateIntegrationIntoTaskBranch,
  loadGitConfigForReship,
  prepareGitContextForReship,
  refreshGitContextBaseCommit,
  resolveReshipTarget,
} from "./task-reship.js";
import { hasNonEmptySection, parseTaskFilename, readGitContext } from "./task.js";
import { prRefLabel } from "./task-ship-state.js";
import type { ProjectPaths } from "./paths.js";

export interface NewCycleOptions {
  readonly dryRun?: boolean;
  readonly cwd?: string;
  readonly noPr?: boolean;
  readonly noIntegrate?: boolean;
  readonly recreateBranch?: boolean;
  readonly skipLlm?: boolean;
  /** Update the still-open MR/PR instead of opening a new one. */
  readonly allowOpenMr?: boolean;
}

async function commitReshipMetadata(opts: {
  readonly cwd: string;
  readonly taskFile: string;
  readonly taskId: string;
  readonly dryRun: boolean;
}): Promise<void> {
  if (opts.dryRun) {
    log.info(dim("  would commit new-cycle metadata (Status stays Shipped)"));
    return;
  }

  const committed = await commitDirtyWorkingTree(
    opts.cwd,
    docsCommitMessageFor(opts.taskId, "new PR cycle metadata"),
    false,
  );
  if (!committed) {
    log.info(dim("No new-cycle metadata commit (Git Context already on disk)."));
  }
}

/**
 * Start a NEW PR cycle for an already-Shipped TASK whose previous PR was merged
 * (the former `task reship` behavior). Carries uncommitted work onto the task
 * branch, integrates the integration branch, and opens a fresh MR/PR.
 */
export async function runPostMergeNewCycle(
  taskRef: string | undefined,
  options: NewCycleOptions = {},
): Promise<void> {
  const cwd = resolve(options.cwd ?? process.cwd());
  const paths: ProjectPaths = projectPaths(cwd);
  const dryRun = options.dryRun === true;

  const target = await resolveReshipTarget(paths, cwd, taskRef);
  if (target === null) {
    process.exitCode = 1;
    return;
  }

  const { taskId, taskFile, meta, gitCtx: initialCtx } = target;
  const relFile = relPath(cwd, taskFile);

  log.info(bold(`vibeops task ship ${taskId} — new PR cycle`));
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
  const updateOpenMr = options.allowOpenMr === true;

  if (!dryRun && !(await assertMergeRequestNotOpen(cwd, taskFile, updateOpenMr))) {
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
    if (updateOpenMr) {
      log.info("  · feat commit, push, update open MR/PR (unless --no-pr)");
    } else {
      log.info("  · feat commit + metadata, then push once and open a NEW MR/PR (unless --no-pr)");
    }
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
    log.info(
      `Nothing to do — ${taskId} is merged with no new changes. Create a new TASK for new work (${cyan("vibeops task add")}).`,
    );
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

  if (updateOpenMr) {
    log.info(dim("Updating open MR/PR (--allow-open-mr)."));
  } else {
    gitCtx = await refreshGitContextBaseCommit(taskFile, gitCtx, cwd);
    gitCtx = await prepareGitContextForReship(cwd, taskFile, gitCtx);

    await commitReshipMetadata({
      cwd,
      taskFile,
      taskId: parts.id,
      dryRun: false,
    });
  }

  const prResult = await finishTaskWithPullRequest({
    cwd,
    taskFile,
    skipPr: options.noPr === true,
    forceNewMergeRequest: !updateOpenMr,
  });
  if (!prResult.ok) {
    log.error("New PR cycle failed — fix push/MR, then rerun `vibeops task ship --new-cycle`.");
    process.exitCode = 1;
    return;
  }

  log.blank();
  const ref = prRefLabel(prNumberFromUrl(prResult.mergeRequestUrl));
  if (prResult.mergeRequestUrl) {
    log.ok(`Started new PR cycle → PR ${ref}`);
    log.info(`  ${dim("MR/PR")}     ${prResult.mergeRequestUrl}`);
  } else {
    log.ok("Started new PR cycle (branch pushed; create the MR/PR manually).");
  }
  log.info(`Next: ${cyan("vibeops task merge")} (or merge in the host UI), then ${cyan("vibeops task sync")}`);
}
