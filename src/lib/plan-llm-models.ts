/**
 * Interactive `vibeops plan`: discover model ids from the active provider
 * (OpenAI / Codex ChatGPT OAuth / Cursor Agent CLI), then let the user pick.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { resolveCodexOAuthAccessToken } from "./plan-codex-auth.js";
import { codexResponsesBaseUrl } from "./plan-codex-responses.js";
import { askInput, askSelect } from "./inquirer-helpers.js";
import { dim, log, yellow } from "./logger.js";
import type { PlanLlmProviderId } from "./plan-llm-types.js";

const execFileAsync = promisify(execFile);

const DEFAULT_PICK_LABEL = "(Use environment / VibeOps default)";

const MAX_OPENAI_MODELS = 100;
const MAX_CODEX_MODELS = 200;
const MAX_SELECT_CHOICES = 120;

/** Codex `GET /models` requires `client_version` (same query as official Codex CLI). */
const DEFAULT_CODEX_CLIENT_VERSION = "0.130.0";

async function resolveCodexClientVersion(): Promise<string> {
  const env = process.env.VIBEOPS_CODEX_CLIENT_VERSION?.trim();
  if (env) return env;
  try {
    const { stdout } = await execFileAsync("codex", ["--version"], {
      maxBuffer: 64 * 1024,
      env: process.env,
      timeout: 4000,
    });
    const line = stdout
      .trim()
      .split(/\r?\n/)
      .find((l) => l.trim().length > 0);
    if (line) {
      const m = /(\d+\.\d+\.\d+(?:-[a-zA-Z0-9.]+)?)/.exec(line);
      if (m?.[1]) return m[1]!;
    }
  } catch {
    /* codex not on PATH */
  }
  return DEFAULT_CODEX_CLIENT_VERSION;
}

function agentBin(): string {
  return process.env.VIBEOPS_CURSOR_AGENT_BIN?.trim() || "agent";
}

/** Best-effort parse for Codex `/models` and similar JSON shapes. */
export function extractModelIdsFromUnknownJson(json: unknown): string[] {
  const ids: string[] = [];

  const fromArray = (arr: readonly unknown[]) => {
    for (const item of arr) {
      if (typeof item === "string" && item.trim().length > 0) {
        ids.push(item.trim());
        continue;
      }
      if (!item || typeof item !== "object" || Array.isArray(item)) continue;
      const o = item as Record<string, unknown>;
      for (const k of ["id", "slug", "model", "name", "model_id"]) {
        const v = o[k];
        if (typeof v === "string" && v.trim().length > 0) {
          ids.push(v.trim());
          break;
        }
      }
    }
  };

  if (Array.isArray(json)) {
    fromArray(json);
  } else if (json && typeof json === "object") {
    const o = json as Record<string, unknown>;
    for (const key of ["data", "models", "items", "results"]) {
      const a = o[key];
      if (Array.isArray(a)) fromArray(a);
    }
  }

  return [...new Set(ids)].sort((a, b) => a.localeCompare(b));
}

function isReasonableOpenAiChatModel(id: string): boolean {
  const x = id.toLowerCase();
  if (!x) return false;
  if (
    /embedding|embed|whisper|tts|realtime|transcribe|audio-in|audio-out|image|dall-e|moderation|davinci|babbage|ada-|text-search|code-search|omni-moderation/.test(
      x,
    )
  ) {
    return false;
  }
  return /^gpt-|^o[0-9]|^chatgpt-/.test(x);
}

function rankOpenAiPlanModel(id: string): number {
  if (/gpt-5\.[45]/.test(id)) return 1000;
  if (/gpt-5/.test(id)) return 900;
  if (/gpt-4o/.test(id)) return 800;
  if (/gpt-4/.test(id)) return 700;
  if (/^o[0-9]/.test(id)) return 650;
  if (/gpt-3/.test(id)) return 300;
  return 100;
}

export async function fetchOpenAiPlatformModelIds(): Promise<string[]> {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) {
    throw new Error("OPENAI_API_KEY is not set.");
  }
  const res = await fetch("https://api.openai.com/v1/models", {
    headers: { Authorization: `Bearer ${key}` },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`OpenAI models HTTP ${res.status}: ${text.slice(0, 400)}`);
  }
  const j = JSON.parse(text) as { data?: Array<{ id?: string }> };
  const raw = (j.data ?? []).map((x) => x.id).filter((x): x is string => typeof x === "string");
  const filtered = raw.filter(isReasonableOpenAiChatModel);
  const sorted = [...new Set(filtered)].sort((a, b) => {
    const d = rankOpenAiPlanModel(b) - rankOpenAiPlanModel(a);
    return d !== 0 ? d : a.localeCompare(b);
  });
  return sorted.slice(0, MAX_OPENAI_MODELS);
}

