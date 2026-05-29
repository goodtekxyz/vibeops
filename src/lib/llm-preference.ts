import { relative } from "node:path";

import type { LlmProviderPreference, VibeopsConfig } from "../types/config.js";
import { probeCodexOAuthFile } from "./plan-codex-auth.js";
import { probeCursorAgentCli, probeOpenAiApiKey } from "./plan-llm-detect.js";
import type { PlanLlmProviderId } from "./plan-llm-types.js";

export type { LlmProviderPreference };

export const LLM_PROVIDER_ORDER: readonly PlanLlmProviderId[] = [
  "codex-oauth",
  "cursor-agent",
  "openai",
] as const;

export interface LlmProviderProbeRow {
  readonly id: PlanLlmProviderId;
  readonly ok: boolean;
  readonly summary: string;
}

function shortPath(cwd: string, abs: string): string {
  const r = relative(cwd, abs);
  return r.startsWith("..") || r.length === 0 ? abs : r;
}

/**
 * First available provider in Codex → Cursor Agent → OpenAI order.
 */
export async function resolveAvailableLlmProvider(cwd: string): Promise<PlanLlmProviderId | null> {
  const codex = await probeCodexOAuthFile();
  if (codex.ok) return "codex-oauth";
  const cursor = await probeCursorAgentCli(cwd);
  if (cursor.ok) return "cursor-agent";
  const openai = await probeOpenAiApiKey();
  if (openai.ok) return "openai";
  return null;
}

export async function probeAllLlmProviders(cwd: string): Promise<LlmProviderProbeRow[]> {
  const codex = await probeCodexOAuthFile();
  const cursor = await probeCursorAgentCli(cwd);
  const openai = await probeOpenAiApiKey();
  return [
    {
      id: "codex-oauth",
      ok: codex.ok,
      summary: codex.ok ? `ok · ${shortPath(cwd, codex.path)}` : (codex.reason ?? "not configured"),
    },
    {
      id: "cursor-agent",
      ok: cursor.ok,
      summary: cursor.ok ? `ok · command: ${cursor.command}` : (cursor.reason ?? "not configured"),
    },
    {
      id: "openai",
      ok: openai.ok,
      summary: openai.ok ? "ok · OPENAI_API_KEY" : (openai.reason ?? "not configured"),
    },
  ];
}

export function parseLlmProviderPreference(raw: string): LlmProviderPreference | null {
  const t = raw.trim().toLowerCase();
  if (t === "auto") return "auto";
  if (t === "codex-oauth" || t === "codex") return "codex-oauth";
  if (t === "cursor-agent" || t === "cursor") return "cursor-agent";
  if (t === "openai") return "openai";
  return null;
}

export function labelLlmProvider(id: PlanLlmProviderId | "auto"): string {
  switch (id) {
    case "auto":
      return "Auto (Codex → Cursor → OpenAI)";
    case "codex-oauth":
      return "Codex OAuth (~/.codex/auth.json)";
    case "cursor-agent":
      return "Cursor Agent CLI (`agent`)";
    case "openai":
      return "OpenAI API (OPENAI_API_KEY)";
    default:
      return id;
  }
}

/**
 * Resolves which concrete provider to use given project preference.
 * - `auto` / undefined: same as `resolveAvailableLlmProvider`.
 * - explicit: that provider only if its probe passes.
 */
export async function resolveLlmProviderForUse(
  cwd: string,
  preference: LlmProviderPreference | undefined,
): Promise<PlanLlmProviderId | null> {
  const pref = preference ?? "auto";
  if (pref === "auto") {
    return resolveAvailableLlmProvider(cwd);
  }
  if (pref === "codex-oauth") {
    const c = await probeCodexOAuthFile();
    return c.ok ? "codex-oauth" : null;
  }
  if (pref === "cursor-agent") {
    const c = await probeCursorAgentCli(cwd);
    return c.ok ? "cursor-agent" : null;
  }
  const o = await probeOpenAiApiKey();
  return o.ok ? "openai" : null;
}

export function getLlmPreferenceFromConfig(config: VibeopsConfig | null): LlmProviderPreference {
  const p = config?.llm?.provider;
  if (p === "auto" || p === "codex-oauth" || p === "cursor-agent" || p === "openai") return p;
  return "auto";
}
