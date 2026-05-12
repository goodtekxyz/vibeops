import {
  AGENT_WORKFLOW_CHOICES,
  AUTH_REQUIREMENT_CHOICES,
  BACKEND_CHOICES,
  DATABASE_CHOICES,
  DB_LAYER_CHOICES,
  DEPLOYMENT_TARGET_CHOICES,
  FRONTEND_CHOICES,
  INTEGRATION_CHOICES,
  MVP_FEATURE_CHOICES,
  OUT_OF_SCOPE_CHOICES,
  PACKAGE_MANAGER_CHOICES,
  PROJECT_TYPE_CHOICES,
  type ProjectBrief,
  RISK_AREA_CHOICES,
  TARGET_USER_CHOICES,
} from "../types/brief.js";

const PLACEHOLDER_PROJECT_NAME = "Unnamed Project";
const PLACEHOLDER_IDEA = "(no idea provided — Planner Agent must fill this in)";
const PLACEHOLDER_PROBLEM = "(no core problem provided — Planner Agent must fill this in)";
const PLACEHOLDER_SUCCESS = "(no success criteria provided — Planner Agent must fill this in)";

function asStr(v: unknown, fallback: string): string {
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return fallback;
}

function asStrArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const x of v) {
    if (typeof x === "string" && x.trim().length > 0) out.push(x.trim());
    else if (typeof x === "number" || typeof x === "boolean") out.push(String(x));
  }
  return out;
}

function asBool(v: unknown, fallback: boolean): boolean {
  if (typeof v === "boolean") return v;
  if (typeof v === "string") {
    const t = v.trim().toLowerCase();
    if (t === "true" || t === "yes" || t === "y" || t === "1") return true;
    if (t === "false" || t === "no" || t === "n" || t === "0") return false;
  }
  return fallback;
}

function pickNearestOrOriginal(value: string, choices: readonly string[]): string {
  const t = value.trim();
  if (t.length === 0) return choices[0] ?? "Other";
  const hit = choices.find((c) => c.toLowerCase() === t.toLowerCase());
  if (hit) return hit;
  return t;
}

function normalizeToChoices(values: string[], choices: readonly string[]): string[] {
  const out: string[] = [];
  for (const v of values) {
    out.push(pickNearestOrOriginal(v, choices));
  }
  return Array.from(new Set(out));
}

/**
 * Coerces a partial LLM `projectBrief` object into a full `ProjectBrief`,
 * snapping enum-like fields to known choice lists when possible.
 */
export function normalizeLlmProjectBrief(raw: Record<string, unknown>): {
  brief: ProjectBrief;
  assumptions: string[];
} {
  const assumptions: string[] = [];

  let projectName = asStr(raw.projectName, "");
  if (projectName.length === 0) {
    projectName = PLACEHOLDER_PROJECT_NAME;
    assumptions.push('projectName: missing from LLM output — defaulted to "Unnamed Project"');
  }

  let oneLineIdea = asStr(raw.oneLineIdea, "");
  if (oneLineIdea.length === 0) {
    oneLineIdea = PLACEHOLDER_IDEA;
    assumptions.push("oneLineIdea: missing — placeholder for Planner Agent");
  }

  const projectType = pickNearestOrOriginal(
    asStr(raw.projectType, "SaaS"),
    PROJECT_TYPE_CHOICES,
  );

  let targetUsers = normalizeToChoices(asStrArray(raw.targetUsers), TARGET_USER_CHOICES);
  if (targetUsers.length === 0) {
    targetUsers = ["Developers"];
    assumptions.push("targetUsers: empty — defaulted to Developers");
  }

  let coreProblem = asStr(raw.coreProblem, "");
  if (coreProblem.length === 0) {
    coreProblem = PLACEHOLDER_PROBLEM;
    assumptions.push("coreProblem: missing — placeholder for Planner Agent");
  }

  let mvpFeatures = normalizeToChoices(asStrArray(raw.mvpFeatures), MVP_FEATURE_CHOICES);
  if (mvpFeatures.length === 0) {
    assumptions.push("mvpFeatures: empty — Planner Agent should expand from conversation");
  }

  let outOfScope = normalizeToChoices(asStrArray(raw.outOfScope), OUT_OF_SCOPE_CHOICES);

  const frontend = pickNearestOrOriginal(asStr(raw.frontend, "Not sure"), FRONTEND_CHOICES);
  const backend = pickNearestOrOriginal(asStr(raw.backend, "Not sure"), BACKEND_CHOICES);
  const database = pickNearestOrOriginal(asStr(raw.database, "Not sure"), DATABASE_CHOICES);
  const dbLayer = pickNearestOrOriginal(asStr(raw.dbLayer, "Not sure"), DB_LAYER_CHOICES);
  const packageManager = pickNearestOrOriginal(
    asStr(raw.packageManager, "pnpm"),
    PACKAGE_MANAGER_CHOICES,
  );

  let deploymentTargets = normalizeToChoices(
    asStrArray(raw.deploymentTargets),
    DEPLOYMENT_TARGET_CHOICES,
  );
  if (deploymentTargets.length === 0) {
    deploymentTargets = ["Not sure"];
    assumptions.push("deploymentTargets: empty — defaulted to Not sure");
  }

  let authRequirements = normalizeToChoices(
    asStrArray(raw.authRequirements),
    AUTH_REQUIREMENT_CHOICES,
  );
  if (authRequirements.length === 0) {
    authRequirements = ["Not sure"];
  }

  let integrations = normalizeToChoices(asStrArray(raw.integrations), INTEGRATION_CHOICES);
  if (integrations.length === 0) {
    integrations = ["None"];
  }

  const useNotion = asBool(raw.useNotion, true);
  const useGitWorkflow = asBool(raw.useGitWorkflow, true);

  let agentWorkflowLevel = asStr(raw.agentWorkflowLevel, "");
  if (!AGENT_WORKFLOW_CHOICES.some((c) => c === agentWorkflowLevel)) {
    agentWorkflowLevel = pickNearestOrOriginal(agentWorkflowLevel, AGENT_WORKFLOW_CHOICES);
  }
  if (!AGENT_WORKFLOW_CHOICES.some((c) => c === agentWorkflowLevel)) {
    agentWorkflowLevel = AGENT_WORKFLOW_CHOICES[2]!;
    assumptions.push("agentWorkflowLevel: LLM value unknown — defaulted to Advanced lineup");
  }

  let risks = normalizeToChoices(asStrArray(raw.risks), RISK_AREA_CHOICES);
  if (risks.length === 0) {
    risks = ["Other"];
    assumptions.push("risks: empty — placeholder");
  }

  let successCriteria = asStr(raw.successCriteria, "");
  if (successCriteria.length === 0) {
    successCriteria = PLACEHOLDER_SUCCESS;
    assumptions.push("successCriteria: missing — placeholder for Planner Agent");
  }

  const brief: ProjectBrief = {
    projectName,
    oneLineIdea,
    projectType,
    targetUsers,
    coreProblem,
    mvpFeatures,
    outOfScope,
    frontend,
    backend,
    database,
    dbLayer,
    packageManager,
    deploymentTargets,
    authRequirements,
    integrations,
    useNotion,
    useGitWorkflow,
    agentWorkflowLevel,
    risks,
    successCriteria,
  };

  return { brief, assumptions };
}
