import { resolve } from "node:path";

import { password, select } from "@inquirer/prompts";

import { readConfig, setLlmProviderPreference } from "../lib/config.js";
import {
  configureOpenAiKey,
  guideCodexOAuth,
  printConnectSetupHint,
  runCursorAgentLogin,
} from "../lib/llm-connect.js";
import {
  getLlmPreferenceFromConfig,
  labelLlmProvider,
  parseLlmProviderPreference,
  probeAllLlmProviders,
  resolveLlmProviderForUse,
} from "../lib/llm-preference.js";
import { buildLlmStatusReport, formatLlmStatusLine } from "../lib/llm-status.js";
import { bold, cyan, dim, green, log, yellow } from "../lib/logger.js";
import type { LlmProviderPreference } from "../types/config.js";
import type { PlanLlmProviderId } from "../lib/plan-llm-types.js";

export interface LlmCommandOptions {
  cwd?: string;
  json?: boolean;
  nonInteractive?: boolean;
}

export interface LlmUseOptions extends LlmCommandOptions {
  provider?: string;
}

async function requireProject(cwd: string): Promise<boolean> {
  const c = await readConfig(cwd);
  if (c === null) {
    log.error("Not a VibeOps project — run vibeops init first.");
    process.exitCode = 1;
    return false;
  }
  return true;
}

async function printLlmStatusHuman(cwd: string): Promise<void> {
  const report = await buildLlmStatusReport(cwd);
  const { preferenceLabel, activeLabel } = formatLlmStatusLine(report);

  log.blank();
  log.info(bold("  LLM"));
  log.info(`    ${dim("Preferred")}  ${preferenceLabel}`);
  log.info(
    `    ${dim("Active")}     ${report.active !== null ? green(activeLabel) : yellow(activeLabel)}`,
  );
  for (const p of report.providers) {
    const mark = p.ok ? green("ok") : dim("—");
    log.info(`    ${dim(p.id.padEnd(14))} ${mark}  ${dim(p.summary)}`);
  }
  if (!report.anyAvailable) {
    log.info(`    ${dim("Hint")}      Run ${cyan("vibeops llm connect")}`);
  }
  log.blank();
}

export async function llmStatusCommand(opts: LlmCommandOptions = {}): Promise<void> {
  const cwd = resolve(opts.cwd ?? process.cwd());
  if (!(await requireProject(cwd))) return;

  if (opts.json) {
    const report = await buildLlmStatusReport(cwd);
    log.raw(JSON.stringify(report, null, 2));
    return;
  }
  await printLlmStatusHuman(cwd);
}

export async function llmUseCommand(providerArg: string | undefined, opts: LlmUseOptions = {}): Promise<void> {
  const cwd = resolve(opts.cwd ?? process.cwd());
  if (!(await requireProject(cwd))) return;

  const nonInteractive = opts.nonInteractive === true || process.stdin.isTTY !== true;

  let preference: LlmProviderPreference | null = null;
  if (providerArg !== undefined) {
    preference = parseLlmProviderPreference(providerArg);
    if (preference === null) {
      log.error(`Unknown provider "${providerArg}". Use auto, codex-oauth, cursor-agent, or openai.`);
      process.exitCode = 1;
      return;
    }
  } else if (nonInteractive) {
    log.error("Provider required in non-interactive mode: vibeops llm use <provider>");
    process.exitCode = 1;
    return;
  } else {
    const probes = await probeAllLlmProviders(cwd);
    const choices: { name: string; value: LlmProviderPreference; disabled?: string }[] = [
      { name: labelLlmProvider("auto"), value: "auto" },
      ...probes.map((p) => ({
        name: `${labelLlmProvider(p.id)}${p.ok ? "" : " (not connected)"}`,
        value: p.id as LlmProviderPreference,
        disabled: p.ok ? undefined : "Run vibeops llm connect first",
      })),
    ];
    preference = await select({
      message: "Default LLM for task add / task done",
      choices,
      loop: false,
    });
  }

  await setLlmProviderPreference(cwd, preference);
  log.ok(`LLM preference → ${labelLlmProvider(preference)}`);

  const active = await resolveLlmProviderForUse(cwd, preference);
  if (active === null && preference !== "auto") {
    log.warn(`"${preference}" is not connected yet. Run ${cyan("vibeops llm connect")}.`);
    printConnectSetupHint(preference as PlanLlmProviderId);
    process.exitCode = 1;
  } else if (active !== null) {
    log.info(`  Active now: ${green(labelLlmProvider(active))}`);
  }
}

