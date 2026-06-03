import { join, relative } from "node:path";

import { readTextOrNull } from "./filesystem.js";
import { readConfig } from "./config.js";
import { llmCompleteJson } from "./llm-complete.js";
import { getLlmPreferenceFromConfig } from "./llm-preference.js";
import { projectPaths } from "./paths.js";
import { slugify } from "./slug.js";
import {
  buildMinimalTaskMarkdown,
  ensureV3Sections,
  normalizeTaskHeader,
  titleFromIdea,
  type TaskDraft,
} from "./task-scaffold.js";
import { statusDisplay } from "./task.js";
import { extractJsonObject } from "./plan-llm-openai.js";
import type { OpenAiChatMessage } from "./plan-llm-openai.js";
import type { PlanLlmProviderId } from "./plan-llm-types.js";

export interface QuickTaskLlmResult {
  readonly title: string;
  readonly slug: string;
  readonly markdown: string;
  readonly provider: PlanLlmProviderId;
}

async function readSnippet(absPath: string, maxChars: number): Promise<string | null> {
  const text = await readTextOrNull(absPath);
  if (text === null) return null;
  const t = text.trim();
  return t.length <= maxChars ? t : `${t.slice(0, maxChars)}\n…`;
}

export async function loadProjectContextForLlm(cwd: string): Promise<string> {
  const paths = projectPaths(cwd);
  const candidates = [
    join(paths.docsProject, "05-current-state.md"),
    join(paths.docsProject, "03-architecture.md"),
    join(paths.docsProject, "06-decisions.md"),
  ];
  const chunks: string[] = [];
  for (const p of candidates) {
    const snip = await readSnippet(p, 3000);
    if (snip) chunks.push(`### ${relative(cwd, p)}\n\n${snip}`);
  }
  return chunks.length > 0 ? chunks.join("\n\n") : "(no project docs yet)";
}

function systemPrompt(): string {
  return `You are a VibeOps TASK author. Reply with JSON only.

{
  "title": "short title without TASK- id",
  "slug": "kebab-case-max-60-chars",
  "markdown": "full TASK markdown"
}

markdown must include sections: Status, Goal, Scope, Out of Scope, Acceptance Criteria, Test Plan, Git Context, Result, Test Result.
Status body: ${statusDisplay("in_progress")}
Result and Test Result: (not yet)
Git Context: (populated by vibeops task add)
Use the exact TASK id given in the user message for the # heading.`;
}

export async function llmScaffoldTask(params: {
  readonly cwd: string;
  readonly taskId: string;
  readonly idea: string;
}): Promise<QuickTaskLlmResult | null> {
  try {
    const context = await loadProjectContextForLlm(params.cwd);
    const messages: OpenAiChatMessage[] = [
      { role: "system", content: systemPrompt() },
      {
        role: "user",
        content: [`TASK id: ${params.taskId}`, `Idea: ${params.idea}`, "", context].join("\n"),
      },
    ];
    const config = await readConfig(params.cwd);
    const preference = getLlmPreferenceFromConfig(config);
    const { text: raw, provider } = await llmCompleteJson(messages, {
      cwd: params.cwd,
      preference,
    });
    const parsed = JSON.parse(extractJsonObject(raw)) as Record<string, unknown>;
    const title =
      typeof parsed.title === "string"
        ? parsed.title.replace(/^TASK-\d+\s*[:\-]\s*/i, "").trim()
        : "";
    const slug =
      typeof parsed.slug === "string" ? slugify(parsed.slug, "task") : slugify(title, "task");
    const markdown =
      typeof parsed.markdown === "string" ? parsed.markdown.trim() : "";
    if (title.length === 0 || markdown.length === 0) return null;
    const body = ensureV3Sections(normalizeTaskHeader(markdown, params.taskId, title));
    return { title, slug, markdown: body, provider };
  } catch {
    return null;
  }
}

export function fallbackTaskDraft(taskId: string, idea: string): {
  title: string;
  slug: string;
  markdown: string;
} {
  const title = titleFromIdea(idea);
  const draft: TaskDraft = { id: taskId, title, idea };
  const slug = slugify(title);
  return {
    title,
    slug,
    markdown: ensureV3Sections(
      normalizeTaskHeader(buildMinimalTaskMarkdown(draft), taskId, title),
    ),
  };
}
