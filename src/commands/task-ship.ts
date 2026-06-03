import { resolve } from "node:path";

import { readText } from "../lib/filesystem.js";
import { requireGitConfig } from "../lib/git-config.js";
import { bold, cyan, dim, green, log, yellow } from "../lib/logger.js";
import { projectPaths } from "../lib/paths.js";
import { resolveTask, taskNotFoundMessage } from "../lib/resolve-task.js";
import { relPath } from "../lib/task-context.js";
import {
  commitDirtyWorkingTree,
  docsCommitMessageFor,
  featCommitMessageFor,
  pushBranch,
} from "../lib/task-git-commit.js";
import {
  applyTaskShipMemory,
  fallbackResultSections,
  llmCompleteTaskShip,
  writeTaskResultSections,
} from "../lib/task-ship-llm.js";
import { finishTaskWithPullRequest } from "../lib/task-push-pr.js";
import {
  hasNonEmptySection,
  parseTaskFilename,
  readGitContext,
  readTaskFile,
  updateInlineStatus,
} from "../lib/task.js";

export interface TaskShipCommandOptions {
  dryRun?: boolean;
  cwd?: string;
  noPr?: boolean;
}

async function commitShipMetadataAndPush(opts: {
  readonly cwd: string;
  readonly taskFile: string;
  readonly taskId: string;
  readonly dryRun: boolean;
  readonly push: { readonly remote: string; readonly branch: string } | null;
}): Promise<boolean> {
  if (opts.dryRun) {
    log.info(dim("  would set Status → Shipped"));
    log.info(dim("  would commit ship metadata"));
    if (opts.push !== null) {
      log.info(
        dim(`  would git push ${opts.push.remote} ${opts.push.branch} (ship metadata)`),
      );
    }
    return true;
  }

  await updateInlineStatus(opts.taskFile, "shipped");
  log.ok("Status → Shipped");

  const committed = await commitDirtyWorkingTree(
    opts.cwd,
    docsCommitMessageFor(opts.taskId, "mark shipped"),
    false,
  );
  if (!committed) {
    log.warn("No file changes for ship metadata commit — check TASK Status on the remote branch.");
    return true;
  }

  if (opts.push === null) return true;

  try {
    await pushBranch(opts.cwd, opts.push.remote, opts.push.branch, false);
    log.ok(`Pushed ship metadata → ${opts.push.remote}/${opts.push.branch}`);
    return true;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    log.error(`Ship metadata push failed: ${msg}`);
    log.info(
      dim(`Fix auth/remote, then: git push ${opts.push.remote} ${opts.push.branch}`),
    );
    return false;
  }
}

export async function taskShipCommand(
  taskRef: string | undefined,
  options: TaskShipCommandOptions = {},
): Promise<void> {
  const cwd = resolve(options.cwd ?? process.cwd());
  const paths = projectPaths(cwd);
  const dryRun = options.dryRun === true;

  const resolved = await resolveTask(paths, cwd, taskRef);
  if (resolved === null) {
    log.error(taskNotFoundMessage(taskRef));
    process.exitCode = 1;
    return;
  }

  const { taskId, taskFile } = resolved;
  const meta = await readTaskFile(taskFile);
  const body = await readText(taskFile);
  const relFile = relPath(cwd, taskFile);

  log.info(bold(`vibeops task ship ${taskId}`));
  log.info(`  ${dim("file")}  ${relFile}`);
  log.blank();

  let resultOk = hasNonEmptySection(body, "Result");
  let testOk = hasNonEmptySection(body, "Test Result");

  if (!resultOk || !testOk) {
    log.step("LLM — Result / Test Result + project memory");
    if (dryRun) {
      log.info(dim("  would call LLM and patch docs/project/*"));
    } else {
      const patch = await llmCompleteTaskShip({
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
        log.warn("LLM unavailable — using git diff fallback for Result sections.");
        const fb = await fallbackResultSections(cwd, taskId, taskFile);
        await writeTaskResultSections(taskFile, fb.result, fb.testResult);
      }
    }
    const body2 = dryRun ? body : await readText(taskFile);
    resultOk = hasNonEmptySection(body2, "Result");
    testOk = hasNonEmptySection(body2, "Test Result");
  }

  log.info(bold("Sections"));
  log.info(`  ${resultOk ? green("✓") : yellow("·")} Result`);
  log.info(`  ${testOk ? green("✓") : yellow("·")} Test Result`);
  log.blank();

  if (!dryRun && (!resultOk || !testOk)) {
    log.error("Fill Result and Test Result in the TASK file, then rerun.");
    process.exitCode = 1;
    return;
  }

  if (dryRun) {
    log.info(bold("dry-run — would:"));
    if (!resultOk || !testOk) {
      log.info("  · LLM fill Result / Test Result + patch docs/project/*");
    }
    log.info("  · commit implementation, push task branch, open MR/PR (unless --no-pr)");
    log.info("  · Status → Shipped; commit metadata; push again");
    await finishTaskWithPullRequest({
      cwd,
      taskFile,
      dryRun: true,
      skipPr: options.noPr === true,
    });
    const gitCtxDry = await readGitContext(taskFile);
    const gitCfgDry =
      gitCtxDry !== null ? await requireGitConfig(cwd).catch(() => null) : null;
    await commitShipMetadataAndPush({
      cwd,
      taskFile,
      taskId,
      dryRun: true,
      push:
        gitCtxDry !== null && gitCfgDry !== null
          ? { remote: gitCfgDry.remote, branch: gitCtxDry.taskBranch }
          : null,
    });
    return;
  }

  const parts = parseTaskFilename(taskFile);
  await commitDirtyWorkingTree(cwd, featCommitMessageFor(parts.id, meta.title), false);

  const gitCtx = await readGitContext(taskFile);
  if (gitCtx !== null) {
    const prResult = await finishTaskWithPullRequest({
      cwd,
      taskFile,
      skipPr: options.noPr === true,
    });
    if (!prResult.ok) {
      log.error("TASK left In Progress — fix push/MR, then rerun task ship.");
      process.exitCode = 1;
      return;
    }
    if (prResult.mergeRequestUrl) {
      log.info(`  ${dim("MR/PR")}     ${prResult.mergeRequestUrl}`);
    }
  } else {
    log.info(dim("No Git Context — push/MR skipped."));
  }

  const gitCtxAfter = await readGitContext(taskFile);
  let pushTarget: { remote: string; branch: string } | null = null;
  if (gitCtxAfter !== null) {
    try {
      const gitCfg = await requireGitConfig(cwd);
      pushTarget = { remote: gitCfg.remote, branch: gitCtxAfter.taskBranch };
    } catch (e) {
      if (e instanceof Error) log.warn(e.message);
    }
  }

  const shipped = await commitShipMetadataAndPush({
    cwd,
    taskFile,
    taskId: parts.id,
    dryRun: false,
    push: pushTarget,
  });
  if (!shipped) {
    log.error("Ship metadata push failed — fix manually, then merge the MR.");
    process.exitCode = 1;
    return;
  }

  log.blank();
  log.info(`Next: ${cyan("vibeops task merge")} (or merge in the host UI), then ${cyan("vibeops task sync")}`);
}
