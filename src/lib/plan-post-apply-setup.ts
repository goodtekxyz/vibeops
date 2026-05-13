import { githubInitCommand } from "../commands/github-init.js";
import { notionInitCommand } from "../commands/notion-init.js";
import { notionSyncCommand } from "../commands/notion-sync.js";
import { askYesNo } from "./inquirer-helpers.js";
import { cyan, dim, log } from "./logger.js";
import { gitInit, gitRemoteUrl, gitSetDefaultBranch, isGitRepository } from "./git.js";
import { loadSyncContext } from "./notion-sync.js";

const DEFAULT_BRANCH = "main";

/**
 * Ensures `cwd` is a Git work tree before planner `git add` / `git commit`.
 * @returns false when commit should be skipped
 */
export async function ensureGitForPlannerCommit(params: {
  readonly cwd: string;
  readonly interactive: boolean;
}): Promise<boolean> {
  if (await isGitRepository(params.cwd)) {
    return true;
  }
  if (!params.interactive) {
    log.warn(
      `No Git repository in this folder — skipping commit. Run ${cyan("git init")} or ${cyan("vibeops init")} with Git enabled, then commit manually.`,
    );
    return false;
  }
  const ok = await askYesNo({
    message: `No Git repository here yet. Run ${cyan("git init")} and set default branch ${cyan(DEFAULT_BRANCH)} now?`,
    nonInteractive: false,
    defaultValue: true,
  });
  if (!ok) {
    log.info(dim("Skipping git commit. Initialize Git when ready, then commit the planner files."));
    return false;
  }
  await gitInit(params.cwd);
  await gitSetDefaultBranch(params.cwd, DEFAULT_BRANCH);
  log.ok(`Git initialized (default branch ${DEFAULT_BRANCH}).`);
  return true;
}

/**
 * Runs `notion sync`, or when context is missing and stdin is interactive,
 * offers to run `vibeops notion init` first then retries sync once.
 */
export async function runNotionSyncWithOptionalInit(params: {
  readonly cwd: string;
  readonly interactive: boolean;
}): Promise<void> {
  let ctx = await loadSyncContext(params.cwd);
  if (ctx.ok) {
    const priorFailure = process.exitCode === 1;
    await notionSyncCommand({ cwd: params.cwd });
    if (priorFailure) {
      process.exitCode = 1;
    }
    return;
  }

  if (!params.interactive) {
    log.warn(`Notion sync skipped: ${ctx.message}`);
    return;
  }

  const setup = await askYesNo({
    message: `Notion is not ready (${ctx.message}). Run ${cyan("vibeops notion init")} setup here now?`,
    nonInteractive: false,
    defaultValue: true,
  });
  if (!setup) {
    log.info(dim("Skipping Notion sync. When ready, run `vibeops notion init` then `vibeops notion sync`."));
    return;
  }

  const priorFailure = process.exitCode === 1;
  await notionInitCommand({ cwd: params.cwd, nonInteractive: false, dryRun: false });
  if (process.exitCode === 1) {
    log.warn("Notion setup exited with an error — sync skipped. Fix issues and run `vibeops notion sync`.");
    return;
  }

  ctx = await loadSyncContext(params.cwd);
  if (!ctx.ok) {
    log.warn(`Notion still not ready after setup: ${ctx.message}`);
    log.info(dim("Try `vibeops notion test` and re-run `vibeops notion sync`."));
    if (priorFailure) {
      process.exitCode = 1;
    }
    return;
  }

  await notionSyncCommand({ cwd: params.cwd });
  if (priorFailure) {
    process.exitCode = 1;
  }
}

/**
 * Before `git push`, optionally runs the same flow as `vibeops github init`
 * (connect existing GitHub repo or create new, `gh auth`, `origin`, config).
 */
export async function offerGithubInitBeforePush(params: {
  readonly cwd: string;
  readonly interactive: boolean;
}): Promise<void> {
  const originUrl = await gitRemoteUrl(params.cwd, "origin");
  const hasOrigin = Boolean(originUrl && originUrl.trim().length > 0);
  if (!params.interactive) {
    if (!hasOrigin) {
      log.warn(
        `No ${cyan("origin")} remote — ${cyan("git push")} may fail. Run ${cyan("vibeops github init")} or add a remote, then push again.`,
      );
    }
    return;
  }
  const wants = await askYesNo({
    message: hasOrigin
      ? `Run ${cyan("vibeops github init")} before push? (connect another repo, create a new GitHub repo, or verify remotes / ${cyan("gh auth")})`
      : `No ${cyan("origin")} remote yet. Run ${cyan("vibeops github init")} now (connect an existing GitHub repo or create a new one)?`,
    nonInteractive: false,
    defaultValue: !hasOrigin,
  });
  if (!wants) {
    return;
  }
  log.blank();
  log.step("GitHub / remote setup (same wizard as `vibeops github init`)");
  const priorFailure = process.exitCode === 1;
  await githubInitCommand({ cwd: params.cwd });
  if (process.exitCode === 1) {
    log.warn("GitHub setup exited with an error — push may still fail.");
    return;
  }
  if (priorFailure) {
    process.exitCode = 1;
  }
}
