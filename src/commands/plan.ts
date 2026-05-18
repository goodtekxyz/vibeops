import { isAbsolute, join, relative, resolve } from "node:path";

import {
  briefToMarkdown,
  findMissingRequired,
  gatherBrief,
  parseBriefFromMarkdown,
  parseIdea,
} from "../lib/brief.js";
import { pathExists, readText, writeText } from "../lib/filesystem.js";
import { bold, cyan, dim, log, yellow } from "../lib/logger.js";
import { gatherBriefViaLlm, pickPlanDialogueLocale, pickPlanLlmProvider } from "../lib/plan-llm-session.js";
import { pickPlanExecutionModel } from "../lib/plan-llm-models.js";
import type { PlanLlmProviderId } from "../lib/plan-llm-types.js";
import { writeMvpArtifacts } from "../lib/mvp-artifacts.js";
import { LAST_DONE_SUMMARY_REL, readLastDoneSummary } from "../lib/mvp-done-summary.js";
import { MVP_BUILD_PROMPT_REL } from "../lib/mvp-constants.js";
import { projectPaths } from "../lib/paths.js";
import type { BriefBundle } from "../types/brief.js";

export interface PlanCommandOptions {
  idea?: string;
  from?: string;
  nonInteractive?: boolean;
  provider?: PlanLlmProviderId;
  llmModel?: string;
  cwd?: string;
}

const DEFAULT_BRIEF_REL = ".vibeops/brief/project-brief.md";

function toAbsolute(root: string, candidate: string): string {
  return isAbsolute(candidate) ? candidate : resolve(root, candidate);
}

function relDisplay(root: string, abs: string): string {
  const r = relative(root, abs);
  return r.length === 0 ? "." : r;
}

export async function planCommand(options: PlanCommandOptions = {}): Promise<void> {
  const cwd = resolve(options.cwd ?? process.cwd());
  const nonInteractive = options.nonInteractive === true;
  const paths = projectPaths(cwd);

  if (!(await pathExists(paths.config))) {
    log.error(`Not a VibeOps project: ${cyan(".vibeops.json")} was not found under this directory.`);
    log.info(`  ${dim("Run")} ${cyan("vibeops init")} ${dim("here first, then run")} ${cyan("vibeops plan")} ${dim("again.")}`);
    process.exitCode = 1;
    return;
  }

  const briefAbs = join(cwd, DEFAULT_BRIEF_REL);

  log.info(bold(`vibeops plan`));
  log.info(dim(`  cwd: ${cwd}`));
  if (options.from) log.info(dim(`  from: ${options.from}`));
  if (options.idea) log.info(dim(`  idea: ${options.idea}`));
  if (typeof options.llmModel === "string" && options.llmModel.trim().length > 0) {
    log.info(dim(`  model: ${options.llmModel.trim()}`));
  }
  if (nonInteractive) log.info(dim(`  mode: non-interactive`));
  log.blank();

  let bundle: BriefBundle;

  if (typeof options.from === "string" && options.from.length > 0) {
    bundle = await loadFromFile({
      cwd,
      fromPath: toAbsolute(cwd, options.from),
      nonInteractive,
      idea: options.idea,
    });
  } else if (nonInteractive) {
    log.step("non-interactive: build ProjectBrief from flags + placeholders");
    log.blank();
    bundle = await gatherBrief({ cwd, idea: options.idea, nonInteractive: true });
  } else {
    if (process.stdin.isTTY !== true) {
      log.error(
        "vibeops plan requires a TTY. In CI, pass --non-interactive or --from <brief.md>.",
      );
      process.exitCode = 1;
      return;
    }
    log.step("LLM planning: interactive discovery → brief + MVP artifacts");
    log.blank();
    const interactiveLogin = true;
    const provider = await pickPlanLlmProvider(cwd, options.provider, { interactiveLogin });
    if (provider === null) return;

    const forcedModel =
      typeof options.llmModel === "string" && options.llmModel.trim().length > 0
        ? options.llmModel.trim()
        : undefined;
    const pickedModel =
      forcedModel ??
      (await pickPlanExecutionModel({ provider, cwd, interactive: interactiveLogin }));
    log.blank();
    const planningLocale = await pickPlanDialogueLocale();
    try {
      bundle = await gatherBriefViaLlm({
        cwd,
        idea: options.idea,
        provider,
        allowCodexBrowserLogin: interactiveLogin,
        llmModelOverride: pickedModel,
        planningLocale,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      log.error(`LLM planning failed: ${msg}`);
      process.exitCode = 1;
      return;
    }
  }

  await writeText(briefAbs, briefToMarkdown(bundle.brief, bundle.meta));
  log.ok(`Wrote brief: ${relDisplay(cwd, briefAbs)}`);

  const prior = await readLastDoneSummary(cwd);
  if (prior !== null) {
    log.info(dim(`  prior iteration: ${LAST_DONE_SUMMARY_REL} → included in TASK + mvp-build.md`));
  }

  const mvp = await writeMvpArtifacts(cwd, bundle);
  log.ok(`MVP TASK: ${relDisplay(cwd, mvp.taskFile)}`);
  log.ok(`MVP build prompt: ${relDisplay(cwd, mvp.buildPromptFile)}`);

  if (bundle.meta.assumptions.length > 0) {
    log.blank();
    log.info(`${yellow("!")} ${bold("Assumptions")} (reconfirm in Cursor if needed):`);
    for (const a of bundle.meta.assumptions) log.info(`  · ${a}`);
  }

  log.blank();
  log.info(bold("Next steps:"));
  log.info(`  1) ${cyan("vibeops start")}`);
  log.info(`  2) Drag ${cyan(MVP_BUILD_PROMPT_REL)} into a new Cursor chat`);
  log.info(`  3) ${cyan("vibeops done")} when Result / Test Result are filled`);
  log.info(`  4) ${cyan("vibeops next")} for step-by-step guidance`);
  log.info(dim(`Re-plan from brief: vibeops plan --from ${DEFAULT_BRIEF_REL}`));
}

interface LoadFromFileInputs {
  cwd: string;
  fromPath: string;
  nonInteractive: boolean;
  idea?: string;
}

async function loadFromFile(inputs: LoadFromFileInputs): Promise<BriefBundle> {
  const { cwd, fromPath, nonInteractive, idea } = inputs;
  if (!(await pathExists(fromPath))) {
    log.error(`--from path does not exist: ${fromPath}`);
    process.exit(1);
  }
  const md = await readText(fromPath);
  log.step(`Loading brief: ${relDisplay(cwd, fromPath)}`);
  const parsed = parseBriefFromMarkdown(md);
  parsed.meta.source = "from-file";

  if (typeof idea === "string" && idea.length > 0) {
    const ideaParsed = parseIdea(idea);
    if (ideaParsed.projectName && parsed.brief.projectName.length === 0) {
      parsed.brief.projectName = ideaParsed.projectName;
    }
    if (ideaParsed.oneLineIdea && parsed.brief.oneLineIdea.length === 0) {
      parsed.brief.oneLineIdea = ideaParsed.oneLineIdea;
    }
  }

  const missing = findMissingRequired(parsed.brief);
  if (missing.length === 0) return parsed;

  if (nonInteractive) {
    log.warn(`Missing fields: ${missing.join(", ")} — placeholders recorded in Assumptions.`);
    return parsed;
  }

  log.warn(`Missing fields: ${missing.join(", ")} — asking only those questions.`);
  log.blank();
  const filled = await gatherBrief({ cwd, idea, nonInteractive: false, seed: parsed.brief });
  filled.meta.source = "from-file";
  return filled;
}
