import { basename } from "node:path";

import {
  askCheckbox,
  askConfirm,
  askInput,
  askSelect,
} from "./inquirer-helpers.js";
import { VERSION } from "../version.js";
import {
  AGENT_WORKFLOW_CHOICES,
  AUTH_REQUIREMENT_CHOICES,
  BACKEND_CHOICES,
  type BriefBundle,
  type BriefMeta,
  type BriefSource,
  DATABASE_CHOICES,
  DB_LAYER_CHOICES,
  DEPLOYMENT_TARGET_CHOICES,
  FRONTEND_CHOICES,
  INTEGRATION_CHOICES,
  MVP_FEATURE_CHOICES,
  OUT_OF_SCOPE_CHOICES,
  PACKAGE_MANAGER_CHOICES,
  PROJECT_BRIEF_SCHEMA_VERSION,
  PROJECT_TYPE_CHOICES,
  type ProjectBrief,
  RISK_AREA_CHOICES,
  TARGET_USER_CHOICES,
} from "../types/brief.js";

const PLACEHOLDER_PROJECT_NAME = "Unnamed Project";
const PLACEHOLDER_IDEA = "(no idea provided — Planner Agent must fill this in)";
const PLACEHOLDER_PROBLEM = "(no core problem provided — Planner Agent must fill this in)";
const PLACEHOLDER_SUCCESS = "(no success criteria provided — Planner Agent must fill this in)";

export interface IdeaParsed {
  projectName?: string;
  oneLineIdea?: string;
}

export function parseIdea(idea: string | undefined): IdeaParsed {
  if (typeof idea !== "string") return {};
  const trimmed = idea.trim();
  if (trimmed.length === 0) return {};
  const colonIdx = trimmed.indexOf(":");
  if (colonIdx > 0 && colonIdx < 40) {
    const head = trimmed.slice(0, colonIdx).trim();
    const tail = trimmed.slice(colonIdx + 1).trim();
    if (head.length > 0 && !head.includes(" ") && tail.length > 0) {
      return { projectName: head, oneLineIdea: tail };
    }
  }
  return { oneLineIdea: trimmed };
}

function deriveProjectTypeDefault(idea: string | undefined): string {
  if (typeof idea === "string" && /browser/i.test(idea)) {
    return "Browser Automation";
  }
  return "SaaS";
}

export interface GatherBriefInputs {
  cwd: string;
  idea?: string;
  nonInteractive: boolean;
  seed?: Partial<ProjectBrief>;
  /** When true, meta.source is legacy-wizard (fixed 20-question flow). */
  legacyWizard?: boolean;
}

