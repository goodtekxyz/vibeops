import { join } from "node:path";

import { notionSyncCommand } from "../commands/notion-sync.js";
import { askYesNo } from "./inquirer-helpers.js";
import { readConfig } from "./config.js";
import { pathExists, readText, readTextOrNull, writeText } from "./filesystem.js";
import {
  detectDefaultBranch,
  gitAddPaths,
  gitCheckoutNewBranch,
  gitHeadCommit,
  gitMergeInProgress,
  gitRemoteUrl,
  listUnmergedRelPaths,
  listWorkingTreeRelPaths,
  partitionPathsForAutoCommit,
  readGitInfo,
  runGit,
  tryResolveGovernanceUnmerged,
} from "./git.js";
import { bold, cyan, dim, log, yellow } from "./logger.js";
import { llmCompleteJson, resolveAvailableLlmProvider } from "./llm-complete.js";
import { NEXT_TASK_SUGGESTION_REL } from "./mvp-constants.js";
import {
  LAST_DONE_SUMMARY_REL,
  readLastDoneSummary,
} from "./mvp-done-summary.js";
import { mergeTaskBranch } from "./task-merge.js";
import { parseTaskFilename, readSection } from "./task.js";
import type { GitContext } from "../types/task.js";

const BRIEF_REL = ".vibeops/brief/project-brief.md";

export interface DoneFollowUpOptions {
  readonly cwd: string;
  readonly taskFile: string;
  readonly taskTitle: string;
  readonly dryRun?: boolean;
  readonly noNotionSync?: boolean;
  readonly interactive?: boolean;
}

async function gitDiffStatSummary(cwd: string): Promise<string> {
  try {
    const stat = await runGit(cwd, ["diff", "--stat"]);
    const body = stat.stdout.trim();
    return body.length > 0 ? body : "(no staged/unstaged diff — check untracked files with git status)";
  } catch {
    return "(could not read git diff)";
  }
}

export async function syncNotionAfterDone(opts: DoneFollowUpOptions): Promise<void> {
  if (opts.noNotionSync === true) {
    log.info(dim("Notion sync skipped (--no-notion-sync)."));
    return;
  }

  const config = await readConfig(opts.cwd);
  if (config?.notion?.enabled !== true) {
    log.info(dim("Notion sync skipped (not enabled in .vibeops.json)."));
    return;
  }

  log.blank();
  log.step(bold("Notion sync"));
  if (opts.dryRun === true) {
    log.info(dim("  dry-run: would run vibeops notion sync"));
    return;
  }

  const prevCode = process.exitCode;
  await notionSyncCommand({ cwd: opts.cwd, dryRun: false });
  if (process.exitCode === 1) {
    log.warn("Notion sync failed — fix integration and run `vibeops notion sync`.");
  } else {
    log.ok("Notion sync complete.");
  }
  if (prevCode === 1) process.exitCode = 1;
}

async function handleMergeInProgressDirtyTree(opts: DoneFollowUpOptions): Promise<boolean> {
  const unmerged = await listUnmergedRelPaths(opts.cwd);
  if (unmerged.length > 0) {
    log.warn("Unmerged files from the task merge:");
    for (const p of unmerged.slice(0, 12)) log.info(`  ${dim("·")} ${p}`);
    if (unmerged.length > 12) log.info(`  ${dim("·")} … and ${unmerged.length - 12} more`);
    const resolved = await tryResolveGovernanceUnmerged(opts.cwd);
    if (resolved.length > 0) {
      log.ok(
        `Auto-resolved ${resolved.length} governance conflict(s) (kept incoming branch version).`,
      );
    }
    const still = await listUnmergedRelPaths(opts.cwd);
    if (still.length > 0) {
      log.error("Remaining conflicts — resolve manually, then:");
      for (const p of still) log.info(`  ${dim("·")} ${p}`);
      log.info(dim("  git add <paths> && git commit   (completes merge)"));
      log.info(dim("  Or abort: git merge --quit"));
      return false;
    }
  }

  const allPaths = await listWorkingTreeRelPaths(opts.cwd);
  const { committable } = partitionPathsForAutoCommit(allPaths, {
    unmerged: await listUnmergedRelPaths(opts.cwd),
  });
  if (committable.length > 0) {
    await gitAddPaths(opts.cwd, committable);
    log.info(dim("Staged remaining changes."));
  }
  log.warn("Complete the merge on this branch:");
  log.info(dim("  git commit -m \"merge: complete TASK merge and post-done files\""));
  return false;
}

