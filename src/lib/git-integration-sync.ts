import {
  gitBranchExists,
  gitFetch,
  gitGovernanceOnlyDirty,
  gitLeftRightCount,
  gitRemoteBranchExists,
  gitRemoteUrl,
  gitRevParse,
  readGitInfo,
} from "./git.js";
import {
  fastForwardLocalIntegration,
  logLocalIntegrationUpdate,
  resolveIntegrationBaseRef,
} from "./git-worktree.js";
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
          `git switch ${integrationBranch}   # or run in the worktree that has it (git worktree list)`,
          `git pull --ff-only ${remote} ${integrationBranch}`,
          "git stash pop   # if you stashed",
          "vibeops task add",
        ],
      };
    }
    // Governance-only dirty (.vibeops.json after init, docs, …) — proceed.
  }

  const remoteSha = await gitRevParse(cwd, remoteRef(remote, integrationBranch));
  const localSha = (await gitBranchExists(cwd, integrationBranch))
    ? await gitRevParse(cwd, `refs/heads/${integrationBranch}`)
    : null;
  if (localSha === null && remoteSha !== null) {
    // No local integration branch (e.g. a fresh worktree) — task branches start
    // from the remote-tracking ref, nothing to fast-forward.
    return {
      ok: true,
      kind: "ok",
      summary: `No local ${integrationBranch} — using ${remote}/${integrationBranch}.`,
      fixes: [],
    };
  }
  if (localSha === null || remoteSha === null) {
    return {
      ok: false,
      kind: "pull_failed",
      summary: `Could not resolve ${integrationBranch} or ${remote}/${integrationBranch}.`,
      fixes: [
        `git fetch ${remote}`,
        `git switch ${integrationBranch}   # or run in the worktree that has it (git worktree list)`,
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
        `git switch ${integrationBranch}   # or run in the worktree that has it (git worktree list)`,
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
        `git switch ${integrationBranch}   # or run in the worktree that has it (git worktree list)`,
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
  /** Local integration ref was fast-forwarded. */
  readonly pulled: boolean;
  /**
   * Ref a new task branch must start from: `<remote>/<integration>` when it
   * exists, else the local integration branch. Null when `ok` is false.
   */
  readonly baseRef: string | null;
}

/**
 * Worktree-safe integration preflight (D-006). Never checks out the integration
 * branch (another worktree may own it) and never force-resets:
 * 1. `git fetch <remote> <integration>`;
 * 2. diagnose (app dirt / local ahead / diverged → refuse with fixes);
 * 3. fast-forward the local integration ref only where safe
 *    ({@link fastForwardLocalIntegration});
 * 4. return the base ref for the task branch (`<remote>/<integration>`).
 */
export async function ensureIntegrationSynced(
  opts: EnsureIntegrationSyncedOptions,
): Promise<EnsureIntegrationSyncedResult> {
  const { cwd, remote, integrationBranch } = opts;
  const doFetch = opts.fetch !== false;

  if (opts.dryRun === true) {
    const d = await diagnoseIntegrationSync(cwd, remote, integrationBranch);
    const ok = d.ok || d.kind === "no_remote_branch";
    return {
      ok,
      diagnosis: d,
      pulled: false,
      baseRef: ok ? await resolveIntegrationBaseRef(cwd, remote, integrationBranch) : null,
    };
  }

  if ((await gitRemoteUrl(cwd, remote)) !== null && doFetch) {
    try {
      await gitFetch(cwd, remote, integrationBranch);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      log.warn(dim(`git fetch failed (${msg}) — diagnosing with local refs.`));
    }
  }

  const diagnosis = await diagnoseIntegrationSync(cwd, remote, integrationBranch);
  if (!diagnosis.ok) {
    return { ok: false, diagnosis, pulled: false, baseRef: null };
  }

  const baseRef = await resolveIntegrationBaseRef(cwd, remote, integrationBranch);
  if (baseRef === null) {
    return {
      ok: false,
      diagnosis: {
        ok: false,
        kind: "pull_failed",
        summary: `Integration branch "${integrationBranch}" not found locally or on ${remote}.`,
        fixes: ["vibeops init   # or create and push the integration branch"],
      },
      pulled: false,
      baseRef: null,
    };
  }

  if (diagnosis.kind === "no_remote" || diagnosis.kind === "no_remote_branch") {
    return { ok: true, diagnosis, pulled: false, baseRef };
  }

  try {
    const update = await fastForwardLocalIntegration(cwd, remote, integrationBranch);
    logLocalIntegrationUpdate(update, remote, integrationBranch);
    if (update.kind === "fast_forwarded") {
      return {
        ok: true,
        diagnosis: {
          ok: true,
          kind: "ok",
          summary: `Fast-forwarded ${integrationBranch} to ${remote}/${integrationBranch}.`,
          fixes: [],
        },
        pulled: true,
        baseRef,
      };
    }
    return { ok: true, diagnosis, pulled: false, baseRef };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      diagnosis: {
        ok: false,
        kind: "pull_failed",
        summary: `Could not fast-forward ${integrationBranch}: ${msg}`,
        fixes: [`git merge --ff-only ${remote}/${integrationBranch}   # in the worktree that has ${integrationBranch}`],
      },
      pulled: false,
      baseRef: null,
    };
  }
}
