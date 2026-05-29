import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

export const PACKAGE_ROOT: string = resolve(here, "..", "..");
export const TEMPLATES_ROOT: string = join(PACKAGE_ROOT, "templates");

export const VIBEOPS_CONFIG_FILE = ".vibeops.json";
export const VIBEOPS_ENV_FILE = ".vibeops.env";
export const VIBEOPS_ENV_EXAMPLE_FILE = ".vibeops.env.example";

export interface ProjectPaths {
  root: string;
  config: string;
  envExample: string;
  agentsMd: string;
  cursorRules: string;
  cursorSkills: string;
  docsProject: string;
  docsTasks: string;
  docsLogs: string;
  vibeopsDir: string;
  gitignore: string;
}

export function projectPaths(root: string): ProjectPaths {
  const abs = resolve(root);
  return {
    root: abs,
    config: join(abs, VIBEOPS_CONFIG_FILE),
    envExample: join(abs, VIBEOPS_ENV_EXAMPLE_FILE),
    agentsMd: join(abs, "AGENTS.md"),
    cursorRules: join(abs, ".cursor", "rules"),
    cursorSkills: join(abs, ".cursor", "skills"),
    docsProject: join(abs, "docs", "project"),
    docsTasks: join(abs, "docs", "tasks"),
    docsLogs: join(abs, "docs", "logs"),
    vibeopsDir: join(abs, ".vibeops"),
    gitignore: join(abs, ".gitignore"),
  };
}

/** Project memory files updated by `vibeops task done`. */
export const PROJECT_MEMORY_FILES = {
  currentState: "docs/project/05-current-state.md",
  architecture: "docs/project/03-architecture.md",
  decisions: "docs/project/06-decisions.md",
} as const;
