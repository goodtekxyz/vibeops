import { join, relative } from "node:path";

import { walk } from "../lib/filesystem.js";
import { TEMPLATES_ROOT } from "../lib/paths.js";

export interface ManifestEntry {
  relativePath: string;
  sourceAbs: string;
}

export async function loadManifest(): Promise<ManifestEntry[]> {
  const files = await walk(TEMPLATES_ROOT);
  return files
    .map((abs) => ({
      relativePath: relative(TEMPLATES_ROOT, abs),
      sourceAbs: abs,
    }))
    .sort((a, b) => a.relativePath.localeCompare(b.relativePath));
}

export function resolveDestination(entry: ManifestEntry, projectRoot: string): string {
  return join(projectRoot, entry.relativePath);
}
