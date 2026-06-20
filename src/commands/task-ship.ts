import { resolve } from "node:path";

import { readText } from "../lib/filesystem.js";
import { requireGitConfig } from "../lib/git-config.js";
import {
  gitCommitsAhead,
  gitHeadCommit,
  gitPush,
  gitRemoteBranchExists,
  readGitInfo,
} from "../lib/git.js";
import { askYesNo, isInteractiveSession } from "../lib/inquirer-helpers.js";
import { bold, cyan, dim, green, log, yellow } from "../lib/logger.js";
import { projectPaths } from "../lib/paths.js";
import { prNumberFromUrl } from "../lib/pr-create.js";
import { resolveShipTarget, taskNotFoundMessage } from "../lib/resolve-task.js";
import { relPath } from "../lib/task-context.js";
import { resolveShipCommitMessage } from "../lib/task-commit-msg.js";
import {
  commitDirtyWorkingTree,
  docsCommitMessageFor,
} from "../lib/task-git-commit.js";
import { runPostMergeNewCycle } from "../lib/task-new-cycle.js";
import {
  applyTaskShipMemory,
  fallbackResultSections,
  llmCompleteTaskShip,
  writeTaskResultSections,
} from "../lib/task-ship-llm.js";
import {
  detectShipPrState,
  prRefLabel,
  resolveShipAction,
  type ShipPrContext,
} from "../lib/task-ship-state.js";
import { finishTaskWithPullRequest } from "../lib/task-push-pr.js";
import {
  hasNonEmptySection,
  parseTaskFilename,
  readGitContext,
  readTaskFile,
  updateInlineStatus,
} from "../lib/task.js";
import type { GitContext, TaskMeta } from "../types/task.js";

export interface TaskShipCommandOptions {
  dryRun?: boolean;
  cwd?: string;
  noPr?: boolean;
  /** `-m/--message` commit subject (TASK id is auto-prefixed). */
  message?: string;
  /** Allow a post-merge new PR cycle without the interactive prompt. */
  newCycle?: boolean;
  /** Push committed history only; skip staging/commit. */
  noCommit?: boolean;
  /** Force CI behavior (no prompts). */
  nonInteractive?: boolean;
  // Forwarded to the new-PR-cycle path:
  noIntegrate?: boolean;
  recreateBranch?: boolean;
  skipLlm?: boolean;
  allowOpenMr?: boolean;
}

interface ShipContext {
  readonly cwd: string;
  readonly taskId: string;
  readonly taskFile: string;
  readonly meta: TaskMeta;
  readonly body: string;
  readonly relFile: string;
  readonly prCtx: ShipPrContext;
  readonly dryRun: boolean;
  readonly nonInteractive: boolean;
  readonly options: TaskShipCommandOptions;
}

function describePushFailure(message: string): string {
  const lower = message.toLowerCase();
  if (
    lower.includes("protected") ||
    lower.includes("pre-receive") ||
    lower.includes("gh006") ||
    lower.includes("hook declined")
  ) {
    return "Push rejected by branch protection. Adjust the rule on the host (or push via the MR), then rerun.";
  }
  if (
    lower.includes("non-fast-forward") ||
    lower.includes("fetch first") ||
    lower.includes("rejected") ||
    lower.includes("behind")
  ) {
    return "Push rejected — the remote branch has commits you don't. Pull/rebase the task branch, then rerun.";
  }
  return `git push failed: ${message}`;
}

function warnPlaceholderSections(body: string): void {
  const resultOk = hasNonEmptySection(body, "Result");
  const testOk = hasNonEmptySection(body, "Test Result");
  if (!resultOk || !testOk) {
    log.warn(
      "Result / Test Result still look like placeholders (docs-before-ship). Update the TASK file before merge.",
    );
  }
}

async function ensureOnTaskBranch(
  cwd: string,
  gitCtx: GitContext,
  dryRun: boolean,
): Promise<boolean> {
  const git = await readGitInfo(cwd);
  if (git.branch === gitCtx.taskBranch) return true;
  const where = git.branch ?? "(detached)";
  if (dryRun) {
    log.warn(`Current branch is ${where}, not ${gitCtx.taskBranch}.`);
    return true;
  }
  log.error(
    `On ${where}, not ${gitCtx.taskBranch}. Switch with \`git switch ${gitCtx.taskBranch}\` and rerun.`,
  );
  return false;
}

async function commitShipMetadata(opts: {
  readonly cwd: string;
  readonly taskFile: string;
  readonly taskId: string;
  readonly dryRun: boolean;
}): Promise<void> {
  if (opts.dryRun) {
    log.info(dim("  would set Status → Shipped"));
    log.info(dim("  would commit ship metadata"));
    return;
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
  }
}

