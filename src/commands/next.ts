import { resolve } from "node:path";

import { ensureCursorImplementPrompt } from "../lib/cursor-task-prompt.js";
import { readText } from "../lib/filesystem.js";
import { doneCommand } from "./done.js";
import { notionSyncCommand } from "./notion-sync.js";
import { startCommand } from "./start.js";
import { readConfig } from "../lib/config.js";
import { pathExists } from "../lib/filesystem.js";
import {
  popGuideHistory,
  pushGuideHistory,
  readGuideState,
  writeGuideState,
} from "../lib/guide-state.js";
import { askSelect, yesNoSelect } from "../lib/inquirer-helpers.js";
import { bold, cyan, dim, green, log, yellow } from "../lib/logger.js";
import { projectPaths } from "../lib/paths.js";
import { statusDisplay } from "../lib/task.js";
import {
  excerptDoneSummary,
  LAST_DONE_SUMMARY_REL,
  readLastDoneSummary,
} from "../lib/mvp-done-summary.js";
import {
  followUpStepId,
  guideStepRank,
  inferGuideStep,
  successorStepId,
  type GuideContext,
  type GuideStep,
  type GuideStepId,
} from "../lib/workflow-guide.js";

export interface NextCommandOptions {
  readonly cwd?: string;
  readonly dryRun?: boolean;
  readonly nonInteractive?: boolean;
  readonly execute?: boolean;
  readonly mergeViaPr?: boolean;
  readonly allowDirty?: boolean;
}

const MENU_NEXT_RUN = "Next — run suggested step";
const MENU_NEXT_ADVANCE = "Next — check / advance step";
const MENU_PREV = "Previous step";
const MENU_REFRESH = "Refresh (re-detect from repo)";
const MENU_QUIT = "Quit";

async function renderPanel(ctx: GuideContext): Promise<void> {
  const { step, task, gitBranch, gitDirty } = ctx;
  log.blank();
  log.info(bold("─".repeat(56)));
  log.info(bold("  VibeOps · what's next"));
  log.info(bold("─".repeat(56)));
  if (task) {
    log.info(`  ${dim("TASK")}     ${cyan(task.id)} — ${task.title || dim("(no title)")}`);
    log.info(`  ${dim("Status")}  ${statusDisplay(task.status)}`);
    if (gitBranch) {
      log.info(
        `  ${dim("Git")}      ${gitBranch}${gitDirty === true ? yellow(" · dirty") : gitDirty === false ? green(" · clean") : ""}`,
      );
    }
  } else if (ctx.mode === "post-mvp" && ctx.referenceTask) {
    log.info(
      `  ${dim("TASK")}     ${dim("(continue — last:")} ${cyan(ctx.referenceTask.id)} ${dim("done)")}`,
    );
  } else if (ctx.mode === "post-mvp") {
    log.info(`  ${dim("TASK")}     ${dim("(MVP complete — plan next slice)")}`);
  } else {
    log.info(`  ${dim("TASK")}     ${dim("(none — run vibeops plan)")}`);
  }
  log.blank();
  log.info(bold(`  Step: ${step.title}`));
  for (const line of step.youDo) log.info(`    ${dim("·")} ${line}`);
  if (step.vibeopsCommand) {
    log.blank();
    log.info(`  ${dim("Command")}  ${cyan(step.vibeopsCommand)}`);
  }
  if (step.shellHints.length > 0) {
    log.blank();
    log.info(dim("  Shell:"));
    for (const h of step.shellHints) log.info(`    ${dim("$")} ${h}`);
  }
  log.info(bold("─".repeat(56)));

  if (ctx.task && (step.id === "implement" || step.id === "commit")) {
    const body = await readText(ctx.task.filePath);
    const cursorPrompt = await ensureCursorImplementPrompt(
      ctx.cwd,
      ctx.config,
      ctx.task,
      body,
    );
    if (cursorPrompt !== null) {
      log.blank();
      log.info(bold("  Cursor"));
      const missing: string[] = [];
      if (cursorPrompt.fillResult) missing.push("Result");
      if (cursorPrompt.fillTestResult) missing.push("Test Result");
      log.info(
        `    ${dim("·")} ${missing.join(" / ")} not filled — start a chat and @-mention:`,
      );
      log.info(`      ${cyan(cursorPrompt.rel)}`);
      log.info(
        `    ${dim("·")} Or open that file and send its contents as the first message.`,
      );
    }
  }

  const prior = await readLastDoneSummary(ctx.cwd);
  if (
    prior !== null &&
    (step.id === "no-mvp" ||
      step.id === "all-done" ||
      step.id === "continue-iteration" ||
      task?.status === "done")
  ) {
    log.blank();
    log.info(bold("  Previous iteration"));
    for (const line of excerptDoneSummary(prior, 14).split("\n")) {
      log.info(`    ${dim(line)}`);
    }
    log.info(`    ${dim("full")} ${cyan(LAST_DONE_SUMMARY_REL)}`);
  }
  log.blank();
}

