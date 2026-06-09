import { resolve } from "node:path";

import { GitConfigError, requireGitConfig } from "../lib/git-config.js";
import {
  gitFetchRemote,
  gitPullFastForwardOnly,
  gitRemoteBranchExists,
  gitRemoteUrl,
  gitSwitchToBranch,
  readGitInfo,
} from "../lib/git.js";
import { bold, cyan, dim, log } from "../lib/logger.js";

export interface PullCommandOptions {
  dryRun?: boolean;
  cwd?: string;
}

/**
 * One-step remote sync: fetch, switch to integration branch, fast-forward pull.
 */
export async function pullCommand(options: PullCommandOptions = {}): Promise<void> {
  const cwd = resolve(options.cwd ?? process.cwd());
  const dryRun = options.dryRun === true;

  let gitCfg;
  try {
    gitCfg = await requireGitConfig(cwd);
  } catch (e) {
    if (e instanceof GitConfigError) {
      log.error(e.message);
      process.exitCode = 1;
      return;
    }
    throw e;
  }

  const { remote, integrationBranch } = gitCfg;

  log.info(bold("vibeops pull"));
  log.info(`  ${dim("remote")}       ${remote}`);
  log.info(`  ${dim("integration")}  ${cyan(integrationBranch)}`);
  log.blank();

  const git = await readGitInfo(cwd);
  if (!git.isRepo) {
    log.error("Not a git repository.");
    process.exitCode = 1;
    return;
  }

  const needsSwitch = git.branch !== integrationBranch;

  if (dryRun) {
    log.info(bold("dry-run — would:"));
    log.info(`  · git fetch ${remote} --prune`);
    if (needsSwitch) {
      log.info(`  · git switch ${integrationBranch}`);
    }
    log.info(`  · git pull --ff-only ${remote} ${integrationBranch}`);
    return;
  }

  if ((await gitRemoteUrl(cwd, remote)) === null) {
    log.error(`No remote "${remote}". Add a remote or re-run vibeops init.`);
    process.exitCode = 1;
    return;
  }

  try {
    await gitFetchRemote(cwd, remote);
    log.ok(`Fetched ${remote}`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    log.warn(`git fetch failed (${msg}). Continuing with local refs.`);
  }

  if (needsSwitch) {
    const switched = await gitSwitchToBranch(cwd, integrationBranch, remote);
    if (!switched) {
      log.error(
        `Branch "${integrationBranch}" not found locally or on ${remote}. Push integration first or check the remote URL.`,
      );
      process.exitCode = 1;
      return;
    }
    log.ok(`On ${integrationBranch}`);
  }

  if (!(await gitRemoteBranchExists(cwd, remote, integrationBranch))) {
    log.warn(`No ${remote}/${integrationBranch} on the remote yet — fetch only.`);
    return;
  }

  try {
    await gitPullFastForwardOnly(cwd, remote, integrationBranch);
    log.ok(`Up to date with ${remote}/${integrationBranch}`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    log.error(
      `Could not fast-forward ${integrationBranch}: ${msg}. Commit or stash local changes, then rerun \`vibeops pull\`.`,
    );
    process.exitCode = 1;
  }
}
