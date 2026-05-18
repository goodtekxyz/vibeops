import { readdir } from "node:fs/promises";
import { basename, extname, join } from "node:path";

import matter from "gray-matter";

import { isDirectory, readText, writeText } from "./filesystem.js";
import { readGitInfo } from "./git.js";
import {
  type GitContext,
  type TaskCounts,
  type TaskMeta,
  type TaskStatus,
} from "../types/task.js";

const KNOWN_STATUSES: ReadonlySet<TaskStatus> = new Set<TaskStatus>([
  "planned",
  "in_progress",
  "review",
  "blocked",
  "done",
]);

export function normalizeStatus(value: unknown): TaskStatus {
  if (typeof value === "string") {
    const s = value.toLowerCase().replace(/\s+/g, "_");
    if (KNOWN_STATUSES.has(s as TaskStatus)) return s as TaskStatus;
  }
  return "planned";
}

export function statusDisplay(status: TaskStatus): string {
  switch (status) {
    case "planned":
      return "Planned";
    case "in_progress":
      return "In Progress";
    case "review":
      return "Review";
    case "blocked":
      return "Blocked";
    case "done":
      return "Done";
  }
}

function extractIdFromFilename(file: string): string {
  const name = basename(file);
  const mvp = /^TASK-mvp/i.exec(name);
  if (mvp) return "TASK-mvp";
  const m = /^(TASK-\d+)/i.exec(name);
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
    .filter(
      (e) =>
        e.isFile() && e.name.endsWith(".md") && /^TASK-(?:\d+|mvp)/i.test(e.name),
    )
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
    review: 0,
    blocked: 0,
    done: 0,
  };
  for (const t of tasks) counts[t.status]++;
  return counts;
}

export function pickInProgressTask(tasks: readonly TaskMeta[]): TaskMeta | null {
  return tasks.find((t) => t.status === "in_progress") ?? null;
}

export function pickNextTask(tasks: TaskMeta[]): TaskMeta | null {
  const inProgress = pickInProgressTask(tasks);
  if (inProgress) return inProgress;
  const review = tasks.find((t) => t.status === "review");
  if (review) return review;
  const planned = tasks.filter((t) => t.status === "planned");
  const mvp = planned.find((t) => t.id.toUpperCase() === "TASK-MVP");
  return mvp ?? planned[0] ?? null;
}

const TEMPLATE_TASK_ID = "TASK-000";

export function filterActionableTasks(tasks: readonly TaskMeta[]): TaskMeta[] {
  return tasks.filter((t) => t.id.toUpperCase() !== TEMPLATE_TASK_ID);
}

export function isMvpTaskId(id: string): boolean {
  return id.toUpperCase() === "TASK-MVP";
}

function taskSortKey(id: string): number {
  if (isMvpTaskId(id)) return 1_000_000;
  const m = /^TASK-(\d+)$/i.exec(id.trim());
  return m ? Number.parseInt(m[1]!, 10) : 0;
}

/** Latest finished TASK by numeric id (TASK-mvp sorts after numbered tasks). */
export function pickLatestDoneTask(tasks: readonly TaskMeta[]): TaskMeta | null {
  const done = filterActionableTasks(tasks).filter((t) => t.status === "done");
  if (done.length === 0) return null;
  return [...done].sort((a, b) => taskSortKey(b.id) - taskSortKey(a.id))[0]!;
}

export async function loadActionableTasks(tasksDir: string): Promise<TaskMeta[]> {
  return filterActionableTasks(await scanTasks(tasksDir));
}

/** True when HEAD is on the TASK's recorded task branch. */
export function isOnTaskBranch(
  gitBranch: string | null | undefined,
  ctx: GitContext | null,
): boolean {
  return (
    typeof gitBranch === "string" &&
    ctx !== null &&
    gitBranch === ctx.taskBranch
  );
}

/**
 * Prefer the TASK for the current `task/*` branch so `next` does not jump to the
 * next Planned TASK while merge / `vibeops done` is still pending.
 */
export async function pickActiveTask(
  tasksDir: string,
  cwd: string,
): Promise<TaskMeta | null> {
  const actionable = await loadActionableTasks(tasksDir);
  const git = await readGitInfo(cwd);

  if (git.isRepo && typeof git.branch === "string" && git.branch.startsWith("task/")) {
    for (const t of actionable) {
      const ctx = await readGitContext(t.filePath);
      if (isOnTaskBranch(git.branch, ctx)) return t;
    }
  }

  return pickNextTask(actionable);
}

