export const PROJECT_BRIEF_SCHEMA_VERSION = 1 as const;

export type BriefSource =
  | "interactive"
  | "non-interactive"
  | "from-file"
  | "llm-openai"
  | "llm-codex-oauth"
  | "llm-cursor-agent"
  | "legacy-wizard";

export interface ProjectBrief {
  projectName: string;
  oneLineIdea: string;
  projectType: string;
  targetUsers: string[];
  coreProblem: string;
  mvpFeatures: string[];
  outOfScope: string[];
  frontend: string;
  backend: string;
  database: string;
  dbLayer: string;
  packageManager: string;
  deploymentTargets: string[];
  authRequirements: string[];
  integrations: string[];
  useNotion: boolean;
  useGitWorkflow: boolean;
  agentWorkflowLevel: string;
  risks: string[];
  successCriteria: string;
}

export interface BriefMeta {
  vibeopsVersion: string;
  generatedAt: string;
  source: BriefSource;
  schemaVersion: typeof PROJECT_BRIEF_SCHEMA_VERSION;
  assumptions: string[];
}

export interface BriefBundle {
  brief: ProjectBrief;
  meta: BriefMeta;
}

export const PROJECT_TYPE_CHOICES: readonly string[] = [
  "SaaS",
  "Web App",
  "CLI Tool",
  "Browser Automation",
  "AI Agent",
  "Internal Tool",
  "Other",
];

export const TARGET_USER_CHOICES: readonly string[] = [
  "Solo founders",
  "Developers",
  "Marketers",
  "Small business owners",
  "Internal team",
  "Other",
];

export const MVP_FEATURE_CHOICES: readonly string[] = [
  "Authentication",
  "Dashboard",
  "Project/workspace management",
  "Task/job creation",
  "Background worker",
  "Browser automation",
  "Scheduling",
  "Execution logs",
  "External integrations",
  "Other",
];

export const OUT_OF_SCOPE_CHOICES: readonly string[] = [
  "Billing",
  "Team workspace",
  "Mobile app",
  "Marketplace",
  "Advanced analytics",
  "Enterprise SSO",
  "Public API",
  "Real-time collaboration",
  "Other",
];

export const FRONTEND_CHOICES: readonly string[] = [
  "Next.js",
  "React + Vite",
  "None / CLI only",
  "Not sure",
  "Other",
];

export const BACKEND_CHOICES: readonly string[] = [
  "NestJS",
  "Next.js API routes",
  "Node.js Fastify",
  "Hono",
  "Python FastAPI",
  "None",
  "Not sure",
  "Other",
];

export const DATABASE_CHOICES: readonly string[] = [
  "PostgreSQL",
  "SQLite",
  "MySQL",
  "Supabase",
  "None",
  "Not sure",
  "Other",
];

export const DB_LAYER_CHOICES: readonly string[] = [
  "Drizzle",
  "Prisma",
  "Kysely",
  "Raw SQL",
  "None",
  "Not sure",
  "Other",
];

export const PACKAGE_MANAGER_CHOICES: readonly string[] = ["pnpm", "npm", "yarn", "bun"];

export const DEPLOYMENT_TARGET_CHOICES: readonly string[] = [
  "VPS",
  "Docker",
  "Podman",
  "Vercel",
  "Cloudflare",
  "AWS",
  "Not sure",
  "Other",
];

export const AUTH_REQUIREMENT_CHOICES: readonly string[] = [
  "Email/password",
  "Google login",
  "GitHub login",
  "Magic link",
  "Admin-only",
  "No auth for MVP",
  "Not sure",
  "Other",
];

export const INTEGRATION_CHOICES: readonly string[] = [
  "Notion",
  "GitHub",
  "Google Drive",
  "Gmail",
  "Slack",
  "Stripe",
  "OpenAI",
  "Anthropic",
  "Browser / Playwright",
  "None",
  "Other",
];

export const AGENT_WORKFLOW_CHOICES: readonly string[] = [
  "Simple: Planner + Builder + Reviewer",
  "Standard: Orchestrator + Planner + Builder + Reviewer + Docs",
  "Advanced: Orchestrator + Planner + Architect + Builder + Tester + Reviewer + Docs + Recovery",
];

export const RISK_AREA_CHOICES: readonly string[] = [
  "Authentication/security",
  "Browser automation reliability",
  "Cost control",
  "Scalability",
  "Data privacy",
  "Deployment complexity",
  "Background jobs",
  "AI hallucination",
  "Other",
];
