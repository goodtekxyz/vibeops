import { join, relative } from "node:path";

import { walk } from "../lib/filesystem.js";
import { pathExists } from "../lib/filesystem.js";
import { TEMPLATES_ROOT } from "../lib/paths.js";
import type { VibeopsClientId } from "../types/config.js";

export interface ManifestEntry {
  relativePath: string;
  sourceAbs: string;
}

async function loadManifestFromDirectory(rootDir: string): Promise<ManifestEntry[]> {
  if (!(await pathExists(rootDir))) return [];
  const files = await walk(rootDir);
  return files.map((abs) => ({
    relativePath: relative(rootDir, abs),
    sourceAbs: abs,
  }));
}

/** Core tree + selected client packs (not shared skills — those are copied separately). */
export async function loadInstallManifest(
  clients: readonly VibeopsClientId[],
): Promise<ManifestEntry[]> {
  const entries: ManifestEntry[] = [];
  entries.push(...(await loadManifestFromDirectory(join(TEMPLATES_ROOT, "core"))));
  for (const id of clients) {
    entries.push(...(await loadManifestFromDirectory(join(TEMPLATES_ROOT, "clients", id))));
  }
  return entries.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
}

export function resolveDestination(entry: ManifestEntry, projectRoot: string): string {
  return join(projectRoot, entry.relativePath);
}
