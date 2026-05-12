/**
 * ChatGPT Codex backend (subscription OAuth) — POST /backend-api/codex/responses
 * with store:false and stream:true (required for ChatGPT OAuth tokens).
 *
 * @see https://github.com/openclaw/openclaw/issues/67740 (payload constraints)
 */
import { resolveCodexOAuthAccessToken } from "./plan-codex-auth.js";
import type { OpenAiChatMessage } from "./plan-llm-openai.js";

const DEFAULT_BASE = "https://chatgpt.com/backend-api/codex";

function codexBaseUrl(): string {
  return (process.env.VIBEOPS_CODEX_BASE_URL ?? DEFAULT_BASE).replace(/\/$/, "");
}

function codexModel(): string {
  return process.env.VIBEOPS_CODEX_MODEL?.trim() || "gpt-5.1-codex";
}

interface ResponsesInputMessage {
  readonly type: "message";
  readonly role: "user" | "assistant";
  readonly content: ReadonlyArray<
    { readonly type: "input_text"; readonly text: string } | { readonly type: "output_text"; readonly text: string }
  >;
}

function mapChatMessagesToCodexBody(messages: readonly OpenAiChatMessage[]): {
  instructions: string;
  input: ResponsesInputMessage[];
} {
  const systemChunks: string[] = [];
  const input: ResponsesInputMessage[] = [];
  for (const m of messages) {
    if (m.role === "system") {
      systemChunks.push(m.content);
      continue;
    }
    if (m.role === "user") {
      input.push({
        type: "message",
        role: "user",
        content: [{ type: "input_text", text: m.content }],
      });
      continue;
    }
    if (m.role === "assistant") {
      input.push({
        type: "message",
        role: "assistant",
        content: [{ type: "output_text", text: m.content }],
      });
    }
  }
  const instructions = systemChunks.join("\n\n").trim();
  if (instructions.length === 0) {
    throw new Error("Codex responses: at least one system message is required.");
  }
  return { instructions, input };
}

function deltaTextFromEvent(obj: Record<string, unknown>): string {
  const d = obj.delta;
  if (typeof d === "string") return d;
  if (d && typeof d === "object") {
    const t = (d as { text?: unknown }).text;
    if (typeof t === "string") return t;
  }
  return "";
}

/**
 * Parses SSE from Codex responses stream; accumulates assistant text deltas.
 */
export async function readSseTextBody(response: Response): Promise<string> {
  const body = response.body;
  if (!body) {
    const t = await response.text();
    return t;
  }
  const reader = body.getReader();
  const dec = new TextDecoder();
  let pending = "";
  let out = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    pending += dec.decode(value, { stream: true });
    let sep: number;
    while ((sep = pending.indexOf("\n\n")) >= 0) {
      const block = pending.slice(0, sep);
      pending = pending.slice(sep + 2);
      for (const line of block.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const data = trimmed.slice(5).trim();
        if (data === "[DONE]") continue;
        try {
          const j = JSON.parse(data) as Record<string, unknown>;
          const typ = String(j.type ?? "");
          if (typ === "response.output_text.delta" || typ.endsWith(".output_text.delta")) {
            out += deltaTextFromEvent(j);
          }
          if (typ === "response.completed" || typ === "response.done") {
            const resp = j.response as Record<string, unknown> | undefined;
            if (resp && typeof resp === "object") {
              const output = resp.output;
              if (Array.isArray(output)) {
                for (const item of output) {
                  if (!item || typeof item !== "object") continue;
                  const content = (item as { content?: unknown }).content;
                  if (!Array.isArray(content)) continue;
                  for (const c of content) {
                    if (!c || typeof c !== "object") continue;
                    const o = c as { type?: unknown; text?: unknown };
                    if (o.type === "output_text" && typeof o.text === "string") {
                      out += o.text;
                    }
                  }
                }
              }
            }
          }
        } catch {
          /* ignore malformed SSE JSON */
        }
      }
    }
  }
  pending += dec.decode();
  if (pending.trim().length > 0) {
    for (const line of pending.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const data = trimmed.slice(5).trim();
      if (data === "[DONE]") continue;
      try {
        const j = JSON.parse(data) as Record<string, unknown>;
        const typ = String(j.type ?? "");
        if (typ === "response.output_text.delta" || typ.endsWith(".output_text.delta")) {
          out += deltaTextFromEvent(j);
        }
      } catch {
        /* ignore */
      }
    }
  }
  return out.trim();
}

async function postCodexResponses(body: Record<string, unknown>): Promise<Response> {
  const { accessToken } = await resolveCodexOAuthAccessToken();
  const url = `${codexBaseUrl()}/responses`;
  return fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      Accept: "text/event-stream",
      "OpenAI-Beta": "responses=v1",
    },
    body: JSON.stringify(body),
  });
}

/**
 * One planning model turn via Codex (ChatGPT OAuth). Returns raw assistant text
 * (expected to be a single JSON object per VibeOps protocol).
 */
export async function codexOAuthPlanCompletion(messages: readonly OpenAiChatMessage[]): Promise<string> {
  const { instructions, input } = mapChatMessagesToCodexBody(messages);
  const model = codexModel();

  const withJsonFormat = (): Record<string, unknown> => ({
    model,
    instructions,
    input,
    store: false,
    stream: true,
    text: {
      format: {
        type: "json_object",
      },
    },
  });

  const minimal = (): Record<string, unknown> => ({
    model,
    instructions,
    input,
    store: false,
    stream: true,
  });

  let res = await postCodexResponses(withJsonFormat());
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    if (res.status === 400 && /unknown|unsupported|text|format|parameter/i.test(errText)) {
      res = await postCodexResponses(minimal());
      if (!res.ok) {
        const err2 = await res.text().catch(() => "");
        throw new Error(`Codex responses HTTP ${res.status}: ${err2.slice(0, 500)}`);
      }
    } else {
      throw new Error(`Codex responses HTTP ${res.status}: ${errText.slice(0, 500)}`);
    }
  }

  const text = await readSseTextBody(res);
  if (text.length === 0) {
    throw new Error("Codex responses stream produced empty text.");
  }
  return text;
}
