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

/**
 * Snapshot of the local Notion configuration surface for `vibeops status`.
 *
 * Read from `.vibeops.env` / `process.env` + `.vibeops.json` only. Status
 * MUST NOT touch the Notion API. Legacy env variables (`NOTION_API_KEY`,
 * `NOTION_PROJECT_DB`, `NOTION_TASK_DB`) are intentionally not exposed here —
 * VibeOps only uses `NOTION_TOKEN` as the secret.
 */
export interface NotionStatusSnapshot {
  /** `.vibeops.json` `notion.enabled`. False when the section is missing. */
  enabled: boolean;
  /** True if a non-empty `NOTION_TOKEN` is reachable (file or process env). */
  hasToken: boolean;
  /** Where the token came from, or `none` when nothing was found. */
  tokenSource: NotionTokenSource;
  /** True when `projectsTargetId` or legacy `projectsDatabaseId` is non-empty. */
  hasProjectsTarget: boolean;
  /** True when `tasksTargetId` or legacy `tasksDatabaseId` is non-empty. */
  hasTasksTarget: boolean;
}

export type NotionTokenSource = ".vibeops.env" | "process.env" | "none";

/**
 * Snapshot of the local GitHub configuration surface for `vibeops status`.
 *
 * Read from `.vibeops.json` only — status NEVER spawns `gh`.
 */
export interface GithubStatusSnapshot {
  enabled: boolean;
  mode: "gh-cli" | "";
  owner: string;
  repo: string;
  remote: string;
  url: string;
}

/**
 * Snapshot of the project's `package.json` for `vibeops status`.
 *
 * `exists` is false when no `package.json` lives at the project root (e.g.
 * a scaffolded directory that has not adopted Node tooling yet). The other
 * fields are empty strings in that case so renderers can branch on `exists`
 * alone.
 */
export interface PackageStatusSnapshot {
  exists: boolean;
  name: string;
  version: string;
  /** First key of `bin` if it's an object, basename otherwise, or "". */
  bin: string;
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
