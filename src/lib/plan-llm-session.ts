import { basename } from "node:path";

import { probeCodexOAuthFile } from "./plan-codex-auth.js";
import { runCodexPkceOAuthLogin } from "./plan-codex-pkce.js";
import { codexOAuthPlanCompletion } from "./plan-codex-responses.js";
import type { BriefBundle, BriefMeta } from "../types/brief.js";
import { PROJECT_BRIEF_SCHEMA_VERSION } from "../types/brief.js";
import { askCheckbox, askInput, askSelect, OTHER_LABEL, yesNoSelect } from "./inquirer-helpers.js";
import { bold, cyan, dim, log } from "./logger.js";
import { cursorAgentPrint, extractAgentAssistantText } from "./plan-llm-cursor-agent.js";
import { probeCursorAgentCli, probeOpenAiApiKey, type CursorAgentProbeResult } from "./plan-llm-detect.js";
import type { OpenAiChatMessage } from "./plan-llm-openai.js";
import { extractJsonObject, openAiChatCompletionJson, parsePlanLlmTurn } from "./plan-llm-openai.js";
import { normalizeLlmProjectBrief } from "./plan-llm-normalize.js";
import type { PlanLlmAssistantTurn, PlanLlmProviderId } from "./plan-llm-types.js";
import { VERSION } from "../version.js";

const MAX_LLM_TURNS = 48;

const PLAN_JSON_PROTOCOL_CORE = `You are VibeOps' planning assistant. Learn about a software project through a short dialogue, infer the next best question from the user's last answer, then produce a structured ProjectBrief.

You MUST reply with a single JSON object only (no markdown fences). Allowed "turn" values: "question", "confirm", "done".

1) While discovering:
{"turn":"question","message":"<markdown allowed>","questionType":"single"|"multi"|"text","options":["..."]}
- **One primary ask per turn** (see conversation rules below).
- **questionType — critical:** Prefer **"multi"** whenever more than one option can legitimately apply (e.g. target users, MVP features, integrations, deployment targets, risks, auth methods, “which concerns apply”, stacks that can combine). Use **"single"** only when choices are **mutually exclusive** (exactly one can be true: e.g. one primary package manager, one hosting model when alternatives exclude each other, a single primary language for the codebase). When in doubt, use **"multi"** so the user can toggle several options with Space.
- For "single" or "multi", include "options" (3–12 short labels) as **suggested answers only**. **"multi"** uses a checkbox (Space toggles, Enter submits). **"single"** uses a one-line picker (Enter picks one). The user can always pick Other or type a custom reply.
- For "text", omit "options" or use an empty array.

2) When information is enough for a solid ProjectBrief and task breakdown, **before** "done", emit exactly one approval step:
{"turn":"confirm","readableSummary":"<markdown>","plannerNote":"optional string"}
- readableSummary must be easy to scan (short headings or bullets): working title, one-line idea, primary users, MVP slice, key constraints or stack if known, main risks or unknowns. Use the planning language from the session rules.
- You may use earlier "question" turns for lightweight check-ins, but you **must** still emit "confirm" with a consolidated summary before the user can finalize.
- Never put "done" in the same JSON object as "confirm".

3) Final structured brief — **only** after the user has confirmed in the terminal (you will receive a user message starting with "[VibeOps session] User CONFIRMED"):
{"turn":"done","projectBrief":{ ... },"plannerAssumptions":["optional strings"]}
- Until you receive that exact confirmation tag, you **must not** output "turn":"done". If you are not ready for approval yet, keep using "question". If ready for approval, use "confirm" first.

The final "projectBrief" MUST include every key below (best effort; prefer "Not sure" options over empty arrays when using predefined lists):

projectName (string), oneLineIdea (string), projectType (string), targetUsers (string[]), coreProblem (string),
mvpFeatures (string[]), outOfScope (string[]), frontend (string), backend (string), database (string), dbLayer (string),
packageManager (string), deploymentTargets (string[]), authRequirements (string[]), integrations (string[]),
useNotion (boolean), useGitWorkflow (boolean), agentWorkflowLevel (string), risks (string[]), successCriteria (string)

Conversation rules:
- **One step per reply:** one JSON "question" object → one user answer. No batched "1) … 2) …" lists or unrelated combined asks.
- **Infer the next question** from the latest user answer and the thread; stay conversational (calm "20 questions" pacing).
- Start from product intent (what / who / why) before deep stack; do not open with database unless the user already did or product context is clear.
- If the user is vague, offer gentle reframes or tiny examples in "message" (do not invent facts about their project).

- If a user message starts with "[VibeOps session] User chose to STOP further discovery", output **only** {"turn":"confirm","readableSummary":"..."} (no more "question" turns) using what the thread already contains; state gaps honestly.

After a "confirm" turn, if the user message says they did **not** confirm, continue with "question" turns (or another "confirm" when ready). Do not output "done" until you receive the CONFIRMED tag.`;

