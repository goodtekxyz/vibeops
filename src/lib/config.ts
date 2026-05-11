import { join } from "node:path";

import { readTextOrNull, writeText } from "./filesystem.js";
import { VIBEOPS_CONFIG_FILE } from "./paths.js";
import { VERSION } from "../version.js";
import {
  type NotionEnvSnapshot,
  type VibeopsConfig,
  VIBEOPS_CONFIG_SCHEMA_VERSION,
} from "../types/config.js";

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
      return {
        name: parsed.name,
        vibeopsVersion: parsed.vibeopsVersion,
        schemaVersion: VIBEOPS_CONFIG_SCHEMA_VERSION,
        createdAt: parsed.createdAt,
      };
    }
    return null;
  } catch {
    return null;
  }
}

export function buildConfig(name: string, nowIso?: string): VibeopsConfig {
  return {
    name,
    vibeopsVersion: VERSION,
    schemaVersion: VIBEOPS_CONFIG_SCHEMA_VERSION,
    createdAt: nowIso ?? new Date().toISOString(),
  };
}

export function configToJson(config: VibeopsConfig): string {
  return `${JSON.stringify(config, null, 2)}\n`;
}

export async function writeConfig(root: string, config: VibeopsConfig): Promise<void> {
  await writeText(join(root, VIBEOPS_CONFIG_FILE), configToJson(config));
}

export function readNotionEnvSnapshot(env: NodeJS.ProcessEnv = process.env): NotionEnvSnapshot {
  const get = (k: string): boolean => typeof env[k] === "string" && env[k]!.length > 0;
  return {
    hasApiKey: get("NOTION_API_KEY"),
    hasProjectDb: get("NOTION_PROJECT_DB"),
    hasTaskDb: get("NOTION_TASK_DB"),
  };
}
