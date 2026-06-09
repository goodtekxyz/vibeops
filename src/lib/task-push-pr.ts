import { readText } from "./filesystem.js";
import { readConfig } from "./config.js";
import { detectGitHost, mergeRequestLabel } from "./git-host.js";
import { requireGitConfig } from "./git-config.js";
import {
  gitCommitsAhead,
  gitDiffNameOnly,
  gitLogOneline,
  gitPush,
  gitRemoteUrl,
  readGitInfo,
} from "./git.js";
import { dim, log } from "./logger.js";
import {
  createMergeRequest,
  findMergeRequestByBranches,
  probeMergeRequestCli,
} from "./pr-create.js";
import { fallbackTaskPr, generateTaskPrWithLlm } from "./task-pr-llm.js";
import { readGitContext, readTaskFile } from "./task.js";
import type { GitContext } from "../types/task.js";
import type { LlmProviderPreference } from "../types/config.js";

export interface FinishTaskPullRequestOptions {
  readonly cwd: string;
  readonly taskFile: string;
  readonly dryRun?: boolean;
  readonly skipPr?: boolean;
  /** Open a new MR/PR even when an open one exists for the task branch (`task reship`). */
  readonly forceNewMergeRequest?: boolean;
}

function mergeRequestAlreadyExistsMessage(msg: string): boolean {
  const lower = msg.toLowerCase();
  return (
    lower.includes("already exists") ||
    lower.includes("merge request already exists") ||
    lower.includes("pull request already exists")
  );
}

export interface FinishTaskPullRequestResult {
  readonly ok: boolean;
  readonly mergeRequestUrl?: string;
  readonly pushed?: boolean;
}

async function buildDiffSummary(cwd: string, gitCtx: GitContext): Promise<string> {
  const files = await gitDiffNameOnly(cwd, `${gitCtx.baseCommit}..HEAD`);
  const commits = await gitLogOneline(cwd, `${gitCtx.baseCommit}..HEAD`);
  const lines: string[] = [];
  if (commits.length > 0) {
    lines.push("Commits:");
    for (const c of commits.slice(0, 20)) {
      lines.push(`- ${c.sha} ${c.message}`);
    }
    if (commits.length > 20) lines.push(`- … and ${commits.length - 20} more`);
  }
  if (files.length > 0) {
    lines.push("", "Files:");
    for (const f of files.slice(0, 40)) lines.push(`- ${f}`);
    if (files.length > 40) lines.push(`- … and ${files.length - 40} more`);
  }
  return lines.join("\n") || "(no commits since task start)";
}