function buildPlanSystemPrompt(localeInstruction: string): string {
  return `${PLAN_JSON_PROTOCOL_CORE}

Planning language (user-chose in the terminal before this session):
${localeInstruction}

Follow that language for all natural-language content inside your JSON ("message", each "options" label, "readableSummary", "plannerNote", "plannerAssumptions"). JSON keys remain in English.`;
}

export interface PlanDialogueLocale {
  readonly tag: string;
  readonly instruction: string;
}

const PLAN_DIALOGUE_LOCALE_PRESETS: readonly {
  readonly label: string;
  readonly tag: string;
  readonly instruction: string;
}[] = [
  {
    label: "English",
    tag: "en",
    instruction:
      "Use English for every user-visible string inside JSON outputs (message, options, readableSummary, plannerNote, plannerAssumptions).",
  },
  {
    label: "Korean (한국어)",
    tag: "ko",
    instruction:
      "Use Korean for every user-visible string inside JSON outputs (message, options, readableSummary, plannerNote, plannerAssumptions).",
  },
  {
    label: "Japanese (日本語)",
    tag: "ja",
    instruction:
      "Use Japanese for every user-visible string inside JSON outputs (message, options, readableSummary, plannerNote, plannerAssumptions).",
  },
  {
    label: "Spanish (Español)",
    tag: "es",
    instruction:
      "Use Spanish for every user-visible string inside JSON outputs (message, options, readableSummary, plannerNote, plannerAssumptions).",
  },
  {
    label: "Chinese (中文)",
    tag: "zh",
    instruction:
      "Use Chinese for every user-visible string inside JSON outputs (message, options, readableSummary, plannerNote, plannerAssumptions).",
  },
];

/**
 * First interactive step for LLM plan: pick dialogue language (arrow keys + Other).
 */
export async function pickPlanDialogueLocale(): Promise<PlanDialogueLocale> {
  const labels = [...PLAN_DIALOGUE_LOCALE_PRESETS.map((p) => p.label), OTHER_LABEL];
  const picked = await askSelect({
    message: "Choose planning dialogue language (↑/↓ · Enter)",
    nonInteractive: false,
    choices: labels,
    default: PLAN_DIALOGUE_LOCALE_PRESETS[0]!.label,
  });
  if (picked === OTHER_LABEL) {
    const raw = await askInput({
      message: 'Language for planning (e.g. "French", "pt-BR", "Deutsch")',
      nonInteractive: false,
      required: true,
    });
    const name = raw.trim();
    return {
      tag: "custom",
      instruction: `Use ${name} for every user-visible string inside JSON outputs (message, options, readableSummary, plannerNote, plannerAssumptions).`,
    };
  }
  const hit = PLAN_DIALOGUE_LOCALE_PRESETS.find((p) => p.label === picked);
  if (hit) return { tag: hit.tag, instruction: hit.instruction };
  return { tag: PLAN_DIALOGUE_LOCALE_PRESETS[0]!.tag, instruction: PLAN_DIALOGUE_LOCALE_PRESETS[0]!.instruction };
}

/** Last select/checkbox row — not sent to the LLM as the user's answer. */
const PLAN_GO_BACK_LABEL = "« Go back one step »";
/** User stops Q&A and requests draft summary from current thread. */
const PLAN_WRAP_UP_LABEL = "« Wrap up — draft summary now »";

const PLAN_ASSUMED_MAX_QUESTIONS = 14;
const PLAN_PROGRESS_BAR_WIDTH = 18;

