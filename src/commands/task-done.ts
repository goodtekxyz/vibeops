import { resolve } from "node:path";

import { readText } from "../lib/filesystem.js";
import { bold, cyan, dim, green, log, yellow } from "../lib/logger.js";
import { projectPaths } from "../lib/paths.js";
import { resolveTask, taskNotFoundMessage } from "../lib/resolve-task.js";
import {
  applyTaskDoneMemory,
  fallbackResultSections,
  llmCompleteTaskDone,
  writeTaskResultSections,
} from "../lib/task-done-llm.js";
import { relPath } from "../lib/task-context.js";
import { requireGitConfig } from "../lib/git-config.js";
import {
  gitAddPaths,
  gitPush,
  listWorkingTreeRelPaths,
  partitionPathsForAutoCommit,
  readGitInfo,
  runGit,
} from "../lib/git.js";
import {
  hasNonEmptySection,
  markGitContextDone,
  parseTaskFilename,
  readGitContext,
  readTaskFile,
  updateInlineStatus,
} from "../lib/task.js";
import { finishTaskWithPullRequest } from "../lib/task-push-pr.js";

export interface TaskDoneCommandOptions {
  dryRun?: boolean;
  cwd?: string;
  noPr?: boolean;
}

function commitMessageFor(taskId: string, title: string): string {
  const slug = title.replace(/^TASK-\d+\s*[:\-]\s*/i, "").trim() || taskId;
  return `feat(${taskId.toLowerCase()}): ${slug}`;
}

function closureCommitMessageFor(taskId: string): string {
  return `docs(${taskId.toLowerCase()}): close task metadata`;
}

async function tryCommitDirty(cwd: string, message: string, dryRun: boolean): Promise<boolean> {
  const git = await readGitInfo(cwd);
  if (!git.isRepo || git.dirty !== true) return false;
  const { committable, excluded } = partitionPathsForAutoCommit(
    await listWorkingTreeRelPaths(cwd),
    { unmerged: [] },
  );
  if (committable.length === 0) return false;
  if (excluded.length > 0) {
    log.warn(`Skipping ${excluded.length} build artifact path(s) from auto-commit.`);
  }
  if (dryRun) {
    log.info(dim(`  would commit ${committable.length} path(s)`));
    return true;
  }
  await gitAddPaths(cwd, committable);
  await runGit(cwd, ["commit", "-q", "-m", message]);
  log.ok(`Committed: ${message}`);
  return true;
}

/**
 * After push/MR: write Status Done + Git Context closure, commit, push so the remote
 * branch matches local TASK metadata (canonical two-phase close).
 */
async function commitClosureMetadataAndPush(opts: {
  readonly cwd: string;
  readonly taskFile: string;
  readonly taskId: string;
  readonly dryRun: boolean;
  readonly push: { readonly remote: string; readonly branch: string } | null;
}): Promise<boolean> {
  if (opts.dryRun) {
    log.info(dim("  would set Status → Done and update Git Context (doneAt)"));
    log.info(dim("  would commit closure metadata"));
    if (opts.push !== null) {
      log.info(
        dim(`  would git push ${opts.push.remote} ${opts.push.branch} (closure commit)`),
      );
    }
    return true;
  }

  await updateInlineStatus(opts.taskFile, "done");
  await markGitContextDone(opts.taskFile);
  log.ok("Status → Done");

  const committed = await tryCommitDirty(opts.cwd, closureCommitMessageFor(opts.taskId), false);
  if (!committed) {
    log.warn(
      "No file changes for closure commit — verify TASK Status and Git Context on the remote branch.",
    );
    return true;
  }

  if (opts.push === null) return true;

  try {
    await gitPush(opts.cwd, opts.push.remote, opts.push.branch, false);
    log.ok(`Pushed closure commit → ${opts.push.remote}/${opts.push.branch}`);
    return true;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    log.error(`Closure commit push failed: ${msg}`);
    log.info(
      dim(`Fix auth/remote, then: git push ${opts.push.remote} ${opts.push.branch}`),
    );
    return false;
  }
}

export async function taskDoneCommand(
  taskRef: string | undefined,
  options: TaskDoneCommandOptions = {},
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

  log.info(bold(`vibeops task done ${taskId}`));
  log.info(`  ${dim("file")}  ${relFile}`);
  log.blank();

  let resultOk = hasNonEmptySection(body, "Result");
  let testOk = hasNonEmptySection(body, "Test Result");

  if (!resultOk || !testOk) {
    log.step("LLM — Result / Test Result + project memory");
    if (dryRun) {
      log.info(dim("  would call LLM and patch docs/project/*"));
    } else {
      const patch = await llmCompleteTaskDone({
        cwd,
        taskId,
        taskTitle: meta.title,
        taskBody: body,
        taskFileRel: relFile,
      });
      if (patch !== null) {
        await writeTaskResultSections(taskFile, patch.result, patch.testResult);
        log.ok(`Result / Test Result updated (${patch.provider})`);
        const memory = await applyTaskDoneMemory(cwd, patch);
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
    log.info("  · Status → Done; commit closure metadata; push again");
    await finishTaskWithPullRequest({
      cwd,
      taskFile,
      dryRun: true,
      skipPr: options.noPr === true,
    });
    const gitCtxDry = await readGitContext(taskFile);
    const gitCfgDry =
      gitCtxDry !== null
        ? await requireGitConfig(cwd).catch(() => null)
        : null;
    await commitClosureMetadataAndPush({
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
  const commitMsg = commitMessageFor(parts.id, meta.title);
  await tryCommitDirty(cwd, commitMsg, false);

  const gitCtx = await readGitContext(taskFile);
  if (gitCtx !== null) {
    const prResult = await finishTaskWithPullRequest({
      cwd,
      taskFile,
      skipPr: options.noPr === true,
    });
    if (!prResult.ok) {
      log.error("TASK left In Progress — fix push/MR, then rerun task done.");
      process.exitCode = 1;
      return;
    }
    if (prResult.mergeRequestUrl) {
      log.info(`  ${dim("MR/PR")}     ${prResult.mergeRequestUrl}`);
      log.info(dim("Merge on GitHub/GitLab — CI deploys after merge."));
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

  const closed = await commitClosureMetadataAndPush({
    cwd,
    taskFile,
    taskId: parts.id,
    dryRun: false,
    push: pushTarget,
  });
  if (!closed) {
    log.error("TASK metadata is Done locally but closure push failed — push manually, then continue.");
    process.exitCode = 1;
    return;
  }

  log.blank();
  log.info(`Next: ${cyan("vibeops task add")} or ${cyan("vibeops status")}`);
}