async function cleanupDirtyTree(opts: DoneFollowUpOptions): Promise<boolean> {
  const git = await readGitInfo(opts.cwd);
  if (!git.isRepo || git.dirty !== true) return true;

  if (await gitMergeInProgress(opts.cwd)) {
    log.blank();
    log.warn(
      `${yellow("!")} Git merge still in progress — cannot create a cleanup branch yet.`,
    );
    return handleMergeInProgressDirtyTree(opts);
  }

  const unmerged = await listUnmergedRelPaths(opts.cwd);
  const allPaths = await listWorkingTreeRelPaths(opts.cwd);
  const { committable, excluded, unmerged: unmergedListed } = partitionPathsForAutoCommit(
    allPaths,
    { unmerged },
  );

  log.blank();
  log.warn(`${yellow("!")} Working tree is still dirty after done.`);
  const summary = await gitDiffStatSummary(opts.cwd);
  log.info(dim("Changes:"));
  log.info(dim(summary.split("\n").map((l) => `  ${l}`).join("\n")));

  if (unmergedListed.length > 0) {
    log.warn("Skipping unmerged paths until conflicts are resolved:");
    for (const p of unmergedListed.slice(0, 8)) log.info(`  ${dim("·")} ${p}`);
  }

  if (excluded.length > 0) {
    log.blank();
    log.warn("These paths are build/install artifacts — VibeOps will not commit them:");
    for (const p of excluded.slice(0, 8)) log.info(`  ${dim("·")} ${p}`);
    if (excluded.length > 8) log.info(`  ${dim("·")} … and ${excluded.length - 8} more`);
    log.info(
      dim("  Add node_modules/, .next/, etc. to .gitignore if they are not already ignored."),
    );
  }

  if (committable.length === 0) {
    log.warn(
      "Nothing safe to auto-commit — fix .gitignore and remove tracked artifacts before the next TASK.",
    );
    return false;
  }

  log.blank();
  log.info(dim("Would commit:"));
  for (const p of committable.slice(0, 12)) log.info(`  ${dim("·")} ${p}`);
  if (committable.length > 12) log.info(`  ${dim("·")} … and ${committable.length - 12} more`);

  let proceed = false;
  if (opts.interactive === true) {
    proceed = await askYesNo({
      message:
        "Create a cleanup branch, commit the paths above (not node_modules/.next), merge, and delete the branch?",
      nonInteractive: false,
      defaultValue: true,
    });
  }

  if (!proceed) {
    log.info(dim("Cleanup skipped — commit manually before starting the next TASK."));
    return false;
  }

  if (opts.dryRun === true) {
    log.info(dim("  dry-run: would create chore/vibeops-post-done-* branch, commit, merge"));
    return false;
  }

  const taskId = parseTaskFilename(opts.taskFile).id;
  const baseBranch = (await detectDefaultBranch(opts.cwd)) ?? "main";
  const baseCommit = (await gitHeadCommit(opts.cwd, false)) ?? "";
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const cleanupBranch = `chore/vibeops-post-done-${stamp}`;

  await gitCheckoutNewBranch(opts.cwd, cleanupBranch);
  await gitAddPaths(opts.cwd, committable);
  await runGit(opts.cwd, [
    "commit",
    "-q",
    "-m",
    `chore(post-done): cleanup uncommitted work after ${taskId}`,
  ]);
  log.ok(`Committed on ${cleanupBranch}`);

  const remote = (await gitRemoteUrl(opts.cwd, "origin")) ?? "";
  if (remote.length === 0) {
    log.warn("No origin remote — merge locally only.");
    await runGit(opts.cwd, ["switch", baseBranch]);
    await runGit(opts.cwd, ["merge", "--no-ff", cleanupBranch, "-m", `merge: post-mvp cleanup`]);
    await runGit(opts.cwd, ["branch", "-d", cleanupBranch]);
    return (await readGitInfo(opts.cwd)).dirty !== true;
  }

  const ctx: GitContext = {
    baseBranch,
    baseCommit,
    taskBranch: cleanupBranch,
    startedAt: new Date().toISOString(),
  };

  const merged = await mergeTaskBranch({
    cwd: opts.cwd,
    taskId,
    taskTitle: opts.taskTitle,
    gitCtx: ctx,
    mode: "direct",
  });

  if (!merged.ok) {
    log.warn("Cleanup merge did not finish — resolve Git state manually.");
    return false;
  }

  const after = await readGitInfo(opts.cwd);
  if (after.dirty === true) {
    log.warn("Tree is still dirty after cleanup merge.");
    return false;
  }
  log.ok("Working tree clean after post-MVP cleanup.");
  return true;
}

interface NextTaskSuggestion {
  readonly title: string;
  readonly oneLineIdea: string;
  readonly goal: string;
  readonly scope: readonly string[];
  readonly rationale: string;
}

