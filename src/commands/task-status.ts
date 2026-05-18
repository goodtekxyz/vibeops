import { resolve } from "node:path";

import {
  collectTaskStatusBrief,
  taskStatusBriefToJson,
  type TaskStatusBrief,
} from "../lib/task-status-brief.js";
import { bold, cyan, dim, green, log, yellow } from "../lib/logger.js";

export interface TaskStatusCommandOptions {
  json?: boolean;
  cwd?: string;
}

function sectionFilled(ok: boolean): string {
  return ok ? green("filled") : yellow("empty");
}

function printHuman(brief: TaskStatusBrief): void {
  log.blank();
  log.info(bold("─".repeat(56)));
  log.info(bold("  VibeOps · TASK briefing"));
  log.info(bold("─".repeat(56)));

  if (!brief.isVibeopsProject) {
    log.info(`  ${dim("Project")}  ${yellow("not a VibeOps project")} (.vibeops.json missing)`);
    if (brief.git.isRepo && brief.git.branch) {
      log.info(`  ${dim("Git")}      ${brief.git.branch}`);
    }
    log.blank();
    log.info(`  ${dim("Next")}     ${cyan("vibeops init")}`);
    log.info(bold("─".repeat(56)));
    log.blank();
    return;
  }

  if (brief.projectName) {
    log.info(`  ${dim("Project")}  ${brief.projectName}`);
  }

  if (brief.counts) {
    const c = brief.counts;
    log.info(
      `  ${dim("Backlog")}  ${c.total} tasks · ${cyan(String(c.in_progress))} in progress · ${c.planned} planned · ${c.done} done`,
    );
  }

  if (brief.inProgressTasks.length > 1) {
    log.blank();
    log.info(bold("  In progress (multiple)"));
    for (const t of brief.inProgressTasks) {
      log.info(`    ${cyan(t.id)} — ${t.title || dim("(no title)")}`);
    }
  }

  log.blank();
  if (brief.activeTask) {
    const t = brief.activeTask;
    log.info(`  ${dim("Focus")}    ${cyan(t.id)} — ${t.title || dim("(no title)")}`);
    log.info(`  ${dim("Status")}  ${t.status}`);
    if (t.mvpPhase) log.info(`  ${dim("Phase")}   ${t.mvpPhase}`);
    log.info(`  ${dim("File")}     ${t.file}`);
  } else if (brief.mode === "post-mvp" && brief.referenceTask) {
    log.info(
      `  ${dim("Focus")}    ${dim("MVP/backlog complete — last:")} ${cyan(brief.referenceTask.id)}`,
    );
  } else {
    log.info(`  ${dim("Focus")}    ${dim("(none — run vibeops plan or task add)")}`);
  }

  if (brief.sections) {
    log.blank();
    log.info(bold("  Progress"));
    if (brief.sections.goalExcerpt.length > 0) {
      log.info(`    ${dim("Goal")}  ${brief.sections.goalExcerpt}`);
    }
    log.info(
      `    ${dim("Result")}  ${sectionFilled(brief.sections.resultFilled)} · ${dim("Test Result")}  ${sectionFilled(brief.sections.testResultFilled)}`,
    );
    if (brief.sections.acceptanceCriteriaCount > 0) {
      log.info(
        `    ${dim("AC")}      ${brief.sections.acceptanceCriteriaCount} acceptance criteria`,
      );
    }
  }

  log.blank();
  log.info(bold("  Git"));
  if (!brief.git.isRepo) {
    log.info(`    ${yellow("not a git repository")}`);
  } else {
    const branch = brief.git.branch ?? "(detached)";
    log.info(`    ${dim("HEAD")}     ${branch}`);
    if (brief.git.dirty === true) log.info(`    ${dim("Tree")}    ${yellow("dirty")}`);
    else if (brief.git.dirty === false) log.info(`    ${dim("Tree")}    ${green("clean")}`);
    if (brief.git.expectedTaskBranch) {
      const on =
        brief.git.onTaskBranch === true
          ? green("yes")
          : brief.git.onTaskBranch === false
            ? yellow("no")
            : dim("—");
      const exists =
        brief.git.taskBranchExists === true
          ? dim("exists")
          : brief.git.taskBranchExists === false
            ? dim("not created")
            : "";
      log.info(
        `    ${dim("Task br.")}  ${brief.git.expectedTaskBranch} · on branch: ${on}${exists ? ` · ${exists}` : ""}`,
      );
    }
    if (brief.git.baseBranch) {
      log.info(`    ${dim("Base")}     ${brief.git.baseBranch}`);
    }
  }

  if (brief.artifacts.length > 0) {
    log.blank();
    log.info(bold("  Cursor artifacts"));
    for (const a of brief.artifacts) log.info(`    ${cyan(a)}`);
  }

  log.blank();
  log.info(bold(`  Step: ${brief.workflow.stepTitle}`));
  for (const line of brief.workflow.youDo) {
    log.info(`    ${dim("·")} ${line}`);
  }
  if (brief.workflow.suggestedCommand) {
    log.blank();
    log.info(`  ${dim("Suggested")}  ${cyan(brief.workflow.suggestedCommand)}`);
  }

  log.info(bold("─".repeat(56)));
  log.blank();
}

export async function taskStatusCommand(opts: TaskStatusCommandOptions = {}): Promise<void> {
  const cwd = resolve(opts.cwd ?? process.cwd());
  const brief = await collectTaskStatusBrief(cwd);

  if (opts.json === true) {
    log.raw(taskStatusBriefToJson(brief));
  } else {
    printHuman(brief);
  }

  if (!brief.isVibeopsProject) {
    process.exitCode = 1;
  }
}
