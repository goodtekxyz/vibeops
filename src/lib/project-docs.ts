import { join, relative } from "node:path";

import { readTextOrNull } from "./filesystem.js";
import { projectPaths } from "./paths.js";

export interface DocSlot {
  /** label shown to the Planner Agent inside the generated prompt */
  readonly label: string;
  /** absolute path on disk */
  readonly path: string;
  /** path relative to project root, for display */
  readonly relativePath: string;
  /** raw markdown content, if the file was readable */
  readonly content: string | null;
  /**
   * whether this slot is treated as the *primary* backlog driver.
   * (only `07-backlog.md` and an explicit `--from <path>` get this flag).
   */
  readonly primary: boolean;
  /** soft category, useful for grouping in the prompt rendering */
  readonly category: DocCategory;
}

export type DocCategory =
  | "backlog"
  | "overview"
  | "requirements"
  | "mvp-scope"
  | "architecture"
  | "tech-stack"
  | "current-state"
  | "decisions"
  | "env"
  | "deployment"
  | "brief"
  | "custom";

export interface CollectInputs {
  /** project root (absolute) */
  cwd: string;
  /** optional path passed via `--from <path>` (relative or absolute) */
  fromPath?: string;
  /** absolute path that resolves `fromPath` (computed by caller) */
  fromAbs?: string;
  /** absolute path of the brief markdown (defaults to .vibeops/brief/project-brief.md) */
  briefAbs: string;
}

interface SlotSpec {
  label: string;
  fileName: string;
  category: DocCategory;
  primary?: boolean;
}

/**
 * Canonical project documentation slots that `task generate` looks at.
 * Files that don't exist are returned with `content: null` so the caller
 * can decide whether to mention them as "missing" in the generated prompt.
 */
const PROJECT_SLOTS: readonly SlotSpec[] = [
  { label: "Backlog (primary)",  fileName: "07-backlog.md",       category: "backlog",       primary: true },
  { label: "Overview",           fileName: "00-overview.md",      category: "overview" },
  { label: "Requirements",       fileName: "01-requirements.md",  category: "requirements" },
  { label: "MVP Scope",          fileName: "02-mvp-scope.md",     category: "mvp-scope" },
  { label: "Architecture",       fileName: "03-architecture.md",  category: "architecture" },
  { label: "Tech Stack",         fileName: "04-tech-stack.md",    category: "tech-stack" },
  { label: "Current State",      fileName: "05-current-state.md", category: "current-state" },
  { label: "Decisions",          fileName: "06-decisions.md",     category: "decisions" },
  { label: "Env",                fileName: "08-env.md",           category: "env" },
  { label: "Deployment",         fileName: "09-deployment.md",    category: "deployment" },
];

/**
 * Fallback set of project doc filenames for repositories that pre-date the
 * 10-file template layout (e.g. this VibeOps repo itself uses 00–05).
 * Only consulted when a slot above is missing.
 */
const LEGACY_FALLBACKS: ReadonlyMap<string, readonly string[]> = new Map([
  ["07-backlog.md", ["05-backlog.md"]],
  ["00-overview.md", []],
  ["03-architecture.md", ["01-architecture.md"]],
  ["04-tech-stack.md", ["02-tech-stack.md"]],
  ["05-current-state.md", ["03-current-state.md"]],
  ["06-decisions.md", ["04-decisions.md"]],
]);

function relDisplay(root: string, abs: string): string {
  const r = relative(root, abs);
  return r.length === 0 ? "." : r;
}

async function readSlotWithFallback(
  cwd: string,
  spec: SlotSpec,
): Promise<DocSlot> {
  const paths = projectPaths(cwd);
  const canonical = join(paths.docsProject, spec.fileName);
  let abs = canonical;
  let content = await readTextOrNull(abs);
  if (content === null) {
    for (const fallback of LEGACY_FALLBACKS.get(spec.fileName) ?? []) {
      abs = join(paths.docsProject, fallback);
      content = await readTextOrNull(abs);
      if (content !== null) break;
    }
    if (content === null) abs = canonical;
  }
  return {
    label: spec.label,
    path: abs,
    relativePath: relDisplay(cwd, abs),
    content,
    primary: spec.primary === true,
    category: spec.category,
  };
}

export interface CollectedDocs {
  slots: DocSlot[];
  brief: DocSlot;
  from: DocSlot | null;
}

export async function collectInputDocs(inputs: CollectInputs): Promise<CollectedDocs> {
  const slots: DocSlot[] = [];
  for (const spec of PROJECT_SLOTS) {
    slots.push(await readSlotWithFallback(inputs.cwd, spec));
  }

  const briefContent = await readTextOrNull(inputs.briefAbs);
  const brief: DocSlot = {
    label: "Project Brief",
    path: inputs.briefAbs,
    relativePath: relDisplay(inputs.cwd, inputs.briefAbs),
    content: briefContent,
    primary: false,
    category: "brief",
  };

  let from: DocSlot | null = null;
  if (typeof inputs.fromAbs === "string" && inputs.fromAbs.length > 0) {
    const content = await readTextOrNull(inputs.fromAbs);
    from = {
      label: "Custom input (--from)",
      path: inputs.fromAbs,
      relativePath: relDisplay(inputs.cwd, inputs.fromAbs),
      content,
      primary: true,
      category: "custom",
    };
  }

  return { slots, brief, from };
}

export function presentSlots(docs: CollectedDocs): DocSlot[] {
  return docs.slots.filter((s) => s.content !== null);
}

export function missingSlots(docs: CollectedDocs): DocSlot[] {
  return docs.slots.filter((s) => s.content === null);
}