export async function gatherBrief(inputs: GatherBriefInputs): Promise<BriefBundle> {
  const assumptions: string[] = [];
  const seed = inputs.seed ?? {};
  const ideaParsed = parseIdea(inputs.idea);

  const defaultName =
    seed.projectName ?? ideaParsed.projectName ?? basename(inputs.cwd) ?? PLACEHOLDER_PROJECT_NAME;

  const projectName = await askInput({
    message: "1/20 · Project name",
    nonInteractive: inputs.nonInteractive,
    default: defaultName,
    required: !inputs.nonInteractive,
    fallback: PLACEHOLDER_PROJECT_NAME,
  });
  const finalProjectName = projectName.length > 0 ? projectName : PLACEHOLDER_PROJECT_NAME;
  if (finalProjectName === PLACEHOLDER_PROJECT_NAME) {
    assumptions.push('projectName: directory name was empty too — defaulted to "Unnamed Project"');
  }

  const oneLineIdea = await askInput({
    message: "2/20 · One-line idea",
    nonInteractive: inputs.nonInteractive,
    default: seed.oneLineIdea ?? ideaParsed.oneLineIdea,
    required: !inputs.nonInteractive,
    fallback: PLACEHOLDER_IDEA,
  });
  const finalIdea = oneLineIdea.length > 0 ? oneLineIdea : PLACEHOLDER_IDEA;
  if (finalIdea === PLACEHOLDER_IDEA) {
    assumptions.push("oneLineIdea: not provided — placeholder for Planner Agent to fill");
  }

  const projectType = await askSelect({
    message: "3/20 · Project type",
    nonInteractive: inputs.nonInteractive,
    choices: PROJECT_TYPE_CHOICES,
    default: seed.projectType ?? deriveProjectTypeDefault(inputs.idea ?? seed.oneLineIdea),
  });

  const targetUsers = await askCheckbox({
    message: "4/20 · Target users (Space to toggle, Enter to confirm)",
    nonInteractive: inputs.nonInteractive,
    choices: TARGET_USER_CHOICES,
    default: seed.targetUsers,
  });

  const coreProblem = await askInput({
    message: "5/20 · Core problem",
    nonInteractive: inputs.nonInteractive,
    default: seed.coreProblem,
    fallback: PLACEHOLDER_PROBLEM,
  });
  const finalCoreProblem = coreProblem.length > 0 ? coreProblem : PLACEHOLDER_PROBLEM;
  if (finalCoreProblem === PLACEHOLDER_PROBLEM) {
    assumptions.push("coreProblem: not provided — placeholder for Planner Agent to fill");
  }

  const mvpFeatures = await askCheckbox({
    message: "6/20 · MVP must-have features",
    nonInteractive: inputs.nonInteractive,
    choices: MVP_FEATURE_CHOICES,
    default: seed.mvpFeatures,
  });

  const outOfScope = await askCheckbox({
    message: "7/20 · Out of scope for MVP",
    nonInteractive: inputs.nonInteractive,
    choices: OUT_OF_SCOPE_CHOICES,
    default: seed.outOfScope,
  });

  const frontend = await askSelect({
    message: "8/20 · Preferred frontend",
    nonInteractive: inputs.nonInteractive,
    choices: FRONTEND_CHOICES,
    default: seed.frontend ?? "Next.js",
  });

  const backend = await askSelect({
    message: "9/20 · Preferred backend",
    nonInteractive: inputs.nonInteractive,
    choices: BACKEND_CHOICES,
    default: seed.backend ?? "NestJS",
  });

  const database = await askSelect({
    message: "10/20 · Database",
    nonInteractive: inputs.nonInteractive,
    choices: DATABASE_CHOICES,
    default: seed.database ?? "PostgreSQL",
  });

  const dbLayer = await askSelect({
    message: "11/20 · ORM / DB layer",
    nonInteractive: inputs.nonInteractive,
    choices: DB_LAYER_CHOICES,
    default: seed.dbLayer ?? "Drizzle",
  });

  const packageManager = await askSelect({
    message: "12/20 · Package manager",
    nonInteractive: inputs.nonInteractive,
    choices: PACKAGE_MANAGER_CHOICES,
    default: seed.packageManager ?? "pnpm",
  });

  const deploymentTargets = await askCheckbox({
    message: "13/20 · Deployment target",
    nonInteractive: inputs.nonInteractive,
    choices: DEPLOYMENT_TARGET_CHOICES,
    default: seed.deploymentTargets,
  });

  const authRequirements = await askCheckbox({
    message: "14/20 · Auth requirement",
    nonInteractive: inputs.nonInteractive,
    choices: AUTH_REQUIREMENT_CHOICES,
    default: seed.authRequirements,
  });

  const integrations = await askCheckbox({
    message: "15/20 · External integrations",
    nonInteractive: inputs.nonInteractive,
    choices: INTEGRATION_CHOICES,
    default: seed.integrations,
  });

  const useNotion = await askConfirm({
    message: "16/20 · Use Notion dashboard sync?",
    nonInteractive: inputs.nonInteractive,
    default: seed.useNotion ?? true,
  });

  const useGitWorkflow = await askConfirm({
    message: "17/20 · Use Git task branch workflow?",
    nonInteractive: inputs.nonInteractive,
    default: seed.useGitWorkflow ?? true,
  });

  const agentWorkflowLevel = await askSelect({
    message: "18/20 · Agent workflow level",
    nonInteractive: inputs.nonInteractive,
    choices: AGENT_WORKFLOW_CHOICES,
    default:
      seed.agentWorkflowLevel ??
      "Advanced: Orchestrator + Planner + Architect + Builder + Tester + Reviewer + Docs + Recovery",
  });

  const risks = await askCheckbox({
    message: "19/20 · Risk areas",
    nonInteractive: inputs.nonInteractive,
    choices: RISK_AREA_CHOICES,
    default: seed.risks,
  });

  const successCriteria = await askInput({
    message: "20/20 · Success criteria",
    nonInteractive: inputs.nonInteractive,
    default: seed.successCriteria,
    fallback: PLACEHOLDER_SUCCESS,
  });
  const finalSuccess = successCriteria.length > 0 ? successCriteria : PLACEHOLDER_SUCCESS;
  if (finalSuccess === PLACEHOLDER_SUCCESS) {
    assumptions.push("successCriteria: not provided — placeholder for Planner Agent to fill");
  }

  const brief: ProjectBrief = {
    projectName: finalProjectName,
    oneLineIdea: finalIdea,
    projectType,
    targetUsers,
    coreProblem: finalCoreProblem,
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
    successCriteria: finalSuccess,
  };

  const meta: BriefMeta = {
    vibeopsVersion: VERSION,
    generatedAt: new Date().toISOString(),
    source: inputs.legacyWizard === true ? "legacy-wizard" : inputs.nonInteractive ? "non-interactive" : "interactive",
    schemaVersion: PROJECT_BRIEF_SCHEMA_VERSION,
    assumptions,
  };

  return { brief, meta };
}

