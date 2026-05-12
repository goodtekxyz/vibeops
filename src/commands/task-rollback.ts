import { relative, resolve } from "node:path";

import {
  gitBranchExists,
  gitCheckout,
  gitDeleteBranch,
  gitResetHard,
  readGitInfo,
} from "../lib/git.js";
import { bold, cyan, dim, log, red, yellow } from "../lib/logger.js";
import { projectPaths } from "../lib/paths.js";
import { findTaskFile, readGitContext, readTaskFile, statusDisplay } from "../lib/task.js";
import type { GitContext } from "../types/task.js";

export type RollbackStrategy = "branch-delete" | "reset-base" | "revert-merge";

export interface TaskRollbackOptions {
  cwd?: string;
  confirm?: boolean;
  confirmDestructive?: boolean;
  strategy?: RollbackStrategy;
  dryRun?: boolean;
  keepBranch?: boolean;
}

function relOrAbs(root: string, p: string): string {
  const r = relative(root, p);
  return r === "" ? "." : r.startsWith("..") ? p : r;
}

function shellQuote(s: string): string {
  return /^[A-Za-z0-9._/\-]+$/.test(s) ? s : `'${s.replace(/'/g, `'\\''`)}'`;
}

function strategyCommands(strategy: RollbackStrategy, ctx: GitContext): string[] {
  switch (strategy) {
    case "branch-delete":
      return [
        `git switch ${shellQuote(ctx.baseBranch)}`,
        `git branch -D ${shellQuote(ctx.taskBranch)}`,
      ];
    case "reset-base":
      return [
        `git switch ${shellQuote(ctx.taskBranch)}`,
        `git reset --hard ${shellQuote(ctx.baseCommit)}`,
      ];
    case "revert-merge":
      return [
        `git switch ${shellQuote(ctx.baseBranch)}`,
        `# find the merge commit:`,
        `git log --oneline --merges ${shellQuote(ctx.baseBranch)} | head -5`,
        `# then:`,
        `git revert -m 1 <merge-sha>`,
      ];
  }
}

function strategyRisk(strategy: RollbackStrategy): string {
  switch (strategy) {
    case "branch-delete":
      return "The task branch will be deleted along with any unmerged changes on it.";
    case "reset-base":
      return "Hard-reset the current branch to the base commit. Uncommitted and unpushed changes will be lost.";
    case "revert-merge":
      return "For already-merged-and-pushed work: adds new revert commits while keeping history. VibeOps never force-pushes.";
  }
}

const STRATEGY_LIST: RollbackStrategy[] = ["branch-delete", "reset-base", "revert-merge"];

function isDestructive(strategy: RollbackStrategy): boolean {
  return strategy === "reset-base";
}

