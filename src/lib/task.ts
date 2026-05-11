import { readdir } from "node:fs/promises";
import { basename, join } from "node:path";

import matter from "gray-matter";

import { isDirectory, readText } from "./filesystem.js";
import { type TaskCounts, type TaskMeta, type TaskStatus } from "../types/task.js";

const KNOWN_STATUSES: ReadonlySet<TaskStatus> = new Set<TaskStatus>([
  "planned",
  "in_progress",
  "blocked",
  "done",
]);

function normalizeStatus(value: unknown): TaskStatus {
  if (typeof value === "string") {
    const s = value.toLowerCase().replace(/\s+/g, "_");
    if (KNOWN_STATUSES.has(s as TaskStatus)) return s as TaskStatus;
  }
  return "planned";
}

function extractIdFromFilename(file: string): string {
  const m = /^(TASK-\d+)/i.exec(basename(file));
  return m ? m[1]!.toUpperCase() : basename(file, ".md");
}

function extractTitleFromBody(body: string): string {
  const lines = body.split("\n");
  for (const line of lines) {
    const m = /^#\s+(.*)$/.exec(line.trim());
    if (m) return m[1]!.trim();
  }
  return "";
}

function extractInlineStatus(body: string): TaskStatus | null {
  const re = /^##\s+Status\s*$/im;
  const idx = body.search(re);
  if (idx < 0) return null;
  const after = body.slice(idx).split("\n");
  for (let i = 1; i < after.length; i++) {
    const line = after[i]!.trim();
    if (line.length === 0) continue;
    if (line.startsWith("#")) break;
    return normalizeStatus(line);
  }
  return null;
}

function extractInlineMvpPhase(body: string): string | undefined {
  const re = /^##\s+MVP Phase\s*$/im;
  const idx = body.search(re);
  if (idx < 0) return undefined;
  const after = body.slice(idx).split("\n");
  for (let i = 1; i < after.length; i++) {
    const line = after[i]!.trim();
    if (line.length === 0) continue;
    if (line.startsWith("#")) break;
    return line;
  }
  return undefined;
}

export async function readTaskFile(filePath: string): Promise<TaskMeta> {
  const raw = await readText(filePath);
  const parsed = matter(raw);
  const data = parsed.data as Record<string, unknown>;
  const body = parsed.content;

  const idFromFm = typeof data["id"] === "string" ? (data["id"] as string) : null;
  const id = idFromFm ?? extractIdFromFilename(filePath);

  const titleFromFm = typeof data["title"] === "string" ? (data["title"] as string) : null;
  const title = titleFromFm ?? extractTitleFromBody(body);

  const status: TaskStatus =
    data["status"] !== undefined
      ? normalizeStatus(data["status"])
      : (extractInlineStatus(body) ?? "planned");

  const mvpPhaseFromFm =
    typeof data["mvpPhase"] === "string" ? (data["mvpPhase"] as string) : undefined;
  const mvpPhase = mvpPhaseFromFm ?? extractInlineMvpPhase(body);

  const priority = typeof data["priority"] === "string" ? (data["priority"] as string) : undefined;

  return { id, title, status, mvpPhase, priority, filePath };
}

export async function scanTasks(tasksDir: string): Promise<TaskMeta[]> {
  if (!(await isDirectory(tasksDir))) return [];
  const entries = await readdir(tasksDir, { withFileTypes: true });
  const files = entries
    .filter((e) => e.isFile() && e.name.endsWith(".md") && /^TASK-\d+/i.test(e.name))
    .map((e) => join(tasksDir, e.name))
    .sort();
  const out: TaskMeta[] = [];
  for (const f of files) {
    try {
      out.push(await readTaskFile(f));
    } catch {
      // skip unreadable files
    }
  }
  return out;
}

export function countTasks(tasks: TaskMeta[]): TaskCounts {
  const counts: TaskCounts = {
    total: tasks.length,
    planned: 0,
    in_progress: 0,
    blocked: 0,
    done: 0,
  };
  for (const t of tasks) counts[t.status]++;
  return counts;
}

export function pickNextTask(tasks: TaskMeta[]): TaskMeta | null {
  const inProgress = tasks.find((t) => t.status === "in_progress");
  if (inProgress) return inProgress;
  const planned = tasks.find((t) => t.status === "planned");
  return planned ?? null;
}
