import { select } from "@inquirer/prompts";

import { askInput } from "./inquirer-helpers.js";
import type { VibeopsGitConfig } from "../types/config.js";

export type GitPolicyPresetId = "gitflow" | "trunk" | "custom";

export interface GitPolicyPreset {
  readonly id: GitPolicyPresetId;
  readonly label: string;
  readonly integrationBranch: string;
  readonly productionBranch: string;
}

export const GIT_POLICY_PRESETS: readonly GitPolicyPreset[] = [
  {
    id: "gitflow",
    label: "GitFlow lite — develop (integration) + main (production)",
    integrationBranch: "develop",
    productionBranch: "main",
  },
  {
    id: "trunk",
    label: "Trunk — main only (integration and production = main)",
    integrationBranch: "main",
    productionBranch: "main",
  },
] as const;

export function parseGitPolicyArg(raw: string | undefined): GitPolicyPresetId | null {
  if (raw === undefined || raw.trim().length === 0) return null;
  const t = raw.trim().toLowerCase();
  if (t === "gitflow" || t === "develop-main") return "gitflow";
  if (t === "trunk" || t === "main") return "trunk";
  if (t === "custom") return "custom";
  return null;
}

export function resolvePreset(id: GitPolicyPresetId): GitPolicyPreset | null {
  return GIT_POLICY_PRESETS.find((p) => p.id === id) ?? null;
}

export async function askGitPolicy(): Promise<{
  integrationBranch: string;
  productionBranch: string;
}> {
  const preset = await select<GitPolicyPresetId>({
    message: "Branch policy",
    choices: [
      ...GIT_POLICY_PRESETS.map((p) => ({ name: p.label, value: p.id })),
      { name: "Custom branch names", value: "custom" as const },
    ],
    loop: false,
  });

  if (preset !== "custom") {
    const p = resolvePreset(preset)!;
    return {
      integrationBranch: p.integrationBranch,
      productionBranch: p.productionBranch,
    };
  }

  const integrationBranch = await askInput({
    message: "Integration branch (task branches start here; MR/PR target)",
    nonInteractive: false,
    default: "develop",
    required: true,
  });
  const productionBranch = await askInput({
    message: "Production branch (releases / deploy; merge manually)",
    nonInteractive: false,
    default: "main",
    required: true,
  });
  return { integrationBranch, productionBranch };
}

export function formatGitPolicySummary(git: VibeopsGitConfig): string {
  if (git.integrationBranch === git.productionBranch) {
    return `${git.integrationBranch} (integration + production)`;
  }
  return `integration=${git.integrationBranch}, production=${git.productionBranch}`;
}
