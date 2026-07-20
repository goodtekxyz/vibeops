import {
  gitFetchRemote,
  gitGovernanceOnlyDirty,
  gitLeftRightCount,
  gitPullFastForwardOnly,
  gitRemoteBranchExists,
  gitRemoteUrl,
  gitRevParse,
  gitSwitchToBranch,
  readGitInfo,
  restoreGovernanceStashAfterSwitch,
  stashGovernanceIfBlocking,
} from "./git.js";
import { cyan, dim, log } from "./logger.js";

export type IntegrationSyncKind =
  | "ok"
  | "no_remote"
  | "no_remote_branch"
  | "dirty"
  | "ahead"
  | "diverged"
  | "pull_failed";

export interface IntegrationSyncDiagnosis {
  readonly ok: boolean;
  readonly kind: IntegrationSyncKind;
  /** Short one-line summary. */
  readonly summary: string;
  /** Copy-paste recovery commands (without prompting). */
  readonly fixes: readonly string[];
  readonly ahead?: number;
  readonly behind?: number;
}

export interface EnsureIntegrationSyncedOptions {
  readonly cwd: string;
  readonly remote: string;
  readonly integrationBranch: string;
  /** When true, only diagnose; never mutate. */
  readonly dryRun?: boolean;
  /** Fetch remote before diagnosing (default true). */
  readonly fetch?: boolean;
}

function remoteRef(remote: string, branch: string): string {
  return `${remote}/${branch}`;
}

/**
 * Classify why `git pull --ff-only` would fail for the integration branch.
 * Call after fetch when possible so `origin/branch` is current.
 *
 * Governance-only dirt (`.vibeops.json`, docs/, `.vibeops/`, …) does **not**
 * block — `task add` right after `init` must work.
 */
export async function diagnoseIntegrationSync(
  cwd: string,
  remote: string,
  integrationBranch: string,
): Promise<IntegrationSyncDiagnosis> {
  if ((await gitRemoteUrl(cwd, remote)) === null) {
    return {
      ok: true,
      kind: "no_remote",
      summary: `No git remote "${remote}" — using local ${integrationBranch} only.`,
      fixes: [],
    };
  }

  if (!(await gitRemoteBranchExists(cwd, remote, integrationBranch))) {
    return {
      ok: true,
      kind: "no_remote_branch",
      summary: `No ${remote}/${integrationBranch} yet — local branch is fine for first push.`,
      fixes: [],
    };
  }

  const git = await readGitInfo(cwd);
  if (git.dirty === true) {
    const gov = await gitGovernanceOnlyDirty(cwd);
    if (!gov.onlyGovernance) {
      const blocking = gov.nonGovernancePaths.slice(0, 8);
      const more =
        gov.nonGovernancePaths.length > blocking.length
          ? ` (+${gov.nonGovernancePaths.length - blocking.length} more)`
          : "";
      return {
        ok: false,
        kind: "dirty",
        summary: `Working tree has app changes — cannot fast-forward ${integrationBranch}.`,
        fixes: [
          "git status",
          `# Blocking (non-governance): ${blocking.join(", ")}${more}`,
          "git stash push -u -m \"vibeops: before sync\"",
          `git checkout ${integrationBranch}`,
          `git pull --ff-only ${remote} ${integrationBranch}`,
          "git stash pop   # if you stashed",
          "vibeops task add",
        ],
      };
    }
    // Governance-only dirty (.vibeops.json after init, docs, …) — proceed.
  }

  const localSha = await gitRevParse(cwd, integrationBranch);
  const remoteSha = await gitRevParse(cwd, remoteRef(remote, integrationBranch));
  if (localSha === null || remoteSha === null) {
    return {
      ok: false,
      kind: "pull_failed",
      summary: `Could not resolve ${integrationBranch} or ${remote}/${integrationBranch}.`,
      fixes: [
        `git fetch ${remote}`,
        `git checkout ${integrationBranch}`,
        `git pull --ff-only ${remote} ${integrationBranch}`,
      ],
    };
  }

  if (localSha === remoteSha) {
    return {
      ok: true,
      kind: "ok",
      summary: `${integrationBranch} matches ${remote}/${integrationBranch}.`,
      fixes: [],
    };
  }

  const counts = await gitLeftRightCount(
    cwd,
    integrationBranch,
    remoteRef(remote, integrationBranch),
  );
  const ahead = counts?.left ?? 0;
  const behind = counts?.right ?? 0;

  if (ahead > 0 && behind > 0) {
    return {
      ok: false,
      kind: "diverged",
      summary: `Local ${integrationBranch} and ${remote}/${integrationBranch} have diverged (local +${ahead}, remote +${behind}).`,
      fixes: [
        `git fetch ${remote}`,
        `git checkout ${integrationBranch}`,
        `# Prefer remote (discards local-only commits on ${integrationBranch}):`,
        `git reset --hard ${remote}/${integrationBranch}`,
        `# Or keep local commits: git pull --rebase ${remote} ${integrationBranch}`,
        "vibeops task add",
      ],
      ahead,
      behind,
    };
  }

  if (ahead > 0 && behind === 0) {
    return {
      ok: false,
      kind: "ahead",
      summary: `Local ${integrationBranch} is ${ahead} commit(s) ahead of ${remote}/${integrationBranch} — fast-forward pull cannot apply.`,
      fixes: [
        `git checkout ${integrationBranch}`,
        `# Push local commits, or reset to remote if they should not exist:`,
        `git push -u ${remote} ${integrationBranch}`,
        `# or: git reset --hard ${remote}/${integrationBranch}`,
        "vibeops task add",
      ],
      ahead,
      behind,
    };
  }

  // behind only — ff-only should work
  return {
    ok: true,
    kind: "ok",
    summary: `${integrationBranch} is ${behind} commit(s) behind ${remote}/${integrationBranch} (ff-only OK).`,
    fixes: [],
    ahead,
    behind,
  };
}

