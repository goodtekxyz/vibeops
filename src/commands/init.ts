import { basename, resolve } from "node:path";

import { install, printReport } from "../bootstrap/installer.js";
import { buildConfig, isVibeopsProject, readConfig, writeConfig } from "../lib/config.js";
import {
  gitAddAll,
  gitBranchExists,
  gitCheckout,
  gitCommit,
  gitCreateBranch,
  gitInit,
  gitPullFastForwardOnly,
  gitPush,
  gitRemoteBranchExists,
  gitRemoteUrl,
  gitSetDefaultBranch,
  gitStatusPorcelain,
  hasAnyCommit,
  isGitRepository,
} from "../lib/git.js";
import { formatGitPolicySummary, askGitPolicy, parseGitPolicyArg, resolvePreset } from "../lib/git-policy.js";
import { ensureOriginRemote } from "../lib/git-remote.js";
import {
  askInitClients,
  formatClientsList,
  parseClientsArg,
} from "../lib/init-clients.js";
import { askInput, askYesNo } from "../lib/inquirer-helpers.js";
import { cyan, dim, green, log, yellow } from "../lib/logger.js";
import type { GitHost, VibeopsClientId, VibeopsGitConfig } from "../types/config.js";

export interface InitOptions {
  dryRun?: boolean;
  force?: boolean;
  yes?: boolean;
  cwd?: string;
  name?: string;
  clients?: string;
  /** @deprecated Git is always initialized; kept for CLI compatibility. */
  git?: boolean;
  initialCommit?: boolean;
  defaultBranch?: string;
  commitMessage?: string;
  allowNoRemote?: boolean;
  gitPolicy?: string;
  integrationBranch?: string;
  productionBranch?: string;
  gitHost?: string;
}

const DEFAULT_COMMIT_MESSAGE = "chore: initialize vibeops project";

function deriveProjectName(root: string, explicit: string | undefined): string {
  if (explicit && explicit.trim().length > 0) return explicit.trim();
  const base = basename(root);
  if (base.length > 0 && base !== "/") return base;
  return "untitled-project";
}

function parseGitHostArg(raw: string | undefined): GitHost | null {
  if (raw === undefined || raw.trim().length === 0) return null;
  const t = raw.trim().toLowerCase();
  if (t === "github" || t === "gitlab") return t;
  return null;
}

async function confirmReinitIfNeeded(
  projectRoot: string,
  options: InitOptions,
): Promise<boolean> {
  const existing = await isVibeopsProject(projectRoot);
  if (!existing) return true;

  if (options.dryRun) {
    log.info(dim("(dry-run) would re-initialize existing VibeOps project templates"));
    return true;
  }

  if (options.yes === true || options.force === true) {
    log.warn("Re-initializing existing VibeOps project (templates will be overwritten).");
    return true;
  }

  if (process.stdin.isTTY !== true) {
    log.error(
      "This directory is already a VibeOps project. Use --yes to re-run init, or --force.",
    );
    process.exitCode = 1;
    return false;
  }

  log.warn(yellow("This directory is already a VibeOps project."));
  log.info(
    dim(
      "Re-running init overwrites AGENTS.md, client rules/skills, and project doc stubs. docs/tasks/TASK-*.md are kept.",
    ),
  );
  log.blank();

  const proceed = await askYesNo({
    message: "Continue and overwrite template files?",
    nonInteractive: false,
    defaultValue: false,
  });
  if (!proceed) {
    log.info(dim("Stopped — no files changed."));
    process.exitCode = 1;
    return false;
  }
  return true;
}

async function resolveClients(
  options: InitOptions,
  interactive: boolean,
): Promise<VibeopsClientId[] | null> {
  const fromFlag = parseClientsArg(options.clients);
  if (options.clients !== undefined && fromFlag === null) {
    log.error(
      'Invalid --clients. Use comma-separated: cursor, claude, codex (e.g. --clients cursor,claude)',
    );
    process.exitCode = 1;
    return null;
  }
  if (fromFlag !== null) return fromFlag;

  if (interactive) {
    log.blank();
    log.info("Agent clients");
    return askInitClients();
  }

  if (options.dryRun) {
    return ["cursor"];
  }

  log.error(
    "Select at least one agent: --clients cursor,claude,codex (non-interactive mode).",
  );
  process.exitCode = 1;
  return null;
}

