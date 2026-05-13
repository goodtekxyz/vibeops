import type { PlanLlmAssistantTurn, PlanLlmDoneTurn } from "./plan-llm-types.js";

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";

export interface OpenAiChatMessage {
  readonly role: "system" | "user" | "assistant";
  readonly content: string;
}

export async function openAiChatCompletionJson(params: {
  readonly messages: readonly OpenAiChatMessage[];
  readonly model?: string;
}): Promise<string> {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) {
    throw new Error("OPENAI_API_KEY is not set.");
  }
  const model = params.model ?? process.env.VIBEOPS_OPENAI_MODEL?.trim() ?? "gpt-4o-mini";
  const res = await fetch(OPENAI_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: params.messages,
      temperature: 0.4,
      response_format: { type: "json_object" },
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`OpenAI HTTP ${res.status}: ${body.slice(0, 500)}`);
  }
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content;
  if (typeof content !== "string" || content.trim().length === 0) {
    throw new Error("OpenAI returned an empty message.");
  }
  return content.trim();
}

/** Plain assistant text (no `response_format`) — used for planner markdown apply. */
export async function openAiChatCompletionText(params: {
  readonly messages: readonly OpenAiChatMessage[];
  readonly model?: string;
}): Promise<string> {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) {
    throw new Error("OPENAI_API_KEY is not set.");
  }
  const model = params.model ?? process.env.VIBEOPS_OPENAI_MODEL?.trim() ?? "gpt-4o-mini";
  const res = await fetch(OPENAI_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: params.messages,
      temperature: 0.35,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`OpenAI HTTP ${res.status}: ${body.slice(0, 500)}`);
  }
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content;
  if (typeof content !== "string" || content.trim().length === 0) {
    throw new Error("OpenAI returned an empty message.");
  }
  return content.trim();
}

export function extractJsonObject(text: string): string {
  const trimmed = text.trim();
  const fence = /^```(?:json)?\s*([\s\S]*?)```$/m.exec(trimmed);
  if (fence?.[1]) return fence[1].trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) return trimmed.slice(start, end + 1);
  return trimmed;
}

export function parsePlanLlmTurn(jsonText: string): PlanLlmAssistantTurn {
  const raw = JSON.parse(jsonText) as Record<string, unknown>;
  const turn = raw.turn;
  if (turn === "done") {
    const pb = raw.projectBrief;
    if (!pb || typeof pb !== "object" || Array.isArray(pb)) {
      throw new Error('Invalid JSON: "done" turn requires object "projectBrief".');
    }
    const plannerAssumptions = raw.plannerAssumptions;
    const pa =
      Array.isArray(plannerAssumptions) && plannerAssumptions.every((x) => typeof x === "string")
        ? (plannerAssumptions as string[])
        : undefined;
    return {
      turn: "done",
      projectBrief: pb as PlanLlmDoneTurn["projectBrief"],
      plannerAssumptions: pa,
    };
  }
  if (turn === "confirm") {
    const readableSummary = typeof raw.readableSummary === "string" ? raw.readableSummary.trim() : "";
    if (readableSummary.length === 0) {
      throw new Error('Invalid JSON: "confirm" turn needs non-empty "readableSummary" (markdown).');
    }
    const plannerNote = typeof raw.plannerNote === "string" ? raw.plannerNote.trim() : undefined;
    return {
      turn: "confirm",
      readableSummary,
      plannerNote: plannerNote && plannerNote.length > 0 ? plannerNote : undefined,
    };
  }
  if (turn === "question") {
    const message = typeof raw.message === "string" ? raw.message : "";
    const questionType = raw.questionType;
    if (message.length === 0) {
      throw new Error('Invalid JSON: "question" turn needs non-empty "message".');
    }
    if (questionType !== "single" && questionType !== "multi" && questionType !== "text") {
      throw new Error('Invalid JSON: questionType must be "single", "multi", or "text".');
    }
    const options = Array.isArray(raw.options)
      ? raw.options.filter((x): x is string => typeof x === "string" && x.trim().length > 0)
      : [];
    return {
      turn: "question",
      message,
      questionType,
      options: options.length > 0 ? options : undefined,
    };
  }
  throw new Error('Invalid JSON: "turn" must be "question", "confirm", or "done".');
}