export async function findTaskFile(
  tasksDir: string,
  taskId: string,
): Promise<string | null> {
  const all = await scanTasks(tasksDir);
  const normalized = taskId.trim();
  const target =
    /^mvp$/i.test(normalized) || /^task-mvp$/i.test(normalized)
      ? "TASK-MVP"
      : normalized.toUpperCase();
  for (const t of all) {
    if (t.id.toUpperCase() === target) return t.filePath;
  }
  return null;
}

const TASK_FILENAME_RE = /^TASK-(\d+)(?:-(.+))?$/i;
const TASK_MVP_FILENAME_RE = /^TASK-mvp(?:-(.+))?$/i;

export interface TaskNameParts {
  id: string;
  number: string;
  slug: string;
}

export function parseTaskFilename(filePath: string): TaskNameParts {
  const stem = basename(filePath, extname(filePath));
  const mvp = TASK_MVP_FILENAME_RE.exec(stem);
  if (mvp) {
    const tail = (mvp[1] ?? "").trim().toLowerCase();
    const slug = tail.length > 0 ? `mvp-${tail}` : "mvp";
    return { id: "TASK-mvp", number: "mvp", slug };
  }
  const m = TASK_FILENAME_RE.exec(stem);
  if (!m) {
    return { id: stem.toUpperCase(), number: "000", slug: stem.toLowerCase() };
  }
  const number = m[1]!;
  const tail = (m[2] ?? "").trim().toLowerCase();
  const slug = tail.length > 0 ? `${number}-${tail}` : number;
  return { id: `TASK-${number}`, number, slug };
}

export function branchNameForTaskFile(filePath: string): string {
  return `task/${parseTaskFilename(filePath).slug}`;
}

