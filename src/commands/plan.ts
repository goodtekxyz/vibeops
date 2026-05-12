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
import { buildPlanPrompt } from "../lib/prompt-builder.js";
import type { BriefBundle } from "../types/brief.js";

export interface PlanCommandOptions {
  idea?: string;
  from?: string;
  output?: string;
  nonInteractive?: boolean;
  cwd?: string;
}

const DEFAULT_BRIEF_REL = ".vibeops/brief/project-brief.md";
const DEFAULT_PROMPT_REL = ".vibeops/generated/plan-prompt.md";

function toAbsolute(root: string, candidate: string): string {
  return isAbsolute(candidate) ? candidate : resolve(root, candidate);
}

function relDisplay(root: string, abs: string): string {
  const r = relative(root, abs);
  return r.length === 0 ? "." : r;
}

export async function planCommand(options: PlanCommandOptions): Promise<void> {
  const cwd = resolve(options.cwd ?? process.cwd());
  const nonInteractive = options.nonInteractive === true;
  const briefAbs = join(cwd, DEFAULT_BRIEF_REL);
  const promptAbs =
    typeof options.output === "string" ? toAbsolute(cwd, options.output) : join(cwd, DEFAULT_PROMPT_REL);

  log.info(bold(`vibeops plan`));
  log.info(dim(`  cwd: ${cwd}`));
  if (options.from) log.info(dim(`  from: ${options.from}`));
  if (options.idea) log.info(dim(`  idea: ${options.idea}`));
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
  } else {
    if (!nonInteractive && process.stdin.isTTY !== true) {
      log.error(
        "vibeops plan requires a TTY. In CI/piped environments, pass --non-interactive or supply --from <brief.md>.",
      );
      process.exitCode = 1;
      return;
    }
    log.step(
      nonInteractive
        ? "non-interactive: build the ProjectBrief from flag values + safe placeholders"
        : "interactive: build the ProjectBrief from 20 questions (arrow keys · Space · Enter)",
    );
    log.blank();
    bundle = await gatherBrief({
      cwd,
      idea: options.idea,
      nonInteractive,
    });
  }

  const briefMd = briefToMarkdown(bundle.brief, bundle.meta);
  await writeText(briefAbs, briefMd);
  log.ok(`Wrote brief: ${relDisplay(cwd, briefAbs)}`);

  const promptMd = buildPlanPrompt({
    brief: bundle.brief,
    meta: bundle.meta,
    briefRelativePath: relDisplay(cwd, briefAbs),
  });
  await writeText(promptAbs, promptMd);
  log.ok(`Cursor planning prompt: ${relDisplay(cwd, promptAbs)}`);

  if (bundle.meta.assumptions.length > 0) {
    log.blank();
    log.info(`${yellow("!")} ${bold("Assumptions")} (items the Planner Agent should reconfirm):`);
    for (const a of bundle.meta.assumptions) log.info(`  · ${a}`);
  }

  log.blank();
  log.info(bold("Next steps:"));
  log.info(`  1) Open a new Cursor chat and paste the full contents of ${cyan(relDisplay(cwd, promptAbs))}.`);
  log.info(`  2) Review the Planner Agent's docs/project/* + initial backlog via git diff and commit.`);
  log.info(`  3) To revise the brief, edit ${cyan(relDisplay(cwd, briefAbs))} and regenerate the prompt with`);
  log.info(`     ${dim("vibeops plan --from " + DEFAULT_BRIEF_REL)}.`);
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
  if (missing.length === 0) {
    return parsed;
  }

  if (nonInteractive) {
    log.warn(
      `Missing required fields: ${missing.join(", ")} → filling with placeholders and recording them in Assumptions.`,
    );
    return parsed;
  }

  log.warn(`Missing required fields: ${missing.join(", ")} → asking only the missing questions.`);
  log.blank();
  const filled = await gatherBrief({
    cwd,
    idea,
    nonInteractive: false,
    seed: parsed.brief,
  });
  filled.meta.source = "from-file";
  return filled;
}
