import { join } from "node:path";

import { readTextOrNull, writeText } from "./filesystem.js";
import { VIBEOPS_CONFIG_FILE } from "./paths.js";
import { VERSION } from "../version.js";
import {
  DEFAULT_GITHUB_CONFIG,
  type GithubConfig,
  type GithubVisibility,
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

function parseGithubVisibility(raw: unknown): GithubVisibility {
  if (raw === "public" || raw === "private") return raw;
  return "";
}

function parseGithubSection(raw: unknown): GithubConfig | undefined {
  if (raw === null || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;
  return {
    enabled: typeof r.enabled === "boolean" ? r.enabled : false,
    mode: r.mode === "gh-cli" ? "gh-cli" : "gh-cli",
    owner: typeof r.owner === "string" ? r.owner : "",
    repo: typeof r.repo === "string" ? r.repo : "",
    remote:
      typeof r.remote === "string" && r.remote.length > 0 ? r.remote : "origin",
    visibility: parseGithubVisibility(r.visibility),
    url: typeof r.url === "string" ? r.url : "",
  };
}

export async function readConfig(root: string): Promise<VibeopsConfig | null> {
  const text = await readTextOrNull(join(root, VIBEOPS_CONFIG_FILE));
  if (text === null) return null;
  try {
    const parsed = JSON.parse(text) as Partial<VibeopsConfig> & {
      notion?: unknown;
      github?: unknown;
    };
    if (
      typeof parsed.name === "string" &&
      typeof parsed.vibeopsVersion === "string" &&
      typeof parsed.createdAt === "string" &&
      parsed.schemaVersion === VIBEOPS_CONFIG_SCHEMA_VERSION
    ) {
      const notion = parseNotionSection(parsed.notion);
      const github = parseGithubSection(parsed.github);
      const config: VibeopsConfig = {
        name: parsed.name,
        vibeopsVersion: parsed.vibeopsVersion,
        schemaVersion: VIBEOPS_CONFIG_SCHEMA_VERSION,
        createdAt: parsed.createdAt,
      };
      if (notion) config.notion = notion;
      if (github) config.github = github;
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

/**
 * Merge a partial github section into an existing config without touching
 * other fields (notion, name, etc.). Empty strings in the patch are treated
 * as "no value provided" — the existing value is kept. Pass through
 * `enabled` / `mode` always (booleans / enums always overwrite).
 */
export function mergeGithubConfig(
  base: VibeopsConfig,
  patch: Partial<GithubConfig>,
): { merged: VibeopsConfig; changed: boolean } {
  const current: GithubConfig = base.github ?? DEFAULT_GITHUB_CONFIG;
  const next: GithubConfig = {
    enabled: patch.enabled ?? current.enabled,
    mode: patch.mode ?? current.mode,
    owner:
      patch.owner !== undefined && patch.owner.length > 0
        ? patch.owner
        : current.owner,
    repo:
      patch.repo !== undefined && patch.repo.length > 0
        ? patch.repo
        : current.repo,
    remote:
      patch.remote !== undefined && patch.remote.length > 0
        ? patch.remote
        : current.remote,
    visibility:
      patch.visibility !== undefined && patch.visibility.length > 0
        ? patch.visibility
        : current.visibility,
    url:
      patch.url !== undefined && patch.url.length > 0 ? patch.url : current.url,
  };
  const changed =
    base.github === undefined ||
    next.enabled !== current.enabled ||
    next.mode !== current.mode ||
    next.owner !== current.owner ||
    next.repo !== current.repo ||
    next.remote !== current.remote ||
    next.visibility !== current.visibility ||
    next.url !== current.url;
  return { merged: { ...base, github: next }, changed };
}
