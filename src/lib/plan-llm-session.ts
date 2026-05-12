import { basename } from "node:path";

import type { BriefBundle, BriefMeta } from "../types/brief.js";
import { PROJECT_BRIEF_SCHEMA_VERSION } from "../types/brief.js";
import { askCheckbox, askInput, askSelect, OTHER_LABEL } from "./inquirer-helpers.js";
import { bold, cyan, dim, log } from "./logger.js";
import { cursorAgentPrint, extractAgentAssistantText } from "./plan-llm-cursor-agent.js";
import { probeCursorAgentCli, probeOpenAiApiKey } from "./plan-llm-detect.js";
import type { OpenAiChatMessage } from "./plan-llm-openai.js";
import { extractJsonObject, openAiChatCompletionJson, parsePlanLlmTurn } from "./plan-llm-openai.js";
import { normalizeLlmProjectBrief } from "./plan-llm-normalize.js";
import type { PlanLlmAssistantTurn, PlanLlmProviderId } from "./plan-llm-types.js";
import { VERSION } from "../version.js";

const MAX_LLM_TURNS = 48;

const PLAN_JSON_PROTOCOL = `You are VibeOps' planning assistant. Your job is to learn enough about a software project (stack, DB, auth, scope, risks) through a short dialogue, then emit a complete structured ProjectBrief.

You MUST reply with a single JSON object only (no markdown fences). Two shapes:

1) While discovering:
{"turn":"question","message":"<markdown allowed inside string>","questionType":"single"|"multi"|"text","options":["..."]}
- For "single" and "multi", "options" is required (3–12 short labels). Always include "Not sure" when choices are technical guesses.
- For "text", omit "options" or use empty array.

2) When you have enough context to freeze the plan:
{"turn":"done","projectBrief":{ ... },"plannerAssumptions":["optional strings"]}

The final "projectBrief" MUST include every key below (use best effort; arrays may be empty only if truly unknown — prefer "Not sure" options over empty when using predefined lists):

projectName (string), oneLineIdea (string), projectType (string), targetUsers (string[]), coreProblem (string),
mvpFeatures (string[]), outOfScope (string[]), frontend (string), backend (string), database (string), dbLayer (string),
packageManager (string), deploymentTargets (string[]), authRequirements (string[]), integrations (string[]),
useNotion (boolean), useGitWorkflow (boolean), agentWorkflowLevel (string), risks (string[]), successCriteria (string)

Discovery rules:
- Ask about database early: none vs new vs existing, hosted vs local, ORM preference.
- Adapt questions to answers; do not follow a rigid script.
- Prefer objective "single"/"multi" when a finite set fits; use "text" for open product vision.
- When ready to finish, use turn "done" with a coherent brief aligned to the conversation.`;

function withOtherOption(options: readonly string[]): string[] {
  const list = [...options];
  if (!list.some((o) => o === OTHER_LABEL)) list.push(OTHER_LABEL);
  return list;
}

async function askForQuestionTurn(q: Extract<PlanLlmAssistantTurn, { turn: "question" }>): Promise<string> {
  log.blank();
  log.info(bold(q.message));
  log.blank();
  if (q.questionType === "text") {
    return askInput({
      message: "Your answer",
      nonInteractive: false,
    });
  }
  const rawOpts = q.options ?? [];
  if (rawOpts.length === 0) {
    return askInput({
      message: "Your answer (free text)",
      nonInteractive: false,
    });
  }
  if (q.questionType === "single") {
    const choice = await askSelect({
      message: "Choose (↑/↓ · Enter)",
      nonInteractive: false,
      choices: withOtherOption(rawOpts),
    });
    return choice;
  }
  const picked = await askCheckbox({
    message: "Choose (Space toggles · Enter confirms)",
    nonInteractive: false,
    choices: withOtherOption(rawOpts),
    default: [],
  });
  if (picked.length === 0) return "(no selection)";
  return picked.join("; ");
}

function buildUserPayload(params: {
  readonly cwd: string;
  readonly idea?: string;
  readonly lastQuestion?: string;
  readonly lastAnswer?: string;
}): string {
  const lines: string[] = [];
  lines.push(`Project directory name: ${basename(params.cwd)}`);
  lines.push(`Full path: ${params.cwd}`);
  if (typeof params.idea === "string" && params.idea.trim().length > 0) {
    lines.push(`Initial idea from user: ${params.idea.trim()}`);
  }
  if (params.lastQuestion && params.lastAnswer) {
    lines.push("");
    lines.push("Previous assistant question was answered as:");
    lines.push(`Q: ${params.lastQuestion}`);
    lines.push(`A: ${params.lastAnswer}`);
  }
  lines.push("");
  lines.push("Produce your next JSON response following the protocol.");
  return lines.join("\n");
}

async function completeOneTurnOpenAi(messages: import("./plan-llm-openai.js").OpenAiChatMessage[]): Promise<string> {
  const raw = await openAiChatCompletionJson({ messages });
  return extractJsonObject(raw);
}

async function completeOneTurnCursor(params: {
  readonly cwd: string;
  readonly system: string;
  readonly transcript: string;
}): Promise<string> {
  const prompt = `${params.system}\n\n--- Conversation ---\n${params.transcript}\n\n---\nReply with ONE JSON object only (no markdown), following the protocol.`;
  const out = await cursorAgentPrint({ cwd: params.cwd, prompt });
  const text = extractAgentAssistantText(out);
  return extractJsonObject(text);
}

