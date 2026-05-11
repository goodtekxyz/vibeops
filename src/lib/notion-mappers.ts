/**
 * Pure mappers between VibeOps local data (TASK markdown / project docs /
 * config) and Notion API property objects.
 *
 * Side-effect free: every function in this file is a synchronous data
 * transformation that the caller can unit-test or dry-run without ever
 * touching the network.
 *
 * Property names match `PROJECTS_DB_PROPERTIES` / `TASKS_DB_PROPERTIES` in
 * `notion-schema.ts` exactly (case-sensitive).
 */

import type { TaskStatus } from "../types/task.js";
import { statusDisplay } from "./task.js";

/**
 * Notion `rich_text` and most string-like properties hard-limit a single
 * text run at 2000 characters. We pick a smaller 1500-char ceiling so we
 * don't bump into multi-byte edge cases or implicit 0-pad on the way back.
 */
export const NOTION_TEXT_LIMIT = 1500;

export function truncate(text: string, limit = NOTION_TEXT_LIMIT): string {
  if (text.length <= limit) return text;
  return `${text.slice(0, limit - 1)}…`;
}

// ─── property builders ────────────────────────────────────────────────────

export function titleProperty(text: string): Record<string, unknown> {
  return {
    title: [{ type: "text", text: { content: truncate(text || "(untitled)") } }],
  };
}

export function richTextProperty(text: string): Record<string, unknown> {
  if (text.length === 0) {
    return { rich_text: [] };
  }
  return {
    rich_text: [{ type: "text", text: { content: truncate(text) } }],
  };
}

export function urlProperty(text: string): Record<string, unknown> {
  return { url: text.length > 0 ? text : null };
}

export function selectProperty(name: string): Record<string, unknown> {
  if (name.length === 0) return { select: null };
  return { select: { name: truncate(name, 100) } };
}

export function statusProperty(name: string): Record<string, unknown> {
  if (name.length === 0) return { status: null };
  return { status: { name: truncate(name, 100) } };
}

/**
 * Build a property for "Git Repo" — a value the user's Notion DB might have
 * declared as either `rich_text` *or* `url`. The caller passes the type it
 * actually saw from `databases.retrieve()`.
 */
export function gitRepoProperty(
  url: string,
  propertyType: "rich_text" | "url",
): Record<string, unknown> {
  if (propertyType === "url") return urlProperty(url);
  return richTextProperty(url);
}

// ─── status mapping (TASK markdown ↔ Notion) ──────────────────────────────

const TASK_TO_NOTION: Record<TaskStatus, string> = {
  planned: "Planned",
  in_progress: "In Progress",
  review: "Review",
  blocked: "Blocked",
  done: "Done",
};

const NOTION_NAME_TO_TASK: Record<string, TaskStatus> = {
  planned: "planned",
  ready: "planned",
  todo: "planned",
  "in progress": "in_progress",
  in_progress: "in_progress",
  doing: "in_progress",
  review: "review",
  "in review": "review",
  blocked: "blocked",
  done: "done",
  closed: "done",
};

export function mapTaskStatusToNotion(status: TaskStatus): string {
  return TASK_TO_NOTION[status] ?? "Planned";
}

export function mapNotionStatusNameToTask(notionName: string): TaskStatus {
  const key = notionName.trim().toLowerCase();
  return NOTION_NAME_TO_TASK[key] ?? "planned";
}

export function taskStatusDisplay(status: TaskStatus): string {
  return statusDisplay(status);
}

// ─── readers (Notion API response → string) ───────────────────────────────

export function readTitle(prop: unknown): string {
  const arr = (prop as { title?: unknown[] })?.title;
  if (!Array.isArray(arr) || arr.length === 0) return "";
  return arr
    .map((seg) => (seg as { plain_text?: string }).plain_text ?? "")
    .join("")
    .trim();
}

export function readRichText(prop: unknown): string {
  const arr = (prop as { rich_text?: unknown[] })?.rich_text;
  if (!Array.isArray(arr) || arr.length === 0) return "";
  return arr
    .map((seg) => (seg as { plain_text?: string }).plain_text ?? "")
    .join("")
    .trim();
}

export function readUrl(prop: unknown): string {
  const v = (prop as { url?: unknown })?.url;
  return typeof v === "string" ? v : "";
}

export function readSelect(prop: unknown): string {
  const v = (prop as { select?: { name?: unknown } })?.select?.name;
  return typeof v === "string" ? v : "";
}

export function readStatus(prop: unknown): string {
  const v = (prop as { status?: { name?: unknown } })?.status?.name;
  return typeof v === "string" ? v : "";
}

/**
 * Read either `rich_text` or `url` and return whichever has content. Useful
 * for the "Git Repo" property which the user may have declared as either type.
 */
export function readUrlOrRichText(prop: unknown): string {
  const url = readUrl(prop);
  if (url.length > 0) return url;
  return readRichText(prop);
}

// ─── filter builders ──────────────────────────────────────────────────────

export function richTextEqualsFilter(
  propertyName: string,
  value: string,
): Record<string, unknown> {
  return {
    property: propertyName,
    rich_text: { equals: value },
  };
}

export function statusEqualsFilter(
  propertyName: string,
  value: string,
): Record<string, unknown> {
  return {
    property: propertyName,
    status: { equals: value },
  };
}

export function andFilter(
  filters: readonly Record<string, unknown>[],
): Record<string, unknown> {
  return { and: [...filters] };
}
