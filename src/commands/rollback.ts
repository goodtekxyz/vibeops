import { relative, resolve } from "node:path";

import {
  gitBranchExists,
  gitCheckout,
  gitDeleteBranch,
  gitResetHard,
  readGitInfo,
} from "../lib/git.js";
import {
  commandTaskNotFoundMessage,
  resolveCommandTask,
} from "../lib/resolve-command-task.js";
import { bold, cyan, dim, log, red, yellow } from "../lib/logger.js";
import { projectPaths } from "../lib/paths.js";
import { readGitContext, readTaskFile, statusDisplay } from "../lib/task.js";
import type { GitContext } from "../types/task.js";

export type RollbackStrategy = "branch-delete" | "reset-base" | "revert-merge";

export interface RollbackCommandOptions {
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
        `git log --oneline --merges ${shellQuote(ctx.baseBranch)} | head -5`,
        `git revert -m 1 <merge-sha>`,
      ];
  }
}

function strategyRisk(strategy: RollbackStrategy): string {
  switch (strategy) {
    case "branch-delete":
      return "Deletes the task branch and any unmerged work on it.";
    case "reset-base":
      return "Hard-resets the task branch to the base commit.";
    case "revert-merge":
      return "Manual revert on main after a merge was pushed.";
  }
}

const STRATEGIES: RollbackStrategy[] = ["branch-delete", "reset-base", "revert-merge"];

export async function rollbackCommand(
  taskRef: string | undefined,
  options: RollbackCommandOptions = {},
): Promise<void> {
  const cwd = resolve(options.cwd ?? process.cwd());
  const paths = projectPaths(cwd);

  const resolved = await resolveCommandTask(paths, cwd, taskRef);
  if (resolved === null) {
    log.error(commandTaskNotFoundMessage(taskRef));
    process.exitCode = 1;
    return;
  }
  const { taskFile } = resolved;

  const meta = await readTaskFile(taskFile);
  const ctx = await readGitContext(taskFile);
  const git = await readGitInfo(cwd);

  log.info(bold(`vibeops rollback ${meta.id}`));
  log.info(`  ${dim("file")}    ${relOrAbs(cwd, taskFile)}`);
  log.info(`  ${dim("status")}  ${statusDisplay(meta.status)}`);
  log.blank();

  if (ctx === null) {
    log.warn(`No Git Context in TASK file. Run ${cyan("vibeops start")} first.`);
    if (options.dryRun !== true) {
      process.exitCode = 1;
    }
    return;
  }

  log.info(bold("Git Context"));
  log.info(`  base  ${ctx.baseBranch} @ ${ctx.baseCommit}`);
  log.info(`  task  ${cyan(ctx.taskBranch)}`);
  log.blank();

  for (const s of STRATEGIES) {
    const destructive = s === "reset-base";
    log.info(`  ${bold(s)}  ${destructive ? red("destructive") : yellow("safe")}`);
    log.info(`    ${dim(strategyRisk(s))}`);
    for (const cmd of strategyCommands(s, ctx)) {
      log.info(`      ${dim("$")} ${cmd}`);
    }
    log.blank();
  }

  if (options.confirm !== true && options.confirmDestructive !== true) {
    log.info(`Guidance only. Use ${cyan("--confirm")} or ${cyan("--confirm-destructive")} to run.`);
    return;
  }

  const strategy = options.strategy ?? "branch-delete";
  if (!STRATEGIES.includes(strategy)) {
    log.error(`Unknown strategy: ${strategy}`);
    process.exitCode = 1;
    return;
  }

  if (strategy === "revert-merge") {
    log.info(`${yellow("!")} revert-merge is manual only — run the commands above.`);
    return;
  }

  if (strategy === "reset-base" && options.confirmDestructive !== true) {
    log.error("reset-base requires --confirm-destructive.");
    process.exitCode = 1;
    return;
  }

  if (!git.isRepo) {
    log.error("Not a git repository.");
    process.exitCode = 1;
    return;
  }

  if (options.dryRun === true) {
    log.info(bold(`dry-run (${strategy}):`));
    for (const cmd of strategyCommands(strategy, ctx)) {
      log.info(`  ${dim("$")} ${cmd}`);
    }
    return;
  }

  if (strategy === "branch-delete") {
    if (git.branch === ctx.taskBranch) await gitCheckout(cwd, ctx.baseBranch);
    if (!options.keepBranch && (await gitBranchExists(cwd, ctx.taskBranch))) {
      await gitDeleteBranch(cwd, ctx.taskBranch, { force: true });
      log.ok(`Deleted ${ctx.taskBranch}`);
    }
    return;
  }

  if (git.branch !== ctx.taskBranch) await gitCheckout(cwd, ctx.taskBranch);
  await gitResetHard(cwd, ctx.baseCommit);
  log.ok(`Reset ${ctx.taskBranch} → ${ctx.baseCommit}`);
}