function planningProgressLine(displayStep1Based: number): string {
  const denom = PLAN_ASSUMED_MAX_QUESTIONS;
  const p = Math.min(1, displayStep1Based / denom);
  const filled = Math.round(p * PLAN_PROGRESS_BAR_WIDTH);
  const bar = "█".repeat(filled) + "░".repeat(PLAN_PROGRESS_BAR_WIDTH - filled);
  const remaining = Math.max(0, denom - displayStep1Based);
  const etaMin = Math.max(1, Math.ceil(remaining * 0.45));
  return `[${bar}] Q${displayStep1Based}/${denom}+ · ~${etaMin} min left (rough guess)`;
}

type PlanCollectResult =
  | { readonly kind: "answer"; readonly text: string }
  | { readonly kind: "goBack" }
  | { readonly kind: "wrapUp" };

function withOtherOption(options: readonly string[]): string[] {
  const list = [...options];
  if (!list.some((o) => o === OTHER_LABEL)) list.push(OTHER_LABEL);
  return list;
}

interface CursorTurn {
  readonly role: "user" | "assistant";
  readonly content: string;
}

function transcriptFromCursorParts(parts: readonly CursorTurn[]): string {
  return parts.map((p) => `${p.role}: ${p.content}`).join("\n") + "\n";
}

/** Pops pending assistant + last user reply (one planning step back). OpenAI array includes system at index 0. */
function planningGoBackOpenAi(messages: OpenAiChatMessage[]): boolean {
  if (messages.length < 4) return false;
  if (messages.at(-1)?.role !== "assistant") return false;
  messages.pop();
  if (messages.at(-1)?.role !== "user") return false;
  messages.pop();
  return true;
}

function planningGoBackCursor(parts: CursorTurn[]): boolean {
  if (parts.length < 3) return false;
  if (parts.at(-1)?.role !== "assistant") return false;
  parts.pop();
  if (parts.at(-1)?.role !== "user") return false;
  parts.pop();
  return true;
}

/** User message prefix — must stay in sync with PLAN_JSON_PROTOCOL_CORE. */
const PLAN_SESSION_WRAP_UP_USER =
  "[VibeOps session] User chose to STOP further discovery questions and move on with what is known so far. Output exactly one JSON object: {\"turn\":\"confirm\",\"readableSummary\":\"...\"} only (no \"question\"). readableSummary must reflect the full conversation to date; explicitly note gaps or unknowns in the summary or plannerNote. Use the planning language rules.";

function logQuestionHeader(q: Extract<PlanLlmAssistantTurn, { turn: "question" }>, displayStep1Based: number): void {
  log.blank();
  log.info(dim(planningProgressLine(displayStep1Based)));
  log.info(bold(q.message));
  log.blank();
}

async function collectAnswerBody(
  q: Extract<PlanLlmAssistantTurn, { turn: "question" }>,
  canGoBack: boolean,
  canWrapUp: boolean,
): Promise<PlanCollectResult> {
  const rawOpts = q.options ?? [];
  if (q.questionType === "text" || rawOpts.length === 0) {
    if (canGoBack) {
      log.info(dim('To go back one step, type exactly: back (then Enter).'));
    }
    if (canWrapUp) {
      log.info(dim("To stop questions and draft a summary now, type: wrap (or enough)."));
    }
    const t = await askInput({ message: "Your answer", nonInteractive: false });
    const w = t.trim().toLowerCase();
    if (canGoBack && w === "back") return { kind: "goBack" };
    if (canWrapUp && (w === "wrap" || w === "enough")) return { kind: "wrapUp" };
    return { kind: "answer", text: t };
  }
  if (q.questionType === "multi") {
    log.info(dim("Suggested answers — Space toggles; Other for custom text."));
    const choices = [...withOtherOption([...rawOpts])];
    if (canWrapUp) choices.push(PLAN_WRAP_UP_LABEL);
    if (canGoBack) choices.push(PLAN_GO_BACK_LABEL);
    const picked = await askCheckbox({
      message: "Choose (↑/↓ · Space · Enter)",
      nonInteractive: false,
      choices,
      default: [],
    });
    if (picked.some((p) => p === PLAN_WRAP_UP_LABEL)) return { kind: "wrapUp" };
    if (picked.some((p) => p === PLAN_GO_BACK_LABEL)) return { kind: "goBack" };
    if (picked.length > 0) return { kind: "answer", text: picked.join("; ") };
    const free = await askInput({
      message: "Nothing selected — type your answer",
      nonInteractive: false,
    });
    return { kind: "answer", text: free };
  }
  const choices = [...rawOpts, OTHER_LABEL];
  if (canWrapUp) choices.push(PLAN_WRAP_UP_LABEL);
  if (canGoBack) choices.push(PLAN_GO_BACK_LABEL);
  const choice = await askSelect({
    message: "Choose (↑/↓ · Enter), Other, wrap-up, or go back",
    nonInteractive: false,
    choices,
    default: rawOpts[0]!,
  });
  if (choice === PLAN_WRAP_UP_LABEL) return { kind: "wrapUp" };
  if (choice === PLAN_GO_BACK_LABEL) return { kind: "goBack" };
  if (choice === OTHER_LABEL) {
    const free = await askInput({ message: "Your answer (free text)", nonInteractive: false });
    return { kind: "answer", text: free };
  }
  return { kind: "answer", text: choice };
}

