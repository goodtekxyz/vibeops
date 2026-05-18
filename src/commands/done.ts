import { relative, resolve } from "node:path";

import { askYesNo } from "../lib/inquirer-helpers.js";
import { readText } from "../lib/filesystem.js";
import { bold, dim, green, log, yellow } from "../lib/logger.js";
import { writeDoneSummary } from "../lib/mvp-done-summary.js";
import { mergeTaskBranch } from "../lib/task-merge.js";
import { projectPaths } from "../lib/paths.js";
import {
  commandTaskNotFoundMessage,
  resolveCommandTask,
} from "../lib/resolve-command-task.js";
import {
  hasNonEmptySection,
  parseTaskFilename,
  readGitContext,
  readTaskFile,
  updateInlineStatus,
} from "../lib/task.js";
import { runDoneFollowUp } from "../lib/done-follow-up.js";
import {
  gitAddPaths,
  listWorkingTreeRelPaths,
  partitionPathsForAutoCommit,
  readGitInfo,
  runGit,
} from "../lib/git.js";

export interface DoneCommandOptions {
  dryRun?: boolean;
  cwd?: string;
  noMerge?: boolean;
  mergeViaPr?: boolean;
  allowDirty?: boolean;
  noNotionSync?: boolean;
  /** Skip writing last-done-summary.md and TASK section auto-fill. */
  skipSummary?: boolean;
  /** Overwrite Result / Test Result even when already filled. */
  refreshTaskSections?: boolean;
}

function relOrAbs(root: string, p: string): string {
  const r = relative(root, p);
  return r === "" ? "." : r.startsWith("..") ? p : r;
}

function commitMessageFor(taskId: string, title: string): string {
  const trimmed = (title || taskId).trim();
  const slug = trimmed.replace(/^TASK-(?:\d+|mvp)\s*[·:\-]\s*/i, "").trim() || trimmed;
  return `feat(${taskId.toLowerCase()}): ${slug}`;
}

async function tryCommitDirty(cwd: string, message: string, dryRun: boolean): Promise<boolean> {
  const git = await readGitInfo(cwd);
  if (!git.isRepo || git.dirty !== true) return false;
  const { committable, excluded } = partitionPathsForAutoCommit(
    await listWorkingTreeRelPaths(cwd),
    { unmerged: [] },
  );
  if (committable.length === 0) {
    if (excluded.length > 0) {
      log.warn(
        "Dirty tree is only node_modules/.next-style paths — add them to .gitignore; commit skipped.",
      );
    }
    return false;
  }
  if (excluded.length > 0) {
    log.warn(
      `Skipping ${excluded.length} build/install path(s) from auto-commit (e.g. ${excluded[0]}).`,
    );
  }
  if (dryRun) {
    log.info(dim(`  would: git add (${committable.length} paths) && git commit -m "${message}"`));
    return true;
  }
  try {
    await gitAddPaths(cwd, committable);
    await runGit(cwd, ["commit", "-q", "-m", message]);
    log.ok(`Committed: ${message}`);
    return true;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    log.warn(`Commit skipped (${msg}).`);
    return false;
  }
}

/** Finalize TASK-mvp: auto-fill Result/Test Result, summary md, merge, Notion. */
export async function doneCommand(
  taskRef: string | undefined,
  options: DoneCommandOptions = {},
): Promise<void> {
  const cwd = resolve(options.cwd ?? process.cwd());
  const paths = projectPaths(cwd);
  const dryRun = options.dryRun === true;
  const interactive = !dryRun && process.stdin.isTTY === true;

  const resolved = await resolveCommandTask(paths, cwd, taskRef);
  if (resolved === null) {
    log.error(commandTaskNotFoundMessage(taskRef));
    process.exitCode = 1;
    return;
  }
  const { taskFile, source } = resolved;
  if (source === "backlog-active") {
    log.info(dim(`No TASK-mvp — using ${resolved.taskId}.`));
  }

  const meta = await readTaskFile(taskFile);

  log.info(bold(`vibeops done ${meta.id}`));
  log.info(`  ${dim("file")}  ${relOrAbs(cwd, taskFile)}`);
  log.blank();

  if (options.skipSummary !== true) {
    log.step(bold("Summary + TASK sections"));
    await writeDoneSummary({
      cwd,
      taskId: meta.id,
      taskTitle: meta.title,
      taskFile,
      dryRun,
      refreshTaskSections: options.refreshTaskSections === true,
    });
    log.blank();
  }

  const body = await readText(taskFile);
  const resultOk = hasNonEmptySection(body, "Result");
  const testResultOk = hasNonEmptySection(body, "Test Result");

  log.info(bold("Required sections"));
  let missing = 0;
  for (const [label, ok] of [
    ["Result", resultOk],
    ["Test Result", testResultOk],
  ] as const) {
    if (!ok) missing++;
    log.info(`  ${ok ? green("✓") : yellow("·")} ${label}`);
  }
  log.blank();

  if (missing > 0) {
    log.error(
      `Could not auto-fill Result / Test Result. Connect Codex OAuth, Cursor Agent CLI, or OPENAI_API_KEY — or fill sections manually.`,
    );
    process.exitCode = 1;
    return;
  }

  if (dryRun) {
    log.info(bold("dry-run — would:"));
    log.info(`  · Status → Done`);
    log.info(`  · commit if dirty, then merge (unless --no-merge)`);
    log.info(`  · Notion sync (if enabled)`);
    await runDoneFollowUp({
      cwd,
      taskFile,
      taskTitle: meta.title,
      dryRun: true,
      noNotionSync: options.noNotionSync,
      interactive,
    });
    return;
  }

  await updateInlineStatus(taskFile, "done");
  log.ok(`Status → Done`);

  const parts = parseTaskFilename(taskFile);
  const commitMsg = commitMessageFor(parts.id, meta.title);
  await tryCommitDirty(cwd, commitMsg, false);

  const gitCtx = await readGitContext(taskFile);
  if (options.noMerge !== true && gitCtx !== null) {
    let doMerge = !interactive;
    if (interactive) {
      doMerge = await askYesNo({
        message: `Push, merge into ${gitCtx.baseBranch}, and delete ${gitCtx.taskBranch}?`,
        nonInteractive: false,
        defaultValue: true,
      });
    }
    if (doMerge) {
      const mergeResult = await mergeTaskBranch({
        cwd,
        taskId: meta.id,
        taskTitle: meta.title,
        gitCtx,
        mode: options.mergeViaPr === true ? "pr" : "direct",
        allowDirty: options.allowDirty,
      });
      if (!mergeResult.ok) {
        process.exitCode = 1;
      }
    } else {
      log.info(dim("Merge skipped — run `vibeops next` later."));
    }
  } else if (gitCtx === null) {
    log.info(dim("No Git Context — merge skipped. Run `vibeops start` before the next MVP."));
  }

  await runDoneFollowUp({
    cwd,
    taskFile,
    taskTitle: meta.title,
    dryRun: false,
    noNotionSync: options.noNotionSync,
    interactive,
  });
}