const HEADING_RE = /^(##+)\s+(.+?)\s*$/;

interface SectionBlock {
  start: number;
  end: number;
  contentStart: number;
  level: number;
  title: string;
}

function locateSection(text: string, title: string, level = 2): SectionBlock | null {
  const lines = text.split("\n");
  const wantTitle = title.toLowerCase();
  for (let i = 0; i < lines.length; i++) {
    const m = HEADING_RE.exec(lines[i]!);
    if (!m) continue;
    if (m[1]!.length !== level) continue;
    if (m[2]!.trim().toLowerCase() !== wantTitle) continue;
    const start = i;
    const contentStart = i + 1;
    let j = i + 1;
    while (j < lines.length) {
      const nm = HEADING_RE.exec(lines[j]!);
      if (nm && nm[1]!.length <= level) break;
      j++;
    }
    return { start, end: j, contentStart, level, title: m[2]!.trim() };
  }
  return null;
}

export function readSection(body: string, title: string): string {
  const block = locateSection(body, title);
  if (block === null) return "";
  const lines = body.split("\n").slice(block.contentStart, block.end);
  // trim leading/trailing blank lines
  while (lines.length > 0 && lines[0]!.trim().length === 0) lines.shift();
  while (lines.length > 0 && lines[lines.length - 1]!.trim().length === 0) lines.pop();
  return lines.join("\n");
}

export function isPlaceholderContent(content: string): boolean {
  const trimmed = content.trim();
  if (trimmed.length === 0) return true;
  if (/^\(.*\uBBF8\uC218\uD589.*\)$/.test(trimmed)) return true; // legacy Korean placeholder
  if (/^_*\(none\)_*$/i.test(trimmed)) return true;
  if (/^\(not yet\)$/i.test(trimmed)) return true;
  if (/^\(scaffold/i.test(trimmed)) return true;
  if (/^pending\.?$/i.test(trimmed)) return true;
  if (/^tbd\.?$/i.test(trimmed)) return true;
  if (/^todo\.?$/i.test(trimmed)) return true;
  if (/^-{1,3}$/.test(trimmed)) return true;
  return false;
}

export function hasNonEmptySection(body: string, title: string): boolean {
  return !isPlaceholderContent(readSection(body, title));
}

export function findExpectedFiles(body: string): string[] {
  const content = readSection(body, "Expected Files to Change");
  if (content.length === 0) return [];
  const out: string[] = [];
  for (const raw of content.split("\n")) {
    const line = raw.trim();
    if (!line.startsWith("- ")) continue;
    let rest = line.slice(2).trim();
    rest = rest.replace(
      /^(\uC2E0\uADDC|\uAC31\uC2E0|new|update|update:|\uC2E0\uADDC:|\uAC31\uC2E0:)\s*[:：-]?\s*/i,
      "",
    ); // matches both English and legacy Korean status prefixes
    const tickMatch = rest.match(/`([^`]+)`/);
    if (tickMatch) {
      out.push(tickMatch[1]!.trim());
    } else {
      const candidate = rest.split(/[\s,]/)[0];
      if (typeof candidate === "string" && candidate.length > 0 && /[./]/.test(candidate)) {
        out.push(candidate);
      }
    }
  }
  return out;
}

export function findAcceptanceCriteria(body: string): string[] {
  const content = readSection(body, "Acceptance Criteria");
  if (content.length === 0) return [];
  const out: string[] = [];
  for (const raw of content.split("\n")) {
    const line = raw.trim();
    const m = /^(\d+)\.\s+(.+)$/.exec(line);
    if (m) out.push(m[2]!.trim());
  }
  return out;
}

function replaceSectionContent(
  body: string,
  title: string,
  newContent: string,
): string {
  const lines = body.split("\n");
  const block = locateSection(body, title);
  if (block === null) return body;
  const before = lines.slice(0, block.contentStart);
  const after = lines.slice(block.end);
  const contentLines = ["", newContent.trim(), ""];
  return [...before, ...contentLines, ...after].join("\n");
}

function insertSectionAfter(
  body: string,
  afterTitle: string,
  newTitle: string,
  newContent: string,
): string {
  const block = locateSection(body, afterTitle);
  const lines = body.split("\n");
  const newSection = ["", `## ${newTitle}`, "", newContent.trim(), ""];
  if (block === null) {
    return [...lines, ...newSection].join("\n");
  }
  const before = lines.slice(0, block.end);
  const after = lines.slice(block.end);
  return [...before, ...newSection, ...after].join("\n");
}

export async function updateInlineStatus(
  filePath: string,
  next: TaskStatus,
): Promise<void> {
  const raw = await readText(filePath);
  const display = statusDisplay(next);
  const updated = replaceSectionContent(raw, "Status", display);
  if (updated !== raw) {
    await writeText(filePath, updated);
  }
}

export async function updateTaskSection(
  filePath: string,
  title: string,
  content: string,
): Promise<void> {
  const raw = await readText(filePath);
  const updated = replaceSectionContent(raw, title, content);
  if (updated !== raw) {
    await writeText(filePath, updated);
  }
}

function renderGitContextBlock(ctx: GitContext): string {
  const lines: string[] = [
    `- Base Branch: \`${ctx.baseBranch}\``,
    `- Base Commit: \`${ctx.baseCommit}\``,
    `- Task Branch: \`${ctx.taskBranch}\``,
    `- Started At: \`${ctx.startedAt}\``,
  ];
  if (typeof ctx.doneAt === "string" && ctx.doneAt.length > 0) {
    lines.push(`- Done At: \`${ctx.doneAt}\``);
  }
  return lines.join("\n");
}

export async function upsertGitContext(
  filePath: string,
  ctx: GitContext,
): Promise<void> {
  const raw = await readText(filePath);
  const block = renderGitContextBlock(ctx);
  let updated: string;
  if (locateSection(raw, "Git Context")) {
    updated = replaceSectionContent(raw, "Git Context", block);
  } else if (locateSection(raw, "MVP Phase")) {
    updated = insertSectionAfter(raw, "MVP Phase", "Git Context", block);
  } else if (locateSection(raw, "Status")) {
    updated = insertSectionAfter(raw, "Status", "Git Context", block);
  } else {
    updated = `${raw.trimEnd()}\n\n## Git Context\n\n${block}\n`;
  }
  if (updated !== raw) {
    await writeText(filePath, updated);
  }
}

const GIT_CTX_RE: Record<keyof GitContext, RegExp> = {
  baseBranch: /^-\s+Base Branch:\s*`([^`]+)`/m,
  baseCommit: /^-\s+Base Commit:\s*`([^`]+)`/m,
  taskBranch: /^-\s+Task Branch:\s*`([^`]+)`/m,
  startedAt: /^-\s+Started At:\s*`([^`]+)`/m,
  doneAt: /^-\s+Done At:\s*`([^`]+)`/m,
};

export async function readGitContext(filePath: string): Promise<GitContext | null> {
  const raw = await readText(filePath);
  const content = readSection(raw, "Git Context");
  if (content.length === 0) return null;
  const baseBranch = content.match(GIT_CTX_RE.baseBranch)?.[1];
  const baseCommit = content.match(GIT_CTX_RE.baseCommit)?.[1];
  const taskBranch = content.match(GIT_CTX_RE.taskBranch)?.[1];
  const startedAt = content.match(GIT_CTX_RE.startedAt)?.[1];
  if (!baseBranch || !baseCommit || !taskBranch || !startedAt) return null;
  const doneAt = content.match(GIT_CTX_RE.doneAt)?.[1];
  const ctx: GitContext = { baseBranch, baseCommit, taskBranch, startedAt };
  if (typeof doneAt === "string" && doneAt.length > 0) ctx.doneAt = doneAt;
  return ctx;
}
