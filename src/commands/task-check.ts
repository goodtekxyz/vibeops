import { join, relative, resolve } from "node:path";

import { pathExists, readText } from "../lib/filesystem.js";
import {
  gitAllChangedFilesSinceTaskStart,
  gitCommitsAhead,
  gitLogOneline,
  readGitInfo,
} from "../lib/git.js";
import { bold, cyan, dim, green, log, red, yellow } from "../lib/logger.js";
import { projectPaths } from "../lib/paths.js";
import {
  findAcceptanceCriteria,
  findExpectedFiles,
  findTaskFile,
  hasNonEmptySection,
  readGitContext,
  readSection,
  readTaskFile,
  statusDisplay,
} from "../lib/task.js";
import { buildTaskPromptString } from "../lib/task-prompt.js";

export interface TaskCheckOptions {
  cwd?: string;
  strict?: boolean;
  agent?: string;
}

function relOrAbs(root: string, p: string): string {
  const r = relative(root, p);
  return r === "" ? "." : r.startsWith("..") ? p : r;
}

function todayLogFileName(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}.md`;
}

export async function taskCheckCommand(
  taskId: string,
  options: TaskCheckOptions = {},
): Promise<void> {
  const cwd = resolve(options.cwd ?? process.cwd());
  const paths = projectPaths(cwd);
  const agentName = options.agent ?? "reviewer";
  let missing = 0;

  const taskFile = await findTaskFile(paths.docsTasks, taskId);
  if (!taskFile) {
    log.error(`TASK not found: ${taskId} (looked in ${relOrAbs(cwd, paths.docsTasks)})`);
    process.exitCode = 1;
    return;
  }
  const meta = await readTaskFile(taskFile);
  const body = await readText(taskFile);

  log.info(bold(`vibeops task check ${meta.id}`));
  log.info(`  ${dim("file")}    ${relOrAbs(cwd, taskFile)}`);
  log.info(`  ${dim("title")}   ${meta.title || dim("(no title)")}`);
  log.info(`  ${dim("status")}  ${statusDisplay(meta.status)}`);
  log.blank();

  log.info(bold("Git"));
  const git = await readGitInfo(cwd);
  if (!git.isRepo) {
    log.info(`  ${red("✗")} not a git repository`);
    missing++;
  } else {
    log.info(`  ${dim("branch")}  ${git.branch ?? dim("(detached)")}`);
    log.info(`  ${dim("status")}  ${git.dirty ? yellow("dirty") : green("clean")}`);
  }

  const ctx = await readGitContext(taskFile);
  if (ctx === null) {
    log.info(`  ${yellow("·")} no Git Context section yet — run \`vibeops task start ${meta.id}\` first.`);
    missing++;
  } else {
    log.info(`  ${dim("base")}    ${ctx.baseBranch} @ ${ctx.baseCommit}`);
    log.info(`  ${dim("task branch")} ${cyan(ctx.taskBranch)}`);
    log.info(`  ${dim("started at")} ${ctx.startedAt}`);
    if (git.isRepo) {
      const range = `${ctx.baseCommit}..HEAD`;
      const summary = await gitAllChangedFilesSinceTaskStart(ctx.baseCommit, cwd);
      const ahead = await gitCommitsAhead(cwd, ctx.baseCommit);
      log.info(`  ${dim("commits ahead")} ${ahead}`);
      log.info(`  ${dim("working tree changed files")} ${summary.workingTree.length}`);
      log.info(`  ${dim("committed changed files")} ${summary.committed.length}`);
      log.info(`  ${dim("total changed files")} ${summary.all.length}`);
      const recent = await gitLogOneline(cwd, `${range}`);
      const head = recent.slice(0, 5);
      if (head.length > 0) {
        log.info(`  ${dim("recent commits:")}`);
        for (const c of head) log.info(`    · ${c.sha}  ${c.message}`);
      }

      const expected = findExpectedFiles(body);
      if (expected.length > 0) {
        log.blank();
        log.info(bold("Expected Files to Change vs current diff"));
        const lower = new Set(summary.all.map((c) => c.toLowerCase()));
        let hit = 0;
        for (const e of expected) {
          const present = lower.has(e.toLowerCase());
          if (present) hit++;
          log.info(
            `  ${present ? green("✓") : yellow("·")} ${e}${present ? "" : dim(" (not yet in diff)")}`,
          );
        }
        log.info(
          dim(`  match ${hit}/${expected.length} (${Math.round((hit / expected.length) * 100)}%)`),
        );
        log.info(
          dim(
            `  basis: working tree(${summary.workingTree.length}) ∪ committed(${summary.committed.length}) = total(${summary.all.length}) files`,
          ),
        );
      }
    }
  }
  log.blank();

  log.info(bold("Acceptance Criteria"));
  const ac = findAcceptanceCriteria(body);
  if (ac.length === 0) {
    log.info(`  ${dim("(none parsed — TASK file may not use \"1. …\" list format)")}`);
  } else {
    for (let i = 0; i < ac.length; i++) {
      log.info(`  ${dim(`${i + 1}.`)} ${ac[i]}`);
    }
    log.info(dim(`  → confirm each item manually with the diff before \`vibeops task done\`.`));
  }
  log.blank();

  log.info(bold("Docs touched in this round"));
  const docsChecks: Array<{ label: string; path: string; required: boolean }> = [
    { label: "current-state (03)", path: join(paths.docsProject, "03-current-state.md"), required: false },
    { label: "current-state (05)", path: join(paths.docsProject, "05-current-state.md"), required: false },
    { label: `log (${todayLogFileName()})`, path: join(paths.docsLogs, todayLogFileName()), required: false },
  ];
  let anyDoc = false;
  for (const c of docsChecks) {
    const present = await pathExists(c.path);
    if (present) anyDoc = true;
    log.info(`  ${present ? green("✓") : dim("·")} ${c.label}  ${dim(relOrAbs(cwd, c.path))}`);
  }
  if (!anyDoc) {
    log.info(
      `  ${yellow("!")} no current-state or today's log file found — Docs Agent must update them before \`task done\`.`,
    );
    missing++;
  }
  log.blank();

  log.info(bold("TASK Result / Test Result"));
  const resultOk = hasNonEmptySection(body, "Result");
  const testResultOk = hasNonEmptySection(body, "Test Result");
  log.info(
    `  ${resultOk ? green("✓") : yellow("·")} Result        ${dim(resultOk ? readSection(body, "Result").split("\n")[0]?.slice(0, 80) ?? "" : "(empty / placeholder)")}`,
  );
  log.info(
    `  ${testResultOk ? green("✓") : yellow("·")} Test Result   ${dim(testResultOk ? readSection(body, "Test Result").split("\n")[0]?.slice(0, 80) ?? "" : "(empty / placeholder)")}`,
  );
  if (!resultOk) missing++;
  if (!testResultOk) missing++;
  log.blank();

  log.info(bold("Summary"));
  if (missing === 0) {
    log.ok("All checks present. Ready for `vibeops task done`.");
  } else {
    log.info(`  ${yellow("!")} ${missing} item(s) need attention before \`vibeops task done\`.`);
  }
  log.blank();

  const promptResult = await buildTaskPromptString({
    projectRoot: paths.root,
    agentsDir: paths.vibeopsAgents,
    agentName,
    taskFilePath: taskFile,
  });
  if (promptResult.ok) {
    log.info(bold(`Cursor prompt (agent: ${agentName}):`));
    log.info(dim("─".repeat(60)));
    log.raw(promptResult.prompt.endsWith("\n") ? promptResult.prompt : `${promptResult.prompt}\n`);
    log.info(dim("─".repeat(60)));
  } else {
    log.info(
      dim(
        `(agent "${agentName}" not found — install \`.vibeops/agents/${agentName}.md\` or pass --agent <name>)`,
      ),
    );
  }

  if (options.strict === true && missing > 0) {
    process.exitCode = 1;
  }
}