async function resolveBranchPolicy(
  options: InitOptions,
  interactive: boolean,
): Promise<{ integrationBranch: string; productionBranch: string } | null> {
  const presetId = parseGitPolicyArg(options.gitPolicy);
  if (options.gitPolicy !== undefined && presetId === null) {
    log.error("Invalid --git-policy. Use: gitflow, trunk, or custom");
    process.exitCode = 1;
    return null;
  }

  if (
    typeof options.integrationBranch === "string" &&
    typeof options.productionBranch === "string"
  ) {
    return {
      integrationBranch: options.integrationBranch.trim(),
      productionBranch: options.productionBranch.trim(),
    };
  }

  if (presetId !== null && presetId !== "custom") {
    const p = resolvePreset(presetId)!;
    return {
      integrationBranch: p.integrationBranch,
      productionBranch: p.productionBranch,
    };
  }

  if (interactive) {
    log.blank();
    log.info("Branch policy");
    return askGitPolicy();
  }

  if (options.dryRun) {
    return { integrationBranch: "develop", productionBranch: "main" };
  }

  return { integrationBranch: "develop", productionBranch: "main" };
}

function printNextSteps(clients: readonly VibeopsClientId[], git: VibeopsGitConfig): void {
  log.blank();
  log.info("Next steps:");
  log.info("  1. Read AGENTS.md");
  if (clients.includes("cursor")) {
    log.info("  2. Cursor: @docs/tasks/TASK-001-….md in Ask, then Agent (+ /plan-task, /implement-task)");
  }
  if (clients.includes("claude")) {
    log.info("  2. Claude Code: open TASK file; use /plan-task then /implement-task");
  }
  if (clients.includes("codex")) {
    log.info("  2. Codex: open TASK file; use $plan-task / $implement-task when needed");
  }
  if (!clients.includes("cursor") && !clients.includes("claude") && !clients.includes("codex")) {
    log.info("  2. Open the current TASK file in your agent before coding");
  }
  log.info(`  3. ${cyan("vibeops llm connect")} — LLM for task add / task ship`);
  log.info("  4. Push branches to origin (first time only):");
  log.info(`     ${dim(`git push -u ${git.remote} ${git.productionBranch}`)}`);
  if (git.integrationBranch !== git.productionBranch) {
    log.info(`     ${dim(`git push -u ${git.remote} ${git.integrationBranch}`)}`);
  }
  log.info(`  5. ${cyan("vibeops task add")} — branches from ${git.integrationBranch} (pulls latest first)`);
  log.info(`  6. ${cyan("vibeops task ship")} → merge → sync — TASK lifecycle on ${git.host}`);
}