interface RunStepResult {
  readonly ok: boolean;
  readonly advancedTo?: GuideStepId;
}

async function runStep(
  ctx: GuideContext,
  step: GuideStep,
  dryRun: boolean,
  opts: NextCommandOptions,
): Promise<RunStepResult> {
  if (dryRun && step.runnable) {
    log.info(bold("dry-run — would run:"));
    log.info(`  ${cyan(step.vibeopsCommand ?? step.title)}`);
    return { ok: true, advancedTo: step.id };
  }

  switch (step.id) {
    case "start":
    case "checkout-task": {
      const ref = ctx.task?.id ?? "mvp";
      await startCommand(ref, { cwd: ctx.cwd, dryRun: false });
      return { ok: process.exitCode !== 1, advancedTo: "implement" };
    }
    case "finish": {
      const ref = ctx.task?.id ?? "mvp";
      await doneCommand(ref, {
        cwd: ctx.cwd,
        dryRun: false,
        mergeViaPr: opts.mergeViaPr,
        allowDirty: opts.allowDirty,
      });
      return {
        ok: process.exitCode !== 1,
        advancedTo: ctx.mode === "mvp" ? "all-done" : undefined,
      };
    }
    case "notion-sync":
      await notionSyncCommand({ cwd: ctx.cwd, dryRun: false });
      return { ok: process.exitCode !== 1, advancedTo: "all-done" };
    default:
      log.info(dim("Nothing to execute for this step."));
      return { ok: true };
  }
}