export async function taskRollbackCommand(
  taskId: string,
  options: TaskRollbackOptions = {},
): Promise<void> {
  const cwd = resolve(options.cwd ?? process.cwd());
  const paths = projectPaths(cwd);

  const taskFile = await findTaskFile(paths.docsTasks, taskId);
  if (!taskFile) {
    log.error(`TASK not found: ${taskId} (looked in ${relOrAbs(cwd, paths.docsTasks)})`);
    process.exitCode = 1;
    return;
  }

  const meta = await readTaskFile(taskFile);
  const ctx = await readGitContext(taskFile);
  const git = await readGitInfo(cwd);

  log.info(bold(`vibeops task rollback ${meta.id}`));
  log.info(`  ${dim("file")}    ${relOrAbs(cwd, taskFile)}`);
  log.info(`  ${dim("status")}  ${statusDisplay(meta.status)}`);
  if (git.isRepo) {
    log.info(`  ${dim("branch")}  ${git.branch ?? dim("(detached)")}`);
    log.info(`  ${dim("dirty")}   ${git.dirty ? yellow("yes") : "no"}`);
  } else {
    log.info(`  ${red("✗")} not a git repository`);
  }
  log.blank();

  if (ctx === null) {
    log.error(
      `Git Context not recorded in ${relOrAbs(cwd, taskFile)}. Was \`vibeops task start ${meta.id}\` ever run?`,
    );
    log.info(
      `If you started the branch manually, add a "## Git Context" section to the TASK file with: Base Branch, Base Commit, Task Branch, Started At.`,
    );
    process.exitCode = 1;
    return;
  }
  log.info(bold("Git Context (from TASK file)"));
  log.info(`  ${dim("base branch")} ${ctx.baseBranch}`);
  log.info(`  ${dim("base commit")} ${ctx.baseCommit}`);
  log.info(`  ${dim("task branch")} ${cyan(ctx.taskBranch)}`);
  log.info(`  ${dim("started at")}  ${ctx.startedAt}`);
  log.blank();

  log.info(bold("Available strategies"));
  for (const s of STRATEGY_LIST) {
    const destructive = isDestructive(s);
    const tag = destructive ? red("destructive") : yellow("non-destructive");
    log.info(`  ${bold(s)}  ${dim("·")} ${tag}`);
    log.info(`    ${dim(strategyRisk(s))}`);
    for (const cmd of strategyCommands(s, ctx)) {
      if (cmd.startsWith("#")) {
        log.info(`      ${dim(cmd)}`);
      } else {
        log.info(`      ${dim("$")} ${cmd}`);
      }
    }
    log.blank();
  }

  const wantConfirm = options.confirm === true || options.confirmDestructive === true;
  if (!wantConfirm) {
    log.info(
      `${yellow("!")} guidance only. add ${cyan("--confirm")} (non-destructive) or ${cyan("--confirm-destructive")} (allows hard reset) to actually run.`,
    );
    return;
  }

  const strategy = options.strategy ?? "branch-delete";
  if (!STRATEGY_LIST.includes(strategy)) {
    log.error(`Unknown strategy: ${strategy}. Choose from: ${STRATEGY_LIST.join(", ")}.`);
    process.exitCode = 1;
    return;
  }

  if (strategy === "revert-merge") {
    log.info(
      `${yellow("!")} ${bold("revert-merge")} is never executed automatically. Run the commands above manually. ` +
        `(VibeOps never force-pushes, regardless of flag combination.)`,
    );
    return;
  }

  if (isDestructive(strategy) && options.confirmDestructive !== true) {
    log.error(
      `${strategy} is a destructive operation. --confirm alone is not enough; pass --confirm-destructive to proceed.`,
    );
    process.exitCode = 1;
    return;
  }

  if (!git.isRepo) {
    log.error("Cannot run rollback: not a git repository.");
    process.exitCode = 1;
    return;
  }

  if (git.dirty === true && options.confirmDestructive !== true) {
    log.error(
      "Working tree is dirty. Commit / stash first, or rerun with --confirm-destructive to acknowledge the risk.",
    );
    process.exitCode = 1;
    return;
  }

  if (options.dryRun === true) {
    log.info(bold(`dry-run — would run for strategy=${strategy}:`));
    for (const cmd of strategyCommands(strategy, ctx)) {
      if (cmd.startsWith("#")) continue;
      log.info(`  ${dim("$")} ${cmd}`);
    }
    log.blank();
    log.info(dim("no git command was executed."));
    return;
  }

  if (strategy === "branch-delete") {
    if (git.branch === ctx.taskBranch) {
      log.info(`switching off ${ctx.taskBranch} → ${ctx.baseBranch}`);
      await gitCheckout(cwd, ctx.baseBranch);
    }
    if (!(await gitBranchExists(cwd, ctx.taskBranch))) {
      log.warn(`task branch already absent: ${ctx.taskBranch}`);
    } else {
      if (options.keepBranch === true) {
        log.info(`--keep-branch given → leaving ${ctx.taskBranch} intact.`);
      } else {
        await gitDeleteBranch(cwd, ctx.taskBranch, { force: true });
        log.ok(`deleted branch: ${ctx.taskBranch}`);
      }
    }
    log.blank();
    log.info(
      `Done. Current branch: ${cyan(ctx.baseBranch)}. TASK file Status is unchanged on purpose — edit it manually if needed.`,
    );
    return;
  }

  if (strategy === "reset-base") {
    if (git.branch !== ctx.taskBranch) {
      log.info(`switching to ${ctx.taskBranch}`);
      await gitCheckout(cwd, ctx.taskBranch);
    }
    await gitResetHard(cwd, ctx.baseCommit);
    log.ok(`hard reset ${ctx.taskBranch} → ${ctx.baseCommit}`);
    log.blank();
    log.info(
      `Done. Branch ${cyan(ctx.taskBranch)} now points at ${ctx.baseCommit}. TASK file Status is unchanged on purpose.`,
    );
    return;
  }
}
