export const VIBEOPS_CONFIG_SCHEMA_VERSION = 1 as const;

export interface VibeopsConfig {
  name: string;
  vibeopsVersion: string;
  schemaVersion: typeof VIBEOPS_CONFIG_SCHEMA_VERSION;
  createdAt: string;
}

export interface NotionEnvSnapshot {
  hasApiKey: boolean;
  hasProjectDb: boolean;
  hasTaskDb: boolean;
}
