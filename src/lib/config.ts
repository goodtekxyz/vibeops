import { join } from "node:path";

import { readTextOrNull, writeText } from "./filesystem.js";
import { VIBEOPS_CONFIG_FILE } from "./paths.js";
import { VERSION } from "../version.js";
import {
  type NotionConfig,
  type NotionEnvSnapshot,
  type VibeopsConfig,
  VIBEOPS_CONFIG_SCHEMA_VERSION,
} from "../types/config.js";

function parseNotionSection(raw: unknown): NotionConfig | undefined {
  if (raw === null || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;
  const out: NotionConfig = {
    enabled: typeof r.enabled === "boolean" ? r.enabled : false,
    projectsTargetId:
      typeof r.projectsTargetId === "string" ? r.projectsTargetId : "",
    tasksTargetId:
      typeof r.tasksTargetId === "string" ? r.tasksTargetId : "",
    projectsDatabaseId:
      typeof r.projectsDatabaseId === "string" ? r.projectsDatabaseId : "",
    tasksDatabaseId:
      typeof r.tasksDatabaseId === "string" ? r.tasksDatabaseId : "",
  };
  return out;
}

export async function readConfig(root: string): Promise<VibeopsConfig | null> {
  const text = await readTextOrNull(join(root, VIBEOPS_CONFIG_FILE));
  if (text === null) return null;
  try {
    const parsed = JSON.parse(text) as Partial<VibeopsConfig> & {
      notion?: unknown;
    };
    if (
      typeof parsed.name === "string" &&
      typeof parsed.vibeopsVersion === "string" &&
      typeof parsed.createdAt === "string" &&
      parsed.schemaVersion === VIBEOPS_CONFIG_SCHEMA_VERSION
    ) {
      const notion = parseNotionSection(parsed.notion);
      const config: VibeopsConfig = {
        name: parsed.name,
        vibeopsVersion: parsed.vibeopsVersion,
        schemaVersion: VIBEOPS_CONFIG_SCHEMA_VERSION,
        createdAt: parsed.createdAt,
      };
      if (notion) config.notion = notion;
      return config;
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

/** Merge a partial notion section into an existing config without touching other fields. */
export function mergeNotionConfig(
  base: VibeopsConfig,
  patch: Partial<NotionConfig>,
): { merged: VibeopsConfig; changed: boolean } {
  const current: NotionConfig = base.notion ?? {
    enabled: false,
    projectsTargetId: "",
    tasksTargetId: "",
    projectsDatabaseId: "",
    tasksDatabaseId: "",
  };
  const next: NotionConfig = {
    enabled: patch.enabled ?? current.enabled,
    projectsTargetId:
      patch.projectsTargetId !== undefined && patch.projectsTargetId.length > 0
        ? patch.projectsTargetId
        : current.projectsTargetId,
    tasksTargetId:
      patch.tasksTargetId !== undefined && patch.tasksTargetId.length > 0
        ? patch.tasksTargetId
        : current.tasksTargetId,
    projectsDatabaseId:
      patch.projectsDatabaseId !== undefined && patch.projectsDatabaseId.length > 0
        ? patch.projectsDatabaseId
        : current.projectsDatabaseId,
    tasksDatabaseId:
      patch.tasksDatabaseId !== undefined && patch.tasksDatabaseId.length > 0
        ? patch.tasksDatabaseId
        : current.tasksDatabaseId,
  };
  const changed =
    base.notion === undefined ||
    next.enabled !== current.enabled ||
    next.projectsTargetId !== current.projectsTargetId ||
    next.tasksTargetId !== current.tasksTargetId ||
    next.projectsDatabaseId !== current.projectsDatabaseId ||
    next.tasksDatabaseId !== current.tasksDatabaseId;
  return { merged: { ...base, notion: next }, changed };
}

/** Preferred Projects target id for API calls: data_source target first, legacy DB fallback. */
export function notionProjectsTargetId(notion: NotionConfig): string {
  return notion.projectsTargetId.length > 0
    ? notion.projectsTargetId
    : notion.projectsDatabaseId;
}

/** Preferred Tasks target id for API calls: data_source target first, legacy DB fallback. */
export function notionTasksTargetId(notion: NotionConfig): string {
  return notion.tasksTargetId.length > 0 ? notion.tasksTargetId : notion.tasksDatabaseId;
}

export function readNotionEnvSnapshot(env: NodeJS.ProcessEnv = process.env): NotionEnvSnapshot {
  const get = (k: string): boolean => typeof env[k] === "string" && env[k]!.length > 0;
  return {
    hasToken: get("NOTION_TOKEN"),
    hasApiKey: get("NOTION_API_KEY"),
    hasProjectDb: get("NOTION_PROJECT_DB"),
    hasTaskDb: get("NOTION_TASK_DB"),
  };
}
