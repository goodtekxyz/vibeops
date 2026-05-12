import { basename, resolve } from "node:path";

import { install, printReport } from "../bootstrap/installer.js";
import { buildConfig } from "../lib/config.js";
import {
  currentBranchOrUnborn,
  gitAddAll,
  gitCommit,
  gitInit,
  gitSetDefaultBranch,
  gitStatusPorcelain,
  hasAnyCommit,
  isGitRepository,
} from "../lib/git.js";
import { askInput, askYesNo } from "../lib/inquirer-helpers.js";
import { cyan, dim, green, log, yellow } from "../lib/logger.js";

export interface InitOptions {
  dryRun?: boolean;
  force?: boolean;
  cwd?: string;
  name?: string;
  git?: boolean;
  initialCommit?: boolean;
  defaultBranch?: string;
  commitMessage?: string;
}

const DEFAULT_BRANCH = "main";
const DEFAULT_COMMIT_MESSAGE = "chore: initialize vibeops project";

function deriveProjectName(root: string, explicit: string | undefined): string {
  if (explicit && explicit.trim().length > 0) return explicit.trim();
  const base = basename(root);
  if (base.length > 0 && base !== "/") return base;
  return "untitled-project";
}

export async function initCommand(options: InitOptions = {}): Promise<void> {
  const dryRun = options.dryRun === true;
  const force = options.force === true;
  const projectRoot = resolve(options.cwd ?? process.cwd());
  const interactive = !dryRun && process.stdin.isTTY === true && options.git === undefined;

  const name = deriveProjectName(projectRoot, options.name);
  const config = buildConfig(name);

  log.step(`vibeops init ${dryRun ? "(dry-run) " : ""}→ ${projectRoot}`);
  log.info(`  project: ${name}`);
  log.info(`  vibeops: ${config.vibeopsVersion}`);
  if (force) log.warn("--force is on — existing files will be overwritten.");
  log.blank();

  const report = await install({ projectRoot, config, dryRun, force });
  printReport(report, dryRun);

  const gitPlan = await resolveGitPlan(options, interactive);
  await runGitSetup(projectRoot, gitPlan, dryRun);

  if (!dryRun) {
    log.blank();
    log.info("Next steps:");
    log.info("  1. Open AGENTS.md and confirm the project name.");
    log.info("  2. Run `vibeops status` to verify installation.");
    log.info(
      "  3. Run `vibeops plan` to populate docs/project/* (or fill them by hand).",
    );
  }
}

interface GitInitPlan {
  shouldInitGit: boolean;
  shouldSetDefaultBranch: boolean;
  defaultBranch: string;
  shouldInitialCommit: boolean;
  commitMessage: string;
}

async function resolveGitPlan(
  options: InitOptions,
  interactive: boolean,
): Promise<GitInitPlan> {
  const defaultBranch =
    typeof options.defaultBranch === "string" && options.defaultBranch.trim().length > 0
      ? options.defaultBranch.trim()
      : DEFAULT_BRANCH;
  const commitMessage =
    typeof options.commitMessage === "string" && options.commitMessage.trim().length > 0
      ? options.commitMessage.trim()
      : DEFAULT_COMMIT_MESSAGE;

  if (interactive) {
    log.blank();
    log.info("Git setup");
    const shouldInitGit = await askYesNo({
      message: "Initialize Git repository?",
      nonInteractive: false,
      defaultValue: true,
    });
    if (!shouldInitGit) {
      return {
        shouldInitGit: false,
        shouldSetDefaultBranch: false,
        defaultBranch,
        shouldInitialCommit: false,
        commitMessage,
      };
    }
    const useMain = await askYesNo({
      message: "Use `main` as default branch?",
      nonInteractive: false,
      defaultValue: true,
    });
    const shouldInitialCommit = await askYesNo({
      message: "Create initial commit?",
      nonInteractive: false,
      defaultValue: true,
    });
    const finalMessage = shouldInitialCommit
      ? await askInput({
          message: "Initial commit message",
          nonInteractive: false,
          default: commitMessage,
          required: true,
        })
      : commitMessage;
    return {
      shouldInitGit: true,
      shouldSetDefaultBranch: useMain,
      defaultBranch,
      shouldInitialCommit,
      commitMessage: finalMessage.length > 0 ? finalMessage : commitMessage,
    };
  }

  const shouldInitGit = options.git !== false && (options.git === true || options.initialCommit === true);
  if (!shouldInitGit) {
    return {
      shouldInitGit: false,
      shouldSetDefaultBranch: false,
      defaultBranch,
      shouldInitialCommit: false,
      commitMessage,
    };
  }
  return {
    shouldInitGit: true,
    shouldSetDefaultBranch: true,
    defaultBranch,
    shouldInitialCommit: options.initialCommit !== false,
    commitMessage,
  };
}

