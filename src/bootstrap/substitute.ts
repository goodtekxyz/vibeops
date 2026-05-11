import { type VibeopsConfig } from "../types/config.js";

export interface Substitutions {
  PROJECT_NAME: string;
  VIBEOPS_VERSION: string;
  CREATED_AT: string;
}

const TEXT_EXTENSIONS = new Set([
  ".md",
  ".mdc",
  ".txt",
  ".json",
  ".yaml",
  ".yml",
  ".env",
  ".example",
]);

export function isTextPath(path: string): boolean {
  const lower = path.toLowerCase();
  for (const ext of TEXT_EXTENSIONS) {
    if (lower.endsWith(ext)) return true;
  }
  if (lower.endsWith("/readme")) return true;
  if (lower.endsWith("/agents.md")) return true;
  return false;
}

export function buildSubstitutions(config: VibeopsConfig): Substitutions {
  return {
    PROJECT_NAME: config.name,
    VIBEOPS_VERSION: config.vibeopsVersion,
    CREATED_AT: config.createdAt,
  };
}

export function applySubstitutions(content: string, subs: Substitutions): string {
  return content
    .replaceAll("{{PROJECT_NAME}}", subs.PROJECT_NAME)
    .replaceAll("{{VIBEOPS_VERSION}}", subs.VIBEOPS_VERSION)
    .replaceAll("{{CREATED_AT}}", subs.CREATED_AT);
}
