import { ghAuthStatus, runGh } from "./github-cli.js";
import {
  gitBranchExists,
  gitCheckout,
  gitCommitsAhead,
  gitDeleteBranch,
  gitGovernanceOnlyDirty,
  gitRemoteUrl,
  readGitInfo,
  runGit,
} from "./git.js";
import { bold, cyan, dim, log } from "./logger.js";
import type { GitContext } from "../types/task.js";

export type TaskMergeMode = "direct" | "pr";

export interface MergeTaskBranchOptions {
  readonly cwd: string;
  readonly taskId: string;
  readonly taskTitle: string;
  readonly gitCtx: GitContext;
  readonly mode?: TaskMergeMode;
  readonly dryRun?: boolean;
  readonly allowDirty?: boolean;
  readonly remote?: string;
}

export interface MergeTaskBranchResult {
  readonly ok: boolean;
  readonly mode: TaskMergeMode;
  readonly prUrl?: string;
}

function mergeCommitMessage(taskId: string, taskTitle: string, taskBranch: string): string {
  const slug = taskTitle.replace(/^TASK-\d+\s*[·:\-]\s*/i, "").trim() || taskId;
  return `merge(${taskId.toLowerCase()}): ${slug} (${taskBranch})`;
}

function prTitle(taskId: string, taskTitle: string): string {
  const slug = taskTitle.replace(/^TASK-\d+\s*[·:\-]\s*/i, "").trim() || taskId;
  return `feat(${taskId.toLowerCase()}): ${slug}`;
}

async function gitPush(cwd: string, remote: string, ref: string, setUpstream: boolean): Promise<void> {
  const args = ["push"];
  if (setUpstream) args.push("-u");
  args.push(remote, ref);
  await runGit(cwd, args);
}

async function findOpenPrNumber(
  baseBranch: string,
  headBranch: string,
): Promise<{ readonly number: number; readonly url?: string } | null> {
  const res = await runGh([
    "pr",
    "list",
    "--head",
    headBranch,
    "--base",
    baseBranch,
    "--state",
    "open",
    "--json",
    "number,url",
    "--limit",
    "1",
  ]);
  if (!res.ok) return null;
  try {
    const rows = JSON.parse(res.stdout) as { number?: number; url?: string }[];
    const row = rows[0];
    if (row && typeof row.number === "number") {
      return { number: row.number, url: row.url };
    }
  } catch {
    return null;
  }
  return null;
}

