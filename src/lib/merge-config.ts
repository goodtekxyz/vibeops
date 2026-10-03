import { join } from "node:path";

import { readTextOrNull } from "./filesystem.js";
import { VIBEOPS_CONFIG_FILE } from "./paths.js";
import type { VibeopsMergeConfig } from "../types/config.js";

/** Resolved merge-gate settings (defaults applied, validated). */
export interface MergeGateConfig {
  readonly requiredChecks: readonly string[];
  readonly releaseRequiredChecks: readonly string[];
  readonly waitTimeoutSeconds: number;
  readonly pollIntervalSeconds: number;
  readonly emptyRollupGraceSeconds: number;
  readonly allowNoChecks: boolean;
}

export const MERGE_GATE_DEFAULTS: MergeGateConfig = {
  requiredChecks: [],
  releaseRequiredChecks: [],
  waitTimeoutSeconds: 900,
  pollIntervalSeconds: 5,
  emptyRollupGraceSeconds: 30,
  allowNoChecks: false,
};

/** Inclusive bounds for the numeric settings (seconds). */
export const MERGE_GATE_LIMITS = {
  waitTimeoutSeconds: { min: 1, max: 7_200 },
  pollIntervalSeconds: { min: 1, max: 300 },
  emptyRollupGraceSeconds: { min: 0, max: 600 },
} as const;

const KNOWN_KEYS: ReadonlySet<keyof VibeopsMergeConfig> = new Set([
  "requiredChecks",
  "releaseRequiredChecks",
  "waitTimeoutSeconds",
  "pollIntervalSeconds",
  "emptyRollupGraceSeconds",
  "allowNoChecks",
]);

/** Invalid `merge` block in `.vibeops.json`. Merge commands refuse to run. */
export class MergeConfigError extends Error {
  constructor(message: string) {
    super(`${VIBEOPS_CONFIG_FILE} merge: ${message}`);
    this.name = "MergeConfigError";
  }
}

function checkList(key: string, raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    throw new MergeConfigError(`\`${key}\` must be an array of check names.`);
  }
  return raw.map((item, i) => {
    if (typeof item !== "string" || item.trim().length === 0) {
      throw new MergeConfigError(`\`${key}[${i}]\` must be a non-empty string.`);
    }
    return item.trim();
  });
}

function seconds(key: keyof typeof MERGE_GATE_LIMITS, raw: unknown): number {
  const { min, max } = MERGE_GATE_LIMITS[key];
  if (typeof raw !== "number" || !Number.isInteger(raw) || raw < min || raw > max) {
    throw new MergeConfigError(`\`${key}\` must be an integer between ${min} and ${max}.`);
  }
  return raw;
}

/**
 * Validate the raw `merge` block (fail closed): must be an object, only known
 * keys, lists of non-empty strings, bounded integer seconds, boolean flags.
 * `undefined` → defaults.
 */
export function parseMergeConfig(raw: unknown): MergeGateConfig {
  if (raw === undefined) return MERGE_GATE_DEFAULTS;
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new MergeConfigError("must be an object.");
  }
  const o = raw as Record<string, unknown>;
  const unknown = Object.keys(o).filter(
    (k) => !KNOWN_KEYS.has(k as keyof VibeopsMergeConfig),
  );
  if (unknown.length > 0) {
    throw new MergeConfigError(
      `unknown key${unknown.length > 1 ? "s" : ""} ${unknown
        .map((k) => `\`${k}\``)
        .join(", ")} (allowed: ${[...KNOWN_KEYS].join(", ")}).`,
    );
  }

  const cfg = {
    requiredChecks:
      o.requiredChecks === undefined
        ? MERGE_GATE_DEFAULTS.requiredChecks
        : checkList("requiredChecks", o.requiredChecks),
    releaseRequiredChecks:
      o.releaseRequiredChecks === undefined
        ? MERGE_GATE_DEFAULTS.releaseRequiredChecks
        : checkList("releaseRequiredChecks", o.releaseRequiredChecks),
    waitTimeoutSeconds:
      o.waitTimeoutSeconds === undefined
        ? MERGE_GATE_DEFAULTS.waitTimeoutSeconds
        : seconds("waitTimeoutSeconds", o.waitTimeoutSeconds),
    pollIntervalSeconds:
      o.pollIntervalSeconds === undefined
        ? MERGE_GATE_DEFAULTS.pollIntervalSeconds
        : seconds("pollIntervalSeconds", o.pollIntervalSeconds),
    emptyRollupGraceSeconds:
      o.emptyRollupGraceSeconds === undefined
        ? MERGE_GATE_DEFAULTS.emptyRollupGraceSeconds
        : seconds("emptyRollupGraceSeconds", o.emptyRollupGraceSeconds),
    allowNoChecks: MERGE_GATE_DEFAULTS.allowNoChecks,
  };
  if (o.allowNoChecks !== undefined) {
    if (typeof o.allowNoChecks !== "boolean") {
      throw new MergeConfigError("`allowNoChecks` must be true or false.");
    }
    cfg.allowNoChecks = o.allowNoChecks;
  }
  if (cfg.pollIntervalSeconds > cfg.waitTimeoutSeconds) {
    throw new MergeConfigError(
      "`pollIntervalSeconds` must not exceed `waitTimeoutSeconds`.",
    );
  }
  return cfg;
}

/**
 * Read and validate `.vibeops.json` `merge`. Throws `MergeConfigError` on an
 * invalid block; a missing file or block yields the defaults.
 */
export async function readMergeConfig(root: string): Promise<MergeGateConfig> {
  const text = await readTextOrNull(join(root, VIBEOPS_CONFIG_FILE));
  if (text === null) return MERGE_GATE_DEFAULTS;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new MergeConfigError("file is not valid JSON.");
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return MERGE_GATE_DEFAULTS;
  }
  return parseMergeConfig((parsed as { merge?: unknown }).merge);
}

/** Gate options (milliseconds) derived from resolved config. */
export function mergeGateTiming(cfg: MergeGateConfig): {
  timeoutMs: number;
  intervalMs: number;
  emptyRollupGraceMs: number;
} {
  return {
    timeoutMs: cfg.waitTimeoutSeconds * 1000,
    intervalMs: cfg.pollIntervalSeconds * 1000,
    emptyRollupGraceMs: cfg.emptyRollupGraceSeconds * 1000,
  };
}
