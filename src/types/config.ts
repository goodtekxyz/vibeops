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

export type GithubVisibility = "public" | "private" | "";

export interface GithubConfig {
  enabled: boolean;
  /**
   * Mode VibeOps uses to talk to GitHub. For now only `gh-cli` (GitHub CLI
   * `gh`) is supported. A future polish round may add `rest-api` driven by
   * `GITHUB_TOKEN` as a fallback for headless environments.
   */
  mode: "gh-cli";
  owner: string;
  repo: string;
  /** Git remote name VibeOps points at this repo. Default `origin`. */
  remote: string;
  visibility: GithubVisibility;
  /** Canonical remote URL VibeOps stored (https or ssh, normalized). */
  url: string;
}

export interface VibeopsConfig {
  name: string;
  vibeopsVersion: string;
  schemaVersion: typeof VIBEOPS_CONFIG_SCHEMA_VERSION;
  createdAt: string;
  notion?: NotionConfig;
  github?: GithubConfig;
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

export const DEFAULT_GITHUB_CONFIG: GithubConfig = {
  enabled: false,
  mode: "gh-cli",
  owner: "",
  repo: "",
  remote: "origin",
  visibility: "",
  url: "",
};