export async function mergeTaskBranch(opts: MergeTaskBranchOptions): Promise<MergeTaskBranchResult> {
  const mode = opts.mode ?? "direct";
  const remote = opts.remote ?? "origin";
  const { cwd, gitCtx, taskId, taskTitle } = opts;
  const { baseBranch, taskBranch } = gitCtx;

  if (baseBranch === taskBranch) {
    log.error("Task branch matches base branch; nothing to merge.");
    return { ok: false, mode };
  }

  const git = await readGitInfo(cwd);
  if (!git.isRepo) {
    log.error("Not a git repository.");
    return { ok: false, mode };
  }

  const remoteUrl = await gitRemoteUrl(cwd, remote);
  if (!remoteUrl) {
    log.error(`No git remote "${remote}". Run ${cyan("vibeops github init")} or add the remote first.`);
    return { ok: false, mode };
  }

  const branchExists = await gitBranchExists(cwd, taskBranch);
  if (!branchExists) {
    log.error(`Local task branch not found: ${taskBranch}`);
    return { ok: false, mode };
  }

  const ahead = await gitCommitsAhead(cwd, baseBranch, taskBranch);
  if (ahead === 0) {
    log.warn(`No commits on ${taskBranch} ahead of ${baseBranch}. Merge may be a no-op.`);
  }

  const planLines = [
    `push ${remote} ${taskBranch}`,
    mode === "direct"
      ? `checkout ${baseBranch} · pull · merge --no-ff ${taskBranch} · push ${remote} ${baseBranch}`
      : `gh pr create (if needed) · gh pr merge --merge --delete-branch`,
    `delete local branch ${taskBranch}`,
    mode === "direct" ? `delete remote branch ${remote}/${taskBranch}` : "(remote branch removed by gh if supported)",
  ];

  if (opts.dryRun === true) {
    log.info(bold("dry-run — would perform:"));
    for (const line of planLines) {
      log.info(`  · ${line}`);
    }
    return { ok: true, mode };
  }

  log.step(bold(`Merging ${cyan(taskBranch)} → ${cyan(baseBranch)} (${mode})`));

  try {
    log.step(`Pushing ${taskBranch} to ${remote}…`);
    await gitPush(cwd, remote, taskBranch, true);
    log.ok(`pushed ${taskBranch}`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    log.error(`git push failed: ${msg}`);
    return { ok: false, mode };
  }

  if (mode === "pr") {
    const auth = await ghAuthStatus();
    if (!auth.authenticated) {
      log.error(`gh is not authenticated. Run ${cyan("gh auth login")} or use direct merge (default).`);
      return { ok: false, mode };
    }

    let pr = await findOpenPrNumber(baseBranch, taskBranch);
    if (!pr) {
      log.step("Opening pull request…");
      const create = await runGh([
        "pr",
        "create",
        "--base",
        baseBranch,
        "--head",
        taskBranch,
        "--title",
        prTitle(taskId, taskTitle),
        "--body",
        `Automated via vibeops next for ${taskId}.`,
      ]);
      if (!create.ok) {
        log.error(`gh pr create failed: ${create.stderr.trim() || create.stdout.trim()}`);
        return { ok: false, mode };
      }
      const url = create.stdout.trim();
      log.ok(`PR created${url.length > 0 ? `: ${url}` : ""}`);
      pr = await findOpenPrNumber(baseBranch, taskBranch);
    } else {
      log.ok(`Using existing PR #${pr.number}`);
    }

    if (!pr) {
      log.error("Could not find PR number after create.");
      return { ok: false, mode };
    }

    log.step(`Merging PR #${pr.number}…`);
    const merged = await runGh([
      "pr",
      "merge",
      String(pr.number),
      "--merge",
      "--delete-branch",
    ]);
    if (!merged.ok) {
      log.error(`gh pr merge failed: ${merged.stderr.trim() || merged.stdout.trim()}`);
      return { ok: false, mode };
    }
    log.ok(`PR #${pr.number} merged`);

    try {
      await gitCheckout(cwd, baseBranch);
      await runGit(cwd, ["pull", remote, baseBranch]);
    } catch {
      log.warn(`Run manually: git switch ${baseBranch} && git pull ${remote} ${baseBranch}`);
    }

    if (await gitBranchExists(cwd, taskBranch)) {
      try {
        await gitDeleteBranch(cwd, taskBranch, { force: true });
        log.ok(`deleted local branch ${taskBranch}`);
      } catch {
        log.warn(`Could not delete local branch ${taskBranch}.`);
      }
    }

    return { ok: true, mode, prUrl: pr.url };
  }

  // direct merge
  if (git.dirty === true && opts.allowDirty !== true) {
    const gov = await gitGovernanceOnlyDirty(cwd);
    if (!gov.onlyGovernance) {
      log.error("Working tree is dirty. Commit or stash before merging, or rerun with --allow-dirty.");
      return { ok: false, mode };
    }
    log.warn("Dirty tree has only governance docs — proceeding.");
  }

  try {
    await runGit(cwd, ["fetch", remote]);
    await gitCheckout(cwd, baseBranch);
    await runGit(cwd, ["pull", remote, baseBranch]);
    log.step(`Merging ${taskBranch} into ${baseBranch}…`);
    await runGit(cwd, [
      "merge",
      "--no-ff",
      taskBranch,
      "-m",
      mergeCommitMessage(taskId, taskTitle, taskBranch),
    ]);
    await gitPush(cwd, remote, baseBranch, false);
    log.ok(`merged and pushed ${baseBranch}`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    log.error(`merge failed: ${msg}`);
    log.info(dim(`  Resolve conflicts on ${baseBranch}, then commit and push manually.`));
    return { ok: false, mode };
  }

  try {
    await gitDeleteBranch(cwd, taskBranch, { force: false });
    log.ok(`deleted local branch ${taskBranch}`);
  } catch {
    try {
      await gitDeleteBranch(cwd, taskBranch, { force: true });
      log.ok(`deleted local branch ${taskBranch} (force)`);
    } catch {
      log.warn(`Could not delete local branch ${taskBranch}.`);
    }
  }

  try {
    await runGit(cwd, ["push", remote, "--delete", taskBranch]);
    log.ok(`deleted remote branch ${remote}/${taskBranch}`);
  } catch {
    log.warn(
      dim(`Remote branch may already be gone. To remove: git push ${remote} --delete ${taskBranch}`),
    );
  }

  return { ok: true, mode };
}