async function runQuestionWithOptionalBack(params: {
  readonly parsed: Extract<PlanLlmAssistantTurn, { turn: "question" }>;
  readonly chatMode: boolean;
  readonly openAiMessages: OpenAiChatMessage[];
  readonly cursorParts: CursorTurn[];
  readonly displayStep1Based: number;
  readonly onBacked: () => void;
}): Promise<{ kind: "answer"; text: string } | { kind: "wrapUp" }> {
  const { parsed, chatMode, openAiMessages, cursorParts } = params;
  const canGoBackNow = () =>
    chatMode
      ? openAiMessages.length >= 4 && openAiMessages.at(-1)?.role === "assistant"
      : cursorParts.length >= 3 && cursorParts.at(-1)?.role === "assistant";
  const canWrapNow = () =>
    chatMode
      ? openAiMessages.length >= 3 && openAiMessages.at(-1)?.role === "assistant"
      : cursorParts.length >= 2 && cursorParts.at(-1)?.role === "assistant";

  for (;;) {
    logQuestionHeader(parsed, params.displayStep1Based);
    const out = await collectAnswerBody(parsed, canGoBackNow(), canWrapNow());
    if (out.kind === "goBack") {
      const ok = chatMode ? planningGoBackOpenAi(openAiMessages) : planningGoBackCursor(cursorParts);
      if (!ok) log.warn("Nothing further to go back to.");
      else {
        params.onBacked();
        log.skip("Went back one step — re-answer when ready.");
      }
      continue;
    }
    if (out.kind === "wrapUp") return { kind: "wrapUp" };
    return { kind: "answer", text: out.text };
  }
}