type ConnectAction =
  | "pick"
  | "setup-cursor"
  | "setup-codex"
  | "setup-openai"
  | "done";

export async function llmConnectCommand(opts: LlmCommandOptions = {}): Promise<void> {
  const cwd = resolve(opts.cwd ?? process.cwd());
  if (!(await requireProject(cwd))) return;

  const nonInteractive = opts.nonInteractive === true || process.stdin.isTTY !== true;
  if (nonInteractive) {
    log.error("llm connect requires an interactive terminal.");
    process.exitCode = 1;
    return;
  }

  log.info(bold("vibeops llm connect"));
  log.info(dim("Set up providers, then pick which one task add / task done use."));
  log.blank();

  let done = false;
  while (!done) {
    const probes = await probeAllLlmProviders(cwd);
    const config = await readConfig(cwd);
    const pref = getLlmPreferenceFromConfig(config);
    const active = await resolveLlmProviderForUse(cwd, pref);

    log.info(bold("  Connected providers"));
    for (const p of probes) {
      log.info(`    ${p.ok ? green("✓") : dim("·")} ${p.id} — ${dim(p.summary)}`);
    }
    log.info(`  ${dim("Preferred")} ${labelLlmProvider(pref)} · ${dim("Active")} ${active ? labelLlmProvider(active) : yellow("none")}`);
    log.blank();

    const action = await select<ConnectAction>({
      message: "LLM setup",
      choices: [
        { name: "Choose default provider (task add / task done)", value: "pick" },
        { name: "Set up Cursor Agent CLI (`agent login`)", value: "setup-cursor" },
        { name: "Show Codex OAuth setup (`codex login`)", value: "setup-codex" },
        { name: "Set up OpenAI API key (.vibeops.env)", value: "setup-openai" },
        { name: "Done", value: "done" },
      ],
      loop: false,
    });

    switch (action) {
      case "pick": {
        await llmUseCommand(undefined, { cwd });
        break;
      }
      case "setup-cursor": {
        const result = await runCursorAgentLogin(cwd);
        if (result.ok) log.ok(result.message);
        else {
          log.warn(result.message);
          process.exitCode = 1;
        }
        log.blank();
        break;
      }
      case "setup-codex": {
        const result = await guideCodexOAuth();
        if (result.ok) log.ok(result.message);
        else {
          for (const line of result.message.split("\n")) log.info(line);
        }
        log.blank();
        break;
      }
      case "setup-openai": {
        const key = await password({
          message: "OpenAI API key (stored in .vibeops.env, gitignored)",
          mask: "*",
          validate: (v) => (v.trim().length > 0 ? true : "Key is required"),
        });
        const result = await configureOpenAiKey(cwd, key);
        if (result.ok) log.ok(result.message);
        else log.warn(result.message);
        log.blank();
        break;
      }
      case "done":
        done = true;
        break;
    }
  }

  const report = await buildLlmStatusReport(cwd);
  const { activeLabel } = formatLlmStatusLine(report);
  log.info(`Saved preference: ${labelLlmProvider(report.preference)} · Active: ${activeLabel}`);
  log.info(`Check anytime: ${cyan("vibeops llm status")} or ${cyan("vibeops status")}`);
}
