import { join } from "node:path";

import { pathExists, readTextOrNull, writeText } from "./filesystem.js";
import { VIBEOPS_ENV_FILE } from "./paths.js";

/**
 * Minimal `.env` parser — handles the subset we need:
 *   - blank lines and `#` comments are ignored
 *   - `KEY=value` (optional whitespace around `=`)
 *   - surrounding single or double quotes are stripped
 *   - inline `#` comments after `value ` are stripped (but only when the value
 *     itself is not quoted)
 *
 * We intentionally don't depend on `dotenv` to keep the install footprint
 * small and to avoid surprising behaviours (e.g. silent override of
 * `process.env`).
 */
export function parseDotenv(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    let val = line.slice(eq + 1).trim();
    const quoted =
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"));
    if (quoted) {
      val = val.slice(1, -1);
    } else {
      const hash = val.indexOf(" #");
      if (hash !== -1) val = val.slice(0, hash).trim();
    }
    out[key] = val;
  }
  return out;
}

export type NotionTokenSource = ".vibeops.env" | "process.env" | "none";

export interface NotionEnvInputs {
  /** raw NOTION_TOKEN value, NEVER log this directly */
  token: string | null;
  /** which file we read it from (for messaging) */
  source: NotionTokenSource;
}

/**
 * Resolve the Notion API token. Priority:
 *   1. `.vibeops.env` in the project root (preferred — not committed)
 *   2. `process.env.NOTION_TOKEN`
 *
 * Returns the raw token. Callers MUST mask before printing.
 */
export async function loadNotionEnv(cwd: string): Promise<NotionEnvInputs> {
  const envPath = join(cwd, VIBEOPS_ENV_FILE);
  const text = await readTextOrNull(envPath);
  if (text !== null) {
    const parsed = parseDotenv(text);
    const fromFile = parsed.NOTION_TOKEN ?? "";
    if (fromFile.length > 0) {
      return { token: fromFile, source: ".vibeops.env" };
    }
  }
  const fromProcess = process.env.NOTION_TOKEN ?? "";
  if (fromProcess.length > 0) {
    return { token: fromProcess, source: "process.env" };
  }
  return { token: null, source: "none" };
}

/**
 * Token-source probe for `vibeops status` and similar read-only flows.
 *
 * Returns only whether a token is reachable and where it came from. The token
 * VALUE never leaves this function — callers cannot accidentally leak it via
 * logs.
 */
export async function getNotionTokenSource(cwd: string): Promise<{
  hasToken: boolean;
  source: NotionTokenSource;
}> {
  const env = await loadNotionEnv(cwd);
  return { hasToken: env.token !== null, source: env.source };
}

/**
 * Mask a secret for safe display. Keeps the first 4 and last 4 characters so
 * the user can sanity-check which token is loaded without revealing the body.
 */
export function maskToken(value: string): string {
  if (value.length <= 8) return "*".repeat(value.length);
  return `${value.slice(0, 4)}…${value.slice(-4)} (len=${value.length})`;
}

export interface EnvFileSnapshot {
  exists: boolean;
  /** raw contents (null if file does not exist) */
  raw: string | null;
  /** current NOTION_TOKEN value (empty string if line exists with no value) */
  currentToken: string | null;
}

export async function inspectEnvFile(cwd: string): Promise<EnvFileSnapshot> {
  const path = join(cwd, VIBEOPS_ENV_FILE);
  const raw = await readTextOrNull(path);
  if (raw === null) return { exists: false, raw: null, currentToken: null };
  const parsed = parseDotenv(raw);
  const value = typeof parsed.NOTION_TOKEN === "string" ? parsed.NOTION_TOKEN : null;
  return { exists: true, raw, currentToken: value };
}

const DEFAULT_ENV_HEADER = `# VibeOps · local environment (DO NOT COMMIT)
# This file is .gitignored. Holds the Notion integration secret VibeOps reads.
`;

/**
 * Write or update the \`NOTION_TOKEN=...\` line inside the project's
 * \`.vibeops.env\`.
 *
 * Rules:
 *   - We never echo the token value anywhere — caller is responsible for
 *     keeping it out of logs.
 *   - If the file doesn't exist, we create it with a header (no other keys).
 *   - If the file exists, we preserve every other line. We replace the first
 *     \`NOTION_TOKEN=...\` line we find, or append one to the end otherwise.
 */
export async function writeNotionTokenToEnvFile(cwd: string, token: string): Promise<{
  path: string;
  created: boolean;
  replaced: boolean;
}> {
  const path = join(cwd, VIBEOPS_ENV_FILE);
  const exists = await pathExists(path);
  const line = `NOTION_TOKEN=${token}`;
  if (!exists) {
    await writeText(path, `${DEFAULT_ENV_HEADER}\n${line}\n`);
    return { path, created: true, replaced: false };
  }
  const raw = (await readTextOrNull(path)) ?? "";
  const lines = raw.split(/\r?\n/);
  let replaced = false;
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i]!.trimStart();
    if (trimmed.startsWith("NOTION_TOKEN=") || trimmed.startsWith("NOTION_TOKEN =")) {
      lines[i] = line;
      replaced = true;
      break;
    }
  }
  let next: string;
  if (replaced) {
    next = lines.join("\n");
    if (!next.endsWith("\n")) next += "\n";
  } else {
    const trailing = raw.endsWith("\n") ? "" : "\n";
    next = `${raw}${trailing}${line}\n`;
  }
  await writeText(path, next);
  return { path, created: false, replaced };
}