/** State 1: first submit — push the task branch and open a new PR/MR. */
async function runFirstShip(ctx: ShipContext): Promise<void> {
  const { cwd, taskId, taskFile, meta, relFile, dryRun, nonInteractive, options } = ctx;
  let body = ctx.body;

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
    body = dryRun ? body : await readText(taskFile);
    resultOk = hasNonEmptySection(body, "Result");
    testOk = hasNonEmptySection(body, "Test Result");
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
    log.info("  · commit implementation (TASK-scoped message) + ship metadata (Status → Shipped)");
    log.info("  · push task branch once, open a new MR/PR (unless --no-pr)");
    const partsDry = parseTaskFilename(taskFile);
    await commitShipMetadata({ cwd, taskFile, taskId: partsDry.id, dryRun: true });
    await finishTaskWithPullRequest({
      cwd,
      taskFile,
      dryRun: true,
      skipPr: options.noPr === true,
    });
    return;
  }

  const gitCtx = await readGitContext(taskFile);
  if (gitCtx !== null && !(await ensureOnTaskBranch(cwd, gitCtx, dryRun))) {
    process.exitCode = 1;
    return;
  }

  const parts = parseTaskFilename(taskFile);
  if (options.noCommit === true) {
    const git = await readGitInfo(cwd);
    if (git.dirty === true) {
      log.warn("Uncommitted changes left in place (--no-commit); committing ship metadata only.");
    }
  } else {
    const message = await resolveShipCommitMessage({
      cwd,
      taskId: parts.id,
      title: meta.title,
      provided: options.message,
      nonInteractive,
    });
    await commitDirtyWorkingTree(cwd, message, false);
  }

  if (gitCtx === null) {
    log.info(dim("No Git Context — push/MR skipped."));
    return;
  }

  await commitShipMetadata({ cwd, taskFile, taskId: parts.id, dryRun: false });

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

  log.blank();
  if (prResult.mergeRequestUrl && prResult.mergeRequestUrl !== "(dry-run)") {
    const ref = prRefLabel(prNumberFromUrl(prResult.mergeRequestUrl));
    log.ok(`Created PR ${ref} → ${prResult.mergeRequestUrl}`);
  } else if (options.noPr === true) {
    log.ok(`Pushed ${gitCtx.taskBranch} (no PR created — --no-pr).`);
  } else {
    log.ok(`Pushed ${gitCtx.taskBranch} (create the MR/PR manually).`);
  }
  log.info(`Next: ${cyan("vibeops task merge")} (or merge in the host UI), then ${cyan("vibeops task sync")}`);
}

