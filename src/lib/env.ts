import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { VIBEOPS_ENV_FILE } from "./paths.js";

/**
 * Loads `KEY=value` pairs from `.vibeops.env` without overwriting existing `process.env`.
 */
export async function loadVibeopsEnv(cwd: string): Promise<void> {
  const path = join(resolve(cwd), VIBEOPS_ENV_FILE);
  try {
    const text = await readFile(path, "utf-8");
    for (const line of text.split("\n")) {
      const t = line.trim();
      if (t.length === 0 || t.startsWith("#")) continue;
      const eq = t.indexOf("=");
      if (eq <= 0) continue;
      const key = t.slice(0, eq).trim();
      let val = t.slice(eq + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (key.length > 0 && process.env[key] === undefined) {
        process.env[key] = val;
      }
    }
  } catch {
    /* missing or unreadable — ok */
  }
}
