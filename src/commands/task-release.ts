import { resolve } from "node:path";

import { GitConfigError, requireGitConfig } from "../lib/git-config.js";
import { formatHostCliHint, formatHostCliMissingMessage } from "../lib/git-host-cli.js";
import { detectGitHost, mergeRequestLabel } from "../lib/git-host.js";
import { gitRemoteUrl } from "../lib/git.js";
import { bold, dim, log } from "../lib/logger.js";
import {
  createMergeRequest,
  getMergeRequestState,
  mergeMergeRequest,
  probeMergeRequestCli,
  type MergeRequestMergeMethod,
} from "../lib/pr-create.js";
import { assertMergeRequestMerged } from "../lib/task-merge-verify.js";

export interface TaskReleaseCommandOptions {
  dryRun?: boolean;
  cwd?: string;
  noMerge?: boolean;
  merge?: boolean;
  squash?: boolean;
  rebase?: boolean;
}

function resolveReleaseMergeMethod(opts: TaskReleaseCommandOptions): MergeRequestMergeMethod {
  if (opts.rebase === true) return "rebase";
  if (opts.squash === true) return "squash";
  return "merge";
}

export async function taskReleaseCommand(
  options: TaskReleaseCommandOptions = {},
): Promise<void> {
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

  const { integrationBranch, productionBranch, remote } = gitCfg;

  if (integrationBranch === productionBranch) {
    log.info(
      "Trunk policy: integration and production are the same branch — no release PR step.",
    );
    return;
  }

  const remoteUrl = await gitRemoteUrl(cwd, remote);
  const host =
    remoteUrl !== null && detectGitHost(remoteUrl) !== null
      ? detectGitHost(remoteUrl)!
      : gitCfg.host;
  const label = mergeRequestLabel(host);
  const title = `Release: ${integrationBranch} → ${productionBranch}`;
  const body = [
    `Integrate \`${integrationBranch}\` into \`${productionBranch}\`.`,
    "",
    "Opened by `vibeops task release`.",
  ].join("\n");

  log.info(bold("vibeops task release"));
  log.info(`  ${dim("head")}   ${integrationBranch}`);
  log.info(`  ${dim("base")}   ${productionBranch}`);
  log.blank();

  if (dryRun) {
    log.info(bold("dry-run — would:"));
    log.info(`  · ${label}: ${integrationBranch} → ${productionBranch}`);
    if (options.noMerge !== true) {
      log.info(`  · merge ${label} (${resolveReleaseMergeMethod(options)}, wait for CI)`);
    }
    return;
  }

  const cliOk = await probeMergeRequestCli(host);
  if (!cliOk) {
    log.error(formatHostCliMissingMessage(host, `create the release ${label}`));
    for (const line of formatHostCliHint(host)) {
      log.info(dim(`  ${line}`));
    }
    process.exitCode = 1;
    return;
  }

  let releaseUrl: string;
  try {
    const { url } = await createMergeRequest({
      cwd,
      host,
      baseBranch: productionBranch,
      headBranch: integrationBranch,
      title,
      body,
    });
    releaseUrl = url;
    log.ok(`${label}: ${url}`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    log.error(`Could not create release ${label}: ${msg}`);
    process.exitCode = 1;
    return;
  }

  if (options.noMerge === true) {
    log.info(dim("Merge skipped (--no-merge)."));
    return;
  }

  const state = await getMergeRequestState(cwd, host, releaseUrl);
  if (state === "merged") {
    log.ok(`Release ${label} already merged.`);
    return;
  }

  const method = resolveReleaseMergeMethod(options);
  try {
    await mergeMergeRequest({
      cwd,
      host,
      url: releaseUrl,
      method,
      waitForCi: true,
      immediate: true,
    });
    const verified = await assertMergeRequestMerged({
      cwd,
      host,
      url: releaseUrl,
      integrationBranch: productionBranch,
    });
    if (!verified.ok) {
      log.error(verified.message);
      process.exitCode = 1;
      return;
    }
    log.ok(`Release ${label} merged into ${productionBranch}.`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    log.error(`Release merge failed: ${msg}`);
    log.info(dim(`Complete merge in the host UI: ${releaseUrl}`));
    process.exitCode = 1;
  }
}