/** State 2: an open PR exists — commit + push to update it (no new PR). */
async function runUpdateOpenPr(ctx: ShipContext): Promise<void> {
  const { cwd, taskId, taskFile, meta, body, prCtx, dryRun, nonInteractive, options } = ctx;

  const gitCtx = await readGitContext(taskFile);
  if (gitCtx === null) {
    log.error("No Git Context — cannot update the open PR.");
    process.exitCode = 1;
    return;
  }

  let gitCfg;
  try {
    gitCfg = await requireGitConfig(cwd);
  } catch (e) {
    log.error(e instanceof Error ? e.message : String(e));
    process.exitCode = 1;
    return;
  }
  const remote = gitCfg.remote;

  if (!(await ensureOnTaskBranch(cwd, gitCtx, dryRun))) {
    process.exitCode = 1;
    return;
  }

  warnPlaceholderSections(body);

  if (dryRun) {
    log.info(bold("dry-run — would:"));
    if (options.noCommit === true) {
      log.info("  · skip commit (--no-commit); push committed history only");
    } else {
      log.info("  · commit working tree with a TASK-scoped message");
    }
    log.info(`  · push ${gitCtx.taskBranch} → ${remote} (no new PR)`);
    log.info(`  · update existing PR ${prRefLabel(prCtx.number)} — CI re-runs`);
    return;
  }

  if (meta.status === "in_progress") {
    await updateInlineStatus(taskFile, "shipped");
    log.ok("Status → Shipped");
    await commitDirtyWorkingTree(cwd, docsCommitMessageFor(taskId, "mark shipped"), false);
  }

  if (options.noCommit === true) {
    const git = await readGitInfo(cwd);
    if (git.dirty === true) {
      log.warn("Uncommitted changes left in place (--no-commit); pushing committed history only.");
    }
  } else {
    const message = await resolveShipCommitMessage({
      cwd,
      taskId,
      title: meta.title,
      provided: options.message,
      nonInteractive,
    });
    await commitDirtyWorkingTree(cwd, message, false);
  }

  const remoteExists = await gitRemoteBranchExists(cwd, remote, gitCtx.taskBranch);
  const ahead = remoteExists
    ? await gitCommitsAhead(cwd, `${remote}/${gitCtx.taskBranch}`, "HEAD")
    : 1;
  const git = await readGitInfo(cwd);
  const stillDirty = git.dirty === true;

  if (ahead === 0 && !stillDirty) {
    log.blank();
    log.info(`Nothing to ship (working tree clean, PR ${prRefLabel(prCtx.number)} up to date).`);
    return;
  }

  try {
    await gitPush(cwd, remote, gitCtx.taskBranch, false);
    log.ok(`Pushed ${gitCtx.taskBranch} → ${remote}`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    log.error(describePushFailure(msg));
    process.exitCode = 1;
    return;
  }

  const sha = (await gitHeadCommit(cwd, true)) ?? "HEAD";
  log.blank();
  log.ok(`Updated existing PR ${prRefLabel(prCtx.number)} (pushed ${sha}) — CI re-running`);
  if (prCtx.url) log.info(`  ${dim("MR/PR")}     ${prCtx.url}`);
}

/** State 3: the previous PR is merged — start a new PR cycle (guarded). */
async function runNewCycleFromShip(ctx: ShipContext): Promise<void> {
  const { taskId, prCtx, dryRun, nonInteractive, options } = ctx;

  if (!dryRun && options.newCycle !== true && options.allowOpenMr !== true) {
    if (nonInteractive) {
      log.error(
        `PR ${prRefLabel(prCtx.number)} is merged. Starting a NEW PR cycle requires --new-cycle in non-interactive mode.`,
      );
      process.exitCode = 1;
      return;
    }
    const ok = await askYesNo({
      message: "This starts a NEW PR cycle after merge. Continue?",
      nonInteractive: false,
      defaultValue: false,
    });
    if (!ok) {
      log.info(
        `Aborted. Use ${cyan("vibeops task add")} for unrelated work, or rerun with ${cyan("--new-cycle")}.`,
      );
      return;
    }
  }

  await runPostMergeNewCycle(taskId, {
    dryRun,
    cwd: options.cwd,
    noPr: options.noPr,
    noIntegrate: options.noIntegrate,
    recreateBranch: options.recreateBranch,
    skipLlm: options.skipLlm,
    allowOpenMr: options.allowOpenMr,
  });
}

/** State/PR mismatch: Status is Shipped but no open/merged PR was found. */
function runMismatchHint(ctx: ShipContext): void {
  log.warn(`${ctx.taskId} is Shipped but no open or merged PR was found for its branch.`);
  log.info("The PR was likely merged and the branch synced/deleted.");
  log.info(
    `Next: start new work with ${cyan("vibeops task add")}, or run ${cyan("vibeops status")} to re-check.`,
  );
}

export async function taskShipCommand(
  taskRef: string | undefined,
  options: TaskShipCommandOptions = {},
): Promise<void> {
  const cwd = resolve(options.cwd ?? process.cwd());
  const paths = projectPaths(cwd);
  const dryRun = options.dryRun === true;
  const nonInteractive = options.nonInteractive === true || !isInteractiveSession();

  const resolved = await resolveShipTarget(paths, cwd, taskRef);
  if (resolved === null) {
    log.error(taskNotFoundMessage(taskRef));
    process.exitCode = 1;
    return;
  }

  const { taskId, taskFile } = resolved;
  const meta = await readTaskFile(taskFile);
  const body = await readText(taskFile);
  const relFile = relPath(cwd, taskFile);

  const prCtx = await detectShipPrState(cwd, taskFile);
  const action = resolveShipAction(prCtx.state, meta.status);

  log.info(bold(`vibeops task ship ${taskId}`));
  log.info(`  ${dim("file")}  ${relFile}`);
  if (prCtx.state !== "none") {
    log.info(`  ${dim("PR")}    ${prRefLabel(prCtx.number)} (${prCtx.state})`);
  }
  log.blank();

  const ctx: ShipContext = {
    cwd,
    taskId,
    taskFile,
    meta,
    body,
    relFile,
    prCtx,
    dryRun,
    nonInteractive,
    options,
  };

  switch (action) {
    case "update-open":
      await runUpdateOpenPr(ctx);
      return;
    case "new-cycle":
      await runNewCycleFromShip(ctx);
      return;
    case "mismatch":
      runMismatchHint(ctx);
      return;
    case "first":
    default:
      await runFirstShip(ctx);
      return;
  }
}
