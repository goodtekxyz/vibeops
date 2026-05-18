import { join, relative, resolve } from "node:path";

import {
  branchNameForTaskFile,
  isMvpTaskId,
  readGitContext,
  readTaskFile,
  upsertGitContext,
  updateInlineStatus,
} from "../lib/task.js";
import {
  detectDefaultBranch,
  gitBranchExists,
  gitCheckout,
  gitCheckoutNewBranch,
  gitGovernanceOnlyDirty,
  gitHeadCommit,
  readGitInfo,
} from "../lib/git.js";
import { MVP_BUILD_PROMPT_REL } from "../lib/mvp-constants.js";
import { taskBuildPromptRel } from "../lib/task-add-build-prompt.js";
import { pathExists } from "../lib/filesystem.js";
import { bold, cyan, dim, log } from "../lib/logger.js";
import { projectPaths } from "../lib/paths.js";
import {
  commandTaskNotFoundMessage,
  resolveCommandTask,
} from "../lib/resolve-command-task.js";
import type { GitContext } from "../types/task.js";

export interface StartCommandOptions {
  dryRun?: boolean;
  allowDirty?: boolean;
  cwd?: string;
}

function relOrAbs(root: string, p: string): string {
  const r = relative(root, p);
  return r === "" ? "." : r.startsWith("..") ? p : r;
}

export async function startCommand(
  taskRef: string | undefined,
  options: StartCommandOptions = {},
): Promise<void> {
  const cwd = resolve(options.cwd ?? process.cwd());
  const paths = projectPaths(cwd);

  const resolved = await resolveCommandTask(paths, cwd, taskRef);
  if (resolved === null) {
    log.error(commandTaskNotFoundMessage(taskRef));
    process.exitCode = 1;
    return;
  }
  const { taskId, taskFile, source } = resolved;
  if (source === "backlog-active") {
    log.info(dim(`No TASK-mvp — continuing backlog with ${cyan(taskId)}.`));
  }

  const git = await readGitInfo(cwd);
  if (!git.isRepo) {
    if (options.dryRun === true) {
      log.info(bold("dry-run — would:"));
      log.info(`  · require a git repo under ${cwd}`);
      log.info(`  · git checkout -b task/mvp-*`);
      log.info(`  · Status → In Progress + Git Context`);
      return;
    }
    log.error(`Not a git repository: ${cwd}`);
    process.exitCode = 1;
    return;
  }

  if (git.dirty === true && options.allowDirty !== true) {
    const gov = await gitGovernanceOnlyDirty(cwd);
    if (!gov.onlyGovernance) {
      log.error("Git working tree is dirty. Commit or stash, or use --allow-dirty.");
      if (gov.nonGovernancePaths.length > 0) {
        for (const p of gov.nonGovernancePaths.slice(0, 16)) {
          log.info(`  ${dim("·")} ${p}`);
        }
        if (gov.nonGovernancePaths.length > 16) {
          log.info(`  ${dim("·")} … and ${gov.nonGovernancePaths.length - 16} more`);
        }
      }
      log.blank();
      log.info(dim("Options:"));
      log.info(`  ${dim("1.")} Commit on ${git.branch ?? "HEAD"}: git add … && git commit`);
      log.info(`  ${dim("2.")} Stash: git stash push -u -m "wip"`);
      log.info(
        `  ${dim("3.")} Carry WIP into task branch: ${cyan(`vibeops start ${taskId} --allow-dirty`)}`,
      );
      log.info(
        dim(
          "  If this is TASK-009 scaffold on main, run vibeops done TASK-009 or commit it before TASK-010.",
        ),
      );
      process.exitCode = 1;
      return;
    }
    log.warn("Only governance / VibeOps paths are dirty — proceeding.");
  }

  const baseBranch = git.branch ?? (await detectDefaultBranch(cwd)) ?? "main";
  const baseCommit = (await gitHeadCommit(cwd)) ?? "";
  if (baseCommit.length === 0) {
    log.error("No commits on HEAD yet.");
    process.exitCode = 1;
    return;
  }

  const taskBranch = branchNameForTaskFile(taskFile);
  const startedAt = new Date().toISOString();
  const ctx: GitContext = { baseBranch, baseCommit, taskBranch, startedAt };
  const meta = await readTaskFile(taskFile);
  const existingCtx = await readGitContext(taskFile);
  const branchExists = await gitBranchExists(cwd, taskBranch);

  log.info(bold(`vibeops start`));
  log.info(`  ${dim("task")}         ${taskId}`);
  log.info(`  ${dim("file")}         ${relOrAbs(cwd, taskFile)}`);
  if (branchExists && existingCtx) {
    log.info(`  ${dim("base branch")}  ${existingCtx.baseBranch} @ ${existingCtx.baseCommit.slice(0, 7)}`);
  } else {
    log.info(`  ${dim("base branch")}  ${baseBranch} @ ${baseCommit.slice(0, 7)}`);
  }
  log.info(`  ${dim("task branch")}  ${cyan(taskBranch)}`);
  log.blank();

  if (options.dryRun === true) {
    log.info(bold("dry-run — would:"));
    log.info(
      branchExists
        ? `  · git switch ${taskBranch} (branch exists)`
        : `  · git checkout -b ${taskBranch}`,
    );
    log.info(`  · Status → In Progress + Git Context in TASK file`);
    return;
  }

  if (branchExists) {
    await gitCheckout(cwd, taskBranch);
    if (meta.status === "planned") {
      await updateInlineStatus(taskFile, "in_progress");
    }
    if (existingCtx === null) {
      await upsertGitContext(taskFile, ctx);
    }
    if (existingCtx?.baseBranch.startsWith("chore/vibeops-post-")) {
      log.warn(
        `Git Context base is ${existingCtx.baseBranch} — merge or delete that chore branch, then fix base in the TASK file if needed.`,
      );
    }
    log.ok(`Resumed existing branch ${taskBranch}.`);
  } else {
    await gitCheckoutNewBranch(cwd, taskBranch, baseBranch);
    await updateInlineStatus(taskFile, "in_progress");
    await upsertGitContext(taskFile, ctx);
    log.ok(`Branch ${taskBranch} ready.`);
  }

  log.blank();
  log.info(bold("Build in Cursor"));
  if (isMvpTaskId(taskId)) {
    log.info(`  Drag ${cyan(relOrAbs(cwd, MVP_BUILD_PROMPT_REL))} into a new chat.`);
  } else {
    const taskBuildRel = taskBuildPromptRel(taskId);
    if (await pathExists(join(cwd, taskBuildRel))) {
      log.info(`  Drag ${cyan(relOrAbs(cwd, taskBuildRel))} into a new chat.`);
    } else {
      log.info(`  Open ${cyan(relOrAbs(cwd, taskFile))} and implement per Acceptance Criteria.`);
    }
  }
  log.info(
    `  When done: fill Result / Test Result, then ${cyan(`vibeops done ${taskId}`)}.`,
  );
}
