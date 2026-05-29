import { join } from "node:path";

import { pathExists, readTextOrNull, writeText } from "./filesystem.js";
import { VIBEOPS_CONFIG_FILE } from "./paths.js";
import { VERSION } from "../version.js";
import {
  type GitHost,
  type LlmProviderPreference,
  type VibeopsClientId,
  type VibeopsConfig,
  type VibeopsGitConfig,
  type VibeopsLlmConfig,
  VIBEOPS_CONFIG_SCHEMA_VERSION,
} from "../types/config.js";
import { isVibeopsClientId } from "./init-clients.js";

function parseClientsBlock(raw: unknown): VibeopsClientId[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: VibeopsClientId[] = [];
  for (const item of raw) {
    if (typeof item === "string" && isVibeopsClientId(item) && !out.includes(item)) {
      out.push(item);
    }
  }
  return out.length > 0 ? out : undefined;
}

export function getClientsFromConfig(config: VibeopsConfig | null): VibeopsClientId[] {
  if (config?.clients && config.clients.length > 0) return [...config.clients];
  return ["cursor"];
}

export async function isVibeopsProject(root: string): Promise<boolean> {
  if ((await readConfig(root)) !== null) return true;
  return pathExists(join(root, VIBEOPS_CONFIG_FILE));
}

function parseGitBlock(raw: unknown): VibeopsGitConfig | undefined {
  if (raw === null || raw === undefined || typeof raw !== "object" || Array.isArray(raw)) {
    return undefined;
  }
  const o = raw as Record<string, unknown>;
  const remote = typeof o.remote === "string" && o.remote.length > 0 ? o.remote : "origin";
  const host = o.host === "github" || o.host === "gitlab" ? o.host : undefined;
  const integrationBranch =
    typeof o.integrationBranch === "string" && o.integrationBranch.length > 0
      ? o.integrationBranch
      : undefined;
  const productionBranch =
    typeof o.productionBranch === "string" && o.productionBranch.length > 0
      ? o.productionBranch
      : undefined;
  if (!host || !integrationBranch || !productionBranch) return undefined;
  return { remote, host, integrationBranch, productionBranch };
}

function parseLlmBlock(raw: unknown): VibeopsLlmConfig | undefined {
  if (raw === null || raw === undefined || typeof raw !== "object" || Array.isArray(raw)) {
    return undefined;
  }
  const p = (raw as { provider?: unknown }).provider;
  if (p === "auto" || p === "codex-oauth" || p === "cursor-agent" || p === "openai") {
    return { provider: p };
  }
  return undefined;
}

export async function readConfig(root: string): Promise<VibeopsConfig | null> {
  const text = await readTextOrNull(join(root, VIBEOPS_CONFIG_FILE));
  if (text === null) return null;
  try {
    const parsed = JSON.parse(text) as Partial<VibeopsConfig>;
    if (
      typeof parsed.name === "string" &&
      typeof parsed.vibeopsVersion === "string" &&
      typeof parsed.createdAt === "string" &&
      parsed.schemaVersion === VIBEOPS_CONFIG_SCHEMA_VERSION
    ) {
      const llm = parseLlmBlock(parsed.llm);
      const git = parseGitBlock(parsed.git);
      const clients = parseClientsBlock(parsed.clients) ?? ["cursor"];
      return {
        name: parsed.name,
        vibeopsVersion: parsed.vibeopsVersion,
        schemaVersion: VIBEOPS_CONFIG_SCHEMA_VERSION,
        createdAt: parsed.createdAt,
        clients,
        ...(git ? { git } : {}),
        ...(llm ? { llm } : {}),
      };
    }
    return null;
  } catch {
    return null;
  }
}

export function buildConfig(
  name: string,
  clients: VibeopsClientId[],
  git: VibeopsGitConfig,
  existing?: VibeopsConfig | null,
  nowIso?: string,
): VibeopsConfig {
  return {
    name,
    vibeopsVersion: VERSION,
    schemaVersion: VIBEOPS_CONFIG_SCHEMA_VERSION,
    createdAt: existing?.createdAt ?? nowIso ?? new Date().toISOString(),
    clients,
    git,
    llm: existing?.llm ?? { provider: "auto" },
  };
}

export type { GitHost, VibeopsGitConfig };

export function configToJson(config: VibeopsConfig): string {
  return `${JSON.stringify(config, null, 2)}\n`;
}

export async function writeConfig(root: string, config: VibeopsConfig): Promise<void> {
  await writeText(join(root, VIBEOPS_CONFIG_FILE), configToJson(config));
}

/**
 * Merge `llm.provider` into existing `.vibeops.json` (preserves other keys).
 */
export async function setLlmProviderPreference(
  root: string,
  provider: LlmProviderPreference,
): Promise<void> {
  const path = join(root, VIBEOPS_CONFIG_FILE);
  const text = await readTextOrNull(path);
  if (text === null) {
    throw new Error(`${VIBEOPS_CONFIG_FILE} not found — run vibeops init first.`);
  }
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error(`${VIBEOPS_CONFIG_FILE} is not valid JSON.`);
  }
  const prevLlm =
    typeof data.llm === "object" && data.llm !== null && !Array.isArray(data.llm)
      ? (data.llm as Record<string, unknown>)
      : {};
  data.llm = { ...prevLlm, provider };
  await writeText(path, `${JSON.stringify(data, null, 2)}\n`);
}