async function runGitSetup(
  projectRoot: string,
  plan: GitInitPlan,
  dryRun: boolean,
): Promise<void> {
  log.blank();
  log.info("Git setup:");

  if (!plan.shouldInitGit) {
    log.info(`  ${dim("skipped")} Git initialization`);
    if (dryRun) {
      log.info(
        `  ${dim("hint")} use ${cyan("vibeops init --git --initial-commit")} to include Git setup in non-interactive mode`,
      );
    }
    return;
  }

  const alreadyRepo = await isGitRepository(projectRoot);
  const hasCommitsBefore = alreadyRepo ? await hasAnyCommit(projectRoot) : false;

  if (dryRun) {
    log.info(
      `  ${alreadyRepo ? dim("would skip") : green("would run")} git init`,
    );
    if (plan.shouldSetDefaultBranch) {
      log.info(`  ${green("would set")} default branch ${cyan(plan.defaultBranch)}`);
    }
    if (plan.shouldInitialCommit) {
      log.info(`  ${green("would run")} git add .`);
      log.info(`  ${green("would run")} git commit -m ${JSON.stringify(plan.commitMessage)}`);
    } else {
      log.info(`  ${dim("would skip")} initial commit`);
    }
    log.info(`  ${dim("dry-run")} no git commands executed`);
    return;
  }

  if (alreadyRepo) {
    log.info(`  ${dim("skipped")} git init (already a git repository)`);
  } else {
    await gitInit(projectRoot);
    log.ok("git init");
  }

  if (plan.shouldSetDefaultBranch) {
    const hasCommitsNow = await hasAnyCommit(projectRoot);
    if (alreadyRepo && hasCommitsNow) {
      log.info(
        `  ${yellow("skipped")} default branch change (repository already has commits)`,
      );
    } else {
      await gitSetDefaultBranch(projectRoot, plan.defaultBranch);
      log.ok(`default branch ${plan.defaultBranch}`);
    }
  }

  if (!plan.shouldInitialCommit) {
    log.info(`  ${dim("skipped")} initial commit`);
    return;
  }

  if (hasCommitsBefore || (await hasAnyCommit(projectRoot))) {
    log.info(`  ${yellow("skipped")} initial commit (repository already has commits)`);
    return;
  }

  const changedFiles = await gitStatusPorcelain(projectRoot);
  log.info(
    `  ${dim("initial commit files")} ${changedFiles.length} file${changedFiles.length === 1 ? "" : "s"} will be included`,
  );
  if (changedFiles.length === 0) {
    log.info(`  ${dim("skipped")} initial commit (nothing to commit)`);
    return;
  }

  try {
    await gitAddAll(projectRoot);
    await gitCommit(projectRoot, plan.commitMessage);
    const branch = await currentBranchOrUnborn(projectRoot);
    log.ok(
      `initial commit created${branch.branch !== null ? ` on ${branch.branch}` : ""}`,
    );
  } catch (err) {
    log.error(`initial commit failed: ${(err as Error).message}`);
    log.info(
      `  ${dim("hint")} check Git user.name/user.email, then run ${cyan(`git commit -m ${JSON.stringify(plan.commitMessage)}`)} manually.`,
    );
    process.exitCode = 1;
  }
}