/** Push task branch and open MR/PR. Does not write MR URL into TASK md (host is source of truth). */
export async function finishTaskWithPullRequest(
  opts: FinishTaskPullRequestOptions,
): Promise<FinishTaskPullRequestResult> {
  let gitCfg = await requireGitConfig(opts.cwd);
  const gitCtx = await readGitContext(opts.taskFile);
  if (gitCtx === null) {
    log.warn("No Git Context on TASK — push and merge request skipped.");
    return { ok: true };
  }

  const label = mergeRequestLabel(gitCfg.host);

  if (opts.dryRun) {
    log.info(
      dim(
        `would git push -u ${gitCfg.remote} ${gitCtx.taskBranch} and open ${label} → ${gitCtx.baseBranch}`,
      ),
    );
    return { ok: true, mergeRequestUrl: "(dry-run)" };
  }

  const remoteUrl = await gitRemoteUrl(opts.cwd, gitCfg.remote);
  if (!remoteUrl) {
    log.error(
      `Remote "${gitCfg.remote}" is not configured. Add it or re-run vibeops init.`,
    );
    return { ok: false };
  }

  const detectedHost = detectGitHost(remoteUrl);
  if (detectedHost !== null && detectedHost !== gitCfg.host) {
    log.warn(
      `Remote host (${detectedHost}) differs from .vibeops.json (${gitCfg.host}). Using ${detectedHost} for MR/PR.`,
    );
    gitCfg = { ...gitCfg, host: detectedHost };
  }

  const git = await readGitInfo(opts.cwd);
  if (git.branch !== gitCtx.taskBranch) {
    log.warn(
      `Current branch is ${git.branch ?? "(detached)"}, not ${gitCtx.taskBranch}. Push may fail.`,
    );
  }

  const ahead = await gitCommitsAhead(opts.cwd, gitCtx.baseCommit, "HEAD");
  if (ahead === 0) {
    log.warn("No commits ahead of base — pushing branch anyway.");
  }

  try {
    await gitPush(opts.cwd, gitCfg.remote, gitCtx.taskBranch, true);
    log.ok(`Pushed ${gitCtx.taskBranch} → ${gitCfg.remote}`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    log.error(`git push failed: ${msg}`);
    return { ok: false };
  }

  if (opts.skipPr === true) {
    log.info(dim("Merge request creation skipped (--no-pr)."));
    return { ok: true, pushed: true };
  }

  if (opts.forceNewMergeRequest !== true) {
    const existing = await findMergeRequestByBranches({
      cwd: opts.cwd,
      host: gitCfg.host,
      headBranch: gitCtx.taskBranch,
      baseBranch: gitCtx.baseBranch,
      state: "open",
    });
    if (existing !== null) {
      log.ok(`Open ${label} updated: ${existing.url}`);
      log.info(dim("MR/PR URL is on the host — not written to TASK md (use task merge)."));
      return { ok: true, mergeRequestUrl: existing.url, pushed: true };
    }
  }

  const cliOk = await probeMergeRequestCli(gitCfg.host);
  if (!cliOk) {
    const tool = gitCfg.host === "gitlab" ? "glab" : "gh";
    log.warn(
      `${tool} CLI not found — create the ${label} manually: ${gitCtx.taskBranch} → ${gitCtx.baseBranch}`,
    );
    return { ok: true, pushed: true };
  }

  const config = await readConfig(opts.cwd);
  const preference: LlmProviderPreference = config?.llm?.provider ?? "auto";
  const meta = await readTaskFile(opts.taskFile);
  const taskBody = await readText(opts.taskFile);
  const diffSummary = await buildDiffSummary(opts.cwd, gitCtx);

  const prInput = {
    taskId: meta.id,
    title: meta.title,
    taskBody,
    diffSummary,
    baseBranch: gitCtx.baseBranch,
    headBranch: gitCtx.taskBranch,
  };

  const llmPr = await generateTaskPrWithLlm(prInput, opts.cwd, preference);
  const { prTitle, prBody } = llmPr ?? fallbackTaskPr(prInput);

  try {
    const { url } = await createMergeRequest({
      cwd: opts.cwd,
      host: gitCfg.host,
      baseBranch: gitCtx.baseBranch,
      headBranch: gitCtx.taskBranch,
      title: prTitle,
      body: prBody,
    });
    log.ok(`${label}: ${url}`);
    log.info(dim("MR/PR URL is on the host — not written to TASK md (use task merge)."));
    return { ok: true, mergeRequestUrl: url, pushed: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (mergeRequestAlreadyExistsMessage(msg)) {
      const existing = await findMergeRequestByBranches({
        cwd: opts.cwd,
        host: gitCfg.host,
        headBranch: gitCtx.taskBranch,
        baseBranch: gitCtx.baseBranch,
        state: "open",
      });
      if (existing !== null) {
        log.ok(`Open ${label} updated: ${existing.url}`);
        log.info(dim("MR/PR URL is on the host — not written to TASK md (use task merge)."));
        return { ok: true, mergeRequestUrl: existing.url, pushed: true };
      }
    }
    log.error(`Could not create merge request: ${msg}`);
    log.info(
      dim(
        `Branch was pushed. Create MR manually: ${gitCtx.taskBranch} → ${gitCtx.baseBranch}`,
      ),
    );
    return { ok: false, pushed: true };
  }
}