export function printIntegrationSyncDiagnosis(d: IntegrationSyncDiagnosis): void {
  if (d.ok) {
    if (d.kind !== "ok" && d.kind !== "no_remote_branch") log.info(dim(d.summary));
    return;
  }
  log.error(d.summary);
  if (d.fixes.length > 0) {
    log.blank();
    log.info(dim("Fix (run in this repo):"));
    for (const line of d.fixes) {
      if (line.startsWith("#")) log.info(dim(`  ${line}`));
      else log.info(`  ${cyan(line)}`);
    }
  }
}

export interface EnsureIntegrationSyncedResult {
  readonly ok: boolean;
  readonly diagnosis: IntegrationSyncDiagnosis;
  readonly pulled: boolean;
}

/**
 * Fetch + ensure local integration can be used as the base for a new task branch.
 * Switches to the integration branch, then `--ff-only` pull when needed. Never force-resets.
 * Governance-only dirt is stashed around switch/pull so post-`init` `.vibeops.json` edits do not block.
 */
export async function ensureIntegrationSynced(
  opts: EnsureIntegrationSyncedOptions,
): Promise<EnsureIntegrationSyncedResult> {
  const { cwd, remote, integrationBranch } = opts;
  const doFetch = opts.fetch !== false;

  if (opts.dryRun === true) {
    const d = await diagnoseIntegrationSync(cwd, remote, integrationBranch);
    return { ok: d.ok || d.kind === "no_remote_branch", diagnosis: d, pulled: false };
  }

  if ((await gitRemoteUrl(cwd, remote)) === null) {
    const d = await diagnoseIntegrationSync(cwd, remote, integrationBranch);
    return { ok: true, diagnosis: d, pulled: false };
  }

  if (doFetch) {
    try {
      await gitFetchRemote(cwd, remote);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      log.warn(dim(`git fetch failed (${msg}) — diagnosing with local refs.`));
    }
  }

  const git = await readGitInfo(cwd);
  if (git.branch !== integrationBranch) {
    const switched = await gitSwitchToBranch(cwd, integrationBranch, remote);
    if (!switched) {
      return {
        ok: false,
        diagnosis: {
          ok: false,
          kind: "pull_failed",
          summary: `Could not switch to integration branch "${integrationBranch}".`,
          fixes: [
            "git status",
            `git checkout ${integrationBranch}`,
            `# If checkout fails due to local changes: git stash -u`,
            `git pull --ff-only ${remote} ${integrationBranch}`,
            "vibeops task add",
          ],
        },
        pulled: false,
      };
    }
  }

  let diagnosis = await diagnoseIntegrationSync(cwd, remote, integrationBranch);
  if (!diagnosis.ok) {
    return { ok: false, diagnosis, pulled: false };
  }

  if (diagnosis.kind === "no_remote_branch") {
    return { ok: true, diagnosis, pulled: false };
  }

  const localSha = await gitRevParse(cwd, integrationBranch);
  const remoteSha = await gitRevParse(cwd, remoteRef(remote, integrationBranch));
  if (localSha !== null && remoteSha !== null && localSha === remoteSha) {
    return { ok: true, diagnosis, pulled: false };
  }

  // Stash governance dirt so ff-only pull cannot be blocked by `.vibeops.json` etc.
  const stashed = await stashGovernanceIfBlocking(cwd);
  try {
    await gitPullFastForwardOnly(cwd, remote, integrationBranch);
    diagnosis = {
      ok: true,
      kind: "ok",
      summary: `Pulled latest ${remote}/${integrationBranch} (--ff-only).`,
      fixes: [],
    };
    return { ok: true, diagnosis, pulled: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    diagnosis = await diagnoseIntegrationSync(cwd, remote, integrationBranch);
    if (diagnosis.ok) {
      diagnosis = {
        ok: false,
        kind: "pull_failed",
        summary: `git pull --ff-only failed: ${msg}`,
        fixes: [
          `git checkout ${integrationBranch}`,
          `git pull --ff-only ${remote} ${integrationBranch}`,
          "vibeops task add",
        ],
      };
    }
    return { ok: false, diagnosis, pulled: false };
  } finally {
    await restoreGovernanceStashAfterSwitch(cwd, stashed);
  }
}