export function printPlanProviderSetupHelp(): void {
  log.blank();
  log.info(bold("No LLM provider is ready for `vibeops plan`."));
  log.blank();
  log.info(bold("1) OpenAI (API key)"));
  log.info("   ChatGPT web login / OAuth alone is not enough here — create an API key.");
  log.info(`  · Create a key: ${cyan("https://platform.openai.com/api-keys")}`);
  log.info(`  · ${dim("export OPENAI_API_KEY=\"sk-...\"")}`);
  log.info(`  · Optional model override: ${dim("export VIBEOPS_OPENAI_MODEL=gpt-4o")}`);
  log.blank();
  log.info(bold("2) Cursor Agent CLI (same account as Cursor IDE)"));
  log.info(`  · Install: ${cyan("https://cursor.com/docs/cli")}`);
  log.info(`  · Run ${cyan("agent login")} then verify with ${cyan("agent status")}`);
  log.info(
    `  · Override binary name: ${dim("export VIBEOPS_CURSOR_AGENT_BIN=/path/to/agent")}`,
  );
  log.blank();
}

export async function pickPlanLlmProvider(
  cwd: string,
  preferred?: PlanLlmProviderId,
): Promise<PlanLlmProviderId | null> {
  const openai = await probeOpenAiApiKey();
  const cursor = await probeCursorAgentCli(cwd);

  if (!openai.ok && !cursor.ok) {
    printPlanProviderSetupHelp();
    if (openai.reason) log.info(dim(`OpenAI: ${openai.reason}`));
    if (cursor.reason) log.info(dim(`Cursor Agent: ${cursor.reason}`));
    process.exitCode = 1;
    return null;
  }

  if (preferred === "openai" && openai.ok) return "openai";
  if (preferred === "cursor-agent" && cursor.ok) return "cursor-agent";

  if (preferred === "openai" && !openai.ok) {
    log.warn(`--provider openai unavailable (${openai.reason ?? "unknown"})`);
  }
  if (preferred === "cursor-agent" && !cursor.ok) {
    log.warn(`--provider cursor-agent unavailable (${cursor.reason ?? "unknown"})`);
  }

  if (openai.ok && !cursor.ok) {
    log.ok("Using OpenAI (OPENAI_API_KEY verified).");
    return "openai";
  }
  if (!openai.ok && cursor.ok) {
    log.ok(`Using Cursor Agent CLI (${cursor.command}, authenticated).`);
    return "cursor-agent";
  }

  const choice = await askSelect({
    message: "Choose LLM provider for planning (↑/↓ · Enter)",
    nonInteractive: false,
    choices: ["OpenAI (API key)", "Cursor Agent CLI"],
    default: "OpenAI (API key)",
  });
  return choice.startsWith("OpenAI") ? "openai" : "cursor-agent";
}

export async function gatherBriefViaLlm(params: {
  readonly cwd: string;
  readonly idea?: string;
  readonly provider: PlanLlmProviderId;
}): Promise<BriefBundle> {
  const source: BriefMeta["source"] =
    params.provider === "openai" ? "llm-openai" : "llm-cursor-agent";

  let transcript = `${buildUserPayload({ cwd: params.cwd, idea: params.idea })}\n`;
  const openAiMessages: OpenAiChatMessage[] = [
    { role: "system", content: PLAN_JSON_PROTOCOL },
    { role: "user", content: buildUserPayload({ cwd: params.cwd, idea: params.idea }) },
  ];

  for (let i = 0; i < MAX_LLM_TURNS; i++) {
    let jsonSlice: string;
    if (params.provider === "openai") {
      jsonSlice = await completeOneTurnOpenAi(openAiMessages);
    } else {
      jsonSlice = await completeOneTurnCursor({
        cwd: params.cwd,
        system: PLAN_JSON_PROTOCOL,
        transcript,
      });
    }

    let parsed: PlanLlmAssistantTurn;
    try {
      parsed = parsePlanLlmTurn(jsonSlice);
    } catch (e) {
      const hint = e instanceof Error ? e.message : String(e);
      const repair = `Your previous reply was not valid for this protocol (${hint}). Output ONE JSON object only.`;
      if (params.provider === "openai") {
        openAiMessages.push({ role: "assistant", content: jsonSlice.slice(0, 4000) });
        openAiMessages.push({ role: "user", content: repair });
      } else {
        transcript += `\nassistant(raw): ${jsonSlice.slice(0, 2000)}\nuser: ${repair}\n`;
      }
      continue;
    }

    if (parsed.turn === "done") {
      const norm = normalizeLlmProjectBrief(parsed.projectBrief as Record<string, unknown>);
      const assumptions = [...norm.assumptions, ...(parsed.plannerAssumptions ?? [])];
      const meta: BriefMeta = {
        vibeopsVersion: VERSION,
        generatedAt: new Date().toISOString(),
        source,
        schemaVersion: PROJECT_BRIEF_SCHEMA_VERSION,
        assumptions,
      };
      return { brief: norm.brief, meta };
    }

    const answer = await askForQuestionTurn(parsed);
    const followUp = buildUserPayload({
      cwd: params.cwd,
      idea: params.idea,
      lastQuestion: parsed.message,
      lastAnswer: answer,
    });

    if (params.provider === "openai") {
      openAiMessages.push({ role: "assistant", content: jsonSlice });
      openAiMessages.push({ role: "user", content: followUp });
    } else {
      transcript += `\nassistant: ${jsonSlice}\nuser: ${followUp}\n`;
    }
  }

  throw new Error(`Planning stopped: exceeded ${MAX_LLM_TURNS} LLM turns without a "done" response.`);
}
