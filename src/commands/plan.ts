import { isAbsolute, join, relative, resolve } from "node:path";

import {
  briefToMarkdown,
  findMissingRequired,
  gatherBrief,
  parseBriefFromMarkdown,
  parseIdea,
} from "../lib/brief.js";
import { askYesNo } from "../lib/inquirer-helpers.js";
import { pathExists, readText, writeText } from "../lib/filesystem.js";
import { bold, cyan, dim, log, yellow } from "../lib/logger.js";
import { applyPlannerMarkdownFlow, commitPlannerGit, pushPlannerGit } from "../lib/plan-apply-planner.js";
import { gatherBriefViaLlm, pickPlanDialogueLocale, pickPlanLlmProvider } from "../lib/plan-llm-session.js";
import { pickPlanExecutionModel } from "../lib/plan-llm-models.js";
import { ensureGitForPlannerCommit, offerGithubInitBeforePush, runNotionSyncWithOptionalInit } from "../lib/plan-post-apply-setup.js";
import type { PlanLlmProviderId } from "../lib/plan-llm-types.js";
import { buildPlanPrompt } from "../lib/prompt-builder.js";
import { projectPaths } from "../lib/paths.js";
import type { BriefBundle } from "../types/brief.js";

export interface PlanCommandOptions {
  idea?: string;
  from?: string;
  output?: string;
  nonInteractive?: boolean;
  legacyWizard?: boolean;
  provider?: PlanLlmProviderId;
  /** When set, skips interactive model discovery and uses this id for the selected provider. */
  llmModel?: string;
  cwd?: string;
  /** Run the same LLM provider against the planning prompt to write docs/project + docs/tasks. */
  applyPlanner?: boolean;
  /** List files that would be written; no disk writes, no git, no Notion. Still calls the LLM. */
  applyPlannerDryRun?: boolean;
  /** With --apply-planner: skip `git commit` after writes. */
  noGitCommit?: boolean;
  /** With --apply-planner: run `git push` after a successful commit. */
  gitPush?: boolean;
  /** With --apply-planner: skip Notion sync even when the brief enables it. */
  noNotionSync?: boolean;
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
  const paths = projectPaths(cwd);
  if (!(await pathExists(paths.config))) {
    log.error(`Not a VibeOps project: ${cyan(".vibeops.json")} was not found under this directory.`);
    log.info(`  ${dim("Run")} ${cyan("vibeops init")} ${dim("here first, then run")} ${cyan("vibeops plan")} ${dim("again.")}`);
    process.exitCode = 1;
    return;
  }
  const briefAbs = join(cwd, DEFAULT_BRIEF_REL);
  const promptAbs =
    typeof options.output === "string" ? toAbsolute(cwd, options.output) : join(cwd, DEFAULT_PROMPT_REL);

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
  let llmProviderForApply: PlanLlmProviderId | undefined;
  let llmModelForApply: string | undefined;

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
    if (nonInteractive) {
      log.step("non-interactive: build the ProjectBrief from flag values + safe placeholders");
      log.blank();
      bundle = await gatherBrief({
        cwd,
        idea: options.idea,
        nonInteractive: true,
      });
    } else if (options.legacyWizard === true) {
      log.step(
        "legacy wizard: build the ProjectBrief from 20 fixed questions (arrow keys · Space · Enter)",
      );
      log.blank();
      bundle = await gatherBrief({
        cwd,
        idea: options.idea,
        nonInteractive: false,
        legacyWizard: true,
      });
    } else {
      log.step("LLM planning: verify provider, then interactive discovery + structured brief");
      log.blank();
      const interactiveLogin = process.stdin.isTTY === true;
      const provider = await pickPlanLlmProvider(cwd, options.provider, { interactiveLogin });
      if (provider === null) {
        return;
      }
      const forcedModel =
        typeof options.llmModel === "string" && options.llmModel.trim().length > 0
          ? options.llmModel.trim()
          : undefined;
      const pickedModel =
        forcedModel ??
        (await pickPlanExecutionModel({
          provider,
          cwd,
          interactive: interactiveLogin,
        }));
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
        llmProviderForApply = provider;
        llmModelForApply =
          typeof pickedModel === "string" && pickedModel.trim().length > 0 ? pickedModel.trim() : undefined;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        log.error(`LLM planning failed: ${msg}`);
        process.exitCode = 1;
        return;
      }
    }
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

  const wantsApply = options.applyPlanner === true || options.applyPlannerDryRun === true;
  if (wantsApply) {
    const applyDryRun = options.applyPlannerDryRun === true;
    const exec = await resolvePlannerApplyExecution({
      cwd,
      nonInteractive,
      fromLlmProvider: llmProviderForApply,
      fromLlmModel: llmModelForApply,
      cliProvider: options.provider,
      cliModel: options.llmModel,
    });
    if (exec === null) {
      return;
    }
    try {
      const applyResult = await applyPlannerMarkdownFlow({
        cwd,
        planPromptMarkdown: promptMd,
        provider: exec.provider,
        model: exec.model,
        dryRun: applyDryRun,
      });
      const applyInteractive = !nonInteractive && process.stdin.isTTY === true && !applyDryRun;
      const hasWrittenFiles =
        !applyDryRun && applyResult.writtenRelativePaths.length > 0;
      let doCommit = hasWrittenFiles && options.noGitCommit !== true;
      if (doCommit && applyInteractive) {
        log.blank();
        log.step("Next: commit, push, and Notion (confirm each step)");
        doCommit = await askYesNo({
          message:
            "[1] Create a git commit for the planner output (docs/project + docs/tasks)?",
          nonInteractive: false,
          defaultValue: true,
        });
      }
      let committedOk = false;
      if (doCommit) {
        const gitReady = await ensureGitForPlannerCommit({
          cwd,
          interactive: applyInteractive,
        });
        if (!gitReady) {
          doCommit = false;
        }
      }
      if (doCommit) {
        try {
          await commitPlannerGit(
            cwd,
            applyResult.writtenRelativePaths,
            "docs: planner output from vibeops plan (--apply-planner)",
          );
          log.ok("Git commit created for planner docs/tasks.");
          committedOk = true;
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          log.warn(`Git commit did not run (${msg}). Review changes and commit manually.`);
        }
      }
      let doPush = false;
      if (committedOk) {
        if (options.gitPush === true) {
          doPush = true;
        } else if (applyInteractive) {
          doPush = await askYesNo({
            message:
              "[2] Push this commit to the remote (git push)? (If Yes, you may be offered `vibeops github init` to connect or create a GitHub repo / set `origin`.)",
            nonInteractive: false,
            defaultValue: false,
          });
        }
        if (doPush) {
          await offerGithubInitBeforePush({ cwd, interactive: applyInteractive });
          try {
            await pushPlannerGit(cwd);
            log.ok("git push complete.");
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            log.error(`git push failed: ${msg}`);
            process.exitCode = 1;
          }
        }
      } else if (options.gitPush === true && !committedOk) {
        log.warn(
          "`--push` skipped (no successful commit: dry-run, --no-git-commit, you declined the commit prompt, commit error, or no files written).",
        );
      }
      let doNotion =
        bundle.brief.useNotion === true && options.noNotionSync !== true && !applyDryRun;
      if (doNotion && applyInteractive) {
        doNotion = await askYesNo({
          message: "[3] Run Notion sync now (project + TASK metadata)?",
          nonInteractive: false,
          defaultValue: true,
        });
      }
      if (doNotion) {
        const hadErrBeforeNotion = process.exitCode === 1;
        await runNotionSyncWithOptionalInit({ cwd, interactive: applyInteractive });
        if (hadErrBeforeNotion) {
          process.exitCode = 1;
        }
        if (process.exitCode === 1 && !hadErrBeforeNotion) {
          log.warn("Notion sync failed — fix integration and run `vibeops notion sync`.");
        }
      } else if (bundle.brief.useNotion === true && applyDryRun) {
        log.info(dim("Notion sync skipped for --apply-dry-run."));
      } else if (bundle.brief.useNotion === true && options.noNotionSync === true) {
        log.info(dim("Notion sync skipped (--no-notion-sync)."));
      } else if (bundle.brief.useNotion === true && applyInteractive && !doNotion) {
        log.info(dim("Notion sync skipped (you chose No)."));
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      log.error(`Planner apply failed: ${msg}`);
      process.exitCode = 1;
      return;
    }
  }

  log.blank();
  log.info(bold("Next steps:"));
  if (wantsApply && options.applyPlannerDryRun !== true) {
    log.info(`  1) Open this repo in Cursor and run ${cyan("vibeops task start TASK-NNN")} for each backlog item.`);
    log.info(`  2) The planning prompt is still at ${cyan(relDisplay(cwd, promptAbs))} if you need to re-run the planner.`);
    log.info(`  3) To revise the brief only, edit ${cyan(relDisplay(cwd, briefAbs))} then:`);
    log.info(`     ${dim("vibeops plan --from " + DEFAULT_BRIEF_REL + " [--apply-planner …]")}`);
  } else if (wantsApply && options.applyPlannerDryRun === true) {
    log.info(`  1) Re-run without ${cyan("--apply-dry-run")} to write files, commit, and (if enabled) Notion sync.`);
    log.info(`  2) Or paste ${cyan(relDisplay(cwd, promptAbs))} into Cursor for a manual planner pass.`);
  } else {
    log.info(`  1) Open a new Cursor chat and paste the full contents of ${cyan(relDisplay(cwd, promptAbs))}.`);
    log.info(
      `  2) Or run again with ${cyan("--apply-planner")}: the CLI calls the same LLM and writes ${cyan("docs/project/*")} + ${cyan("docs/tasks/*")} from the prompt (brief alone does not create TASK files).`,
    );
    log.info(`  3) Regenerate only the prompt from an edited brief:`);
    log.info(`     ${dim("vibeops plan --from " + DEFAULT_BRIEF_REL + " [--apply-planner …]")}`);
  }
}