function renderSuggestionMarkdown(
  s: NextTaskSuggestion,
  priorDoneSummary: string | null,
): string {
  const priorBlock =
    priorDoneSummary !== null
      ? `## Previous iteration (from \`${LAST_DONE_SUMMARY_REL}\`)\n\n${priorDoneSummary.trim()}\n\n---\n\n`
      : "";
  return `# Next iteration (suggested)

${priorBlock}## Title

${s.title}

## One-line idea

${s.oneLineIdea}

## Goal

${s.goal}

## Suggested scope

${s.scope.map((x) => `- ${x}`).join("\n")}

## Rationale

${s.rationale}

---

Run planning again when ready:

\`\`\`bash
vibeops plan --idea "${s.oneLineIdea.replace(/"/g, '\\"')}"
\`\`\`
`;
}

async function suggestNextTask(opts: DoneFollowUpOptions): Promise<void> {
  const git = await readGitInfo(opts.cwd);
  if (git.dirty === true) {
    log.info(dim("Next-task suggestion skipped until the working tree is clean."));
    return;
  }

  const briefPath = join(opts.cwd, BRIEF_REL);
  const brief =
    (await readTextOrNull(briefPath)) ??
    "(no project brief — run vibeops plan or add .vibeops/brief/project-brief.md)";
  const priorDone = await readLastDoneSummary(opts.cwd);
  const result = readSection(await readText(opts.taskFile), "Result");

  const provider = await resolveAvailableLlmProvider(opts.cwd);
  if (provider === null) {
    log.info(
      dim(
        `Next-task suggestion skipped (no LLM). Connect Codex OAuth, Cursor Agent, or OPENAI_API_KEY.`,
      ),
    );
    return;
  }

  log.blank();
  log.step(bold("Next iteration (LLM suggestion)"));
  const providerLabel =
    provider === "codex-oauth"
      ? "Codex OAuth"
      : provider === "cursor-agent"
        ? "Cursor Agent CLI"
        : "OpenAI API";
  log.info(dim(`  using ${providerLabel}`));

  if (opts.dryRun === true) {
    log.info(dim(`  dry-run: would write ${NEXT_TASK_SUGGESTION_REL}`));
    return;
  }

  try {
    const { text: raw } = await llmCompleteJson(
      [
        {
          role: "system",
          content:
            "You suggest the next small product iteration after an MVP shipped. Reply with JSON only: title, oneLineIdea, goal, scope (string array, 3-6 items), rationale.",
        },
        {
          role: "user",
          content: [
            `Project brief:\n${brief.slice(0, 8000)}`,
            priorDone
              ? `\nLast done summary (${LAST_DONE_SUMMARY_REL}):\n${priorDone.slice(0, 12000)}`
              : "",
            `\nMVP Result (TASK file):\n${result.slice(0, 6000)}`,
            "\nSuggest the next TASK (post-MVP), not a full replan.",
          ].join("\n"),
        },
      ],
      { cwd: opts.cwd, provider },
    );
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const suggestion: NextTaskSuggestion = {
      title: String(parsed.title ?? "Next iteration"),
      oneLineIdea: String(parsed.oneLineIdea ?? parsed.title ?? "Next feature slice"),
      goal: String(parsed.goal ?? ""),
      scope: Array.isArray(parsed.scope)
        ? parsed.scope.map((x) => String(x))
        : ["(define scope in vibeops plan)"],
      rationale: String(parsed.rationale ?? ""),
    };
    const outPath = join(opts.cwd, NEXT_TASK_SUGGESTION_REL);
    await writeText(outPath, renderSuggestionMarkdown(suggestion, priorDone));
    log.ok(`Wrote ${cyan(NEXT_TASK_SUGGESTION_REL)}`);
    log.info(`  ${dim("title")}  ${suggestion.title}`);
    log.info(`  ${dim("idea")}   ${suggestion.oneLineIdea}`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    log.warn(`Next-task suggestion failed (${msg}).`);
  }
}

/** Notion sync, dirty-tree cleanup, and optional next-task LLM suggestion after `vibeops done`. */
export async function runDoneFollowUp(opts: DoneFollowUpOptions): Promise<void> {
  await syncNotionAfterDone(opts);

  const clean = await cleanupDirtyTree(opts);
  if (clean) {
    await suggestNextTask(opts);
  }

  log.blank();
  log.info(bold("Next"));
  log.info(`  · ${cyan("vibeops status")}`);
  if (await pathExists(join(opts.cwd, LAST_DONE_SUMMARY_REL))) {
    log.info(`  · ${cyan(LAST_DONE_SUMMARY_REL)} — what shipped last time`);
  }
  if (await pathExists(join(opts.cwd, NEXT_TASK_SUGGESTION_REL))) {
    log.info(`  · ${cyan(NEXT_TASK_SUGGESTION_REL)} — suggested follow-up`);
  }
  log.info(`  · ${cyan("vibeops plan --idea \"…\"")} — start the next iteration when ready`);
}