export async function fetchCodexOAuthModelIds(): Promise<string[]> {
  const { accessToken } = await resolveCodexOAuthAccessToken();
  const clientVersion = await resolveCodexClientVersion();
  const base = codexResponsesBaseUrl();
  const url = new URL(`${base}/models`);
  url.searchParams.set("client_version", clientVersion);
  const res = await fetch(url.toString(), {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Codex models HTTP ${res.status}: ${text.slice(0, 400)}`);
  }
  let j: unknown;
  try {
    j = JSON.parse(text) as unknown;
  } catch {
    throw new Error("Codex models response was not JSON.");
  }
  const ids = extractModelIdsFromUnknownJson(j);
  if (ids.length === 0) {
    throw new Error("Codex models response contained no model ids.");
  }
  return ids.slice(0, MAX_CODEX_MODELS);
}

/** Parses `agent models` / `agent --list-models` human-readable listing. */
export function parseAgentModelsStdout(text: string): { readonly id: string; readonly label: string }[] {
  const rows: { id: string; label: string }[] = [];
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    const m = /^([a-zA-Z0-9._-]+)\s+-\s+(.+)$/.exec(trimmed);
    if (!m) continue;
    const id = m[1]!;
    const rest = m[2]!.trim();
    if (id === "Available") continue;
    rows.push({ id, label: `${id} — ${rest}` });
  }
  return rows;
}

export async function fetchCursorAgentModelRows(cwd: string): Promise<{ readonly id: string; readonly label: string }[]> {
  const command = agentBin();
  const { stdout, stderr } = await execFileAsync(command, ["models"], {
    cwd,
    maxBuffer: 4 * 1024 * 1024,
    env: process.env,
  });
  const rows = parseAgentModelsStdout(`${stdout}\n${stderr}`);
  if (rows.length === 0) {
    throw new Error(`${command} models produced no parseable lines.`);
  }
  return rows;
}

async function pickFromLabels(
  rows: readonly { readonly value: string; readonly label: string }[],
  message: string,
): Promise<string | undefined> {
  const cap = MAX_SELECT_CHOICES - 1;
  const slice = rows.slice(0, cap);
  if (rows.length > cap) {
    log.info(dim(`Showing first ${cap} of ${rows.length} models.`));
  }
  const choices = [...slice.map((r) => r.label), DEFAULT_PICK_LABEL];
  const picked = await askSelect({
    message,
    nonInteractive: false,
    choices,
    default: slice[0]?.label ?? DEFAULT_PICK_LABEL,
  });
  if (picked === DEFAULT_PICK_LABEL) return undefined;
  const hit = slice.find((r) => r.label === picked);
  return hit?.value;
}

/**
 * After the user picks a provider (and auth exists), query the provider for
 * model ids and ask which one to use. Returns `undefined` to keep env / built-in defaults.
 */
export async function pickPlanExecutionModel(params: {
  readonly provider: PlanLlmProviderId;
  readonly cwd: string;
  readonly interactive: boolean;
}): Promise<string | undefined> {
  if (!params.interactive) return undefined;

  log.blank();
  log.step("Fetching available models from the provider…");

  try {
    if (params.provider === "openai") {
      const ids = await fetchOpenAiPlatformModelIds();
      const rows = ids.map((id) => ({ value: id, label: id }));
      return await pickFromLabels(rows, "Choose OpenAI model for planning (↑/↓ · Enter)");
    }
    if (params.provider === "codex-oauth") {
      const ids = await fetchCodexOAuthModelIds();
      const rows = ids.map((id) => ({ value: id, label: id }));
      return await pickFromLabels(rows, "Choose Codex (ChatGPT) model for planning (↑/↓ · Enter)");
    }
    const rows = await fetchCursorAgentModelRows(params.cwd);
    return await pickFromLabels(
      rows.map((r) => ({ value: r.id, label: r.label })),
      "Choose Cursor Agent model for planning (↑/↓ · Enter)",
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    log.warn(`${yellow("!")} Model list could not be loaded: ${msg}`);
    log.info(dim("Enter a model id manually, or press Enter for the environment / built-in default."));
    const typed = await askInput({
      message: "Model id (optional)",
      nonInteractive: false,
      default: "",
    });
    const t = typed.trim();
    return t.length > 0 ? t : undefined;
  }
}
