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

/**
 * Merge gate settings for `task merge` / `task release` (`.vibeops.json` `merge`).
 * Validated strictly by `src/lib/merge-config.ts` — see README "Merge gate".
 */
export interface VibeopsMergeConfig {
  /** Check names (exact or `*` glob) required on the task PR for `task merge`. */
  requiredChecks?: string[];
  /** Same as `requiredChecks`, for the release PR (`task release`). */
  releaseRequiredChecks?: string[];
  /** Max wait for pending checks, seconds. Default 900. */
  waitTimeoutSeconds?: number;
  /** Poll interval while waiting, seconds. Default 5. */
  pollIntervalSeconds?: number;
  /** How long an empty check list is re-polled after a push, seconds. Default 30. */
  emptyRollupGraceSeconds?: number;
  /** Allow merging when the host reports no checks at all. Default false (refuse). */
  allowNoChecks?: boolean;
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
  /**
   * Raw `merge` block, preserved verbatim on re-init. Not validated here —
   * `task merge` / `task release` validate it with `readMergeConfig` (fail closed).
   */
  merge?: unknown;
}