export async function nextCommand(options: NextCommandOptions = {}): Promise<void> {
  const cwd = resolve(options.cwd ?? process.cwd());
  const paths = projectPaths(cwd);

  if (!(await pathExists(paths.config))) {
    log.error(`Not a VibeOps project. Run ${cyan("vibeops init")} first.`);
    process.exitCode = 1;
    return;
  }

  const config = await readConfig(paths.root);
  let guideState = await readGuideState(paths.vibeopsDir);
  /** Set only after "Previous step" — one-shot forced step for display. */
  let forceStepOnce: GuideStepId | undefined;

  const loadContext = async (forceStepId?: GuideStepId): Promise<GuideContext> => {
    const inferred = await inferGuideStep({ cwd, paths, config });
    const taskKey = inferred.task?.id ?? inferred.referenceTask?.id ?? null;
    const saved =
      forceStepOnce ??
      (guideState?.taskId === taskKey &&
      guideState.stepId &&
      guideStepRank(guideState.stepId) > guideStepRank(inferred.step.id)
        ? guideState.stepId
        : undefined);
    if (saved !== undefined && saved !== inferred.step.id) {
      return inferGuideStep({ cwd, paths, config, forceStepId: saved });
    }
    return inferred;
  };

  const syncGuideStep = async (ctx: GuideContext): Promise<void> => {
    if (forceStepOnce !== undefined) return;
    const taskKey = ctx.task?.id ?? ctx.referenceTask?.id ?? null;
    if (guideState?.taskId === taskKey && guideState.stepId) {
      if (guideStepRank(guideState.stepId) > guideStepRank(ctx.step.id)) return;
    }
    if (guideState?.stepId === ctx.step.id && guideState?.taskId === taskKey) return;
    guideState = pushGuideHistory(guideState, taskKey, ctx.step.id);
    await writeGuideState(paths.vibeopsDir, guideState);
  };

  if (options.nonInteractive === true) {
    const ctx = await loadContext(undefined);
    await renderPanel(ctx);
    if (options.execute === true && ctx.step.runnable) {
      await runStep(ctx, ctx.step, options.dryRun === true, options);
      if (ctx.task) {
        await writeGuideState(
          paths.vibeopsDir,
          pushGuideHistory(guideState, ctx.task.id, ctx.step.id),
        );
      }
    }
    return;
  }

  if (!process.stdin.isTTY) {
    const ctx = await loadContext(guideState?.stepId);
    await renderPanel(ctx);
    log.info(dim("Re-run in a terminal for the interactive menu."));
    return;
  }

  for (;;) {
    const ctx = await loadContext(forceStepOnce);
    forceStepOnce = undefined;
    await syncGuideStep(ctx);
    await renderPanel(ctx);

    const menuNext = ctx.step.runnable ? MENU_NEXT_RUN : MENU_NEXT_ADVANCE;
    const picked = await askSelect({
      message: "Choose",
      nonInteractive: false,
      choices: [menuNext, MENU_PREV, MENU_REFRESH, MENU_QUIT],
      default: menuNext,
    });

    if (picked === MENU_QUIT) {
      log.info(dim("Resume with: vibeops next"));
      return;
    }
    if (picked === MENU_REFRESH) {
      guideState = null;
      continue;
    }
    if (picked === MENU_PREV) {
      if (!guideState?.history.length) {
        log.warn("No previous step in .vibeops/state/guide.json");
        continue;
      }
      const popped = popGuideHistory(guideState);
      guideState = popped.next;
      if (popped.stepId) forceStepOnce = popped.stepId;
      continue;
    }

    const step = ctx.step;
    if (!step.runnable) {
      const body = ctx.task ? await readText(ctx.task.filePath) : "";
      const fresh = await loadContext(undefined);
      if (fresh.task?.id !== ctx.task?.id && ctx.task) {
        log.warn(
          `Still on ${ctx.gitBranch ?? "task branch"} for ${ctx.task.id}. Run ${cyan(`vibeops done ${ctx.task.id}`)} (commit, merge, Notion) before starting ${fresh.task?.id ?? "another TASK"}.`,
        );
        continue;
      }
      if (fresh.step.runnable && fresh.step.id !== step.id) {
        log.ok(`Step updated: ${bold(fresh.step.title)}`);
        const go = await yesNoSelect({
          message: `Run: ${fresh.step.vibeopsCommand ?? fresh.step.title}?`,
          defaultValue: true,
        });
        if (!go) continue;
        const result = await runStep(fresh, fresh.step, options.dryRun === true, options);
        if (!result.ok) {
          log.warn("Step failed — fix the issue, then Refresh.");
          continue;
        }
        const nextId = result.advancedTo ?? followUpStepId(fresh.step.id);
        if (nextId !== null && nextId !== undefined) {
          guideState = pushGuideHistory(
            guideState,
            fresh.task?.id ?? fresh.referenceTask?.id ?? null,
            nextId,
          );
          await writeGuideState(paths.vibeopsDir, guideState);
        } else {
          guideState = null;
        }
        guideState = await readGuideState(paths.vibeopsDir);
        log.ok("Done.");
        log.blank();
        continue;
      }

      const succ = successorStepId(step.id, { body, gitDirty: ctx.gitDirty });
      if (succ !== null && succ !== step.id) {
        const go = await yesNoSelect({
          message: `Move to next step (${succ})?`,
          defaultValue: true,
        });
        if (!go) continue;
        guideState = pushGuideHistory(guideState, ctx.task?.id ?? null, succ);
        await writeGuideState(paths.vibeopsDir, guideState);
        log.ok(`Advanced to ${succ}.`);
        log.blank();
        continue;
      }

      log.info(
        dim(
          "This step is manual (Cursor / git). Fill Result and Test Result, then choose Next again or Refresh.",
        ),
      );
      continue;
    }

    const go = await yesNoSelect({
      message: `Run: ${step.vibeopsCommand ?? step.title}?`,
      defaultValue: true,
    });
    if (!go) continue;

    const result = await runStep(ctx, step, options.dryRun === true, options);
    if (!result.ok) {
      log.warn("Step failed — fix the issue, then Refresh.");
      continue;
    }

    const nextId = result.advancedTo ?? followUpStepId(step.id);
    if (nextId !== null && nextId !== undefined) {
      await writeGuideState(
        paths.vibeopsDir,
        pushGuideHistory(guideState, ctx.task?.id ?? ctx.referenceTask?.id ?? null, nextId),
      );
    } else {
      guideState = null;
    }
    guideState = await readGuideState(paths.vibeopsDir);
    log.ok(`Done. Refresh or Next for the following step.`);
    log.blank();
  }
}