async function resolvePlannerApplyExecution(inputs: {
  readonly cwd: string;
  readonly nonInteractive: boolean;
  readonly fromLlmProvider: PlanLlmProviderId | undefined;
  readonly fromLlmModel: string | undefined;
  readonly cliProvider?: PlanLlmProviderId;
  readonly cliModel?: string;
}): Promise<{ provider: PlanLlmProviderId; model?: string } | null> {
  if (inputs.fromLlmProvider !== undefined) {
    return { provider: inputs.fromLlmProvider, model: inputs.fromLlmModel };
  }
  const tty = process.stdin.isTTY === true;

  if (inputs.cliProvider !== undefined) {
    const interactiveLogin = tty && !inputs.nonInteractive;
    const provider = await pickPlanLlmProvider(inputs.cwd, inputs.cliProvider, { interactiveLogin });
    if (provider === null) return null;
    let model = inputs.cliModel?.trim();
    if (!model && tty && !inputs.nonInteractive) {
      const picked = await pickPlanExecutionModel({
        provider,
        cwd: inputs.cwd,
        interactive: true,
      });
      model = picked?.trim();
    }
    return { provider, model: model && model.length > 0 ? model : undefined };
  }

  if (!tty || inputs.nonInteractive) {
    log.error(
      "When using --apply-planner without an interactive LLM briefing in the same run, pass --provider openai | codex-oauth | cursor-agent (and optional --model / env defaults).",
    );
    process.exitCode = 1;
    return null;
  }

  const provider = await pickPlanLlmProvider(inputs.cwd, undefined, { interactiveLogin: true });
  if (provider === null) return null;
  const model = await pickPlanExecutionModel({ provider, cwd: inputs.cwd, interactive: true });
  return { provider, model };
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
