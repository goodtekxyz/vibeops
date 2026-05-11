import { relative, resolve } from "node:path";

import { readText } from "../lib/filesystem.js";
import { bold, cyan, dim, green, log, yellow } from "../lib/logger.js";
import { projectPaths } from "../lib/paths.js";
import {
  findTaskFile,
  hasNonEmptySection,
  parseTaskFilename,
  pickNextTask,
  readGitContext,
  readTaskFile,
  scanTasks,
  statusDisplay,
  updateInlineStatus,
} from "../lib/task.js";

export interface TaskDoneOptions {
  dryRun?: boolean;
  finalize?: boolean;
  cwd?: string;
}

function relOrAbs(root: string, p: string): string {
  const r = relative(root, p);
  return r === "" ? "." : r.startsWith("..") ? p : r;
}

function commitMessageFor(taskId: string, title: string, mvpPhase: string | undefined): string {
  const trimmed = (title || taskId).trim();
  const slug = trimmed.replace(/^TASK-\d+\s*[·:\-]\s*/i, "").trim() || trimmed;
  const scope = taskId.toLowerCase();
  const typePrefix =
    typeof mvpPhase === "string" && /rollback/i.test(mvpPhase) ? "chore" : "feat";
  return `${typePrefix}(${scope}): ${slug}`;
}

export async function taskDoneCommand(
  taskId: string,
  options: TaskDoneOptions = {},
): Promise<void> {
  const cwd = resolve(options.cwd ?? process.cwd());
  const paths = projectPaths(cwd);

  const taskFile = await findTaskFile(paths.docsTasks, taskId);
  if (!taskFile) {
    log.error(`TASK not found: ${taskId} (looked in ${relOrAbs(cwd, paths.docsTasks)})`);
    process.exitCode = 1;
    return;
  }
  const meta = await readTaskFile(taskFile);
  const body = await readText(taskFile);

  log.info(bold(`vibeops task done ${meta.id}`));
  log.info(`  ${dim("file")}    ${relOrAbs(cwd, taskFile)}`);
  log.info(`  ${dim("title")}   ${meta.title || dim("(no title)")}`);
  log.info(`  ${dim("status")}  ${statusDisplay(meta.status)}`);
  log.blank();

  const resultOk = hasNonEmptySection(body, "Result");
  const testResultOk = hasNonEmptySection(body, "Test Result");
  const docCheck: Array<[string, boolean]> = [
    ["Result section", resultOk],
    ["Test Result section", testResultOk],
  ];
  log.info(bold("Required sections"));
  let missing = 0;
  for (const [label, ok] of docCheck) {
    if (!ok) missing++;
    log.info(`  ${ok ? green("✓") : yellow("·")} ${label}${ok ? "" : dim(" (empty or placeholder)")}`);
  }
  log.blank();

  if (missing > 0) {
    log.error(
      `${missing} required section(s) still empty. Fill Result / Test Result first, then re-run \`vibeops task done\`.`,
    );
    process.exitCode = 1;
    return;
  }

  const target = options.finalize === true ? "done" : "review";
  const targetDisplay = statusDisplay(target);

  if (options.dryRun === true) {
    log.info(bold("dry-run — would perform:"));
    log.info(`  · update Status → ${targetDisplay} in ${relOrAbs(cwd, taskFile)}`);
    log.info(`  · (no git commit, no Notion call)`);
    log.blank();
  } else {
    await updateInlineStatus(taskFile, target);
    log.ok(`Status → ${targetDisplay}  (${relOrAbs(cwd, taskFile)})`);
    log.blank();
  }

  const ctx = await readGitContext(taskFile);
  const parts = parseTaskFilename(taskFile);
  const commitMsg = commitMessageFor(parts.id, meta.title, meta.mvpPhase);
  log.info(bold("Suggested commit"));
  log.info(`  ${cyan(`git add -A && git commit -m "${commitMsg}"`)}`);
  if (ctx !== null) {
    log.info(
      `  ${dim(`after commit on ${ctx.taskBranch}: open PR or run \`git switch ${ctx.baseBranch} && git merge --no-ff ${ctx.taskBranch}\``)}`,
    );
  } else {
    log.info(`  ${dim("(no Git Context section — skipping merge guidance)")}`);
  }
  log.blank();

  log.info(bold("Notion"));
  log.info(`  ${dim("TODO (MVP 4 / TASK-011): \`vibeops notion sync\` will push this TASK metadata.")}`);
  log.blank();

  const all = await scanTasks(paths.docsTasks);
  const next = pickNextTask(all.filter((t) => t.id.toUpperCase() !== meta.id.toUpperCase()));
  log.info(bold("Next TASK candidate"));
  if (next) {
    log.info(
      `  → ${cyan(next.id)} — ${next.title || dim("(no title)")}  ${dim(`[${statusDisplay(next.status)}]`)}`,
    );
    log.info(`    file: ${dim(relOrAbs(cwd, next.filePath))}`);
    log.info(`    start: ${dim(`vibeops task start ${next.id}`)}`);
  } else {
    log.info(`  ${dim("(no remaining planned / in-progress / review TASK)")}`);
  }
  log.blank();

  if (target === "review") {
    log.info(
      `Status는 ${cyan("Review")}로 두었다. 사람 또는 Reviewer Agent 검토 후 ${cyan(`vibeops task done ${meta.id} --finalize`)}로 Done 처리하라.`,
    );
  } else {
    log.ok(`${meta.id} finalized → Done.`);
  }
}
