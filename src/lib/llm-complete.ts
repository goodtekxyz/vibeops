import type { LlmProviderPreference } from "../types/config.js";
import { resolveAvailableLlmProvider, resolveLlmProviderForUse } from "./llm-preference.js";
import { codexOAuthTextCompletion } from "./plan-codex-responses.js";
import { cursorAgentPrint, extractAgentAssistantText } from "./plan-llm-cursor-agent.js";
import type { OpenAiChatMessage } from "./plan-llm-openai.js";
import {
  extractJsonObject,
  openAiChatCompletionJson,
  openAiChatCompletionText,
} from "./plan-llm-openai.js";
import type { PlanLlmProviderId } from "./plan-llm-types.js";

function formatMessagesForCursor(messages: readonly OpenAiChatMessage[]): string {
  return messages
    .map((m) => `### ${m.role}\n\n${m.content}`)
    .join("\n\n---\n\n");
}

export interface LlmCompleteResult {
  readonly text: string;
  readonly provider: PlanLlmProviderId;
}

export interface LlmCompleteOpts {
  readonly cwd: string;
  /** Force a specific provider (overrides project preference). */
  readonly provider?: PlanLlmProviderId;
  readonly model?: string;
  /** From `.vibeops.json` — `auto` picks first available. */
  readonly preference?: LlmProviderPreference;
}

export async function llmCompleteText(
  messages: readonly OpenAiChatMessage[],
  opts: LlmCompleteOpts,
): Promise<LlmCompleteResult> {
  const pref = opts.preference ?? "auto";
  const provider =
    opts.provider ?? (await resolveLlmProviderForUse(opts.cwd, pref));
  if (provider === null) {
    if (pref !== "auto") {
      throw new Error(
        `Preferred LLM "${pref}" is not available (not installed or not authenticated). Run \`vibeops llm connect\` or \`vibeops llm use auto\`.`,
      );
    }
    throw new Error(
      "No LLM provider available. Run `vibeops llm connect` or set Codex OAuth, Cursor Agent CLI (`agent login`), or OPENAI_API_KEY.",
    );
  }

  if (provider === "openai") {
    const text = await openAiChatCompletionText({ messages, model: opts.model });
    return { text, provider };
  }

  if (provider === "codex-oauth") {
    const text = await codexOAuthTextCompletion(messages, { model: opts.model });
    return { text, provider };
  }

  const raw = await cursorAgentPrint({
    cwd: opts.cwd,
    prompt: formatMessagesForCursor(messages),
    model: opts.model,
  });
  return { text: extractAgentAssistantText(raw), provider: "cursor-agent" };
}

export async function llmCompleteJson(
  messages: readonly OpenAiChatMessage[],
  opts: LlmCompleteOpts,
): Promise<LlmCompleteResult> {
  const pref = opts.preference ?? "auto";
  const provider =
    opts.provider ?? (await resolveLlmProviderForUse(opts.cwd, pref));
  if (provider === null) {
    if (pref !== "auto") {
      throw new Error(
        `Preferred LLM "${pref}" is not available (not installed or not authenticated). Run \`vibeops llm connect\` or \`vibeops llm use auto\`.`,
      );
    }
    throw new Error(
      "No LLM provider available. Run `vibeops llm connect` or set Codex OAuth, Cursor Agent CLI (`agent login`), or OPENAI_API_KEY.",
    );
  }

  if (provider === "openai") {
    const text = await openAiChatCompletionJson({ messages, model: opts.model });
    return { text, provider };
  }

  const jsonMessages: OpenAiChatMessage[] = [
    ...messages,
    {
      role: "user",
      content: "Reply with a single JSON object only. No markdown code fences or extra prose.",
    },
  ];

  const { text: raw } = await llmCompleteText(jsonMessages, { ...opts, provider });
  return { text: extractJsonObject(raw), provider };
}

export { resolveAvailableLlmProvider } from "./llm-preference.js";

/** True if any provider can run completions (ignores project preference). */
export async function anyLlmProviderAvailable(cwd: string): Promise<boolean> {
  return (await resolveAvailableLlmProvider(cwd)) !== null;
}