const SECTIONS: ReadonlyArray<{ num: number; title: string; field: keyof ProjectBrief }> = [
  { num: 1, title: "Project name", field: "projectName" },
  { num: 2, title: "One-line idea", field: "oneLineIdea" },
  { num: 3, title: "Project type", field: "projectType" },
  { num: 4, title: "Target users", field: "targetUsers" },
  { num: 5, title: "Core problem", field: "coreProblem" },
  { num: 6, title: "MVP must-have features", field: "mvpFeatures" },
  { num: 7, title: "Out of scope for MVP", field: "outOfScope" },
  { num: 8, title: "Preferred frontend", field: "frontend" },
  { num: 9, title: "Preferred backend", field: "backend" },
  { num: 10, title: "Database", field: "database" },
  { num: 11, title: "ORM / DB layer", field: "dbLayer" },
  { num: 12, title: "Package manager", field: "packageManager" },
  { num: 13, title: "Deployment target", field: "deploymentTargets" },
  { num: 14, title: "Auth requirement", field: "authRequirements" },
  { num: 15, title: "External integrations", field: "integrations" },
  { num: 16, title: "Use Notion dashboard sync?", field: "useNotion" },
  { num: 17, title: "Use Git task branch workflow?", field: "useGitWorkflow" },
  { num: 18, title: "Agent workflow level", field: "agentWorkflowLevel" },
  { num: 19, title: "Risk areas", field: "risks" },
  { num: 20, title: "Success criteria", field: "successCriteria" },
];

function renderList(values: string[]): string {
  if (values.length === 0) return "_(none)_";
  return values.map((v) => `- ${v}`).join("\n");
}

function renderScalar(value: string): string {
  return value.length > 0 ? value : "_(empty)_";
}

function renderBool(value: boolean): string {
  return value ? "yes" : "no";
}

export function briefToMarkdown(brief: ProjectBrief, meta: BriefMeta): string {
  const lines: string[] = [];
  lines.push(`# Project Brief — ${brief.projectName}`);
  lines.push("");
  lines.push(
    `> Generated: ${meta.generatedAt} · VibeOps ${meta.vibeopsVersion} · Source: ${meta.source} · schemaVersion: ${meta.schemaVersion}`,
  );
  lines.push("");
  lines.push(
    meta.source === "llm-openai" ||
      meta.source === "llm-codex-oauth" ||
      meta.source === "llm-cursor-agent"
      ? meta.source === "llm-codex-oauth"
        ? "This brief was produced by an **LLM planning session** using **Codex (ChatGPT OAuth)** (`codex login`, read from ~/.codex/auth.json). Review and edit it, then let the Planner Agent fill `docs/project/*`."
        : meta.source === "llm-openai"
          ? "This brief was produced by an **LLM planning session** using an **OpenAI platform API key**. Review and edit it, then let the Planner Agent fill `docs/project/*`."
          : "This brief was produced by an **LLM planning session** using the **Cursor Agent CLI**. Review and edit it, then let the Planner Agent fill `docs/project/*`."
      : "This brief is the input for the Cursor **Planner Agent**. VibeOps collected these answers locally (or from `--from`) — the Planner Agent reads this brief, fills in `docs/project/*`, and creates the initial backlog.",
  );
  lines.push("");

  for (const sec of SECTIONS) {
    lines.push(`## ${sec.num}. ${sec.title}`);
    lines.push("");
    const value = brief[sec.field];
    if (typeof value === "boolean") {
      lines.push(renderBool(value));
    } else if (Array.isArray(value)) {
      lines.push(renderList(value));
    } else {
      lines.push(renderScalar(value));
    }
    lines.push("");
  }

  lines.push("## Assumptions");
  lines.push("");
  if (meta.assumptions.length === 0) {
    lines.push("_(none)_");
  } else {
    for (const a of meta.assumptions) lines.push(`- ${a}`);
  }
  lines.push("");

  return lines.join("\n");
}

