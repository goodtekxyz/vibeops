export const VIBEOPS_CONFIG_SCHEMA_VERSION = 1 as const;

/** Installed agent client packs from `vibeops init`. */
export type VibeopsClientId = "cursor" | "claude" | "codex";

/** Matches `PlanLlmProviderId` in `plan-llm-types.ts` plus `auto`. */
export type LlmProviderPreference = "auto" | "codex-oauth" | "cursor-agent" | "openai";

export type GitHost = "github" | "gitlab";

export interface VibeopsGitConfig {
  /** Remote name (default `origin`). */
  remote: string;
  host: GitHost;
  /** Branch tasks branch from (e.g. develop). MR/PR target. */
  integrationBranch: string;
  /** Production branch (e.g. main). Documented for release flow; not auto-merged by CLI. */
  productionBranch: string;
}

export interface VibeopsLlmConfig {
  /** Default provider for `task add` / `task ship`. `auto` = first available (Codex → Cursor → OpenAI). */
  provider?: LlmProviderPreference;
}

export interface VibeopsConfig {
  name: string;
  vibeopsVersion: string;
  schemaVersion: typeof VIBEOPS_CONFIG_SCHEMA_VERSION;
  createdAt: string;
  /** Agent packs installed by init (cursor, claude, codex). */
  clients: VibeopsClientId[];
  /** Written by init; required for task add/done. */
  git?: VibeopsGitConfig;
  llm?: VibeopsLlmConfig;
}
