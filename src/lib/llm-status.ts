import { readConfig } from "./config.js";
import {
  getLlmPreferenceFromConfig,
  labelLlmProvider,
  probeAllLlmProviders,
  resolveLlmProviderForUse,
} from "./llm-preference.js";
import type { LlmProviderPreference } from "../types/config.js";
import type { PlanLlmProviderId } from "./plan-llm-types.js";

export interface LlmStatusReport {
  readonly preference: LlmProviderPreference;
  readonly active: PlanLlmProviderId | null;
  readonly providers: Awaited<ReturnType<typeof probeAllLlmProviders>>;
  readonly anyAvailable: boolean;
}

export async function buildLlmStatusReport(cwd: string): Promise<LlmStatusReport> {
  const config = await readConfig(cwd);
  const preference = getLlmPreferenceFromConfig(config);
  const providers = await probeAllLlmProviders(cwd);
  const active = await resolveLlmProviderForUse(cwd, preference);
  const anyAvailable = providers.some((p) => p.ok);
  return { preference, active, providers, anyAvailable };
}

export function formatLlmStatusLine(report: LlmStatusReport): {
  preferenceLabel: string;
  activeLabel: string;
} {
  const preferenceLabel = labelLlmProvider(report.preference);
  const activeLabel =
    report.active !== null
      ? `${labelLlmProvider(report.active)} (ok)`
      : report.anyAvailable
        ? "none (preference blocked or misconfigured)"
        : "none — run vibeops llm connect";
  return { preferenceLabel, activeLabel };
}