function buildUserPayload(params: {
  readonly cwd: string;
  readonly idea?: string;
  readonly planningLocale?: PlanDialogueLocale;
  readonly lastQuestion?: string;
  readonly lastAnswer?: string;
}): string {
  const lines: string[] = [];
  if (params.planningLocale) {
    lines.push(`Planning dialogue language tag: ${params.planningLocale.tag}`);
    lines.push(`Assistant natural-language outputs must follow: ${params.planningLocale.instruction}`);
  }
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

async function completeOneTurnOpenAi(
  messages: readonly OpenAiChatMessage[],
  model?: string,
): Promise<string> {
  const raw = await openAiChatCompletionJson({ messages, model });
  return extractJsonObject(raw);
}

async function completeOneTurnCursor(params: {
  readonly cwd: string;
  readonly system: string;
  readonly transcript: string;
  readonly model?: string;
}): Promise<string> {
  const prompt = `${params.system}\n\n--- Conversation ---\n${params.transcript}\n\n---\nReply with ONE JSON object only (no markdown), following the protocol.`;
  const out = await cursorAgentPrint({ cwd: params.cwd, prompt, model: params.model });
  const text = extractAgentAssistantText(out);
  return extractJsonObject(text);
}

export function printPlanProviderSetupHelp(): void {
  log.blank();
  log.info(bold("No LLM provider is ready for `vibeops plan`."));
  log.blank();
  log.info(bold("1) OpenAI (platform API key)"));
  log.info("   Usage-based billing on the OpenAI API (not the same as ChatGPT-only login).");
  log.info(`  · Create a key: ${cyan("https://platform.openai.com/api-keys")}`);
  log.info(`  · ${dim("export OPENAI_API_KEY=\"sk-...\"")}`);
  log.info(`  · Optional model override: ${dim("export VIBEOPS_OPENAI_MODEL=gpt-4o")}`);
  log.info(`  · Interactive ${cyan("vibeops plan")} lists models from ${dim("GET /v1/models")} for you to pick.`);
  log.blank();
  log.info(bold("2) Codex (ChatGPT OAuth)"));
  log.info(
    `  · Interactive ${cyan("vibeops plan")} can open the browser and save tokens to ${dim("~/.codex/auth.json")}.`,
  );
  log.info(`  · Or run ${cyan("codex login")} (official CLI).`);
  log.info(
    `  · Optional: ${dim("export VIBEOPS_CODEX_MODEL=...")} ${dim("export VIBEOPS_CODEX_BASE_URL=...")} ${dim("export VIBEOPS_CODEX_CLIENT_VERSION=...")} or ${cyan("vibeops plan --model <id>")}`,
  );
  log.info(`  · Interactive plan lists models from ${dim("GET …/backend-api/codex/models")} when signed in.`);
  log.blank();
  log.info(bold("3) Cursor Agent CLI (same account as Cursor IDE)"));
  log.info(
    "   VibeOps does not install this for you: use Cursor’s installer for your OS, then put `agent` on PATH.",
  );
  log.info(`  · Install / update: ${cyan("https://cursor.com/docs/cli")}`);
  log.info(`  · Run ${cyan("agent login")} then verify with ${cyan("agent status")}`);
  log.info(
    `  · Override binary name: ${dim("export VIBEOPS_CURSOR_AGENT_BIN=/path/to/agent")}`,
  );
  log.info(`  · Interactive plan runs ${cyan("agent models")} and lets you pick before planning.`);
  log.blank();
}

interface ProviderCandidate {
  readonly id: PlanLlmProviderId;
  readonly label: string;
  readonly ok: boolean;
}

function printCursorAgentSetupHelp(cursor: CursorAgentProbeResult): void {
  const cmd = cursor.command;
  const reason = cursor.reason ?? "";
  const missingOnPath = /not found on PATH/i.test(reason);
  log.blank();
  if (missingOnPath) {
    log.info(bold("Cursor Agent CLI — install"));
    log.info(
      `  ${cyan(cmd)} was not found on PATH. VibeOps does not run an installer for you (brew vs npm vs a manual bundle depends on your machine and policy).`,
    );
    log.info(`  · Follow Cursor’s steps: ${cyan("https://cursor.com/docs/cli")}`);
    log.info(`  · Then open a new terminal and check: ${cyan(`${cmd} --version`)} and ${cyan(`${cmd} status`)}`);
  } else if (/not authenticated|not logged|login required|unauthorized/i.test(reason)) {
    log.info(bold("Cursor Agent CLI — sign in"));
    log.info(`  · Run ${cyan(`${cmd} login`)} then ${cyan(`${cmd} status`)}`);
  } else {
    log.info(bold("Cursor Agent CLI — fix the error below"));
    if (reason.length > 0) log.info(dim(`  ${reason}`));
    log.info(`  · When resolved, verify with ${cyan(`${cmd} status`)}`);
  }
  log.info(`  · Different binary name: ${dim(`export VIBEOPS_CURSOR_AGENT_BIN=/path/to/${cmd}`)}`);
  log.blank();
}

function providerChoiceLabel(c: ProviderCandidate): string {
  return c.ok ? `${c.label} ✓` : `${c.label} (needs setup)`;
}

export async function pickPlanLlmProvider(
  cwd: string,
  preferred?: PlanLlmProviderId,
  opts?: { interactiveLogin?: boolean },
): Promise<PlanLlmProviderId | null> {
  const interactiveLogin = opts?.interactiveLogin === true;

  async function loadProbes() {
    return {
      openai: await probeOpenAiApiKey(),
      codex: await probeCodexOAuthFile(),
      cursor: await probeCursorAgentCli(cwd),
    };
  }

  let { openai, codex, cursor } = await loadProbes();

  if (interactiveLogin && preferred === "codex-oauth" && !codex.ok) {
    log.step("Codex (ChatGPT) OAuth — opening sign-in…");
    try {
      await runCodexPkceOAuthLogin();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      log.error(`Codex OAuth login failed: ${msg}`);
      process.exitCode = 1;
      return null;
    }
    ({ codex } = await loadProbes());
    if (!codex.ok) {
      log.error("Codex auth is still not available after login.");
      process.exitCode = 1;
      return null;
    }
  }

  const buildCandidates = (
    o: typeof openai,
    c: typeof codex,
    u: typeof cursor,
  ): ProviderCandidate[] => [
    { id: "openai", label: "OpenAI (platform API key)", ok: o.ok },
    { id: "codex-oauth", label: "Codex (ChatGPT OAuth — ~/.codex/auth.json)", ok: c.ok },
    { id: "cursor-agent", label: "Cursor Agent CLI", ok: u.ok },
  ];

  let candidates = buildCandidates(openai, codex, cursor);
  let okList = candidates.filter((c) => c.ok);

  if (okList.length === 0 && interactiveLogin) {
    const connect = await askSelect({
      message: "No LLM provider detected. How do you want to connect?",
      nonInteractive: false,
      choices: [
        "ChatGPT / Codex OAuth (open browser sign-in)",
        "Re-check environment (I exported OPENAI_API_KEY or logged in with Cursor Agent in this shell)",
        "Show setup instructions and exit",
      ],
      default: "ChatGPT / Codex OAuth (open browser sign-in)",
    });
    if (connect === "ChatGPT / Codex OAuth (open browser sign-in)") {
      try {
        await runCodexPkceOAuthLogin();
        ({ openai, codex, cursor } = await loadProbes());
        candidates = buildCandidates(openai, codex, cursor);
        okList = candidates.filter((c) => c.ok);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        log.error(`Codex OAuth login failed: ${msg}`);
      }
    } else if (connect === "Re-check environment (I exported OPENAI_API_KEY or logged in with Cursor Agent in this shell)") {
      ({ openai, codex, cursor } = await loadProbes());
      candidates = buildCandidates(openai, codex, cursor);
      okList = candidates.filter((c) => c.ok);
    }
  }

  if (okList.length === 0) {
    printPlanProviderSetupHelp();
    if (openai.reason) log.info(dim(`OpenAI: ${openai.reason}`));
    if (!codex.ok && codex.reason) log.info(dim(`Codex OAuth: ${codex.reason}`));
    if (cursor.reason) log.info(dim(`Cursor Agent: ${cursor.reason}`));
    process.exitCode = 1;
    return null;
  }

  if (preferred !== undefined) {
    const hit = candidates.find((c) => c.id === preferred);
    if (hit?.ok === true) return preferred;
    if (hit !== undefined) {
      log.warn(`--provider ${preferred} unavailable (${explainMiss(preferred, openai, codex, cursor)})`);
    }
  }

  if (!interactiveLogin) {
    if (okList.length === 1) return okList[0]!.id;
    return okList[0]?.id ?? null;
  }

  const choiceLabels = candidates.map(providerChoiceLabel);
  const firstReady = candidates.find((c) => c.ok);
  const defaultLabel = firstReady ? providerChoiceLabel(firstReady) : choiceLabels[0]!;

  const pickedLabel = await askSelect({
    message: "Choose LLM provider for planning (↑/↓ · Enter)",
    nonInteractive: false,
    choices: choiceLabels,
    default: defaultLabel,
  });
  const picked = candidates.find((c) => providerChoiceLabel(c) === pickedLabel);
  const pickedId = picked?.id ?? firstReady?.id;
  if (!pickedId) {
    process.exitCode = 1;
    return null;
  }

  if (pickedId === "openai") {
    if (!openai.ok) {
      log.error("OpenAI is not configured: set OPENAI_API_KEY (platform API key), then run again.");
      if (openai.reason) log.info(dim(`OpenAI: ${openai.reason}`));
      process.exitCode = 1;
      return null;
    }
    return pickedId;
  }

  if (pickedId === "codex-oauth") {
    if (!codex.ok) {
      log.step("Codex (ChatGPT) OAuth — opening sign-in…");
      try {
        await runCodexPkceOAuthLogin();
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        log.error(`Codex OAuth login failed: ${msg}`);
        process.exitCode = 1;
        return null;
      }
      ({ codex } = await loadProbes());
      if (!codex.ok) {
        log.error("Codex auth is still not available after login.");
        process.exitCode = 1;
        return null;
      }
    }
    return pickedId;
  }

  if (!cursor.ok) {
    log.error("Cursor Agent CLI is not ready for planning.");
    printCursorAgentSetupHelp(cursor);
    process.exitCode = 1;
    return null;
  }
  return "cursor-agent";
}

function explainMiss(
  id: PlanLlmProviderId,
  openai: { reason?: string },
  codex: { reason?: string },
  cursor: { reason?: string },
): string {
  if (id === "openai") return openai.reason ?? "unknown";
  if (id === "codex-oauth") return codex.reason ?? "unknown";
  return cursor.reason ?? "unknown";
}

function usesChatMessageTranscript(provider: PlanLlmProviderId): boolean {
  return provider === "openai" || provider === "codex-oauth";
}

export async function gatherBriefViaLlm(params: {
  readonly cwd: string;
  readonly idea?: string;
  readonly provider: PlanLlmProviderId;
  readonly allowCodexBrowserLogin?: boolean;
  /** When set, overrides env/default model for the active provider. */
  readonly llmModelOverride?: string;
  /** User-chosen dialogue language (system prompt + first user turn). */
  readonly planningLocale: PlanDialogueLocale;
}): Promise<BriefBundle> {
  if (params.provider === "codex-oauth" && params.allowCodexBrowserLogin === true) {
    let probe = await probeCodexOAuthFile();
    if (!probe.ok) {
      log.step("Codex OAuth required — starting browser sign-in…");
      await runCodexPkceOAuthLogin();
      probe = await probeCodexOAuthFile();
      if (!probe.ok) {
        throw new Error("Codex OAuth is not available after sign-in.");
      }
    }
  }
  const source: BriefMeta["source"] =
    params.provider === "openai"
      ? "llm-openai"
      : params.provider === "codex-oauth"
        ? "llm-codex-oauth"
        : "llm-cursor-agent";

  const systemContent = buildPlanSystemPrompt(params.planningLocale.instruction);
  const user0 = buildUserPayload({
    cwd: params.cwd,
    idea: params.idea,
    planningLocale: params.planningLocale,
  });
  const cursorParts: CursorTurn[] = [{ role: "user", content: user0 }];
  let transcript = transcriptFromCursorParts(cursorParts);
  const openAiMessages: OpenAiChatMessage[] = [
    { role: "system", content: systemContent },
    { role: "user", content: user0 },
  ];

  const chatMode = usesChatMessageTranscript(params.provider);
  const modelRaw = params.llmModelOverride?.trim();
  const model = modelRaw && modelRaw.length > 0 ? modelRaw : undefined;
  let summaryConfirmed = false;
  /** Count of answered planning questions (used for progress + go-back). */
  let completedPlanningSteps = 0;

  for (let i = 0; i < MAX_LLM_TURNS; i++) {
    let jsonSlice: string;
    if (params.provider === "openai") {
      jsonSlice = await completeOneTurnOpenAi(openAiMessages, model);
    } else if (params.provider === "codex-oauth") {
      jsonSlice = await codexOAuthPlanCompletion(openAiMessages, model !== undefined ? { model } : undefined);
    } else {
      jsonSlice = await completeOneTurnCursor({
        cwd: params.cwd,
        system: systemContent,
        transcript,
        model,
      });
    }

    let parsed: PlanLlmAssistantTurn;
    try {
      parsed = parsePlanLlmTurn(jsonSlice);
    } catch (e) {
      const hint = e instanceof Error ? e.message : String(e);
      const repair = `Your previous reply was not valid for this protocol (${hint}). Output ONE JSON object only.`;
      if (chatMode) {
        openAiMessages.push({ role: "assistant", content: jsonSlice.slice(0, 4000) });
        openAiMessages.push({ role: "user", content: repair });
      } else {
        cursorParts.push({ role: "assistant", content: jsonSlice.slice(0, 2000) });
        cursorParts.push({ role: "user", content: repair });
        transcript = transcriptFromCursorParts(cursorParts);
      }
      continue;
    }

    if (parsed.turn === "done") {
      if (!summaryConfirmed) {
        const repair =
          'Protocol: do not output {"turn":"done"} until the user has confirmed a {"turn":"confirm"} summary in the terminal. First output {"turn":"confirm","readableSummary":"..."} when you have enough context. Output ONE JSON object only.';
        if (chatMode) {
          openAiMessages.push({ role: "assistant", content: jsonSlice.slice(0, 4000) });
          openAiMessages.push({ role: "user", content: repair });
        } else {
          cursorParts.push({ role: "assistant", content: jsonSlice.slice(0, 2000) });
          cursorParts.push({ role: "user", content: repair });
          transcript = transcriptFromCursorParts(cursorParts);
        }
        continue;
      }
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

    if (parsed.turn === "confirm") {
      if (summaryConfirmed) {
        const repair =
          '[VibeOps session] User already confirmed. Reply with ONE JSON object only: {"turn":"done","projectBrief":{...},"plannerAssumptions":[...]}. No "confirm" or "question".';
        if (chatMode) {
          openAiMessages.push({ role: "assistant", content: jsonSlice.slice(0, 4000) });
          openAiMessages.push({ role: "user", content: repair });
        } else {
          cursorParts.push({ role: "assistant", content: jsonSlice.slice(0, 2000) });
          cursorParts.push({ role: "user", content: repair });
          transcript = transcriptFromCursorParts(cursorParts);
        }
        continue;
      }
      log.blank();
      log.step("Review summary before writing the ProjectBrief");
      log.raw(parsed.readableSummary.endsWith("\n") ? parsed.readableSummary : `${parsed.readableSummary}\n`);
      log.blank();
      const ok = await yesNoSelect({
        message: "Does this summary match what you want to build?",
        defaultValue: true,
      });
      if (chatMode) {
        openAiMessages.push({ role: "assistant", content: jsonSlice });
      } else {
        cursorParts.push({ role: "assistant", content: jsonSlice });
        transcript = transcriptFromCursorParts(cursorParts);
      }
      if (ok) {
        summaryConfirmed = true;
        const msg =
          '[VibeOps session] User CONFIRMED this summary. Reply with ONE JSON object only: {"turn":"done","projectBrief":{...all required keys...},"plannerAssumptions":[...]}. Align projectBrief with the confirmed summary and the full conversation. Do NOT output "question" or "confirm".';
        if (chatMode) {
          openAiMessages.push({ role: "user", content: msg });
        } else {
          cursorParts.push({ role: "user", content: msg });
          transcript = transcriptFromCursorParts(cursorParts);
        }
        continue;
      }
      const fb = await askInput({
        message: "What should we change or add?",
        nonInteractive: false,
      });
      const msg = `[VibeOps session] User did NOT confirm the summary. Feedback:\n${fb}\nContinue with one {"turn":"question",...} per reply until ready, then {"turn":"confirm",...} again before any "done".`;
      if (chatMode) {
        openAiMessages.push({ role: "user", content: msg });
      } else {
        cursorParts.push({ role: "user", content: msg });
        transcript = transcriptFromCursorParts(cursorParts);
      }
      continue;
    }

    openAiMessages.push({ role: "assistant", content: jsonSlice });
    if (!chatMode) {
      cursorParts.push({ role: "assistant", content: jsonSlice });
      transcript = transcriptFromCursorParts(cursorParts);
    }

    const outcome = await runQuestionWithOptionalBack({
      parsed,
      chatMode,
      openAiMessages,
      cursorParts,
      displayStep1Based: completedPlanningSteps + 1,
      onBacked: () => {
        completedPlanningSteps = Math.max(0, completedPlanningSteps - 1);
      },
    });
    if (outcome.kind === "wrapUp") {
      log.step("Stopping discovery — moving on to a draft summary with what we have.");
      if (chatMode) {
        openAiMessages.push({ role: "user", content: PLAN_SESSION_WRAP_UP_USER });
      } else {
        cursorParts.push({ role: "user", content: PLAN_SESSION_WRAP_UP_USER });
        transcript = transcriptFromCursorParts(cursorParts);
      }
      continue;
    }
    completedPlanningSteps++;
    const followUp = buildUserPayload({
      cwd: params.cwd,
      idea: params.idea,
      lastQuestion: parsed.message,
      lastAnswer: outcome.text,
    });

    openAiMessages.push({ role: "user", content: followUp });
    if (!chatMode) {
      cursorParts.push({ role: "user", content: followUp });
      transcript = transcriptFromCursorParts(cursorParts);
    }
  }

  throw new Error(`Planning stopped: exceeded ${MAX_LLM_TURNS} LLM turns without a "done" response.`);
}
