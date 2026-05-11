import { readdir } from "node:fs/promises";
import { basename, extname, join } from "node:path";

import matter from "gray-matter";

import { isDirectory, readText } from "../lib/filesystem.js";
import { type AgentMeta } from "../types/task.js";

export interface AgentRecord {
  meta: AgentMeta;
  body: string;
  rawFrontmatter: string;
  raw: string;
}

function metaFromFile(filePath: string, data: Record<string, unknown>, body: string): AgentMeta {
  const fallbackName = basename(filePath, extname(filePath));
  const name = typeof data["name"] === "string" ? (data["name"] as string) : fallbackName;
  const role =
    typeof data["role"] === "string" ? (data["role"] as string) : extractFirstHeading(body);
  const description =
    typeof data["description"] === "string" ? (data["description"] as string) : undefined;
  return { name, role, description, filePath };
}

function extractFirstHeading(body: string): string {
  for (const line of body.split("\n")) {
    const m = /^#\s+(.*)$/.exec(line.trim());
    if (m) return m[1]!.trim();
  }
  return "(no role)";
}

function frontmatterSlice(raw: string): string {
  if (!raw.startsWith("---")) return "";
  const end = raw.indexOf("\n---", 3);
  if (end < 0) return "";
  return raw.slice(0, end + 4);
}

export async function loadAgent(filePath: string): Promise<AgentRecord> {
  const raw = await readText(filePath);
  const parsed = matter(raw);
  const meta = metaFromFile(filePath, parsed.data as Record<string, unknown>, parsed.content);
  return {
    meta,
    body: parsed.content.trimStart(),
    rawFrontmatter: frontmatterSlice(raw),
    raw,
  };
}

export async function listAgents(agentsDir: string): Promise<AgentRecord[]> {
  if (!(await isDirectory(agentsDir))) return [];
  const entries = await readdir(agentsDir, { withFileTypes: true });
  const files = entries
    .filter((e) => e.isFile() && e.name.endsWith(".md"))
    .map((e) => join(agentsDir, e.name))
    .sort();
  const records: AgentRecord[] = [];
  for (const f of files) {
    try {
      records.push(await loadAgent(f));
    } catch {
      // skip malformed agent files
    }
  }
  return records;
}

export async function findAgent(agentsDir: string, name: string): Promise<AgentRecord | null> {
  const all = await listAgents(agentsDir);
  const target = name.toLowerCase();
  for (const a of all) {
    if (a.meta.name.toLowerCase() === target) return a;
  }
  for (const a of all) {
    const filenameKey = basename(a.meta.filePath, extname(a.meta.filePath)).toLowerCase();
    if (filenameKey === target) return a;
  }
  return null;
}
