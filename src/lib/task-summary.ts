import { isPlaceholderContent, readSection } from "./task.js";

const PLACEHOLDER_RE = new RegExp(
  String.raw`^\(.*(not yet|fill in|unassigned|scaffold|\uBBF8\uC218\uD589).*\)$`,
  "i",
);

function stripBullet(line: string): string {
  return line.replace(/^\s*(?:[-*+]|\d+\.)\s+/, "").trim();
}

function truncate(text: string, limit: number): string {
  if (text.length <= limit) return text;
  return `${text.slice(0, limit - 1)}…`;
}

function compressBlank(lines: string[]): string {
  const out: string[] = [];
  let blank = false;
  for (const raw of lines) {
    const line = raw.replace(/\s+$/u, "");
    if (line.length === 0) {
      if (!blank && out.length > 0) out.push("");
      blank = true;
      continue;
    }
    blank = false;
    out.push(line);
  }
  return out.join("\n").trim();
}

export function summarizeSection(body: string, title: string, limit = 280): string {
  const raw = readSection(body, title);
  if (raw.length === 0 || isPlaceholderContent(raw)) return "";
  const cleaned: string[] = [];
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (t.length === 0) {
      cleaned.push("");
      continue;
    }
    if (PLACEHOLDER_RE.test(t)) continue;
    if (/^#{1,6}\s+/.test(t)) continue;
    cleaned.push(stripBullet(t));
  }
  return truncate(compressBlank(cleaned), limit);
}

export function summarizeGoal(body: string, limit = 280): string {
  const goal = summarizeSection(body, "Goal", limit);
  return goal.length > 0 ? goal : summarizeSection(body, "Scope", limit);
}
