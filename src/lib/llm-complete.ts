import { probeCodexOAuthFile } from "./plan-codex-auth.js";
import { codexOAuthTextCompletion } from "./plan-codex-responses.js";
import { cursorAgentPrint, extractAgentAssistantText } from "./plan-llm-cursor-agent.js";
import { probeCursorAgentCli, probeOpenAiApiKey } from "./plan-llm-detect.js";
import type { OpenAiChatMessage } from "./plan-llm-openai.js";
import {
  extractJsonObject,
  openAiChatCompletionJson,
  openAiChatCompletionText,
} from "./plan-llm-openai.js";
import type { PlanLlmProviderId } from "./plan-llm-types.js";

/** Non-interactive: Codex OAuth → Cursor Agent → OpenAI API key (same sources as `vibeops plan`). */
export async function resolveAvailableLlmProvider(
  cwd: string,
): Promise<PlanLlmProviderId | null> {
  const codex = await probeCodexOAuthFile();
  if (codex.ok) return "codex-oauth";
  const cursor = await probeCursorAgentCli(cwd);
  if (cursor.ok) return "cursor-agent";
  const openai = await probeOpenAiApiKey();
  if (openai.ok) return "openai";
  return null;
}

function formatMessagesForCursor(messages: readonly OpenAiChatMessage[]): string {
  return messages
    .map((m) => `### ${m.role}\n\n${m.content}`)
    .join("\n\n---\n\n");
}

export interface LlmCompleteResult {
  readonly text: string;
  readonly provider: PlanLlmProviderId;
}

export async function llmCompleteText(
  messages: readonly OpenAiChatMessage[],
  opts: { readonly cwd: string; readonly provider?: PlanLlmProviderId; readonly model?: string },
): Promise<LlmCompleteResult> {
  const provider = opts.provider ?? (await resolveAvailableLlmProvider(opts.cwd));
  if (provider === null) {
    throw new Error(
      "No LLM provider available. Use Codex OAuth (~/.codex/auth.json), Cursor Agent CLI (`agent login`), or OPENAI_API_KEY.",
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
  opts: { readonly cwd: string; readonly provider?: PlanLlmProviderId; readonly model?: string },
): Promise<LlmCompleteResult> {
  const provider = opts.provider ?? (await resolveAvailableLlmProvider(opts.cwd));
  if (provider === null) {
    throw new Error(
      "No LLM provider available. Use Codex OAuth (~/.codex/auth.json), Cursor Agent CLI (`agent login`), or OPENAI_API_KEY.",
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
