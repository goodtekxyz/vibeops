export const VIBEOPS_CONFIG_SCHEMA_VERSION = 1 as const;

export interface NotionConfig {
  enabled: boolean;
  /**
   * Preferred sync/test target. In Notion API 2025-09-03 this should be the
   * resolved `data_source` id because schema (`properties`) lives there.
   *
   * Kept separate from `projectsDatabaseId` so older configs and human-facing
   * container ids can remain intact.
   */
  projectsTargetId: string;
  /** Preferred Tasks DB target; see `projectsTargetId`. */
  tasksTargetId: string;
  /** Legacy/container id. Used as fallback when `projectsTargetId` is empty. */
  projectsDatabaseId: string;
  /** Legacy/container id. Used as fallback when `tasksTargetId` is empty. */
  tasksDatabaseId: string;
}

export interface VibeopsConfig {
  name: string;
  vibeopsVersion: string;
  schemaVersion: typeof VIBEOPS_CONFIG_SCHEMA_VERSION;
  createdAt: string;
  notion?: NotionConfig;
}

export interface NotionEnvSnapshot {
  hasToken: boolean;
  hasApiKey: boolean;
  hasProjectDb: boolean;
  hasTaskDb: boolean;
}

export const DEFAULT_NOTION_CONFIG: NotionConfig = {
  enabled: false,
  projectsTargetId: "",
  tasksTargetId: "",
  projectsDatabaseId: "",
  tasksDatabaseId: "",
};