export async function initCommand(options: InitOptions = {}): Promise<void> {
  const dryRun = options.dryRun === true;
  const projectRoot = resolve(options.cwd ?? process.cwd());
  const interactive =
    !dryRun &&
    process.stdin.isTTY === true &&
    options.clients === undefined &&
    options.gitPolicy === undefined;

  const proceed = await confirmReinitIfNeeded(projectRoot, options);
  if (!proceed) return;

  const existingConfig = await readConfig(projectRoot);
  const reinit = existingConfig !== null || (await isVibeopsProject(projectRoot));
  const force = options.force === true || reinit;

  const clients = await resolveClients(options, interactive);
  if (clients === null) return;

  const branchPolicy = await resolveBranchPolicy(options, interactive);
  if (branchPolicy === null) return;

  const hostFromFlag = parseGitHostArg(options.gitHost);
  if (options.gitHost !== undefined && hostFromFlag === null) {
    log.error("Invalid --git-host. Use: github or gitlab");
    process.exitCode = 1;
    return;
  }

  let gitConfig: VibeopsGitConfig = {
    remote: "origin",
    host: hostFromFlag ?? existingConfig?.git?.host ?? "github",
    integrationBranch: branchPolicy.integrationBranch,
    productionBranch: branchPolicy.productionBranch,
  };

  const name =
    options.name?.trim() ||
    existingConfig?.name ||
    deriveProjectName(projectRoot, options.name);

  const config = buildConfig(name, clients, gitConfig, existingConfig);

  log.step(`vibeops init ${dryRun ? "(dry-run) " : ""}→ ${projectRoot}`);
  log.info(`  project: ${name}`);
  log.info(`  vibeops: ${config.vibeopsVersion}`);
  log.info(`  clients: ${formatClientsList(clients)}`);
  log.info(`  git:     ${formatGitPolicySummary(gitConfig)}`);
  if (force && reinit) log.warn("Template files will be overwritten where they already exist.");
  log.blank();

  const report = await install({
    projectRoot,
    config,
    clients,
    dryRun,
    force,
  });
  printReport(report, dryRun);

  const commitMessage =
    typeof options.commitMessage === "string" && options.commitMessage.trim().length > 0
      ? options.commitMessage.trim()
      : DEFAULT_COMMIT_MESSAGE;

  let shouldInitialCommit =
    options.initialCommit !== false &&
    (options.initialCommit === true || options.git === true);

  let finalCommitMessage = commitMessage;
  if (interactive && !dryRun) {
    log.blank();
    log.info("Git repository");
    shouldInitialCommit = await askYesNo({
      message: "Create initial commit?",
      nonInteractive: false,
      defaultValue: true,
    });
    if (shouldInitialCommit) {
      finalCommitMessage = await askInput({
        message: "Initial commit message",
        nonInteractive: false,
        default: commitMessage,
        required: true,
      });
    }
  } else if (!dryRun && !shouldInitialCommit && options.initialCommit === undefined) {
    shouldInitialCommit = true;
  }

  await runGitSetup(
    projectRoot,
    {
      productionBranch: gitConfig.productionBranch,
      integrationBranch: gitConfig.integrationBranch,
      shouldInitialCommit,
      commitMessage: finalCommitMessage,
    },
    dryRun,
  );

  const hadRemoteBefore = (await gitRemoteUrl(projectRoot, gitConfig.remote)) !== null;
  const remote = await ensureOriginRemote({
    cwd: projectRoot,
    remoteName: gitConfig.remote,
    dryRun,
    nonInteractive: !interactive,
    allowMissing: options.allowNoRemote === true,
    defaultBranch: gitConfig.productionBranch,
  });

  if (remote !== null) {
    gitConfig = {
      ...gitConfig,
      remote: remote.remote,
      host: remote.host,
    };
  }

  // If we created/configured a new remote during init, push baseline branches so
  // `task add` can always pull latest integration before branching.
  if (!dryRun && options.allowNoRemote !== true && !hadRemoteBefore) {
    const remoteName = gitConfig.remote;
    log.blank();
    log.info("Remote bootstrap:");
    try {
      // Ensure local branches are up-to-date with origin if they already exist remotely.
      const prodRemoteExists = await gitRemoteBranchExists(projectRoot, remoteName, gitConfig.productionBranch);
      if (prodRemoteExists) {
        await gitCheckout(projectRoot, gitConfig.productionBranch);
        await gitPullFastForwardOnly(projectRoot, remoteName, gitConfig.productionBranch);
      }
      await gitCheckout(projectRoot, gitConfig.productionBranch);
      await gitPush(projectRoot, remoteName, gitConfig.productionBranch, true);
      log.ok(`pushed ${gitConfig.productionBranch} → ${remoteName}`);

      if (gitConfig.integrationBranch !== gitConfig.productionBranch) {
        const intRemoteExists = await gitRemoteBranchExists(projectRoot, remoteName, gitConfig.integrationBranch);
        if (intRemoteExists) {
          await gitCheckout(projectRoot, gitConfig.integrationBranch);
          await gitPullFastForwardOnly(projectRoot, remoteName, gitConfig.integrationBranch);
        }
        await gitCheckout(projectRoot, gitConfig.integrationBranch);
        await gitPush(projectRoot, remoteName, gitConfig.integrationBranch, true);
        log.ok(`pushed ${gitConfig.integrationBranch} → ${remoteName}`);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      log.warn(`Automatic push failed: ${msg}`);
      log.info(dim("Run these manually:"));
      log.info(dim(`  git push -u ${remoteName} ${gitConfig.productionBranch}`));
      if (gitConfig.integrationBranch !== gitConfig.productionBranch) {
        log.info(dim(`  git push -u ${remoteName} ${gitConfig.integrationBranch}`));
      }
    }
  }

  if (!dryRun) {
    await writeConfig(projectRoot, buildConfig(name, clients, gitConfig, existingConfig));
    if (options.allowNoRemote === true && remote === null) {
      log.warn("No git remote configured (--allow-no-remote). task ship push/MR will fail until origin exists.");
    }
    printNextSteps(clients, gitConfig);
  }
}

interface GitSetupPlan {
  productionBranch: string;
  integrationBranch: string;
  shouldInitialCommit: boolean;
  commitMessage: string;
}

async function runGitSetup(
  projectRoot: string,
  plan: GitSetupPlan,
  dryRun: boolean,
): Promise<void> {
  log.blank();
  log.info("Git setup:");

  const alreadyRepo = await isGitRepository(projectRoot);
  const hasCommitsBefore = alreadyRepo ? await hasAnyCommit(projectRoot) : false;

  if (dryRun) {
    log.info(`  ${alreadyRepo ? dim("would skip") : green("would run")} git init`);
    log.info(`  ${green("would set")} production branch ${cyan(plan.productionBranch)}`);
    if (plan.integrationBranch !== plan.productionBranch) {
      log.info(`  ${green("would create")} integration branch ${cyan(plan.integrationBranch)}`);
    }
    if (plan.shouldInitialCommit) {
      log.info(`  ${green("would run")} git add . && git commit`);
    }
    log.info(`  ${dim("would require")} remote origin (unless --allow-no-remote)`);
    return;
  }

  if (alreadyRepo) {
    log.info(`  ${dim("skipped")} git init (already a git repository)`);
  } else {
    await gitInit(projectRoot);
    log.ok("git init");
  }

  const hasCommitsNow = await hasAnyCommit(projectRoot);
  if (!hasCommitsNow) {
    await gitSetDefaultBranch(projectRoot, plan.productionBranch);
    log.ok(`production branch ${plan.productionBranch}`);
  } else {
    log.info(`  ${yellow("skipped")} default branch change (repository already has commits)`);
  }

  if (plan.shouldInitialCommit && !hasCommitsBefore && !hasCommitsNow) {
    const changedFiles = await gitStatusPorcelain(projectRoot);
    if (changedFiles.length > 0) {
      await gitAddAll(projectRoot);
      await gitCommit(projectRoot, plan.commitMessage);
      log.ok(`initial commit on ${plan.productionBranch}`);
    } else {
      log.info(`  ${dim("skipped")} initial commit (nothing to commit)`);
    }
  } else if (hasCommitsNow || hasCommitsBefore) {
    log.info(`  ${dim("skipped")} initial commit (repository already has commits)`);
  }

  await ensureIntegrationBranch(projectRoot, plan);
}

/** Create integration branch when missing (including re-init on existing repos). */
async function ensureIntegrationBranch(
  projectRoot: string,
  plan: GitSetupPlan,
): Promise<void> {
  if (plan.integrationBranch === plan.productionBranch) return;
  if (await gitBranchExists(projectRoot, plan.integrationBranch)) return;
  if (!(await hasAnyCommit(projectRoot))) return;

  const start =
    (await gitBranchExists(projectRoot, plan.productionBranch))
      ? plan.productionBranch
      : "HEAD";
  await gitCreateBranch(projectRoot, plan.integrationBranch, start);
  log.ok(`integration branch ${plan.integrationBranch}`);
  if (await gitBranchExists(projectRoot, plan.productionBranch)) {
    await gitCheckout(projectRoot, plan.productionBranch);
  }
}