function extractSection(md: string, num: number): string {
  const re = new RegExp(
    String.raw`^##\s+${num}\.\s+[^\n]*\n([\s\S]*?)(?=^##\s+|\Z)`,
    "m",
  );
  const match = md.match(re);
  return match ? (match[1] ?? "").trim() : "";
}

function parseList(text: string): string[] {
  if (text.length === 0 || text === "_(none)_") return [];
  const items: string[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (line.startsWith("- ")) {
      const v = line.slice(2).trim();
      if (v.length > 0) items.push(v);
    }
  }
  return items;
}

function parseScalar(text: string): string {
  if (text === "_(empty)_") return "";
  return text.trim();
}

function parseBool(text: string): boolean {
  const t = text.trim().toLowerCase();
  return t === "yes" || t === "true" || t === "y";
}

export function parseBriefFromMarkdown(md: string): { brief: ProjectBrief; meta: BriefMeta } {
  const brief: ProjectBrief = {
    projectName: parseScalar(extractSection(md, 1)),
    oneLineIdea: parseScalar(extractSection(md, 2)),
    projectType: parseScalar(extractSection(md, 3)),
    targetUsers: parseList(extractSection(md, 4)),
    coreProblem: parseScalar(extractSection(md, 5)),
    mvpFeatures: parseList(extractSection(md, 6)),
    outOfScope: parseList(extractSection(md, 7)),
    frontend: parseScalar(extractSection(md, 8)),
    backend: parseScalar(extractSection(md, 9)),
    database: parseScalar(extractSection(md, 10)),
    dbLayer: parseScalar(extractSection(md, 11)),
    packageManager: parseScalar(extractSection(md, 12)),
    deploymentTargets: parseList(extractSection(md, 13)),
    authRequirements: parseList(extractSection(md, 14)),
    integrations: parseList(extractSection(md, 15)),
    useNotion: parseBool(extractSection(md, 16)),
    useGitWorkflow: parseBool(extractSection(md, 17)),
    agentWorkflowLevel: parseScalar(extractSection(md, 18)),
    risks: parseList(extractSection(md, 19)),
    successCriteria: parseScalar(extractSection(md, 20)),
  };

  const assumptionMatch = md.match(/^##\s+Assumptions\s*\n([\s\S]*?)(?=^##\s+|\Z)/m);
  const assumptions =
    assumptionMatch && assumptionMatch[1] ? parseList(assumptionMatch[1].trim()) : [];

  const headerMatch = md.match(/^>\s+Generated:\s+([^\s]+)\s+·\s+VibeOps\s+([^\s]+)\s+·\s+Source:\s+([^\s·]+)/m);
  const generatedAt = headerMatch?.[1] ?? new Date().toISOString();
  const recordedVersion = headerMatch?.[2] ?? VERSION;
  const recordedSource = (headerMatch?.[3] as BriefSource | undefined) ?? "from-file";
  const meta: BriefMeta = {
    vibeopsVersion: recordedVersion,
    generatedAt,
    source: recordedSource,
    schemaVersion: PROJECT_BRIEF_SCHEMA_VERSION,
    assumptions,
  };

  return { brief, meta };
}

export function findMissingRequired(brief: ProjectBrief): string[] {
  const missing: string[] = [];
  if (brief.projectName.length === 0 || brief.projectName === PLACEHOLDER_PROJECT_NAME) {
    missing.push("projectName");
  }
  if (
    brief.oneLineIdea.length === 0 ||
    brief.oneLineIdea === PLACEHOLDER_IDEA
  ) {
    missing.push("oneLineIdea");
  }
  return missing;
}
