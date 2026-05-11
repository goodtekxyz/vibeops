export const VIBEOPS_CONFIG_SCHEMA_VERSION = 1 as const;

export interface NotionConfig {
  enabled: boolean;
  projectsDatabaseId: string;
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
  projectsDatabaseId: "",
  tasksDatabaseId: "",
};
